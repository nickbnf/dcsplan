## ADDED Requirements

### Requirement: Field elevation field on the waypoint
Each `FlightPlanTurnPoint` SHALL support an optional `groundAlt` numeric field, expressed in feet (MSL), with no enforced sign constraint. The field is semantically meaningful only on the **first** and **last** waypoints of the flight plan, where it represents takeoff field elevation and landing field elevation respectively. On all other waypoints, the field SHALL be treated as absent and SHALL NOT be read by any calculation. The field is independent of the existing per-waypoint `alt` field, which continues to mean "cruise altitude of the segment going INTO this waypoint" per the `performance-regime` capability.

#### Scenario: First waypoint carries takeoff field elevation
- **WHEN** the flight plan has at least one waypoint and the first waypoint's `groundAlt` is set to a numeric value
- **THEN** that value is the takeoff field elevation in feet MSL

#### Scenario: Last waypoint carries landing field elevation
- **WHEN** the flight plan has at least two waypoints and the last waypoint's `groundAlt` is set to a numeric value
- **THEN** that value is the landing field elevation in feet MSL

#### Scenario: Interior waypoints ignore groundAlt
- **WHEN** an interior waypoint (neither first nor last) has `groundAlt` set
- **THEN** no calculation reads the field; the value has no observable effect on leg time, fuel, ETA, EFR, or any rendered output

---

### Requirement: Field alt input on first and last waypoint cards
The route sidebar SHALL render a "Field alt" numeric input on the first and last waypoint cards. The input SHALL display the current `groundAlt` value in feet (integer). Editing the input SHALL update the corresponding waypoint's `groundAlt` via `updateTurnPoint`. No such input SHALL appear on any interior waypoint card.

#### Scenario: Field alt input visible on first waypoint card
- **WHEN** the route sidebar renders the card for the first waypoint
- **THEN** a "Field alt" input is displayed showing the waypoint's `groundAlt` value

#### Scenario: Field alt input visible on last waypoint card
- **WHEN** the route sidebar renders the card for the last waypoint and the plan has at least two waypoints
- **THEN** a "Field alt" input is displayed showing the waypoint's `groundAlt` value

#### Scenario: Field alt input absent on interior waypoint cards
- **WHEN** the route sidebar renders the card for any interior waypoint (index 0 < i < N-1)
- **THEN** no "Field alt" input is displayed on that card

#### Scenario: Editing Field alt updates groundAlt
- **WHEN** the user types a new value into the Field alt input on the first or last waypoint card and commits the edit
- **THEN** the waypoint's `groundAlt` is updated to the parsed integer value

---

### Requirement: Leg-0 climb anchors to takeoff field elevation
Leg-0 climb computation SHALL use the first waypoint's `groundAlt` as the starting altitude. When `groundAlt` is undefined on the first waypoint (e.g., legacy plan), it SHALL be treated as `0` ft. The first waypoint's `alt` field SHALL NOT be read for leg-0 climb computation. This applies to both the frontend (`computeLegSegments` in `legCalculations.ts`) and the backend (`compute_leg_segments` in `flight_plan.py`).

#### Scenario: Leg 0 climbs from field elevation to first cruise altitude
- **WHEN** the first waypoint has `groundAlt = E` ft, the second waypoint has `alt = A` ft with `A > E`, and the destination waypoint of leg 0 is bound to a regime with climb data
- **THEN** leg-0 climb computation uses `E` as the start altitude and `A` as the target altitude, producing a positive altitude delta of `A − E`

#### Scenario: Leg 0 with groundAlt absent uses 0 ft
- **WHEN** the first waypoint has no `groundAlt` (legacy plan) and the second waypoint has `alt = A` ft
- **THEN** leg-0 climb computation treats the start altitude as `0` ft and the altitude delta as `A`

#### Scenario: Leg 0 with field elevation equal to first cruise altitude is level
- **WHEN** the first waypoint has `groundAlt = E` ft and the second waypoint has `alt = E` ft
- **THEN** leg-0 has an altitude delta of `0` and is computed as level cruise (no climb segment), independent of `WP0.alt`

#### Scenario: First waypoint's alt field is ignored on leg 0
- **WHEN** the first waypoint has `groundAlt = E` ft and `alt = X` ft with `X ≠ E`, and the second waypoint has `alt = A` ft
- **THEN** leg-0 computation uses `E` (not `X`) as the start altitude

#### Scenario: Backend matches frontend for leg-0 climb start
- **WHEN** the backend computes leg 0 for a plan with `WP0.groundAlt = E`
- **THEN** the backend uses `E` as the starting altitude for the climb segment, matching the frontend's leg-0 time and fuel for the same inputs

---

### Requirement: Landing field elevation is stored but not consumed
The last waypoint's `groundAlt` value SHALL be persisted in the flight plan and round-trip through JSON serialisation, but no leg-time / fuel / distance / segment computation SHALL consume it in this capability. The last leg SHALL continue to be computed exactly as legs 1..N-2 (regime-driven cruise plus optional climb or descent at the start of the leg, per `performance-regime`).

Descent-from-cruise-to-field-elevation at the end of the last leg is reserved for a future change; the data is in place to support it.

#### Scenario: Last leg ignores groundAlt in calculations
- **WHEN** the last waypoint has `groundAlt` set to any value and the second-to-last and last waypoints have `alt = A` ft (level last leg by cruise)
- **THEN** the last leg's time, fuel, and segment breakdown match what they would be if `groundAlt` were unset

#### Scenario: groundAlt round-trips on the last waypoint
- **WHEN** a plan with the last waypoint's `groundAlt = L` is downloaded as JSON and re-imported
- **THEN** the last waypoint's `groundAlt` equals `L` after re-import

---

### Requirement: Default groundAlt on creation and endpoint promotion
When a waypoint is added via `addTurnPoint` and becomes the **first** waypoint of the plan (i.e., the plan was empty), the new waypoint SHALL be created with `groundAlt: 0`. When a waypoint is added via `addTurnPoint` to a plan that already has waypoints, the new waypoint becomes the **last** waypoint and SHALL be created with `groundAlt: 0` if it does not already have one. The previously-last waypoint (now interior) SHALL have its `groundAlt` removed.

Deleting the last waypoint via `deleteTurnPoint` SHALL leave the new last waypoint's `groundAlt` untouched if present; if absent, no automatic value is assigned (`groundAlt` remains undefined and is treated as `0` ft in the calc).

#### Scenario: First waypoint placed in an empty plan has groundAlt = 0
- **WHEN** the user adds the first waypoint via `addTurnPoint` to a plan with no existing waypoints
- **THEN** the new waypoint's `groundAlt` is `0`

#### Scenario: New last waypoint has groundAlt = 0
- **WHEN** the user adds a waypoint via `addTurnPoint` to a plan that already has at least one waypoint
- **THEN** the new waypoint (now the last) has `groundAlt` set to `0`

#### Scenario: Demoted last waypoint loses groundAlt
- **WHEN** a waypoint was the last waypoint of the plan (carrying a `groundAlt` value) and a new waypoint is appended after it
- **THEN** the previously-last waypoint's `groundAlt` is removed; it is now interior and the field is no longer meaningful

#### Scenario: Deleting the last waypoint preserves the new last waypoint's groundAlt
- **WHEN** the user deletes the last waypoint of a plan with at least three waypoints
- **THEN** the new last waypoint's existing `groundAlt` value (if any) is preserved unchanged

---

### Requirement: groundAlt round-trip serialisation
The `groundAlt` field SHALL be included in the saved JSON when set, and SHALL be tolerated as absent on load. The `FLIGHT_PLAN_VERSION` SHALL NOT be bumped by the addition of this optional field. Backend dataclass loaders SHALL treat absence as `None` and use `0` ft for any leg-0 calculation when `groundAlt` is `None`.

#### Scenario: groundAlt persists through save and load
- **WHEN** a plan with `WP0.groundAlt = E` and `WP_last.groundAlt = L` is saved as JSON and re-imported
- **THEN** `WP0.groundAlt = E` and `WP_last.groundAlt = L` in the loaded plan

#### Scenario: Legacy plans without groundAlt load cleanly
- **WHEN** a flight plan JSON predating this feature (no `groundAlt` field on any waypoint) is loaded
- **THEN** the plan loads without error; all waypoints have `groundAlt` undefined; leg-0 climb computation treats the start altitude as `0` ft

#### Scenario: No version bump
- **WHEN** a plan is saved after this feature ships
- **THEN** the saved JSON's `FLIGHT_PLAN_VERSION` field is unchanged from before this feature

---

### Requirement: Midpoint waypoint insert inherits destination planning fields
`insertTurnPointAtMidpoint` SHALL create the new waypoint by copying `alt`, `tas`, `fuelFlow`, `windSpeed`, `windDir`, and `regimeId` from the **destination** waypoint of the split leg. Lat/lon SHALL be the midpoint of the leg (existing behaviour). The new waypoint's `name` SHALL be generated as `WP{newIndex + 1}` (existing behaviour). `groundAlt` SHALL NOT be set on the new waypoint (it is interior).

#### Scenario: Midpoint insert copies destination's altitude
- **WHEN** the user inserts a midpoint waypoint between WP_i (alt = X) and WP_{i+1} (alt = Y)
- **THEN** the new waypoint has `alt = Y`

#### Scenario: Midpoint insert copies destination's TAS and fuel flow
- **WHEN** the user inserts a midpoint waypoint between WP_i (tas = T_i, fuelFlow = F_i) and WP_{i+1} (tas = T_{i+1}, fuelFlow = F_{i+1})
- **THEN** the new waypoint has `tas = T_{i+1}` and `fuelFlow = F_{i+1}`

#### Scenario: Midpoint insert copies destination's regime binding
- **WHEN** the user inserts a midpoint waypoint between WP_i and WP_{i+1} where WP_{i+1} has `regimeId = R`
- **THEN** the new waypoint has `regimeId = R`

#### Scenario: Midpoint insert does not set groundAlt
- **WHEN** the user inserts a midpoint waypoint between any two waypoints
- **THEN** the new waypoint's `groundAlt` is undefined (it is interior to the plan)

#### Scenario: Splitting a leg preserves overall leg time and fuel
- **WHEN** the user inserts a midpoint waypoint between WP_i and WP_{i+1} on a plan where leg i+1 had time T and fuel F
- **THEN** the sum of the resulting two halves' times equals T (within rounding) and the sum of their fuels equals F (within rounding)

---

### Requirement: addTurnPoint does not back-fill prior waypoints
When `addTurnPoint` appends a new waypoint, it SHALL NOT modify any previously placed waypoint's planning fields (`tas`, `alt`, `fuelFlow`, `windSpeed`, `windDir`, `regimeId`, `name`). The only exception is the previously-last waypoint losing its `groundAlt` per the endpoint-promotion rules above.

#### Scenario: Adding a waypoint preserves prior waypoints' fields
- **WHEN** the user adds a new waypoint via `addTurnPoint` to a plan with at least one existing waypoint
- **THEN** every existing waypoint's `tas`, `alt`, `fuelFlow`, `windSpeed`, `windDir`, `regimeId`, and `name` are unchanged

#### Scenario: Adding a waypoint removes prior last waypoint's groundAlt only
- **WHEN** the user adds a new waypoint via `addTurnPoint` and the previously-last waypoint had `groundAlt = L`
- **THEN** the previously-last waypoint's `groundAlt` is removed and no other field is changed
