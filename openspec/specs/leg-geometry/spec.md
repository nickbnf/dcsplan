# Spec: Leg Geometry

## Purpose

Defines how each leg's path and navigation values come from its waypoints: the turn at the origin waypoint, the straight segment to the destination, the true-to-magnetic course conversion, and the wind-corrected heading. With these rules the drawn route, the sidebar, and the kneeboard agree with each other and with DCS.

---

## Requirements

### Requirement: Declination sign convention
The plan's `declination` SHALL follow the canonical magnetic-variation convention: positive means East, negative means West ("VAR 6°E" = `+6`). The magnetic course of a leg SHALL be `(trueCourse − declination)` normalised to [0, 360). Every computation that converts between true and magnetic, in the frontend and the backend, SHALL use this convention.

#### Scenario: Easterly variation is subtracted
- **WHEN** a leg's true course is 090° and the declination is `+6` (6°E)
- **THEN** the leg's displayed magnetic course is 084°

#### Scenario: Westerly variation is added
- **WHEN** a leg's true course is 090° and the declination is `−6` (6°W)
- **THEN** the leg's displayed magnetic course is 096°

#### Scenario: Wrap-around at north
- **WHEN** a leg's true course is 002° and the declination is `+6`
- **THEN** the leg's displayed magnetic course is 356°

#### Scenario: Zero declination
- **WHEN** the declination is `0`
- **THEN** every leg's magnetic course equals its true course

---

### Requirement: Stored declinations are not migrated
Loading a plan SHALL NOT change its stored `declination`, whenever and however it was saved. `FLIGHT_PLAN_VERSION` SHALL NOT be bumped by this convention. The stored number keeps its value and is read with the convention above.

#### Scenario: Existing plan keeps its value
- **WHEN** a plan saved before this change, with `declination = −6`, is loaded
- **THEN** its declination is still `−6` and is displayed as 6°W

---

### Requirement: Declination readout shows sign and direction
The declination control's readout SHALL show the signed value together with its direction: `(+) <abs>°E` for a positive value, `(−) <abs>°W` for a negative value, and `0°` for zero. The readout SHALL show the value with the control's precision.

#### Scenario: Positive declination
- **WHEN** the declination is `6.5`
- **THEN** the readout shows `(+) 6.5°E`

#### Scenario: Negative declination
- **WHEN** the declination is `−6.5`
- **THEN** the readout shows `(−) 6.5°W`

#### Scenario: Zero declination
- **WHEN** the declination is `0`
- **THEN** the readout shows `0°`

---

### Requirement: Turn starts tangent to the arrival track
For every leg except the first, the turn at the origin waypoint SHALL start along the true ground track of the previous leg's final straight segment. Neither the declination nor the wind SHALL change the turn's starting direction, so the route has no corner where a straight segment meets the next turn.

#### Scenario: No corner with declination
- **WHEN** a plan has a 90° turn at WP1 and a declination of `+6`
- **THEN** the turn at WP1 starts exactly along leg 1's true ground track (no angular difference)

#### Scenario: No corner with wind
- **WHEN** a plan has a 90° turn at WP1, declination `0`, and a 40 kt crosswind on leg 1
- **THEN** the turn at WP1 starts exactly along leg 1's true ground track (no angular difference)

#### Scenario: Geometry independent of declination
- **WHEN** only the plan's declination changes, with or without wind
- **THEN** the drawn route, the leg distances, the ETEs, and the fuel values are unchanged, and only courses and headings change

---

### Requirement: Effective leg TAS for geometry
A leg is flown at its destination's TAS. Every geometry and navigation computation, including the turn radius and the heading's wind correction, SHALL use the leg's **effective TAS**. That is the bound regime's cruise TAS when the destination has a resolving `regimeId`, and the destination's stored `tas` otherwise (Manual, or an orphan `regimeId`). On bound legs the stored `tas` SHALL NOT be read. The value SHALL match the TAS used for ETE and fuel and shown in the sidebar.

#### Scenario: Bound leg uses the regime TAS
- **WHEN** a leg's destination has stored `tas = 400` and is bound to a regime with cruise TAS 480
- **THEN** the turn radius and the heading's wind correction are computed at 480 kt

#### Scenario: Manual leg uses the stored TAS
- **WHEN** a leg's destination has no `regimeId` and stored `tas = 400`
- **THEN** the turn radius and the heading's wind correction are computed at 400 kt

#### Scenario: Orphan regime falls back to the stored TAS
- **WHEN** a signed-in plan's destination has a `regimeId` that does not resolve in the plan's profile, and stored `tas = 400`
- **THEN** the turn radius and the heading's wind correction are computed at 400 kt

#### Scenario: Changing the regime's cruise TAS reshapes the turn
- **WHEN** the cruise TAS of the regime bound to a leg's destination is changed on the Performance page
- **THEN** that leg's drawn turn and turn radius are recomputed at the new TAS

---

### Requirement: Turn construction
At each origin waypoint except the first, the leg SHALL turn at the plan's bank angle, with radius `TAS² / (g · tan(bank))` using the leg's effective TAS. The turn direction SHALL be the side of the arrival track on which the destination lies. The turn SHALL end where the track points at the destination, then a straight segment SHALL run to the destination. The leg distance SHALL be the turn length plus the straight length.

#### Scenario: Turn direction follows the destination side
- **WHEN** the destination lies to the right of the arrival track as seen from the origin waypoint
- **THEN** the turn is a right turn

#### Scenario: Leg distance includes the turn
- **WHEN** a leg has a 90° turn of radius R at its origin
- **THEN** the leg distance equals `π·R/2` plus the straight distance from the roll-out point to the destination

#### Scenario: First leg has no turn
- **WHEN** the first leg is computed
- **THEN** it is a straight segment from the first waypoint to the second waypoint, with no turn

---

### Requirement: Wind direction is true
A waypoint's `windDir` SHALL be the **true** direction the wind blows from. Every wind computation (ground speed, wind components, wind correction angle) SHALL combine it with the leg's **true** course, never the magnetic course. The route sidebar SHALL display the wind direction with a `°T` suffix.

#### Scenario: Headwind is independent of declination
- **WHEN** a leg's true course is 090°, the destination wind is 30 kt from 090°, and the declination is `+6`
- **THEN** the cruise ground speed is TAS − 30 kt, exactly as with declination `0`

#### Scenario: Wind label
- **WHEN** a waypoint's wind direction is 270
- **THEN** the sidebar shows `270°T`

---

### Requirement: Wind-corrected heading
Each leg's heading SHALL be the magnetic course of its final straight segment corrected for the destination waypoint's wind at the leg's effective TAS, using the wind triangle: `sin(WCA) = crosswind / TAS`. The crosswind is taken relative to the true course. The heading SHALL be used only for display (sidebar, kneeboard). It SHALL NOT be used as an input to any turn geometry.

#### Scenario: Crosswind correction
- **WHEN** a leg's magnetic course is 084° and the destination wind is a crosswind from the left
- **THEN** the displayed heading is less than 084° by the wind correction angle

#### Scenario: Wind correction angle uses TAS, not ground speed
- **WHEN** a leg's effective TAS is 300 kt, its magnetic course is 360°, and the destination wind is 60 kt from 045°
- **THEN** the wind correction angle is `asin(60·sin 45° / 300) ≈ 8.1°`, and the displayed heading is about 008°, regardless of the 42 kt headwind component

#### Scenario: No wind
- **WHEN** the destination wind speed is 0
- **THEN** the displayed heading equals the magnetic course

---

### Requirement: Backend leg-geometry parity
The backend SHALL apply the same declination convention, turn start direction, effective TAS, and turn construction as the frontend. Kneeboard courses, headings, leg distances, ETEs, and fuel, and the routes drawn on kneeboard leg maps and the overview map, SHALL then match the frontend for the same plan.

#### Scenario: Printed course matches the frontend
- **WHEN** the backend generates a kneeboard for a plan with declination `+6`
- **THEN** each leg's printed course and heading equal the frontend-displayed values, within display rounding

#### Scenario: Drawn turns match the frontend
- **WHEN** the backend draws a leg map for a plan with declination and wind
- **THEN** the turn starts tangent to the arrival track, as on the frontend map

---

### Requirement: Leg geometry is tier-independent
Leg geometry, the declination convention, and the declination readout SHALL be identical in the anonymous and signed-in tiers, and SHALL depend only on the plan's data.

#### Scenario: Anonymous plan
- **WHEN** an anonymous user's local plan has declination `+6`
- **THEN** courses, headings, and turns follow the rules above

#### Scenario: Signed-in plan seen by two editors
- **WHEN** two signed-in editors view the same plan with declination `+6`
- **THEN** both see the same courses, headings, readout, and drawn turns
