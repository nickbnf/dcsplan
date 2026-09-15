---
name: performance-data-lifecycle-alignment
description: Aircraft/performance data extracted from FlightPlan into its own PerformanceContext and localStorage key
metadata:
  type: project
---

Implemented the performance data lifecycle alignment plan (docs/plans/performance-data-lifecycle-alignment.md).

**What changed:** `Aircraft` (model, T/O config, taxi fuel, T/O perf, regimes) was extracted from `FlightPlan.aircraft` into a separate `PerformanceContext` backed by `localStorage['dcsplan.performance']`. Flight plan version bumped from 1.4 → 1.5.

**Why:** Clicking "Clear" on the flight plan was wiping the user's aircraft profile, which should survive plan clears (same lifecycle as the Library).

**Key architectural facts:**
- `contexts/PerformanceContext.tsx` → `usePerformance()` — new, no theatre dependency
- `utils/performanceStorage.ts` — new, single global key `dcsplan.performance`, exports `parseAircraftBlock()`
- `utils/legacyMigration.ts` — `bootstrapPerformanceFromLegacyPlan()` called in `main.tsx` before React mounts
- `calculateAllLegData()` now takes `aircraft: Aircraft` as 4th parameter (was `flightPlan.aircraft`)
- `flightPlanUtils.downloadAircraft(aircraft)` now takes `Aircraft` directly (not `FlightPlan`)
- `flightPlanUtils.downloadFlightPlan(plan, library, performance)` now embeds `performanceSnapshot`
- `ImportFlightPlanDialog` handles wire-format marshaling: injects `aircraft` before posting to backend (which still validates the combined shape), strips it on return
- Backend `main.py` SUPPORTED_VERSIONS now includes "1.4" and "1.5"
- `Layout.tsx` mounts `RegimeConsistencyGuard` which drops orphan regimeIds when performance.regimes changes

**How to apply:** When working on flight plan structure, performance data, or regime-related code — performance is now entirely separate from FlightPlan. Components that need both must use both hooks (`useFlightPlan()` and `usePerformance()`).
