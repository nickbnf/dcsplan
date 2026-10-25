/**
 * Request bodies for the backend's plan endpoints (AD-2 wire format, reshaped
 * in add-cloud-sync): the aircraft travels as a sibling of the flight plan,
 * never inside it. Kept as pure builders so a shared contract fixture can pin
 * them to the backend's request models (shared/wire-format-fixtures).
 */
import type { Aircraft, FlightPlan, LibraryObject } from '../types/flightPlan';
import { formatEditors, type PlanVersion } from '../api/planApi';

/** The plan version a signed-in kneeboard stamps (add-version-history D8). */
export interface KneeboardRevision {
  rev: number;
  finalizedAt: string;
  /** Already formatted, e.g. `Falcon +2`. */
  editor: string;
}

export interface KneeboardRequestBody {
  flightPlan: FlightPlan & { librarySnapshot?: LibraryObject[] };
  aircraft: Aircraft;
  revision?: KneeboardRevision;
}

export interface ImportRequestBody {
  version: string;
  flightPlan: unknown;
  aircraft: Aircraft;
}

/** The stamp for a finalized version: its rev, time and editors. */
export function kneeboardRevision(version: PlanVersion): KneeboardRevision {
  return { rev: version.rev, finalizedAt: version.finalizedAt, editor: formatEditors(version.editors) };
}

/** POST /kneeboard. Library refs resolve from a snapshot of the referenced
 * entries carried inside the plan; unresolved refs simply have no snapshot.
 * A signed-in plan's kneeboard carries the version it stamps; an anonymous
 * one has none and is stamped with the generation time. */
export function buildKneeboardRequest(
  flightPlan: FlightPlan, aircraft: Aircraft, library: LibraryObject[], revision?: KneeboardRevision,
): KneeboardRequestBody {
  const referenced = new Set((flightPlan.libraryRefs ?? []).map(r => r.uuid));
  const snapshot = library.filter(e => referenced.has(e.id));
  return {
    flightPlan: { ...flightPlan, ...(snapshot.length > 0 && { librarySnapshot: snapshot }) },
    aircraft,
    ...(revision && { revision }),
  };
}

/** POST /flightplan/import: the file's version and plan, with the aircraft
 * extracted from the file (or the defaults) as a sibling. */
export function buildImportRequest(
  file: { version: string; flightPlan: Record<string, unknown> }, aircraft: Aircraft,
): ImportRequestBody {
  const { aircraft: _legacyNested, ...flightPlan } = file.flightPlan;
  return { version: file.version, flightPlan, aircraft };
}
