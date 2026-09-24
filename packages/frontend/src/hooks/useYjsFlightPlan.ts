import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { FlightPlan } from '../types/flightPlan';
import { snapshotFromYDoc, seedYDoc } from '../utils/yjsFlightPlanBinding';
import { flightPlanUtils } from '../utils/flightPlanUtils';

const YDOC_DB_NAME = 'dcsplan-flightplan-ydoc';
const LEGACY_STORAGE_KEY = 'dcsplan-flightplan';

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

export type UseYjsFlightPlanResult = {
  yDoc: Y.Doc;
  flightPlan: FlightPlan | null;
  isReady: boolean;
};

export function useYjsFlightPlan(): UseYjsFlightPlanResult {
  const [flightPlan, setFlightPlan] = useState<FlightPlan | null>(null);
  const [isReady, setIsReady] = useState(false);
  const yDocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<IndexeddbPersistence | null>(null);

  useEffect(() => {
    const yDoc = new Y.Doc();
    yDocRef.current = yDoc;

    const provider = new IndexeddbPersistence(YDOC_DB_NAME, yDoc);
    providerRef.current = provider;

    provider.whenSynced.then(() => {
      const yPlan = yDoc.getMap('flightPlan');

      if (yPlan.size === 0) {
        // Y.Doc is empty — try migration from localStorage, else default
        const migrated = tryMigrateLegacyPlan();
        const initialPlan = migrated ?? flightPlanUtils.newFlightPlan();

        yDoc.transact(() => {
          seedYDoc(yDoc, initialPlan);
        }, 'migration');

        if (migrated) {
          try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
        }
      }

      setFlightPlan(snapshotFromYDoc(yDoc));
      setIsReady(true);

      // Subscribe to future updates
      yDoc.on('update', () => {
        setFlightPlan(snapshotFromYDoc(yDoc));
      });
    });

    return () => {
      provider.destroy();
      yDoc.destroy();
    };
  }, []);

  return {
    yDoc: yDocRef.current!,
    flightPlan,
    isReady,
  };
}
