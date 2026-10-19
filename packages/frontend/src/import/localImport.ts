/**
 * Importing this device's local data into the space (capability:
 * local-data-migration; design D3, D5, D7).
 */
import type { AssetSync } from '../sync/assetSync';
import { moveOffDevice } from './localSource';
import { importIntoSpace, type SpaceDeps } from './spaceDestination';
import type { ImportOutcome, ImportSelection, ImportSource } from './types';

export const EMPTINESS_TIMEOUT_MS = 15_000;

/** Resolve once the space's assets have been pulled from the server and no
 *  write is pending; reject after `timeoutMs`. */
export function waitCaughtUp(sync: AssetSync, timeoutMs: number): Promise<void> {
  if (sync.getStatus().caughtUp) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('The space could not be read.'));
    }, timeoutMs);
    const unsubscribe = sync.subscribe(() => {
      if (!sync.getStatus().caughtUp) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

/**
 * Whether the space holds no plans, library entries or profiles, judged from
 * the server. If that cannot be determined, the space counts as not empty, so
 * the user is asked rather than imported into silently
 * (local-data-migration, *An empty account imports local data silently*).
 */
export async function isSpaceEmpty(
  listPlans: () => Promise<{ id: string }[]>,
  sync: AssetSync,
  timeoutMs = EMPTINESS_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const [plans] = await Promise.all([listPlans(), waitCaughtUp(sync, timeoutMs)]);
    const state = sync.getState();
    return plans.length === 0
      && Object.keys(state.entries).length === 0
      && Object.keys(state.profiles).length === 0;
  } catch {
    return false;
  }
}

/** Import the selected local items, then move what the server accepted off
 *  the device. */
export async function importLocalData(
  source: ImportSource,
  selection: ImportSelection,
  deps: SpaceDeps,
): Promise<ImportOutcome> {
  const outcome = await importIntoSpace(source, selection, deps);
  await moveOffDevice(source, outcome);
  return outcome;
}

/** Whether every selected item made it. */
export function fullySucceeded(outcome: ImportOutcome): boolean {
  return outcome.plan !== 'failed' && outcome.entries !== 'failed' && outcome.profile !== 'failed';
}
