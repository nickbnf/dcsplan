# Spec Delta

## Purpose

Models how a flight actually leaves its first waypoint: down the departure runway, straight ahead for a set distance, then an accelerating turn on course to WP1. Leg 1's drawn route, distance, time, and fuel then reflect the real departure instead of a straight line in an arbitrary direction.

## ADDED Requirements

### Requirement: Runway field on the first waypoint
Each waypoint SHALL support an optional `runway` field: an integer from 1 to 36. It is the departure runway number, meaning the runway's magnetic heading in tens of degrees (`27` → 270° M). The field SHALL be meaningful only on the **first** waypoint. On any other waypoint it SHALL be ignored by every calculation and rendering. No waypoint SHALL receive a `runway` automatically.

#### Scenario: First waypoint carries the departure runway
- **WHEN** the first waypoint has `runway = 27`
- **THEN** the departure runway is 27, with a magnetic heading of 270°

#### Scenario: Runway on a non-first waypoint is ignored
- **WHEN** an interior or last waypoint has a `runway` value (e.g. it was the first waypoint before an earlier waypoint was inserted ahead of it)
- **THEN** no calculation or rendering reads it

#### Scenario: New waypoints have no runway
- **WHEN** a waypoint is created by any means (first placement, append, midpoint insert)
- **THEN** it has no `runway` value

#### Scenario: Deleting the first waypoint does not move the runway
- **WHEN** the user deletes the first waypoint, which had `runway = 27`, and the new first waypoint has no `runway`
- **THEN** the plan has no departure runway and leg 1 is computed without a departure path

---

### Requirement: Runway input on the first waypoint card
The route sidebar SHALL render a "Rwy" input on the first waypoint card only, next to "Field alt". It SHALL show the current runway as two digits (`09`, `27`) or be empty when unset. Committing a value from 1 to 36 SHALL set `runway`. Committing an empty value SHALL clear it. Any other value SHALL be rejected, with an inline error, and SHALL NOT change the plan.

#### Scenario: Rwy input only on the first card
- **WHEN** the route sidebar renders waypoint cards
- **THEN** the "Rwy" input appears on the first waypoint card and on no other card

#### Scenario: Setting a runway
- **WHEN** the user enters `9` in the Rwy input and commits
- **THEN** the first waypoint's `runway` is `9` and the input shows `09`

#### Scenario: Clearing the runway
- **WHEN** the user empties the Rwy input and commits
- **THEN** the first waypoint's `runway` is removed and leg 1 is computed without a departure path

#### Scenario: Out-of-range value rejected
- **WHEN** the user enters `0`, `37`, or `27.5` and commits
- **THEN** an inline error is shown and the waypoint's `runway` is unchanged

---

### Requirement: Runway round-trip and sync
The `runway` field SHALL be included in the saved and exported plan JSON when set, and SHALL be tolerated as absent on load. `FLIGHT_PLAN_VERSION` SHALL NOT be bumped. In the signed-in tier the field SHALL be part of the collaboratively edited plan, so it syncs to other editors and is captured by finalized versions like any other waypoint field. In the anonymous tier it SHALL persist with the local plan.

#### Scenario: Runway persists through export and import
- **WHEN** a plan with `WP0.runway = 27` is exported and re-imported
- **THEN** the imported plan has `WP0.runway = 27`

#### Scenario: Legacy plans load without a runway
- **WHEN** a plan saved before this feature is loaded
- **THEN** it loads without error, no waypoint has `runway`, and leg 1 is computed exactly as before

#### Scenario: Runway edit reaches other editors (signed in)
- **WHEN** a signed-in user sets the runway on a plan open in another editor's session
- **THEN** the other editor sees the runway and the recomputed departure path

#### Scenario: Runway persists locally (anonymous)
- **WHEN** an anonymous user sets the runway and reloads the app
- **THEN** the first waypoint still has the runway

---

### Requirement: Departure path activation
Leg 1 SHALL fly a departure path when the plan has at least two waypoints and the first waypoint has a `runway`. Otherwise leg 1 SHALL be computed and rendered exactly as before this capability. Activation SHALL NOT depend on a regime, the take-off block, or the tier.

#### Scenario: Runway set activates the departure path
- **WHEN** the first waypoint has `runway = 27` and the plan has two or more waypoints
- **THEN** leg 1 is computed and drawn as a departure path

#### Scenario: Manual leg 1 still gets a departure path
- **WHEN** the first waypoint has a runway and leg 1 has no regime
- **THEN** leg 1 is drawn and computed as a departure path, flown at the leg's stored TAS

#### Scenario: No runway leaves leg 1 unchanged
- **WHEN** the first waypoint has no runway
- **THEN** leg 1's geometry, distance, time, and fuel are identical to the pre-feature computation

---

### Requirement: Runway true heading
The departure runway's true heading SHALL be derived from its magnetic heading (`runway × 10`) using the plan's `declination`. The conversion SHALL be the exact inverse of the true-to-magnetic conversion used for leg courses, so that a departure aligned with the runway shows a leg course equal to the runway's magnetic heading.

#### Scenario: Runway course displays as the runway number
- **WHEN** the first waypoint has `runway = 27` and WP1 lies straight ahead on the runway axis, beyond the straight-out distance
- **THEN** leg 1's displayed course is 270°

#### Scenario: Declination is applied
- **WHEN** the plan's declination is non-zero and the first waypoint has `runway = 27`
- **THEN** the drawn runway segment points along the true heading that corresponds to 270° M under that declination

---

### Requirement: Departure path geometry
A departure path SHALL consist of, in order:
1. a straight segment from WP0 along the runway true heading, for the profile's straight-out distance;
2. a turn at the plan's bank angle;
3. a straight segment from the roll-out point to WP1.

The turn SHALL end at the first point where the track points directly at WP1. Leg 1's distance SHALL be the length of this whole path.

#### Scenario: WP1 behind the airfield
- **WHEN** the runway is 27, the straight-out distance is 2 NM, and WP1 lies 20 NM east of WP0
- **THEN** the path runs 2 NM west, turns about 180° back towards WP1, and the leg distance is greater than 20 NM

#### Scenario: WP1 on the runway axis
- **WHEN** WP1 lies on the extended runway centreline beyond the straight-out distance
- **THEN** the path has no turn and the leg distance equals the WP0→WP1 distance

#### Scenario: Straight-out distance from the profile
- **WHEN** the resolved profile's straight-out distance is 3 NM
- **THEN** the turn begins 3 NM along the runway heading from WP0

---

### Requirement: Automatic turn direction
The departure turn SHALL be made towards the side of the runway heading on which WP1 lies, as seen from the start of the turn. This is the same rule used for every other turn in the plan. No user control for the turn direction SHALL be provided.

#### Scenario: WP1 to the right
- **WHEN** WP1 is to the right of the runway heading as seen from the start of the turn
- **THEN** the departure turn is a right turn

#### Scenario: WP1 to the left
- **WHEN** WP1 is to the left of the runway heading as seen from the start of the turn
- **THEN** the departure turn is a left turn

---

### Requirement: Speed-dependent turn radius
At every point of the departure turn, the turn radius SHALL be `TAS² / (g · tan(bank))`, using the TAS being flown at that point per the departure speed rules. When the speed changes during the turn, the turn SHALL be a spiral rather than a circular arc. When the speed is constant through the whole turn, the turn SHALL match the circular-arc construction used for the other legs.

#### Scenario: Accelerating turn widens
- **WHEN** the aircraft is still accelerating to climb speed during the departure turn
- **THEN** the turn radius at roll-out is larger than at turn entry

#### Scenario: Constant-speed turn equals a circular arc
- **WHEN** the take-off distance is shorter than the straight-out distance, and the climb continues past the end of the turn
- **THEN** the departure turn is a circular arc at climb TAS and matches the arc the other legs' construction would produce for that TAS, inbound bearing, and bank angle

---

### Requirement: Departure speed rules
Along a departure path, the TAS at time `t` from brake release SHALL be:
1. During the take-off phase (`t < T`, only when the take-off segment is active per `aircraft-performance`): the take-off acceleration profile.
2. Then, while the leg climbs or descends with regime transition data: the regime's transition TAS.
3. Then: the regime's cruise TAS (bound leg) or the leg's stored TAS (Manual leg).

#### Scenario: Speed sequence with take-off active
- **WHEN** leg 1 is bound to a regime with climb data, the take-off block is active, and the leg climbs
- **THEN** TAS rises from 0 to the climb TAS over the take-off phase, stays at climb TAS until top of climb, then becomes the cruise TAS

#### Scenario: No take-off block
- **WHEN** leg 1 is bound to a regime with climb data but the take-off block is all zero
- **THEN** the departure is flown at climb TAS from brake release until top of climb, then at cruise TAS

#### Scenario: Top of climb inside the turn
- **WHEN** top of climb is reached partway through the departure turn
- **THEN** the turn radius changes to match the cruise TAS from that point onward

---

### Requirement: Take-off acceleration profile
When the take-off segment is active on a departure path, take-off TAS SHALL follow `v(t) = Vc · (t/T)^p`, where `p = Vc·T/D − 1`. Here `T` and `D` are the profile's take-off time and distance, and `Vc` is the TAS of the phase that follows take-off. With this curve, `v` reaches `Vc` at `t = T` after exactly `D` of air distance. Take-off fuel SHALL accrue in proportion to elapsed time. Take-off time and fuel SHALL still be counted verbatim.

#### Scenario: Consistent data gives constant acceleration
- **WHEN** `D = Vc·T/2` (for example `Vc = 300 kt`, `T = 60 s`, `D = 2.5 NM`)
- **THEN** `p = 1` and the speed rises linearly from 0 to 300 kt over 60 s

#### Scenario: Distance covered matches the profile
- **WHEN** the take-off phase completes on a departure path in still air
- **THEN** the air distance flown during it equals the profile's take-off distance `D`

#### Scenario: Fuel accrues over the take-off phase
- **WHEN** half of the take-off time has elapsed
- **THEN** half of the take-off fuel has been consumed, and the full take-off fuel is consumed by the end of the phase

#### Scenario: Inconsistent data falls back to a constant speed
- **WHEN** `D ≥ Vc·T`, meaning the profile's average take-off speed is at or above `Vc`
- **THEN** the take-off phase is flown at a constant `D/T`, time and fuel are still counted verbatim, and no error is raised

---

### Requirement: Wind along the departure track
On a departure path, every part of leg 1 SHALL take its ground speed from the wind component along the current track. That track is the runway heading on the straight-out segment, the instantaneous track in the turn, and the course to WP1 after roll-out. The origin waypoint's wind SHALL apply to the take-off and transition phases, and the destination waypoint's wind to cruise, as for every leg. The drawn path SHALL NOT include wind drift.

#### Scenario: Headwind on the runway shortens the take-off ground distance
- **WHEN** the origin wind blows straight down the runway towards the aircraft (a headwind on takeoff) and WP1 lies behind the airfield
- **THEN** the take-off ground distance is reduced by the headwind, even though the same wind would be a tailwind on the WP0→WP1 course

#### Scenario: Drawn path is wind-independent
- **WHEN** only the wind of WP0 or WP1 changes
- **THEN** the drawn departure path is unchanged and only leg 1's time and fuel change

---

### Requirement: Unreachable WP1 warning
When WP1 cannot be reached by a departure path, leg 1 SHALL show the non-interactive `⚠ Fix` indicator. Its tooltip SHALL state that WP1 cannot be reached from the runway departure. Leg 1 SHALL then be computed and drawn as if no runway were set. This happens when:
- WP1 is closer to WP0 than the straight-out distance, or
- the turn passes 360° without the track pointing at WP1.

#### Scenario: WP1 closer than the straight-out distance
- **WHEN** the straight-out distance is 2 NM and WP1 is 1.5 NM from WP0
- **THEN** leg 1 shows `⚠ Fix` with the unreachable-WP1 tooltip and is computed as if no runway were set

#### Scenario: WP1 inside the turn
- **WHEN** WP1 lies abeam the straight-out segment, closer than the turn radius
- **THEN** leg 1 shows `⚠ Fix` with the unreachable-WP1 tooltip and is computed as if no runway were set

#### Scenario: Warning clears when resolved
- **WHEN** the user moves WP1, changes the runway, or clears the runway so that the departure becomes reachable or inactive
- **THEN** the unreachable-WP1 warning is no longer shown

---

### Requirement: Departure path rendering
The map SHALL draw leg 1 along its departure path when one is active, including the runway segment and the turn, instead of a straight WP0→WP1 line. The leg's course label SHALL apply to the final straight segment, as it does for other legs. Following legs SHALL keep their existing turn construction, entering their own turn from leg 1's final straight segment.

#### Scenario: Departure drawn on the map
- **WHEN** a departure path is active
- **THEN** the map shows a line from WP0 along the runway heading, the turn, and the straight segment to WP1

#### Scenario: Following legs are unchanged
- **WHEN** a departure path is active on leg 1
- **THEN** legs 2..N are drawn and computed exactly as they would be for a leg 1 whose final straight segment ends at WP1 with the same course

---

### Requirement: Backend departure parity
The backend SHALL accept `runway` on waypoints and the profile's straight-out distance, and SHALL compute leg 1's departure path, distance, time, and fuel as the frontend does. Kneeboard leg maps and the overview map SHALL draw the departure path and include it in their map bounds.

#### Scenario: Kneeboard values match the frontend
- **WHEN** the backend generates a kneeboard for a plan with an active departure path
- **THEN** leg 1's distance, ETE, and fuel printed on the kneeboard equal the frontend-displayed values for the same inputs, within display rounding

#### Scenario: Kneeboard maps show the departure
- **WHEN** the backend renders the leg-1 map or the overview map for a plan with an active departure path
- **THEN** the departure path is drawn and fully contained in the map extent

---

### Requirement: Departure is tier-independent
Departure behaviour SHALL be identical in the anonymous and signed-in tiers. The only tier difference is where the inputs come from: the straight-out distance comes from the plan's resolved profile, which is the single local profile in the anonymous tier and `plan.profileId` in the signed-in tier.

#### Scenario: Anonymous plan
- **WHEN** an anonymous user sets a runway on the first waypoint
- **THEN** leg 1 flies a departure path using the single local profile's straight-out distance

#### Scenario: Signed-in plan
- **WHEN** a signed-in user sets a runway on the first waypoint of a plan flying profile P
- **THEN** leg 1 flies a departure path using profile P's straight-out distance

#### Scenario: Null profile
- **WHEN** the plan resolves to the null profile
- **THEN** the departure path uses the default straight-out distance of 2 NM
