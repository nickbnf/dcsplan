import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { FlightPlan } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { ANON_PLAN_ID, clearPlanStore } from '../hooks/useYjsFlightPlan';
import { generatePlanId } from '../utils/planId';
import { userPrefix } from '../sync/assetCache';
import {
  createPlan as apiCreatePlan,
  getMySpace,
  listPlans as apiListPlans,
  type PlanSummary,
  type SpaceSummary,
} from '../api/planApi';

/**
 * The plan-selection layer (capability: space, plan-addressing; AD-1, AD-15, AD-16).
 *
 * The URL is the active selection: `/p/:id/…` names the plan to open, and it is
 * resolved during render so the flight-plan Y.Doc opens the right plan first
 * (unify-plan-name D3). Off a plan's address (`/plans`, `/library`) the last
 * opened plan stays active. Anonymous users always have their `local` plan.
 */

const SELECTION_KEY = 'dcsplan-active-selection';

interface StoredSelection {
  spaceId: string | null;
  planId: string;
}

interface Draft {
  id: string;
  name: string;
  theatre: string;
  seed: FlightPlan;
  /** A commit was attempted (the draft has edits): never discard it. */
  pendingCommit: boolean;
}

export interface PlanSelectionValue {
  /** The plan id the flight-plan Y.Doc should open (`local` or a short id). */
  activePlanId: string;
  /** A real plan is active (always true for anonymous). */
  hasActivePlan: boolean;
  /** Attach the WebSocket provider for this plan (signed-in, committed, not anon). */
  sync: boolean;
  /** The active plan is an uncommitted local draft. */
  isDraft: boolean;
  /** Signed-in with no plan to open — the app should show Home. */
  atHome: boolean;
  /** Auth or the signed-in plan list is still loading; addresses are not judged yet. */
  isResolving: boolean;
  /** The id in the current `/p/:id/…` address, if any. */
  requestedPlanId: string | null;
  /** The current address names a plan that does not resolve (after resolving). */
  requestUnresolved: boolean;
  /** Initial plan to seed the active draft's store with (on its chosen theatre). */
  draftSeed: FlightPlan | null;
  spaceId: string | null;
  plans: PlanSummary[];
  /** Create a local draft (no server row yet); returns its id so the caller can open its address. */
  newDraft: (theatre: string, name?: string) => string;
  /** Register the draft in the space (called on its first edit, and on each later
   *  edit until it lands). `name` is the draft's current name, if known. */
  commitDraft: (name?: string) => Promise<void>;
  /** Why the current draft is not saved to the account yet, if a commit failed. */
  commitError: string | null;
  refreshPlans: () => Promise<PlanSummary[]>;
  /** The open plan's own name changed (in its document): show it in the list
   * at once, without waiting for the server's copy (plan-sync). */
  notePlanName: (planId: string, name: string) => void;
  /** A plan was added to the space outside the draft flow (an import): list
   *  it at once, so opening its address resolves before the next refresh. */
  notePlanCreated: (plan: PlanSummary) => void;
}

const PlanSelectionContext = createContext<PlanSelectionValue | null>(null);

function readStored(): StoredSelection | null {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    return raw ? (JSON.parse(raw) as StoredSelection) : null;
  } catch {
    return null;
  }
}

function writeStored(sel: StoredSelection | null) {
  try {
    if (sel) localStorage.setItem(SELECTION_KEY, JSON.stringify(sel));
    else localStorage.removeItem(SELECTION_KEY);
  } catch {
    /* ignore */
  }
}

// The space and plan list are cached per user so a signed-in user who starts
// offline still reaches their plans (user-identity offline start, design D9).
interface CachedIndex {
  space: SpaceSummary;
  plans: PlanSummary[];
}

const indexKey = (userId: string) => `${userPrefix(userId)}planIndex`;

function readIndex(userId: string): CachedIndex | null {
  try {
    const raw = localStorage.getItem(indexKey(userId));
    return raw ? (JSON.parse(raw) as CachedIndex) : null;
  } catch {
    return null;
  }
}

function writeIndex(userId: string, index: CachedIndex) {
  try {
    localStorage.setItem(indexKey(userId), JSON.stringify(index));
  } catch {
    /* ignore: offline start falls back to Home */
  }
}

/** The plan id named by a `/p/:id/…` address, if any. */
export function planIdFromPath(pathname: string): string | null {
  const m = matchPath('/p/:id/*', pathname) ?? matchPath('/p/:id', pathname);
  return m?.params.id ?? null;
}

export const PlanSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  const userId = user?.id ?? null;
  const { pathname } = useLocation();
  const requestedPlanId = planIdFromPath(pathname);

  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const [commitError, setCommitError] = useState<string | null>(null);
  const commitInFlight = useRef(false);
  // The plan last opened at its address, so space-scoped routes keep it active.
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(() => readStored()?.planId ?? null);
  // Committed plan ids we have seen, so logout can clear their local stores.
  const knownPlanIds = useRef<Set<string>>(new Set());

  const spaceRef = useRef<SpaceSummary | null>(null);

  const notePlanName = useCallback((planId: string, name: string) => {
    setPlans((prev) => {
      const i = prev.findIndex((p) => p.id === planId);
      if (i < 0 || prev[i].name === name) return prev;
      const next = [...prev];
      next[i] = { ...prev[i], name };
      return next;
    });
  }, []);

  const notePlanCreated = useCallback((plan: PlanSummary) => {
    knownPlanIds.current.add(plan.id);
    setPlans((prev) => [plan, ...prev.filter((p) => p.id !== plan.id)]);
  }, []);

  const refreshPlans = useCallback(async () => {
    const list = await apiListPlans();
    setPlans(list);
    list.forEach((p) => knownPlanIds.current.add(p.id));
    if (userId && spaceRef.current) writeIndex(userId, { space: spaceRef.current, plans: list });
    return list;
  }, [userId]);

  // Load the space + plan list when signing in; fall back to the cached copy
  // when the server cannot be reached.
  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    let cancelled = false;
    setListLoaded(false);
    (async () => {
      try {
        const space = await getMySpace();
        if (cancelled) return;
        spaceRef.current = space;
        setSpaceId(space.id);
        await refreshPlans();
      } catch {
        const cached = readIndex(userId);
        if (cancelled || !cached) return; // nothing cached: addresses fall back to Home
        spaceRef.current = cached.space;
        setSpaceId(cached.space.id);
        setPlans(cached.plans);
        cached.plans.forEach((p) => knownPlanIds.current.add(p.id));
      } finally {
        if (!cancelled) setListLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, userId, refreshPlans]);

  // On logout, clear cached copies of synced plans but keep the anonymous plan (L1).
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === 'authenticated' && status === 'anonymous') {
      const ids = Array.from(knownPlanIds.current);
      knownPlanIds.current.clear();
      void Promise.all(ids.map((id) => clearPlanStore(id)));
      setSpaceId(null);
      setPlans([]);
      setListLoaded(false);
      setDraft(null);
      setCommitError(null);
      setLastOpenedId(null);
      writeStored(null);
    }
    prevStatus.current = status;
  }, [status]);

  // --- Resolution (D3), during render ---------------------------------------
  const signedIn = status === 'authenticated';
  const isResolving = status === 'loading' || (signedIn && !listLoaded);
  const inSpace = (id: string | null) => !!id && plans.some((p) => p.id === id);
  const isCurrentDraft = (id: string | null) => !!id && draft?.id === id;

  let resolvedId: string | null = null;
  let requestUnresolved = false;
  if (!signedIn) {
    resolvedId = ANON_PLAN_ID;
    requestUnresolved = !isResolving && requestedPlanId !== null && requestedPlanId !== ANON_PLAN_ID;
  } else if (!isResolving) {
    if (requestedPlanId !== null) {
      if (isCurrentDraft(requestedPlanId) || inSpace(requestedPlanId)) resolvedId = requestedPlanId;
      else requestUnresolved = true;
    } else if (isCurrentDraft(lastOpenedId) || inSpace(lastOpenedId)) {
      resolvedId = lastOpenedId;
    }
  }

  const activePlanId = resolvedId ?? ANON_PLAN_ID;
  const isDraft = signedIn && resolvedId !== null && isCurrentDraft(resolvedId);
  const sync = signedIn && resolvedId !== null && !isDraft;
  const hasActivePlan = !signedIn || resolvedId !== null;
  const atHome = signedIn && !isResolving && resolvedId === null;

  // Remember the plan opened at its address (persist committed plans only).
  useEffect(() => {
    if (!signedIn || requestedPlanId === null || resolvedId !== requestedPlanId) return;
    setLastOpenedId(requestedPlanId);
    if (!isDraft && spaceId) writeStored({ spaceId, planId: requestedPlanId });
  }, [signedIn, requestedPlanId, resolvedId, isDraft, spaceId]);

  // Leaving an uncommitted draft (another plan's address, or Home) abandons it:
  // it never reached the space, so only its local store needs clearing. Only a
  // draft whose address has been visited can be left — `newDraft` is called from
  // Home just before navigating to the draft.
  const draftVisited = useRef<string | null>(null);
  useEffect(() => {
    if (!draft || draft.pendingCommit) return; // a draft with edits is never discarded
    if (requestedPlanId === draft.id) {
      draftVisited.current = draft.id;
      return;
    }
    if (draftVisited.current !== draft.id) return;
    const leftForAnotherPlan = requestedPlanId !== null;
    if (leftForAnotherPlan || pathname === '/plans') {
      const id = draft.id;
      setDraft(null);
      setLastOpenedId((prev) => (prev === id ? null : prev));
      void clearPlanStore(id);
    }
  }, [draft, requestedPlanId, pathname]);

  const newDraft = useCallback((theatre: string, name = 'New flight plan') => {
    const id = generatePlanId();
    setDraft({ id, name, theatre, seed: { ...flightPlanUtils.newFlightPlan(theatre), name }, pendingCommit: false });
    setCommitError(null);
    return id;
  }, []);

  const commitDraft = useCallback(
    async (name?: string) => {
      const d = draftRef.current;
      if (!d || commitInFlight.current) return;
      commitInFlight.current = true;
      // From now on the draft has edits: it is kept even if the commit fails.
      setDraft((prev) => (prev && prev.id === d.id ? { ...prev, pendingCommit: true } : prev));

      const landed = (created: PlanSummary) => {
        knownPlanIds.current.add(d.id);
        // Add it to the list in the same render that clears the draft, so the
        // address never looks unresolved in between.
        setPlans((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
        setDraft((prev) => (prev && prev.id === d.id ? null : prev));
        setCommitError(null);
        if (spaceId) writeStored({ spaceId, planId: d.id });
        void refreshPlans();
      };

      try {
        landed(await apiCreatePlan({ id: d.id, name: name || d.name, theatre: d.theatre }));
      } catch {
        // An earlier attempt may have landed with its response lost (409):
        // reconcile with the server's list before reporting a failure.
        try {
          const found = (await refreshPlans()).find((p) => p.id === d.id);
          if (found) {
            landed(found);
            return;
          }
        } catch {
          /* still unreachable */
        }
        setCommitError(
          'This new plan is not saved to your account yet. It will be retried when you are back online.',
        );
      } finally {
        commitInFlight.current = false;
      }
    },
    [spaceId, refreshPlans],
  );

  // Retry a failed commit when connectivity returns (the next edit retries too).
  const pendingDraft = draft?.pendingCommit ? draft.id : null;
  useEffect(() => {
    if (!pendingDraft) return;
    const onOnline = () => void commitDraft();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [pendingDraft, commitDraft]);

  const draftSeed = isDraft ? draft?.seed ?? null : null;

  const value = useMemo<PlanSelectionValue>(
    () => ({
      activePlanId,
      hasActivePlan,
      sync,
      isDraft,
      atHome,
      isResolving,
      requestedPlanId,
      requestUnresolved,
      draftSeed,
      spaceId,
      plans,
      newDraft,
      commitDraft,
      commitError,
      refreshPlans,
      notePlanName,
      notePlanCreated,
    }),
    [
      activePlanId, hasActivePlan, sync, isDraft, atHome, isResolving, requestedPlanId,
      requestUnresolved, draftSeed, spaceId, plans, newDraft, commitDraft, commitError, refreshPlans, notePlanName,
      notePlanCreated,
    ],
  );

  return <PlanSelectionContext.Provider value={value}>{children}</PlanSelectionContext.Provider>;
};

const ANON_SELECTION: PlanSelectionValue = {
  activePlanId: ANON_PLAN_ID,
  hasActivePlan: true,
  sync: false,
  isDraft: false,
  atHome: false,
  isResolving: false,
  requestedPlanId: null,
  requestUnresolved: false,
  draftSeed: null,
  spaceId: null,
  plans: [],
  newDraft: () => ANON_PLAN_ID,
  commitDraft: async () => {},
  commitError: null,
  refreshPlans: async () => [],
  notePlanName: () => {},
  notePlanCreated: () => {},
};

/**
 * Selection state. Falls back to the anonymous single-plan selection when no
 * provider is present, so `FlightPlanProvider` works standalone (e.g. in tests).
 */
export const usePlanSelection = (): PlanSelectionValue => {
  return useContext(PlanSelectionContext) ?? ANON_SELECTION;
};
