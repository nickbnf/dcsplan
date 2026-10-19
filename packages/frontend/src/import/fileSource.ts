/**
 * A flight-plan file as an import source (plan-import). The file is parsed on
 * the device and validated by the stateless `POST /flightplan/import`; the
 * library and performance snapshots it embeds are extracted here.
 */
import type { Aircraft, FlightPlan, LibraryObject } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';
import { getApiUrl } from '../config/api';
import { parseAircraftBlock } from '../utils/performanceStorage';
import { buildImportRequest } from '../utils/wireFormat';
import type { ImportSource } from './types';

/** The file is not a valid flight plan, or could not be validated. */
export class ImportFileError extends Error {}

function parseValidationError(error: any): string {
  if (typeof error === 'string') return error;
  if (error.detail) {
    if (Array.isArray(error.detail)) {
      return error.detail
        .map((err: any) => `${err.loc ? err.loc.join('.') : 'field'}: ${err.msg || 'Invalid value'}`)
        .join('\n');
    }
    if (typeof error.detail === 'string') return error.detail;
  }
  return error.message ?? 'An unknown error occurred while importing the flight plan.';
}

/** A stable id for a profile the file does not identify (files exported
 *  before profiles had ids): a hash of its aircraft data, formatted as a UUID,
 *  so importing the same file again finds the profile it added (D4). */
export async function profileIdFromContent(aircraft: Aircraft): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(aircraft));
  const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .slice(0, 16)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Parse and validate a plan file's text. Throws ImportFileError. */
export async function readPlanFile(text: string): Promise<ImportSource> {
  let jsonData: any;
  try {
    jsonData = JSON.parse(text);
  } catch {
    throw new ImportFileError('Invalid JSON: unable to parse file.');
  }

  if (!jsonData.version || !jsonData.flightPlan) {
    throw new ImportFileError('Invalid flight plan format: missing version or flightPlan field.');
  }

  // Performance snapshot (v1.5: top-level; v1.4: inside flightPlan.aircraft)
  const rawPerformance = jsonData.performanceSnapshot ?? jsonData.flightPlan?.aircraft;
  let aircraft: Aircraft | null = null;
  if (rawPerformance) {
    const perfResult = parseAircraftBlock(rawPerformance);
    if (perfResult.ok) aircraft = perfResult.aircraft;
  }
  const meta = jsonData.performanceProfile;
  const recordedId = meta && typeof meta === 'object' && typeof meta.id === 'string' ? meta.id : undefined;

  // Library snapshot: the backend does not know about it
  const snapshot: LibraryObject[] = Array.isArray(jsonData.librarySnapshot) ? jsonData.librarySnapshot : [];

  // { version, flightPlan, aircraft }: the aircraft is a sibling (AD-2)
  const wireBody = buildImportRequest(jsonData, aircraft ?? defaultAircraft());

  let response: Response;
  try {
    response = await fetch(getApiUrl('flightplan/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wireBody),
    });
  } catch (err) {
    throw new ImportFileError(err instanceof Error ? err.message : 'Failed to validate flight plan.');
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ImportFileError(parseValidationError(errorData));
  }

  const data = await response.json();
  // Strip aircraft back off: FlightPlan type no longer carries it. A profileId
  // only means something in the space it came from, so it is dropped too.
  const { aircraft: _aircraft, profileId: _profileId, ...rest } = data.flightPlan;
  const plan = rest as FlightPlan;
  plan.points = plan.points.map(p => (p.id ? p : { ...p, id: crypto.randomUUID() }));

  return {
    kind: 'file',
    plan,
    entries: snapshot.length > 0 ? { [plan.theatre]: snapshot } : {},
    profile: aircraft ? { id: recordedId ?? await profileIdFromContent(aircraft), aircraft } : null,
  };
}
