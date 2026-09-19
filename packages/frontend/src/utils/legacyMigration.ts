import { defaultAircraft } from '../types/flightPlan';
import {
  hasStoredPerformance,
  savePerformance,
  PERFORMANCE_STORAGE_KEY,
  DEFAULT_PROFILE_NAME,
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
      const name = fp.aircraft.model?.trim() || DEFAULT_PROFILE_NAME;
      savePerformance({ name, aircraft: fp.aircraft });
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
 * Ensures `dcsplan.performance` has the profiled shape ({ version, name, aircraft }).
 * Runs after bootstrapPerformanceFromLegacyPlan so a pre-1.5 user gets both
 * migrations in a single boot. Must run synchronously before React mounts.
 */
export function migratePerformanceProfile(): void {
  try {
    const raw = localStorage.getItem(PERFORMANCE_STORAGE_KEY);
    if (!raw) {
      savePerformance({ name: DEFAULT_PROFILE_NAME, aircraft: defaultAircraft() });
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      savePerformance({ name: DEFAULT_PROFILE_NAME, aircraft: defaultAircraft() });
      return;
    }

    if (typeof parsed.name === 'string' && parsed.name.trim()) return;

    if ('aircraft' in parsed && parsed.aircraft && typeof parsed.aircraft === 'object') {
      const name = parsed.aircraft.model?.trim() || DEFAULT_PROFILE_NAME;
      parsed.name = name;
      localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }

    const name = parsed.model?.trim() || DEFAULT_PROFILE_NAME;
    savePerformance({ name, aircraft: parsed });
  } catch {
    try {
      savePerformance({ name: DEFAULT_PROFILE_NAME, aircraft: defaultAircraft() });
    } catch {
      // storage completely unavailable — app will start with in-memory defaults
    }
  }
}
