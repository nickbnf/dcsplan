/**
 * The active space as an import destination (plan-import, *Signed-in import
 * adds a new plan to the space*; local-data-migration, *Imported local data
 * merges additively*).
 *
 * Order (D3): library entries, then the profile, then wait until the server has
 * acknowledged them, then create the plan with its content in one request (D1).
 * The plan comes last so a failure never leaves a plan whose selected items are
 * missing; every step is safe to repeat (D4).
 */
import * as Y from 'yjs';
import type { AssetSync } from '../sync/assetSync';
import { entriesFor } from '../sync/assetCache';
import { seedYDoc } from '../utils/yjsFlightPlanBinding';
import { generatePlanId } from '../utils/planId';
import { PlanRequestError, type createPlan as createPlanFn } from '../api/planApi';
import { awaitAcked } from './awaitAcked';
import type { HeldAssets, ImportOutcome, ImportSelection, ImportSource } from './types';

export const ACK_TIMEOUT_MS = 30_000;

export interface SpaceDeps {
  sync: AssetSync;
  createPlan: typeof createPlanFn;
  /** The ids of the space's plans, fresh from the server (to resolve a 409). */
  listPlanIds: () => Promise<string[]>;
  ackTimeoutMs?: number;
}

export function spaceHeld(sync: AssetSync): HeldAssets {
  return {
    entries: theatre => entriesFor(sync.getState(), theatre),
    hasProfile: id => Boolean(sync.getState().profiles[id]),
  };
}

function encodePlan(plan: Parameters<typeof seedYDoc>[1]): Uint8Array {
  const doc = new Y.Doc();
  seedYDoc(doc, plan);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

export async function importIntoSpace(
  source: ImportSource,
  selection: ImportSelection,
  deps: SpaceDeps,
): Promise<ImportOutcome> {
  const { sync } = deps;
  const outcome: ImportOutcome = { plan: 'skipped', entries: 'skipped', profile: 'skipped' };
  const state = sync.getState();

  // 1. Library entries: only ids the space does not hold. Putting a held id
  //    would edit it; the space's copy is kept instead.
  const putEntries: string[] = [];
  const importEntries = selection.entries && Object.keys(source.entries).length > 0;
  if (importEntries) {
    for (const [theatre, entries] of Object.entries(source.entries)) {
      for (const entry of entries) {
        if (state.entries[entry.id]) continue;
        sync.putEntry(theatre, entry);
        putEntries.push(entry.id);
      }
    }
  }

  // 2. The profile: reused when the space holds it, whatever the selection.
  let profileId: string | undefined;
  const putProfiles: string[] = [];
  if (source.profile) {
    if (state.profiles[source.profile.id]) {
      profileId = source.profile.id;
    } else if (selection.profile) {
      sync.putProfile({ id: source.profile.id, aircraft: source.profile.aircraft });
      putProfiles.push(source.profile.id);
      profileId = source.profile.id;
    }
  }
  const importProfile = selection.profile && source.profile !== null;

  // 3. Wait for the server to hold them.
  try {
    await awaitAcked(sync, { entries: putEntries, profiles: putProfiles }, deps.ackTimeoutMs ?? ACK_TIMEOUT_MS);
  } catch (err) {
    return {
      plan: selection.plan && source.plan ? 'failed' : 'skipped',
      entries: importEntries ? 'failed' : 'skipped',
      profile: importProfile ? 'failed' : 'skipped',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (importEntries) outcome.entries = 'done';
  if (importProfile) outcome.profile = 'done';

  // 4. The plan, created with its content.
  if (selection.plan && source.plan) {
    const { profileId: _fromSource, ...rest } = source.plan;
    const plan = profileId ? { ...rest, profileId } : rest;
    const id = source.planId ?? generatePlanId();
    try {
      await deps.createPlan({ id, name: plan.name, theatre: plan.theatre, initialState: encodePlan(plan) });
    } catch (err) {
      // A 409 is a retry whose first attempt landed (its reply was lost).
      const landed = err instanceof PlanRequestError && err.status === 409
        && (await deps.listPlanIds().catch(() => [] as string[])).includes(id);
      if (!landed) {
        return { ...outcome, plan: 'failed', error: err instanceof Error ? err.message : String(err) };
      }
    }
    outcome.plan = 'done';
    outcome.created = { id, name: plan.name, theatre: plan.theatre };
  }
  return outcome;
}
