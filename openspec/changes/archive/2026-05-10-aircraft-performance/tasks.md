## 1. Data model and regime relocation refactor

- [x] 1.1 Add `TakeoffPerformance` type to `packages/frontend/src/types/flightPlan.ts` (`{ timeSec: number; fuel: number; distance: number }`)
- [x] 1.2 Add `Aircraft` type with `model`, `takeoffConfiguration`, `taxiFuel`, `takeoff: TakeoffPerformance`, and `regimes: Regime[]`
- [x] 1.3 Add `aircraft: Aircraft` to `FlightPlan` and remove the top-level `regimes: Regime[]` field
- [x] 1.4 Bump `FLIGHT_PLAN_VERSION` from `"1.2"` to `"1.3"`
- [x] 1.5 Add `PERFORMANCE_FILE_VERSION = "1.0"` constant in `flightPlan.ts`
- [x] 1.6 Add a `defaultAircraft()` factory returning `{ model: "", takeoffConfiguration: "", taxiFuel: 0, takeoff: { timeSec: 0, fuel: 0, distance: 0 }, regimes: [] }` and use it wherever a fresh plan is created
- [x] 1.7 Update every `flightPlan.regimes` read site to `flightPlan.aircraft.regimes` — use TypeScript errors as a checklist; expected sites: `regimeUtils.ts`, `legCalculations.ts`, `PerformancePage.tsx`, `FlightPlanZone.tsx`, `usePersistedFlightPlan.ts`
- [x] 1.8 Update helpers in `regimeUtils.ts` (`propagateRegimeCruiseChange`, `clearRegimeFromAllWaypoints`, `applyRegimeToWaypoint`, `clearRegimeBinding`) so their internal reads/writes go through `aircraft.regimes`; signatures stay the same where possible
- [x] 1.9 Run `pnpm tsc --noEmit` (frontend) and confirm zero errors before moving on

## 2. Frontend persistence and migration

- [x] 2.1 In `usePersistedFlightPlan.ts`, recognise `version === "1.2"` on load and synthesise `aircraft` via `defaultAircraft()`
- [x] 2.2 Move any legacy top-level `regimes` array into `aircraft.regimes` during the v1.2 migration; delete the top-level field on the in-memory plan
- [x] 2.3 Set the in-memory version to `"1.3"` so the next save writes the new shape
- [x] 2.4 Add migration tests in `usePersistedFlightPlan.test.tsx`: v1.2 fixture with regimes loads with `aircraft.regimes` populated; v1.2 fixture without regimes loads with empty `aircraft.regimes`; v1.2 fixture's `regimeId` references continue to resolve; saved JSON has `version: "1.3"` and the new shape

## 3. Take-off segment computation (frontend, canonical)

- [x] 3.1 Add an optional `takeoff` field to the `LegSegmentsSegmented` discriminant: `takeoff?: { time: number; distance: number; fuel: number }` so callers can read each segment's contribution
- [x] 3.2 Extend `computeLegSegments` (or wrap it in a new `computeLeg1Segments`) to accept `aircraft.takeoff` and apply only when leg index = 0, regime is bound, `timeSec > 0`, and `distance > 0`
- [x] 3.3 Implement the wind-corrected take-off math: derive `TAS_to = takeoff.distance / (takeoff.timeSec / 3600)`; ground speed via `applyWind(TAS_to, originWind, course)`; ground distance = `groundSpeed × (takeoff.timeSec / 3600)`; segment time = `takeoff.timeSec` verbatim; segment fuel = `takeoff.fuel` verbatim
- [x] 3.4 Update the overflow check so the warning fires when `(takeoff_distance + climb_distance) > leg_distance` (or, when no climb, when `takeoff_distance > leg_distance`)
- [x] 3.5 In `calculateAllLegData`, plumb `aircraft.takeoff` and the leg index into the segment computation so leg 0 alone receives the take-off branch
- [x] 3.6 Unit tests in `legCalculations.test.ts`: leg 0 with active T/O and climb yields 3-phase result with summed totals; leg 0 with active T/O and no climb yields T/O + cruise; leg 0 with regime but `takeoff = {0,0,0}` reproduces today's 2-phase result exactly; leg 0 in Manual mode skips T/O even when `takeoff` is set; leg 1 (index ≥ 1) ignores `takeoff` regardless; T/O time and fuel are verbatim under any wind; T/O ground distance shrinks with headwind and grows with tailwind; warning fires when `T/O + climb > leg_distance`; warning fires when T/O alone > leg_distance with no climb
- [x] 3.7 Update `legCalcContract.test.ts` so the frontend/backend contract fixture covers a leg-0 T/O case (same fixture is consumed by `test_leg_calc_contract.py`)

## 4. Taxi fuel in the EFR chain

- [x] 4.1 In `calculateAllLegData`, initialise `previousEfr = flightPlan.initFob - flightPlan.aircraft.taxiFuel` (only at the start of the loop; subsequent legs continue chaining as today)
- [x] 4.2 Confirm `flightPlan.initFob` is never mutated by the taxi-fuel deduction
- [x] 4.3 Tests in `legCalculations.test.ts`: `taxiFuel = 0` reproduces pre-change EFR exactly; `taxiFuel = 400` reduces waypoint-1 EFR by 400 lbs and propagates through subsequent waypoints; `taxiFuel` does not appear as a recurring deduction on legs 2..N

## 5. Leg-row tooltip update

- [x] 5.1 Extend `segmentTooltipContent` in `FlightPlanZone.tsx` to render a `Take-off:` row above the existing `Climb:` / `Cruise:` rows when the segment result includes a `takeoff` contribution
- [x] 5.2 Render-test the tooltip in `RouteCard.test.tsx`: T/O row appears on leg 1 when active; T/O row absent on leg 1 when not active; T/O row absent on legs 2..N regardless

## 6. Backend parity

- [x] 6.1 Add `Aircraft` and `TakeoffPerformance` Pydantic models in `packages/backend/flight_plan.py` mirroring the frontend types; relocate `regimes` from `FlightPlan` into `Aircraft`
- [x] 6.2 Provide a `default_aircraft()` factory and use it as the `FlightPlan.aircraft` default
- [x] 6.3 Accept legacy v1.2 plans on import: if the request payload has top-level `regimes` and no `aircraft`, synthesise `aircraft` and move `regimes` into `aircraft.regimes`
- [x] 6.4 Implement the leg-0 take-off branch in `compute_leg_segments` (Python), using the same wind-corrected ground-distance math as the frontend
- [x] 6.5 Deduct `aircraft.taxiFuel` from the cumulative EFR at the start of leg 0 in the backend leg-data builder
- [x] 6.6 Extend `test_compute_leg_segments.py` with the same scenarios as task 3.6 (T/O active, T/O inactive, verbatim time/fuel, wind correction, overflow warning, leg ≥ 1 unaffected)
- [x] 6.7 Extend `test_leg_calc_contract.py` so a leg-0 T/O fixture round-trips to identical numbers between the TS and Python implementations
- [x] 6.8 Test legacy v1.2 plan ingestion: backend accepts the payload, regimes are correctly relocated, and computed leg-0 numbers match the frontend's pre-change values

## 7. Perf page header UI

- [x] 7.1 Add an always-visible header section to `PerformancePage.tsx` rendering above the existing left sidebar / right pane split
- [x] 7.2 Render text inputs for `aircraft.model` and `aircraft.takeoffConfiguration`, a number input for `aircraft.taxiFuel` (lbs), and three inputs for the take-off block: time as `mm:ss`, fuel in lbs, distance in NM
- [x] 7.3 Wire the take-off all-or-nothing positive validation: empty/zero is fine; any single positive value requires the other two positive; show an inline error and refuse to save partial states
- [x] 7.4 Add the `ⓘ` information icon next to the take-off row with the exact tooltip text from the spec ("Time, fuel, and distance covered from brake release through acceleration to climb speed. Use values from your aircraft's performance charts for your T/O configuration. Or obtain by flight testing the difference between a cruise climb and the same climb from brake release.")
- [x] 7.5 Wire all aircraft-field edits to `onFlightPlanUpdate` so changes persist via the existing auto-persistence mechanism
- [x] 7.6 Tests in `PerformancePage.test.tsx`: header is always visible (with and without regimes); editing each field persists; tooltip text matches; T/O all-or-nothing validation rejects mixed states and accepts all-zero / all-positive

## 8. Performance package export

- [x] 8.1 Add `downloadAircraft(plan)` to `flightPlanUtils.ts`: deep-copy `plan.aircraft`, build envelope `{ version: PERFORMANCE_FILE_VERSION, aircraft: <copy> }`, `JSON.stringify` with 2-space indent
- [x] 8.2 Filename: slugify `plan.aircraft.model` via `slugifyPlanName`; if empty, use `"performance"`. Append `".perf.json"`
- [x] 8.3 Trigger the download with the existing blob/URL/anchor pattern (factor out the helper if convenient; reuse what `downloadFlightPlan` does)
- [x] 8.4 Wire the `⬇ Export performance` button in the Perf page header to `downloadAircraft`
- [x] 8.5 Tests: filename slugification (`F-15E Strike Eagle` → `f-15e-strike-eagle.perf.json`); empty model fallback to `performance.json`; envelope shape; deep-copy independence (mutating exported object does not affect the in-memory plan)

## 9. Performance package import — validation

- [x] 9.1 Add `validatePerformancePackage(parsed: unknown)` in a new `packages/frontend/src/utils/performanceImport.ts`, returning `{ ok: true, aircraft } | { ok: false, errors: string[] }`
- [x] 9.2 Implement validation rules per the spec: `version === "1.0"`; `aircraft` is an object with `model: string`, `takeoffConfiguration: string`, `taxiFuel: number ≥ 0`, `takeoff: { timeSec, fuel, distance }` all numbers ≥ 0 and all-or-nothing positive, `regimes: array`
- [x] 9.3 Validate each regime: non-empty `id` and `name`; positive `cruise.tas`/`cruise.ff`; if `climb` present, positive `tas`/`ff`/`roc`; if `descent` present, positive `tas`/`ff`/`rod`; unique names within the imported set
- [x] 9.4 Silently ignore unknown keys at every nesting level (forward-compat)
- [x] 9.5 Unit tests in `performanceImport.test.ts`: each rejection rule (bad version, mixed-state T/O, duplicate regime name, missing fields, negative numbers); each acceptance case (empty regimes, fully-populated regime, only-cruise regime); unknown extra keys ignored

## 10. Performance package import — dialog and apply

- [x] 10.1 Create `PerformanceImportDialog.tsx` (or extend the existing `ImportFlightPlanDialog` pattern) with a file picker filtered to `.json`
- [x] 10.2 On file select, parse and validate; on validation failure, render the field-level errors inside the dialog with the `Replace` button disabled
- [x] 10.3 On validation success, render the preview block: file name, `Aircraft: <model or em-dash>`, `T/O Config: <config or em-dash>`, `Regimes: <count>`, and the impact line (`N waypoints currently use a regime; bindings that no longer match will revert to Manual`) computed from `points.filter(p => p.regimeId).length`
- [x] 10.4 Buttons: `Cancel` closes without applying; `Replace` (destructive style) applies the import
- [x] 10.5 Apply step: build `newAircraft = deepCopy(imported.aircraft)`; build the set of imported regime IDs; map waypoints to clear `regimeId` when not in the imported set; call `onFlightPlanUpdate({ ...flightPlan, aircraft: newAircraft, points: newPoints })`
- [x] 10.6 Wire the `⬆ Import performance` button on the Perf page to open the dialog
- [x] 10.7 Tests: cancel leaves plan unchanged; replace overwrites `aircraft` and preserves other fields; orphan `regimeId` is cleared; matching `regimeId` is preserved; impact-line count is correct

## 11. Kneeboard waypoint page header

- [x] 11.1 In `waypoint_list_page.py`, render a header line containing `aircraft.model` and `aircraft.takeoffConfiguration` joined by ` · ` when both are non-empty
- [x] 11.2 Render only the non-empty field (no separator) when one is empty; omit the line entirely when both are empty
- [x] 11.3 Verify (and if needed, audit) that no other kneeboard surface leaks regime names, taxi fuel, or take-off block values
- [x] 11.4 Tests in `test_kneeboard.py`: header rendered with both fields, header rendered with model only, header rendered with config only, header omitted when both empty, no other pages contain regime/taxi/T-O text

## 12. Cross-stack validation parity

- [x] 12.1 Add a fixture file `packages/shared/fixtures/aircraft-package.valid.json` (or similar location) containing a fully-populated valid performance package
- [x] 12.2 Frontend test asserts `validatePerformancePackage(<fixture>)` returns `ok: true`
- [x] 12.3 Backend test ingests a flight plan whose `aircraft` block equals the fixture's `aircraft` and asserts the Pydantic model accepts it
- [x] 12.4 Add `aircraft-package.invalid.json` and assert both validators reject it (exact field error reported by each)

## 13. End-to-end smoke

- [x] 13.1 Run the dev server (`pnpm dev`) and exercise the full user flow: create a plan, fill in aircraft fields and a regime with climb data, set a leg-1 wind, observe the leg-1 tooltip showing T/O + Climb + Cruise rows, observe waypoint-1 EFR reflecting taxi-fuel deduction
- [x] 13.2 Export the performance package and confirm filename + content
- [x] 13.3 Create a second plan, import the performance package, confirm the dialog preview is correct, replace, and confirm regimes appear in the new plan
- [x] 13.4 Generate a kneeboard and confirm the waypoint page renders the aircraft header line and that leg-1 ETE/fuel match the frontend
- [x] 13.5 Load a v1.2 plan from disk and confirm leg numbers, regime bindings, and EFR are unchanged from before this change
