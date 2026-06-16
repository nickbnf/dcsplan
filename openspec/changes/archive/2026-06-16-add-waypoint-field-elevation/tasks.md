## 1. Data model — frontend types

- [x] 1.1 Add `groundAlt?: number` to `FlightPlanTurnPoint` in `packages/frontend/src/types/flightPlan.ts` with a one-line comment clarifying it is meaningful only on first/last waypoints
- [x] 1.2 Add `groundAlt?: number` to `FlightPlanPointChange` in the same file
- [x] 1.3 Verify the type change does not break any existing `tsc` build: `pnpm --filter frontend tsc --noEmit`

## 2. Data model — backend types

- [x] 2.1 Add `groundAlt: Optional[float] = None` to the `FlightPlanTurnPoint` dataclass in `packages/backend/flight_plan.py`
- [x] 2.2 Verify the dataclass loads existing flight plan JSON without `groundAlt` (round-trip test in the existing backend test suite)

## 3. Frontend leg calculation

- [x] 3.1 In `packages/frontend/src/utils/legCalculations.ts:calculateAllLegData`, when `legIndex === 0`, pass `origin.groundAlt ?? 0` as `prevAlt` into `computeLegSegments` instead of `origin.alt`
- [x] 3.2 Add unit tests in the existing `legCalculations` test file covering: (a) leg 0 climb from `groundAlt = E` to `WP1.alt = A` produces altDelta `A - E`; (b) leg 0 with undefined `groundAlt` treats start as 0; (c) leg 0 with `groundAlt = WP1.alt` is level; (d) `WP0.alt ≠ WP0.groundAlt` does not affect leg 0; (e) legs 2..N still use `origin.alt` as prevAlt

## 4. Backend leg calculation

- [x] 4.1 In `packages/backend/flight_plan.py:LegData.__init__` (or wherever `compute_leg_segments` is called for leg 0), source `prev_alt` from `origin_pt.groundAlt or 0` when `i == 0`, else from `origin_pt.alt`
- [x] 4.2 Add Python tests mirroring the frontend leg-0 cases to ensure backend/frontend parity

## 5. Waypoint editing utilities

- [x] 5.1 In `packages/frontend/src/utils/flightPlanUtils.ts:addTurnPoint`, remove the back-fill block (currently `flightPlanUtils.ts:35-37`) that rewrites `newPoints[newPoints.length - 2]`
- [x] 5.2 In `addTurnPoint`, set `groundAlt: 0` on the newly added waypoint
- [x] 5.3 In `addTurnPoint`, when the plan had at least one prior waypoint, remove `groundAlt` from the previously-last waypoint (now interior)
- [x] 5.4 In `insertTurnPointAtMidpoint`, change the inheritance source from `originWpt` to `destinationWpt` for `alt`, `tas`, `fuelFlow`, `windSpeed`, `windDir`, and `regimeId` (preserve midpoint lat/lon and generated name; do not set `groundAlt`)
- [x] 5.5 In `deleteTurnPoint`, no change needed — the new last waypoint's `groundAlt` is preserved if present, undefined otherwise (treated as 0 in calc)
- [x] 5.6 Add unit tests covering: `addTurnPoint` no longer mutates prior waypoints; first add yields `groundAlt: 0`; appending demotes previous-last's `groundAlt`; `insertTurnPointAtMidpoint` copies from destination; midpoint insert does not set `groundAlt`

## 6. Sidebar UI — Field alt input

- [x] 6.1 In `packages/frontend/src/components/sidebar/FlightPlanZone.tsx`, identify the rendering path for the first waypoint card and add a "Field alt" numeric input bound to `groundAlt` (read current value, dispatch `updateTurnPoint(flightPlan, 0, { groundAlt: parseInt(...) })`)
- [x] 6.2 Add the same "Field alt" input on the last waypoint card, bound to `groundAlt` at index `points.length - 1`
- [x] 6.3 Ensure no "Field alt" input is rendered on any interior waypoint card
- [x] 6.4 Match the visual styling and edit semantics (parsing, defocus behaviour) of the existing altitude input on segment rows

## 7. Manual verification (browser)

- [x] 7.1 Start the dev server and open a new flight plan
- [x] 7.2 Place two waypoints; confirm both cards show `Field alt = 0`; first segment shows no climb glyph
- [x] 7.3 Bind a climb regime to the second waypoint; confirm leg 0 now shows a climb from 0 to the segment cruise altitude
- [x] 7.4 Set `Field alt` on the first waypoint to a non-zero value (e.g., 2000); confirm the climb amount decreases accordingly
- [x] 7.5 Reproduce the original bug scenario: set first segment to 5000, insert a midpoint waypoint, confirm the inserted waypoint inherits `alt = 5000` (destination), and that no spurious descent appears on leg 0
- [x] 7.6 Set the new first segment's altitude to 2000 (below the original 5000); confirm leg 0 shows a climb (from `groundAlt` to 2000), not a descent
- [x] 7.7 Append a new waypoint to the end of the plan; confirm the previously-last waypoint's `Field alt` input has disappeared (now interior) and the new last waypoint shows `Field alt = 0`
- [x] 7.8 Save the plan as JSON, reopen it, confirm `groundAlt` round-trips on first and last waypoints

## 8. Documentation and changelog

- [x] 8.1 Add a short note to the changelog / release notes describing the new "Field alt" field, the behaviour change on leg-0 climb start, and the removal of the `addTurnPoint` back-fill
- [x] 8.2 If the project has user-facing docs in `docs/`, add a brief mention of takeoff/landing field elevation under the waypoint-editing section (no waypoint-editing section exists in docs/ — changelog covers this)
