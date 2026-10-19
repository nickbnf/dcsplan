/**
 * The import pipeline (add-local-data-import D2): a source (a plan file, or
 * this device's anonymous data) is previewed against a destination (the
 * anonymous stores, or the active space), the user selects what to bring in,
 * and the destination executes the selection.
 *
 * Capabilities: plan-import, local-data-migration.
 */
import type { Aircraft, FlightPlan, LibraryObject } from '../types/flightPlan';

/** A profile to import. The id is fixed by the source so a retry finds the
 *  profile it already added (D4). */
export interface ImportProfile {
  id: string;
  aircraft: Aircraft;
}

export interface ImportSource {
  kind: 'file' | 'local';
  /** The plan, or null when the source holds none (local data without one). */
  plan: FlightPlan | null;
  /** The plan id to create it under, reused across retries (local data, D4). */
  planId?: string;
  /** Library entries by theatre. A file holds only its plan's theatre. */
  entries: Record<string, LibraryObject[]>;
  profile: ImportProfile | null;
}

/** What the user chose. A file's plan is always imported. */
export interface ImportSelection {
  plan: boolean;
  entries: boolean;
  profile: boolean;
}

export const SELECT_ALL: ImportSelection = { plan: true, entries: true, profile: true };

/** What the destination already holds, for the preview counts. */
export interface HeldAssets {
  entries: (theatre: string) => LibraryObject[];
  hasProfile: (id: string) => boolean;
}

export interface ImportPreview {
  plan: { name: string; theatre: string; waypoints: number } | null;
  /** Null when the source holds no entries. */
  entries: { total: number; added: number; kept: number; differs: number } | null;
  /** Null when the source holds no profile. `present`: the destination
   *  already holds it, and reuses it whatever the selection. */
  profile: { aircraft: Aircraft; present: boolean } | null;
}

export type ItemOutcome = 'done' | 'skipped' | 'failed';

export interface ImportOutcome {
  plan: ItemOutcome;
  entries: ItemOutcome;
  profile: ItemOutcome;
  /** The created plan (signed-in), to open it. */
  created?: { id: string; name: string; theatre: string };
  error?: string;
}
