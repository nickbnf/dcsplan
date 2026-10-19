/**
 * This device's anonymous data as an import source, and moving it off the
 * device once imported (capability: local-data-migration; design D4–D6).
 *
 * The ids an import will use are fixed the first time they are needed and kept
 * until the item is moved, so a retry after a partial failure finds what the
 * first attempt already added.
 */
import { defaultAircraft } from '../types/flightPlan';
import { isFreshPlan } from '../utils/flightPlanUtils';
import { listLocalLibraries, removeLocalEntries } from '../utils/libraryStorage';
import { isDefaultAircraft, loadPerformance, savePerformance } from '../utils/performanceStorage';
import { generatePlanId } from '../utils/planId';
import { readAnonymousPlan, resetAnonymousPlan } from '../hooks/useYjsFlightPlan';
import type { ImportOutcome, ImportSource } from './types';

export const LOCAL_PLAN_ID_KEY = 'dcsplan.localImport.planId';
export const LOCAL_PROFILE_ID_KEY = 'dcsplan.performance.importId';

function stableId(key: string, generate: () => string): string {
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = generate();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return generate();
  }
}

function forget(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** The device's local data, or null when there is nothing worth importing
 *  (local-data-migration, *Local data is defined per item*). */
export async function readLocalData(): Promise<ImportSource | null> {
  const anonymousPlan = await readAnonymousPlan();
  const plan = anonymousPlan && !isFreshPlan(anonymousPlan) ? anonymousPlan : null;
  const entries = listLocalLibraries();
  const aircraft = loadPerformance();
  const hasProfile = !isDefaultAircraft(aircraft);

  if (!plan && Object.keys(entries).length === 0 && !hasProfile) return null;
  return {
    kind: 'local',
    plan,
    planId: plan ? stableId(LOCAL_PLAN_ID_KEY, generatePlanId) : undefined,
    entries,
    profile: hasProfile ? { id: stableId(LOCAL_PROFILE_ID_KEY, () => crypto.randomUUID()), aircraft } : null,
  };
}

/** Remove what the server accepted from the device's anonymous data
 *  (local-data-migration, *Import moves local data off the device*). Items
 *  that were skipped or failed stay. */
export async function moveOffDevice(source: ImportSource, outcome: ImportOutcome): Promise<void> {
  if (outcome.entries === 'done') {
    for (const [theatre, entries] of Object.entries(source.entries)) {
      removeLocalEntries(theatre, entries.map(e => e.id));
    }
  }
  if (outcome.profile === 'done') {
    savePerformance(defaultAircraft());
    forget(LOCAL_PROFILE_ID_KEY);
  }
  if (outcome.plan === 'done') {
    await resetAnonymousPlan();
    forget(LOCAL_PLAN_ID_KEY);
  }
}
