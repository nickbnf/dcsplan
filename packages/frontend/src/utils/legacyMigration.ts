import { hasStoredPerformance, savePerformance } from './performanceStorage';

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
