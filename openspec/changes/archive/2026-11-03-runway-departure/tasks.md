# Tasks

## 1. Data model and inputs

- [x] 1.1 Add `runway?: number` to `FlightPlanTurnPoint` and `FlightPlanPointChange` in `types/flightPlan.ts`, and add `'runway'` to the waypoint field allow-list in `utils/yjsFlightPlanBinding.ts` (design D8). Verify with a `yjsFlightPlanBinding` test: a `runway` set on WP0 round-trips through the Y.Doc. Verify with a `flightPlanUtils` test: new waypoints (first, append, midpoint insert) have no `runway`, and deleting WP0 does not move the runway to the new first waypoint.
- [x] 1.2 Add the "Rwy" input to the first waypoint card in `FlightPlanZone.tsx`, beside "Field alt". Show two digits, set 1–36, clear on an empty commit, and reject anything else with an inline error. Verify with `FlightPlanZone` tests: the input appears on the first card only; `9` commits and shows `09`; an empty commit clears the runway; `0`, `37` and `27.5` show the error and leave the plan unchanged.
- [x] 1.3 Add `straightOutDistance?: number` to `Aircraft` and add `straightOutDistanceNm(aircraft)` (default 2 NM) in a new `utils/departure.ts`. Extend `parseAircraftBlock`: accept the field when absent, reject it when ≤ 0. Write it on export only when set. Make `isDefaultAircraft` treat absent and `2` as equal. Verify with `performanceStorage` / import tests: a file without the field imports with 2 NM, `straightOutDistance: 0` is rejected with an error naming the field, and export → import round-trips 3.5.
- [x] 1.4 Add the "Straight out" input (NM) with its info tooltip on the General performance line of `PerformancePage.tsx` (spec "Perf page header section"). Verify with `PerformancePage` tests: the field shows `2` when unset; the tooltip text matches the spec exactly; `0` or a negative value shows an inline error and is not saved; a valid value persists.

## 2. Frontend departure computation

- [x] 2.1 In `utils/departure.ts`, extract the take-off-active and transition-phase predicates, and make `computeLegSegments` use them with no change in behaviour (design D1). Verify that `legCalculations.test.ts` and `theatreGolden.test.ts` pass unchanged.
- [x] 2.2 Implement `departureSchedule(plan, aircraft)` (design D1). It builds the take-off phase from `v(t) = Vc·(t/T)^p`, using the constant `D/T` when `D ≥ Vc·T`, then the transition phase at the transition TAS for `|Δalt|/roc`, then cruise at the effective TAS. Verify with `departure.test.ts`:
  - `Vc = 300`, `T = 60 s`, `D = 2.5 NM` gives `p = 1` and linear speed;
  - air distance over the take-off phase equals `D` within 1 m;
  - `D ≥ Vc·T` gives a constant `D/T`;
  - with the take-off block all zero, the schedule starts at climb TAS;
  - a Manual leg uses the stored TAS throughout.
- [x] 2.3 Implement `buildDeparturePath(...)` (design D2), in both projected and geographic mode:
  - 1 s exact-arc steps, with step boundaries at phase changes and at the start of the turn;
  - auto turn direction;
  - roll-out found by bisection;
  - unreachable detection.
  
  Verify with `departure.test.ts`:
  - a constant-speed turn matches `calculateStraighteningPoint` within 1 m;
  - WP1 to the right gives a right turn, and to the left a left turn;
  - WP1 on the runway axis gives no turn and a distance equal to WP0→WP1;
  - WP1 behind the airfield gives about a 180° turn, with a distance greater than WP0→WP1;
  - an accelerating turn has a larger radius at roll-out than at entry;
  - a top of climb inside the turn switches to the cruise-TAS radius;
  - WP1 closer than `S`, or inside the turn, is unreachable.
- [x] 2.4 Implement `departureTiming(path)` with `groundDistance(t0, t1, wind)` and `timeOver(s0, s1, tas, wind)` (design D4). Verify with `departure.test.ts`:
  - in still air, `groundDistance` equals air distance and `timeOver` equals distance / TAS;
  - a 20 kt headwind along the runway shortens the take-off ground distance by about `20 · T/3600` NM.
- [x] 2.5 Add the leg-1 departure branch to `computeLegGeometries` (design D3):
  - runway true heading = `runway·10 + declination`;
  - roll-out point as the straightening point;
  - `LegGeometry.departure` holds the path;
  - `departureWarning: 'unreachable'` with a fallback to the no-runway computation.
  
  Keep `departure.points` in `LegDrawDataResult`. Verify with `legCalculations.test.ts`:
  - with no runway, the output deep-equals the previous output;
  - with declination ±6, a runway-27 departure with WP1 on the axis shows course 270;
  - leg 2's turn starts along leg 1's final straight segment;
  - changing only the winds leaves `departure.points` unchanged.
- [x] 2.6 Thread `departureTiming` through `computeLegSegments` (optional `departure` input) and the level-ETE path in `calculateAllLegData`. Expose `departureWarning` on `LegData` (design D4, D7). Verify with `legCalculations.test.ts`:
  - with a runway headwind that is a tailwind on the WP0→WP1 course, the take-off ground distance is reduced;
  - take-off time and fuel are verbatim;
  - take-off, climb and cruise distances sum to the departure path length;
  - with no runway, the results are identical.
  
  Verify that `theatreGolden.test.ts` passes without regenerating.

## 3. Frontend rendering and warning

- [x] 3.1 Draw leg 1 as `departure.points` followed by the destination in `utils/flightPlanLayer.ts` when a departure is present (design D6). Verify with a `flightPlanLayer.test.ts` case: with a runway, the leg-1 LineString starts at WP0, its second point lies along the runway true heading, and it ends at WP1; with no runway, it is unchanged.
- [x] 3.2 Show the `⚠ Fix` badge in `FlightPlanZone.tsx` when `departureWarning` is set, with the unreachable tooltip, alongside any segment warning (design D7). Verify with `FlightPlanZone` tests: WP1 1.5 NM from WP0 with `S = 2` shows the badge and the tooltip; moving WP1 away or clearing the runway hides it.

## 4. Backend parity

- [x] 4.1 Add `runway: Optional[int] = Field(None, ge=1, le=36)` to the waypoint model and `straightOutDistance: float = Field(2.0, gt=0)` to `Aircraft` in `flight_plan.py` (design D8). Verify with `test_flight_plan_data.py` cases: a plan with `runway` parses; a legacy plan parses with no runway and a 2 NM default; `runway: 37` and `straightOutDistance: 0` are rejected.
- [x] 4.2 Create `departure.py`, mirroring `departure.ts` function by function: predicates, `departure_schedule`, `build_departure_path`, `departure_timing` (design D5). Make `compute_leg_segments` use the shared predicates. Verify with a new `test_departure.py` holding the same cases as 2.2–2.4.
- [x] 4.3 Add the leg-1 departure branch to `LegData`: store `departure_path` and `departure_warning`, and pass the timing to `compute_leg_segments` and the level ETE (design D3, D4). Verify with `test_flight_plan_data.py` cases mirroring 2.5–2.6. Verify that `test_theatre_golden.py` passes without regenerating.
- [x] 4.4 Draw the departure path as a polyline in `map_annotations.draw_leg`, and add the path points to the bounds in `overview_map_page.py` and the kneeboard leg-map bounding box (design D6). Verify with `test_map_annotations.py` / `test_kneeboard.py` cases: a departure path is drawn and lies inside the map extent. Also generate a kneeboard for a runway plan and visually confirm the path.

## 5. Parity fixture and integration

- [x] 5.1 Add one plan to `packages/shared/theatre-golden/plans.json` with a runway, an active take-off block, a climb, declination and wind. Regenerate the expected files with `UPDATE_GOLDEN=1` on both sides (backend via the project venv), and verify that the existing plans' entries are unchanged in the diff. Compare the new plan's leg-1 distance, ETE and fuel between the frontend and backend expected files, and verify they agree within the existing tolerances.
- [x] 5.2 Run the full suites (`pnpm test:frontend`, `pnpm --filter frontend exec tsc --noEmit`, and backend pytest via the project venv). Verify that all pass with no loosened tolerances.
- [x] 5.3 Add a `docs/release-notes.md` entry for runway departures: the Rwy field, the straight-out distance on the profile, and the `⚠ Fix` unreachable warning. Verify that the entry matches the proposal.

## Workflow follow-up

- Archive the change after review so that the `departure` spec and the `aircraft-performance` / `performance-regime` deltas land in `openspec/specs/`.
