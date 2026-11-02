# Tasks

## 1. Frontend: single leg-geometry pass (no behaviour change)

- [x] 1.1 Extract `computeLegGeometries(plan, aircraft, projection, mode)` in `utils/legCalculations.ts` from the duplicated loop (design D1). Keep today's formulas exactly, including `inboundBearing = heading`, `+ declination`, and the stored `destination.tas`. Verify that `pnpm --filter frontend test legCalculations` passes unchanged.
- [x] 1.2 Re-implement `calculateAllLegDrawData` and `calculateAllLegData` on top of `computeLegGeometries`. Verify that `theatreGolden.test.ts` and `flightPlanLayer.test.ts` pass without regenerating goldens, which proves the output is identical.
- [x] 1.3 Add an `aircraft: Aircraft` parameter to `createFlightPlanLayer` and pass it through to the leg-geometry pass. In `Map.tsx`, read the profile with `usePerformance()`, keep it in a ref like `flightPlanRef`, and rebuild the layer when it changes (design D2). Verify that the existing layer tests pass after updating their call sites, and that a new `flightPlanLayer` test shows a different profile changes the drawn coordinates for a bound leg (it fails until 2.2 lands; mark it `todo` until then).

## 2. Frontend: geometry fixes

- [x] 2.1 Add `effectiveTas(destination, aircraft)` to `utils/regimeUtils.ts` and use it for `displayTas` in `FlightPlanZone.tsx` (design D3). Verify with `regimeUtils.test.ts` cases: bound → regime cruise TAS, Manual → stored `tas`, orphan `regimeId` → stored `tas`. The existing sidebar tests should still pass.
- [x] 2.2 In `computeLegGeometries`, use `effectiveTas` for the turn radius and the heading. Verify with a `legCalculations.test.ts` case: a destination with stored `tas` 400 bound to a 480 kt regime gives the 480 kt radius. Enable the `todo` test from 1.3.
- [x] 2.3 Set the inbound bearing for leg *i* to leg *i−1*'s `outboundBearing` (design D4). Verify with a `legCalculations.test.ts` case: the arc start tangent equals the previous outbound bearing within 1e-6° for declination 0, +6, and −6, with and without a 40 kt crosswind.
- [x] 2.4 Change the course to `(outboundBearing − declination + 360) % 360` (design D5). Verify with test cases `090/+6 → 084`, `090/−6 → 096`, `002/+6 → 356`. Add a declination-invariance test: changing only the declination leaves turn centres, straightening points, distance, ETE, and fuel identical.
- [x] 2.5 Change the heading's wind correction to `asin(crosswind / effectiveTas)` (design D5). Verify with a test case: TAS 300, course 360, wind 60 kt from 045 gives a heading of about 008.1°. A no-wind case gives heading = course.
- [x] 2.6 Change the declination readout in `components/sidebar/ButtonZone.tsx` to `(+) <abs>°E` / `(−) <abs>°W` / `0°`. Verify with a component test covering 6.5, −6.5, and 0.

- [x] 2.7 Compute every wind component against the true course (design D5b): `computeLegSegments` input, level-cruise `applyWind`, and the heading. Show the wind direction as `°T` in the sidebar. Verify with:
  - a `legCalculations.test.ts` case: a 30 kt headwind on true 090° with declination +6 gives ground speed TAS − 30;
  - the declination-invariance test extended with wind;
  - a sidebar test for `270°T`.

## 3. Backend: geometry fixes

- [x] 3.1 Add `_effective_tas(point, aircraft)` to `flight_plan.py` and use it in `LegData` for the turn radius, the heading, and `time_to_straightening_s` (design D3). Verify with a `test_flight_plan_data.py` case for a bound leg (stored 400, regime 480 → 480 kt radius), a Manual leg, and an orphan `regimeId`.
- [x] 3.2 Store the leg's true outbound bearing on `LegData`, and pass it as the next leg's `inbound_bearing` in the `FlightPlanData` loop instead of `heading` (design D4). Verify with a test: the turn centre lies exactly one radius from the origin, perpendicular to the previous leg's outbound bearing, with declination +6 and a crosswind.
- [x] 3.3 Change `LegData.course` to `bearing − declination`, and the heading's wind correction to `asin(cross / effective_tas)` (design D5). Verify with the same course and heading cases as 2.4 and 2.5 in `test_flight_plan_data.py`. Review the existing heading assertions there (≈ lines 183, 209, 417) and update any that encoded the old formula.
- [x] 3.4 Pass the true bearing (not `self.course`) to `compute_leg_segments`, `apply_wind`, and the heading's wind correction in `LegData` (design D5b). Verify with the same headwind-with-declination case as 2.7 in `test_flight_plan_data.py`.
- [x] 3.5 Check that the kneeboard leg maps and the overview map draw turns from the updated `LegData`, with no other code change needed. Verify by generating a kneeboard for a golden fixture plan and visually confirming the turns join their arrival legs smoothly.

## 4. Golden fixtures and parity

- [x] 4.1 Regenerate `packages/shared/theatre-golden/frontend-expected.json` (`UPDATE_GOLDEN=1` on `theatreGolden.test.ts`) and `backend-expected.json` (`UPDATE_GOLDEN=1` on `test_theatre_golden.py`, run with the project venv) (design D6). Verify that course and heading shift by about −2 × declination (plus a small change in the wind correction), that turn geometry shifts only at turns, and that the frontend and backend expected values agree within the existing tolerances.
- [x] 4.2 Run the full suites (`pnpm test:frontend` and the backend pytest suite via the project venv). Verify both pass with no loosened tolerances.

## 5. Documentation

- [x] 5.1 Add a release-notes entry in `docs/` explaining:
  - the corrected courses and headings;
  - that turns now join smoothly;
  - that regime-bound turns use the regime TAS;
  - that users should re-check their declination sign (`(+)` = East), since stored values are not migrated.
  
  Verify that the entry exists and matches the proposal's BREAKING note.

## Workflow follow-up

- Implement `runway-departure` only after this change is applied. Its design should build on `computeLegGeometries`.
- Archive this change after review, so that the `leg-geometry` spec lands in `openspec/specs/`.
