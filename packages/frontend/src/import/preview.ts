import { summarizeSnapshotMerge } from '../utils/libraryStorage';
import type { HeldAssets, ImportPreview, ImportSource } from './types';

/** What importing `source` into a destination holding `held` would add
 *  (plan-import, *The chooser states what each item would add*). */
export function computePreview(source: ImportSource, held: HeldAssets): ImportPreview {
  let entries: ImportPreview['entries'] = null;
  for (const [theatre, incoming] of Object.entries(source.entries)) {
    if (incoming.length === 0) continue;
    const s = summarizeSnapshotMerge(held.entries(theatre), incoming);
    entries ??= { total: 0, added: 0, kept: 0, differs: 0 };
    entries.total += incoming.length;
    entries.added += s.added;
    entries.kept += s.kept;
    entries.differs += s.differs;
  }

  return {
    plan: source.plan
      ? { name: source.plan.name, theatre: source.plan.theatre, waypoints: source.plan.points.length }
      : null,
    entries,
    profile: source.profile
      ? { aircraft: source.profile.aircraft, present: held.hasProfile(source.profile.id) }
      : null,
  };
}
