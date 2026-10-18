import type { Aircraft } from '../types/flightPlan';
import { parseAircraftBlock } from './performanceStorage';

type ValidationResult =
  | { ok: true; aircraft: Aircraft }
  | { ok: false; errors: string[] };

export function validatePerformancePackage(parsed: unknown): ValidationResult {
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, errors: ['File is not a valid JSON object.'] };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['version'] !== '1.0') {
    return { ok: false, errors: [`Unsupported file version: "${obj['version']}". Expected "1.0".`] };
  }

  const result = parseAircraftBlock(obj['aircraft']);
  if (!result.ok) return result;

  // A `name` written by earlier versions is ignored: profiles are labelled
  // from their aircraft (performance-profile).
  return { ok: true, aircraft: result.aircraft };
}
