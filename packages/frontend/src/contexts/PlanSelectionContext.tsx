import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import type { FlightPlan } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { ANON_PLAN_ID, clearPlanStore } from '../hooks/useYjsFlightPlan';
import {
  createPlan as apiCreatePlan,
  getMySpace,
  listPlans as apiListPlans,
  renamePlan as apiRenamePlan,
  type PlanSummary,
} from '../api/planApi';

/**
 * The plan-selection layer (capability: space; AD-1, AD-15). It owns which
 * space and plan are active, the signed-in plan list, and the draft lifecycle
 * (defer-commit), and derives the `(planId, sync)` the flight-plan Y.Doc opens
 * with. Anonymous is space-less and always on the single local plan (AD-9).
 */

const SELECTION_KEY = 'dcsplan-active-selection';

interface StoredSelection {
  spaceId: string | null;
  planId: string;
}

interface DraftMeta {
  name: string;
  theatre: string;
}

export interface PlanSelectionValue {
  /** The plan id the flight-plan Y.Doc should open (ANON or a uuid). */
  activePlanId: string;
  /** Attach the WebSocket provider for this plan (signed-in, committed, not anon). */
  sync: boolean;
  /** The active plan is an uncommitted local draft. */
  isDraft: boolean;
  /** Signed-in with no real plan selected — the app should show Home. */
  atHome: boolean;
  /** Loading the space + plan list right after sign-in (avoids a Home flash). */
  isLoadingSelection: boolean;
  /** Display name of the active plan (draft or committed), or null when anonymous. */
  activePlanName: string | null;
  /** Initial plan to seed the active draft's store with (on its chosen theatre). */
  draftSeed: FlightPlan | null;
  spaceId: string | null;
  plans: PlanSummary[];
  /** Create a local draft (no server row yet) and make it active. */
  newDraft: (theatre: string, name?: string) => void;
  /** Register the active draft in the space (called on its first waypoint). */
  commitDraft: () => Promise<void>;
  /** Discard the active draft and clear its local store. */
  abandonDraft: () => Promise<void>;
  /** Make an existing committed plan active. */
  selectPlan: (planId: string) => void;
  /** Rename a committed plan (A1 unique within the space). */
  renamePlan: (planId: string, name: string) => Promise<void>;
  refreshPlans: () => Promise<PlanSummary[]>;
  /** Return to Home (clear the active selection without a plan). */
  goHome: () => void;
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

export const PlanSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();

  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [activePlanId, setActivePlanId] = useState<string>(ANON_PLAN_ID);
  const [isDraft, setIsDraft] = useState(false);
  const [isLoadingSelection, setIsLoadingSelection] = useState(false);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftSeed, setDraftSeed] = useState<FlightPlan | null>(null);
  const draftMetaRef = useRef<DraftMeta | null>(null);
  // Committed plan ids we have seen, so logout can clear their local stores.
  const knownPlanIds = useRef<Set<string>>(new Set());

  const refreshPlans = useCallback(async () => {
    const list = await apiListPlans();
    setPlans(list);
    list.forEach((p) => knownPlanIds.current.add(p.id));
    return list;
  }, []);

  // Load space + plans and restore the active selection when signing in.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    setIsLoadingSelection(true);
    (async () => {
      try {
        const space = await getMySpace();
        if (cancelled) return;
        setSpaceId(space.id);
        const list = await refreshPlans();
        if (cancelled) return;
        const stored = readStored();
        if (stored && list.some((p) => p.id === stored.planId)) {
          setActivePlanId(stored.planId);
          setIsDraft(false);
        } else {
          // Unresolvable or no stored selection → Home (no active plan).
          setActivePlanId(ANON_PLAN_ID);
          setIsDraft(false);
          writeStored(null);
        }
      } catch {
        /* backend unreachable — stay on the local plan */
      } finally {
        if (!cancelled) setIsLoadingSelection(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, refreshPlans]);

  // On logout, clear cached copies of synced plans but keep the anonymous plan (L1).
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === 'authenticated' && status === 'anonymous') {
      const ids = Array.from(knownPlanIds.current);
      knownPlanIds.current.clear();
      void Promise.all(ids.map((id) => clearPlanStore(id)));
      setSpaceId(null);
      setPlans([]);
      setActivePlanId(ANON_PLAN_ID);
      setIsDraft(false);
      draftMetaRef.current = null;
      setDraftSeed(null);
      writeStored(null);
    }
    prevStatus.current = status;
  }, [status]);

  const newDraft = useCallback((theatre: string, name = 'New flight plan') => {
    const id = crypto.randomUUID();
    draftMetaRef.current = { name, theatre };
    setDraftName(name);
    setDraftSeed({ ...flightPlanUtils.newFlightPlan(theatre), name });
    setActivePlanId(id);
    setIsDraft(true);
    // A draft is local-only until its first waypoint; don't persist it as the
    // restorable selection (it isn't in the space list yet).
    writeStored(null);
  }, []);

  const commitDraft = useCallback(async () => {
    if (!isDraft || !draftMetaRef.current) return;
    const meta = draftMetaRef.current;
    await apiCreatePlan({ id: activePlanId, name: meta.name, theatre: meta.theatre });
    knownPlanIds.current.add(activePlanId);
    draftMetaRef.current = null;
    setDraftName(null);
    setDraftSeed(null);
    setIsDraft(false); // flips `sync` on → the Y.Doc attaches its provider
    if (spaceId) writeStored({ spaceId, planId: activePlanId });
    await refreshPlans();
  }, [isDraft, activePlanId, spaceId, refreshPlans]);

  const abandonDraft = useCallback(async () => {
    if (!isDraft) return;
    const draftId = activePlanId;
    draftMetaRef.current = null;
    setDraftName(null);
    setDraftSeed(null);
    setIsDraft(false);
    setActivePlanId(ANON_PLAN_ID);
    writeStored(null);
    await clearPlanStore(draftId);
  }, [isDraft, activePlanId]);

  const selectPlan = useCallback(
    (planId: string) => {
      setActivePlanId(planId);
      setIsDraft(false);
      setDraftSeed(null);
      knownPlanIds.current.add(planId);
      if (spaceId) writeStored({ spaceId, planId });
    },
    [spaceId],
  );

  const renamePlan = useCallback(
    async (planId: string, name: string) => {
      await apiRenamePlan(planId, name);
      await refreshPlans();
    },
    [refreshPlans],
  );

  const goHome = useCallback(() => {
    setActivePlanId(ANON_PLAN_ID);
    setIsDraft(false);
    draftMetaRef.current = null;
    setDraftSeed(null);
    writeStored(null);
  }, []);

  const sync =
    status === 'authenticated' && activePlanId !== ANON_PLAN_ID && !isDraft;
  const atHome =
    status === 'authenticated' &&
    !isLoadingSelection &&
    activePlanId === ANON_PLAN_ID &&
    !isDraft;

  const activePlanName = useMemo(() => {
    if (activePlanId === ANON_PLAN_ID) return null;
    if (isDraft) return draftName;
    return plans.find((p) => p.id === activePlanId)?.name ?? null;
  }, [activePlanId, isDraft, draftName, plans]);

  const value = useMemo<PlanSelectionValue>(
    () => ({
      activePlanId,
      sync,
      isDraft,
      atHome,
      isLoadingSelection,
      activePlanName,
      draftSeed,
      spaceId,
      plans,
      newDraft,
      commitDraft,
      abandonDraft,
      selectPlan,
      renamePlan,
      refreshPlans,
      goHome,
    }),
    [
      activePlanId, sync, isDraft, atHome, isLoadingSelection, activePlanName, draftSeed, spaceId, plans,
      newDraft, commitDraft, abandonDraft, selectPlan, renamePlan, refreshPlans, goHome,
    ],
  );

  return <PlanSelectionContext.Provider value={value}>{children}</PlanSelectionContext.Provider>;
};

const ANON_SELECTION: PlanSelectionValue = {
  activePlanId: ANON_PLAN_ID,
  sync: false,
  isDraft: false,
  atHome: false,
  isLoadingSelection: false,
  activePlanName: null,
  draftSeed: null,
  spaceId: null,
  plans: [],
  newDraft: () => {},
  commitDraft: async () => {},
  abandonDraft: async () => {},
  selectPlan: () => {},
  renamePlan: async () => {},
  refreshPlans: async () => [],
  goHome: () => {},
};

/**
 * Selection state. Falls back to the anonymous single-plan selection when no
 * provider is present, so `FlightPlanProvider` works standalone (e.g. in tests).
 */
export const usePlanSelection = (): PlanSelectionValue => {
  return useContext(PlanSelectionContext) ?? ANON_SELECTION;
};
