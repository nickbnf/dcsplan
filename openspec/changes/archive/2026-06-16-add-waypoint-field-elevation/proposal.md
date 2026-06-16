## Why

The flight plan has no concept of takeoff or landing **field elevation**. The first waypoint's `alt` field is never displayed or editable in the UI, yet it silently controls the starting altitude of the leg-0 climb. New plans default it to 3000 ft, which leaks into climb/descent calculations as a phantom altitude. A user setting the first segment's cruise altitude to anything below 3000 ft sees an unexpected *descent* on leg 0 (instead of a climb from field elevation). Inserting a waypoint between the first two waypoints amplifies the bug because the insert copies the origin's (phantom) altitude into the new waypoint.

This change exposes takeoff and landing field elevation as a first-class, user-editable concept on the first and last waypoints, anchors leg-0 climb math to it, fixes the midpoint-insert altitude-inheritance bug, and removes a related back-fill in `addTurnPoint` that has the same root cause.

## What Changes

- Add an optional `groundAlt: number` field to `FlightPlanTurnPoint` (TypeScript and Python). Meaningful only on the first and last waypoints; ignored elsewhere.
- Render a new **"Field alt"** input on the first and last waypoint cards in the route sidebar; no UI elsewhere.
- Climb computation for **leg 0** SHALL use `WP0.groundAlt` as the starting altitude (instead of `WP0.alt`). The takeoff segment continues to consume only time/distance/fuel (no altitude change), and the climb regime covers the full altitude delta from field elevation up to the first cruise altitude.
- The last waypoint's `groundAlt` is **stored but not used in calculations** in this change. The last leg continues to be flown at cruise altitude throughout. Descent-to-field-elevation at the end of the last leg is deferred to a future change.
- Fix `insertTurnPointAtMidpoint`: the new waypoint SHALL inherit altitude, TAS, fuel flow, and regime from the **destination** waypoint of the split leg (not the origin). This matches the physical truth — the midpoint of a leg is at the leg's cruise altitude.
- Remove the altitude/tas/ff back-fill at `flightPlanUtils.ts:36` in `addTurnPoint`. Newly added waypoints SHALL NOT mutate any previously placed waypoint's planning fields.
- **BREAKING (behavior)**: existing plans where the user set the first segment's altitude below the previous phantom default (3000 ft) will show a corrected climb on leg 0 once `groundAlt` is set. No automatic migration is performed; users adjust `Field alt` in the UI on a per-plan basis.
- Backend (`packages/backend/flight_plan.py`) mirrors the data-model and climb-math changes.

## Capabilities

### New Capabilities
- `waypoint-field-elevation`: owns the concept of takeoff/landing field elevation. Defines the `groundAlt` field on `FlightPlanTurnPoint`, its UI presence on first and last waypoint cards only, and the rule that leg-0 climb math anchors to `WP0.groundAlt`. Reserves `WP_last.groundAlt` for a future descent-at-end-of-leg behavior.

### Modified Capabilities
- `performance-regime`: the "altitude going into this waypoint" convention is refined — for the **first** waypoint, the planning `alt` field no longer governs leg-0 climb start (which now reads `groundAlt`); for the **last** waypoint, `alt` continues to mean cruise altitude of the final leg and `groundAlt` is recorded but not consumed by descent math yet.

## Impact

- **Frontend types**: `FlightPlanTurnPoint` gains `groundAlt?: number`. `FlightPlanPointChange` gains the same.
- **Frontend calc**: `calculateAllLegData` / `computeLegSegments` at `packages/frontend/src/utils/legCalculations.ts` — read `origin.groundAlt` for `prevAlt` when `legIndex === 0`.
- **Frontend utils**: `packages/frontend/src/utils/flightPlanUtils.ts` — `insertTurnPointAtMidpoint` copies destination instead of origin; `addTurnPoint` no longer back-fills the previous waypoint.
- **Frontend UI**: `packages/frontend/src/components/sidebar/FlightPlanZone.tsx` — render `Field alt` input on first and last waypoint cards.
- **Backend types**: `FlightPlanTurnPoint` in `packages/backend/flight_plan.py` gains `groundAlt`.
- **Backend calc**: `compute_leg_segments` mirror — read `prev.groundAlt` on first leg.
- **File format / persistence**: JSON round-trip includes `groundAlt` when set; absence on load is tolerated (treated as `undefined`/`None`).
- **Tests**: extend leg-calculation tests for the leg-0 climb start altitude; cover midpoint-insert inheritance; cover `addTurnPoint` no-backfill behavior.
- **Deferred (not in this change)**: descent-at-end-of-leg behavior on the last leg, using `WP_last.groundAlt`. Requires a new code path (descent applied at the end of the leg rather than the start).
