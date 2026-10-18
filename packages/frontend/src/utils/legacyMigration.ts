import { defaultAircraft } from '../types/flightPlan';
import {
  hasStoredPerformance,
  savePerformance,
  PERFORMANCE_STORAGE_KEY,
} from './performanceStorage';

const FLIGHT_PLAN_STORAGE_KEY = 'dcsplan-flightplan';

/**
 * One-time bootstrap: if localStorage has a legacy plan with aircraft inline
 * and no separate performance key yet, extract and migrate aircraft to
 * `dcsplan.performance`. Must run synchronously before React mounts.
 */
export function bootstrapPerformanceFromLegacyPlan(): void {
  try {
    const raw = localStorage.getItem(FLIGHT_PLAN_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.flightPlan) return;

    const fp = parsed.flightPlan;
    if (!fp.aircraft || typeof fp.aircraft !== 'object') return;

    if (!hasStoredPerformance()) {
      savePerformance(fp.aircraft);
    }

    delete fp.aircraft;
    if (fp.regimes !== undefined) delete fp.regimes;

    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      version: '1.5',
      flightPlan: fp,
    }));
  } catch {
    // ignore migration errors — app will start with defaults
  }
}

/**
 * Ensures `dcsplan.performance` holds a profile, as `{ version, aircraft }`
 * (performance-profile, Anonymous profile bootstrap). Runs after
 * bootstrapPerformanceFromLegacyPlan so a pre-1.5 user gets both in a single
 * boot. A `name` from earlier versions is left in place and ignored on read.
 * Must run synchronously before React mounts.
 */
export function migratePerformanceProfile(): void {
  try {
    const raw = localStorage.getItem(PERFORMANCE_STORAGE_KEY);
    if (!raw) {
      savePerformance(defaultAircraft());
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      savePerformance(defaultAircraft());
      return;
    }
    if ('aircraft' in parsed) return;   // already an envelope
    savePerformance(parsed);           // a bare aircraft block: wrap it
  } catch {
    try {
      savePerformance(defaultAircraft());
    } catch {
      // storage completely unavailable — app will start with in-memory defaults
    }
  }
}
