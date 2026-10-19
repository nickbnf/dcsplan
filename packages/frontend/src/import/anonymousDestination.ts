/**
 * The anonymous tier as an import destination (plan-import, *Anonymous import
 * replaces the single plan*). Everything is on the device, so nothing needs
 * acknowledging; the order still follows D3 (library, profile, plan) so the
 * plan never arrives before what it references.
 */
import type { Aircraft, FlightPlan, LibraryObject } from '../types/flightPlan';
import { loadLibrary } from '../utils/libraryStorage';
import type { HeldAssets, ImportOutcome, ImportSelection, ImportSource } from './types';

/** How the anonymous tier's stores are changed: through the live contexts, so
 *  the open plan, library and profile update at once. */
export interface AnonymousTargets {
  /** Merge entries into a theatre's device-local library (existing ids kept). */
  mergeEntries: (theatre: string, entries: LibraryObject[]) => void;
  setProfile: (aircraft: Aircraft) => void;
  replacePlan: (plan: FlightPlan) => void;
}

/** The anonymous tier holds one profile, which an import replaces: it never
 *  "already holds" the file's. */
export const anonymousHeld: HeldAssets = {
  entries: theatre => loadLibrary(theatre),
  hasProfile: () => false,
};

export function importAnonymously(
  source: ImportSource,
  selection: ImportSelection,
  targets: AnonymousTargets,
): ImportOutcome {
  const outcome: ImportOutcome = { plan: 'skipped', entries: 'skipped', profile: 'skipped' };

  if (selection.entries && Object.keys(source.entries).length > 0) {
    for (const [theatre, entries] of Object.entries(source.entries)) targets.mergeEntries(theatre, entries);
    outcome.entries = 'done';
  }
  if (selection.profile && source.profile) {
    targets.setProfile(source.profile.aircraft);
    outcome.profile = 'done';
  }
  if (selection.plan && source.plan) {
    // A profileId only means something inside a space.
    const { profileId: _profileId, ...plan } = source.plan;
    targets.replacePlan(plan);
    outcome.plan = 'done';
  }
  return outcome;
}
