## Why

Performance regimes (introduced in `2026-05-06-performance-regimes`) capture cruise/climb/descent values per power setting, but every other element of aircraft performance is still entered per-mission and locked inside a single flight plan: there is no aircraft model field, no take-off configuration, no taxi fuel, and no take-off / acceleration block. As a result, the regimes a pilot tunes for a given airframe cannot travel from one mission to another — they have to be retyped in every plan — and the first leg of every plan systematically under-counts time, fuel, and distance because brake-release-to-climb-speed is silently lumped into "cruise".

The aim of this change is to (a) capture aircraft-level performance data (model, T/O configuration, taxi fuel, T/O / acceleration) once per flight plan, (b) make the aircraft as a whole — including its regimes — portable across plans via a JSON file, mirroring the existing flight-plan upload/download flow, and (c) account for the take-off and acceleration phase in the leg-1 calculation so that the first leg's time and fuel match reality.

## What Changes

- **`Aircraft` block on the flight plan, with regimes nested inside.** Add `aircraft: Aircraft` on `FlightPlan` containing:
  - `model` (free text)
  - `takeoffConfiguration` (free text)
  - `taxiFuel` (lbs)
  - `takeoff` block: `timeSec` (integer seconds), `fuel` (lbs), `distance` (NM)
  - `regimes: Regime[]` — relocated from the top level of `FlightPlan`. A regime is a property of an aircraft, not of a plan, so it lives on the aircraft.
- **New "Performance package" file format.** Independent of the flight-plan JSON: `{ version, aircraft }` (the aircraft is the entire performance package, since regimes are nested inside it). Add download/upload buttons on the Perf page. Upload **replaces** (no merge for now) the `aircraft` block on the current flight plan, after a confirmation dialog. Waypoint `regimeId` references that no longer resolve to an imported regime are cleared on import (re-using the existing orphan-clearing rule).
- **Perf page header section.** Above the existing regime list/editor, render the aircraft fields (model, T/O config), taxi fuel, and the T/O perf inputs (time `mm:ss`, fuel `lbs`, distance `NM`) with an information tooltip explaining how to source the values. Add Export / Import buttons for the performance package.
- **Three-phase leg-1 computation.** When the first leg is **bound to a regime**, leg time/fuel/distance are computed as `T/O segment + climb segment + cruise segment`. The T/O segment uses the user-entered chart values for time and fuel **verbatim**, but the **ground distance is wind-corrected** (chart distance is treated as still-air distance; an effective TAS is derived as `chart_distance / chart_time` and combined with the origin-waypoint wind for the leg course to yield the actual ground distance). The climb and cruise segments behave exactly as today. When the first leg has no regime (Manual mode), no T/O segment is applied — the leg behaves as it does today.
- **Long-segment warning extended.** The existing `⚠ Fix` indicator now triggers when `T/O distance + climb distance > leg distance` (today it triggers only on `climb distance > leg distance`).
- **Taxi fuel applied at T/O.** EFR is reduced by `taxiFuel` at the start of leg 1, before the T/O segment burns fuel. The plan's `initFob` is unchanged (it remains visible elsewhere as the pre-taxi fuel-on-board).
- **Kneeboard parity.** The backend leg computation matches the frontend three-phase model for leg 1. The waypoint page (front of the kneeboard) prints `aircraft.model` and `aircraft.takeoffConfiguration` as a reference header; no other kneeboard pages are modified.
- **Version bump.** `FLIGHT_PLAN_VERSION` `"1.2"` → `"1.3"`. Loading a v1.2 plan: `aircraft` is synthesised with empty/zero defaults and the legacy top-level `regimes` array is moved into `aircraft.regimes`. With zero T/O values, leg 1 stays exactly as today (the T/O guard requires `timeSec > 0 && distance > 0`); regime bindings on every waypoint are preserved.

### Out of scope (deferred)

- Merging imported regimes/aircraft into the existing plan (only full-replace is supported for now).
- Aircraft-level libraries shared across plans (multiple aircraft per plan, switching aircraft mid-plan, etc.).
- Per-leg taxi/refuel events beyond a single taxi-out at the start.
- T/O performance variation by ambient conditions (temperature, runway altitude, gross weight). The user enters one set of constants per plan.

## Capabilities

### New Capabilities

- `aircraft-performance`: Capture aircraft-level performance data (model, T/O configuration, taxi fuel, T/O / acceleration block, and the regime collection) on a flight plan; export and import the entire `aircraft` block as a portable JSON file; consume the T/O block in the leg-1 calculation as a wind-corrected take-off segment that precedes the existing climb/cruise segments.

### Modified Capabilities

- `performance-regime`: Two requirements are updated. (1) The "Performance regime collection" requirement now places the `regimes` array inside `flightPlan.aircraft` rather than at the top level of `FlightPlan`. (2) The "Climb / descent leg computation" requirement is updated so that, on leg 1 only and only when a regime is bound, a take-off segment from the new `aircraft-performance` capability precedes the climb and cruise segments. Other legs are unchanged.

## Impact

- `packages/frontend/src/types/flightPlan.ts` — add the `Aircraft` and `TakeoffPerformance` types (with `regimes: Regime[]` nested inside `Aircraft`), replace the top-level `regimes` field on `FlightPlan` with `aircraft: Aircraft`, add a separate `PerformanceFileV1` envelope type, bump `FLIGHT_PLAN_VERSION` to `"1.3"`.
- `packages/frontend/src/utils/regimeUtils.ts`, `packages/frontend/src/utils/legCalculations.ts`, `packages/frontend/src/components/PerformancePage.tsx`, `packages/frontend/src/components/sidebar/FlightPlanZone.tsx` — update every `flightPlan.regimes` read site (~15–20 references) to `flightPlan.aircraft.regimes`. Mechanical refactor.
- `packages/frontend/src/utils/flightPlanUtils.ts` — add `downloadAircraft(plan)` and `applyImportedAircraft(plan, importedAircraft)` helpers; extend the plan-load migration path to synthesise the `aircraft` block and relocate the legacy top-level `regimes` array into it.
- `packages/frontend/src/utils/legCalculations.ts` — extend `computeLegSegments` (or wrap it) to support a `takeoff` precursor segment on leg 1 when a regime is bound and `aircraft.takeoff.timeSec > 0 && aircraft.takeoff.distance > 0`. Re-use `applyWind` for wind correction. Update the warning trigger to include T/O distance.
- `packages/frontend/src/components/PerformancePage.tsx` — add a header section for the aircraft fields (model, T/O config, taxi fuel, T/O perf with tooltip) and the Export/Import buttons. Wire validation: when any T/O perf field is positive, all three must be positive.
- `packages/frontend/src/components/sidebar/FlightPlanZone.tsx` — extend the leg-row tooltip on leg 1 to include the T/O segment when present (`Take-off: t · d · f` line above `Climb:` and `Cruise:`); EFR at waypoint 1 reflects taxi-fuel deduction.
- `packages/frontend/src/hooks/usePersistedFlightPlan.ts` — handle `version === "1.2"` migration (synthesise `aircraft`, relocate `regimes`).
- `packages/backend/flight_plan.py` — add Pydantic models for `Aircraft` and `TakeoffPerformance` (with `regimes` nested inside `Aircraft`), update the `FlightPlan` model to expose `aircraft` instead of a top-level `regimes` field, accept on import, apply the same three-phase leg-1 computation, deduct `taxiFuel` from the EFR chain at the start of leg 1.
- `packages/backend/waypoint_list_page.py` — print `aircraft.model` and `aircraft.takeoffConfiguration` as a header on the waypoint page of the kneeboard.
- New file `packages/frontend/src/components/PerformanceImportDialog.tsx` (or extend the existing `ImportFlightPlanDialog` pattern) — confirmation dialog for the performance-package upload.
