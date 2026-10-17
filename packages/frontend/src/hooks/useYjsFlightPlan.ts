import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import type { FlightPlan } from '../types/flightPlan';
import { snapshotFromYDoc, seedYDoc } from '../utils/yjsFlightPlanBinding';
import { flightPlanUtils } from '../utils/flightPlanUtils';

// The anonymous tier keeps its single plan under the original (unkeyed) store
// name, so existing users' data and the legacy-localStorage migration are
// preserved (AD-9). Signed-in plans are keyed by their plan id (add-cloud-sync).
const LEGACY_STORE = 'dcsplan-flightplan-ydoc';
const LEGACY_STORAGE_KEY = 'dcsplan-flightplan';
export const ANON_PLAN_ID = 'local';

export function storeNameFor(planId: string): string {
  return planId === ANON_PLAN_ID ? LEGACY_STORE : `dcsplan-flightplan-ydoc-${planId}`;
}

/**
 * Delete a plan's local IndexedDB store (abandon a draft, or clear a synced plan
 * on logout). Never deletes the anonymous store, whose plan may be the only copy.
 */
export function clearPlanStore(planId: string): Promise<void> {
  return new Promise((resolve) => {
    if (planId === ANON_PLAN_ID) {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(storeNameFor(planId));
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function resolveSyncUrl(override?: string): string {
  if (override) return override;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/sync`;
}

function tryMigrateLegacyPlan(): FlightPlan | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    let planData: any;
    if (parsed && typeof parsed === 'object' && parsed.version && parsed.flightPlan) {
      planData = parsed.flightPlan;
    } else {
      planData = parsed;
    }

    if (!planData || typeof planData !== 'object') return null;
    if (!planData.theatre) planData.theatre = 'syria';

    if (
      typeof planData.theatre !== 'string' ||
      !Array.isArray(planData.points) ||
      typeof planData.declination !== 'number' ||
      typeof planData.bankAngle !== 'number' ||
      typeof planData.initTimeSec !== 'number' ||
      typeof planData.initFob !== 'number' ||
      typeof planData.name !== 'string'
    ) {
      return null;
    }

    // Ensure all waypoints have ids
    planData.points = planData.points.map((p: any) =>
      p.id ? p : { ...p, id: crypto.randomUUID() }
    );

    return planData as FlightPlan;
  } catch {
    return null;
  }
}

export interface UseYjsFlightPlanOptions {
  /** Attach the WebSocket sync provider (a signed-in, committed plan). */
  sync?: boolean;
  /** Base URL for the sync socket; the plan id is appended as the room. For tests. */
  syncUrl?: string;
  /** Initial plan to seed an empty, non-synced store with (e.g. a new draft on
   *  its chosen theatre). Defaults to a fresh plan on the default theatre. */
  seedPlan?: FlightPlan;
}

export type UseYjsFlightPlanResult = {
  yDoc: Y.Doc;
  flightPlan: FlightPlan | null;
  /** The plan id `flightPlan` belongs to; lags `planId` for a render while switching. */
  loadedPlanId: string | null;
  isReady: boolean;
  /** True while a synced plan is still catching up with the server (plan-sync). */
  isSyncing: boolean;
};

/**
 * Opens the Y.Doc for one flight plan, keyed by `planId`, backed by its own
 * IndexedDB store, and — when `sync` is set — a WebSocket provider to the
 * server. Changing `planId` or `sync` tears down the previous providers and
 * opens the new ones; non-active plans remain cached in their own stores.
 */
export function useYjsFlightPlan(
  planId: string = ANON_PLAN_ID,
  options: UseYjsFlightPlanOptions = {},
): UseYjsFlightPlanResult {
  const { sync = false, syncUrl, seedPlan } = options;
  const [flightPlan, setFlightPlan] = useState<FlightPlan | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadedPlanId, setLoadedPlanId] = useState<string | null>(null);
  const yDocRef = useRef<Y.Doc | null>(null);
  // Read the latest values at open time without re-running the doc effect.
  const seedRef = useRef<FlightPlan | undefined>(seedPlan);
  seedRef.current = seedPlan;
  const syncAtOpenRef = useRef(sync);
  syncAtOpenRef.current = sync;
  // Let the WebSocket effect mark the doc ready (empty-synced case).
  const finishReadyRef = useRef<(() => void) | null>(null);

  // The Y.Doc + IndexedDB store are keyed on `planId` ONLY. Toggling `sync`
  // (e.g. a draft committing on its first waypoint) must not recreate the doc —
  // that would remount the editor and lose transient UI state.
  useEffect(() => {
    const yDoc = new Y.Doc();
    yDocRef.current = yDoc;
    setIsReady(false);
    setFlightPlan(null);
    setLoadedPlanId(null);
    const openSynced = syncAtOpenRef.current;
    setIsSyncing(openSynced);

    const idb = new IndexeddbPersistence(storeNameFor(planId), yDoc);
    let cancelled = false;
    let subscribed = false;

    const finishReady = () => {
      if (cancelled || subscribed) return;
      subscribed = true;
      setFlightPlan(snapshotFromYDoc(yDoc));
      setLoadedPlanId(planId);
      setIsReady(true);
      yDoc.on('update', () => {
        if (!cancelled) setFlightPlan(snapshotFromYDoc(yDoc));
      });
    };
    finishReadyRef.current = finishReady;

    idb.whenSynced.then(() => {
      if (cancelled) return;
      const yPlan = yDoc.getMap('flightPlan');

      // Seed only a non-synced store (anonymous plan or local draft); a synced
      // plan is populated by the server, so we must not seed a competing doc.
      if (yPlan.size === 0 && !openSynced) {
        const migrated = planId === ANON_PLAN_ID ? tryMigrateLegacyPlan() : null;
        const initial = migrated ?? seedRef.current ?? flightPlanUtils.newFlightPlan();
        yDoc.transact(() => { seedYDoc(yDoc, initial); }, 'migration');
        if (migrated) {
          try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
        }
      }

      // Ready now, unless waiting for the first server sync of an empty store.
      if (!openSynced || yPlan.size > 0) finishReady();
    });

    return () => {
      cancelled = true;
      finishReadyRef.current = null;
      idb.destroy();
      yDoc.destroy();
    };
  }, [planId]);

  // The WebSocket provider attaches/detaches as `sync` toggles, on the existing
  // doc — no doc recreation, so committing a draft doesn't remount the editor.
  useEffect(() => {
    const yDoc = yDocRef.current;
    if (!sync || !yDoc) return;
    setIsSyncing(true);
    const ws = new WebsocketProvider(resolveSyncUrl(syncUrl), planId, yDoc, { connect: true });
    ws.on('sync', (isSynced: boolean) => {
      if (!isSynced) return;
      setIsSyncing(false);
      finishReadyRef.current?.();
    });
    return () => { ws.destroy(); };
  }, [planId, sync, syncUrl]);

  return { yDoc: yDocRef.current!, flightPlan, loadedPlanId, isReady, isSyncing };
}
