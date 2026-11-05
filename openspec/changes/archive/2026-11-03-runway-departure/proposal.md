# Proposal

## Why

Leg 1 currently leaves the first waypoint in a straight line towards WP1, as if the aircraft could depart in any direction. A real departure goes down the runway, climbs straight ahead for a short distance, and only then turns on course, often while still accelerating to climb speed. As a result, the drawn route, the leg-1 distance, the wind correction, and the ETE/fuel to WP1 are all wrong for any WP1 that is not roughly along the runway axis.

## What Changes

- **Runway on the first waypoint.** The first waypoint gets an optional `runway` field: a runway number from 1 to 36, read as the magnetic heading in tens of degrees (e.g. `27` → 270° M). It is edited on the first waypoint card next to "Field alt", following the same first-waypoint-only rules as `groundAlt`. It is converted to true using the plan's `declination`.
- **Straight-out distance on the performance profile.** The profile's general performance line gets a new **straight-out distance** (NM, default 2 NM). It is the along-track distance from brake release to the start of the departure turn.
- **Departure path for leg 1.** When the first waypoint has a runway, leg 1 is made of three parts:
  - straight along the runway heading for the straight-out distance;
  - a turn at the plan's bank angle, direction chosen automatically (the shorter way to WP1);
  - a straight line from the roll-out point to WP1.
  
  The turn is computed by stepping through it, because the aircraft may still be accelerating: its radius grows with speed and the path is a widening spiral, not a circle. The map draws this path, and the leg-1 distance is its length.
- **Take-off acceleration profile.** The profile's take-off block `{timeSec, fuel, distance}` stays an overhead added to the climb from brake release, as today. When a departure path is active, speed during the take-off phase follows a curve fitted to that block and the climb speed: `v(t) = Vc·(t/T)^p` with `p = Vc·T/D − 1`. The curve reaches climb speed exactly at the take-off distance, and fuel is spread in proportion to time. The take-off time and fuel are still counted verbatim.
- **Wind along the actual track.** On a departure path, ground speed for the take-off, climb, and cruise parts of leg 1 uses the wind component along the current track (runway heading, then the turning track, then the course to WP1), not along the WP0→WP1 course.
- **Unreachable WP1 warning.** If WP1 cannot be reached from the departure, leg 1 shows a warning instead of silently falling back. This covers WP1 inside the turn (no roll-out within 360°) and WP1 closer than the straight-out distance.
- **No change without a runway.** A first waypoint without `runway` (all existing plans) computes and renders leg 1 exactly as today. `FLIGHT_PLAN_VERSION` is not bumped because the field is optional.
- **Backend parity.** The backend applies the same leg-1 departure computation, so kneeboard timings and leg/overview maps match the frontend.

## Capabilities

### New Capabilities
- `departure`: Leg-0 departure modelling. Covers the first-waypoint runway field and its input, conversion of the runway heading to true, the straight-out / turn / roll-out geometry and auto turn direction, the take-off acceleration speed profile, wind along the track, the unreachable-WP1 warning, map rendering of the departure path, and frontend/backend parity.

### Modified Capabilities
- `aircraft-performance`:
  - The profile gains the straight-out distance (input on the general performance line, export/import, default when absent).
  - The "Take-off segment on leg 1" and "Long-segment warning" requirements change when a runway is set: the take-off ground distance comes from the acceleration profile and the wind along the runway instead of `applyWind(TAS_to, originWind, course)`.
- `performance-regime`: When a departure path is active, the leg-1 climb and cruise use the departure-path distance and wind along the track instead of the WP0→WP1 course.

## Non-goals

- Arrival runway / approach modelling on the last waypoint.
- A user-chosen turn direction (left/right override). Auto only for now.
- A separate departure bank angle. The plan's `bankAngle` is used.
- Positioning on the runway threshold. The departure starts at WP0 (the airfield reference point), accepting the sub-NM error.
- Wind drift in the drawn geometry. As with every other turn in the app, the drawn path is in the air frame, and wind affects only time and fuel.
- Turning at an altitude rather than a distance (e.g. "turn at 500 ft AGL").

## Impact

- **Frontend types**
  - `types/flightPlan.ts`: `FlightPlanTurnPoint.runway?`, `FlightPlanPointChange.runway?`, and the straight-out distance on `Aircraft`, with `defaultAircraft()` and the null profile defaults.
- **Frontend calculations**
  - `utils/legCalculations.ts`: a new departure-path builder used by both `calculateAllLegDrawData` and `calculateAllLegData`, so the drawn path and the numbers come from the same computation.
  - `computeLegSegments`: its leg-1 handling is extended for the departure path.
- **Frontend rendering**
  - `utils/flightPlanLayer.ts`: draws the departure polyline for leg 1.
- **Frontend UI**
  - First-waypoint card: runway input next to Field alt.
  - Perf page: straight-out distance input on the general performance line.
- **Frontend persistence and sync**
  - `utils/yjsFlightPlanBinding.ts`: the new waypoint field travels through the Y.Doc (AD-6).
  - `performanceImport.ts` / `performanceStorage.ts`: validate and round-trip the new profile field. Profiles stay plain LWW state (AD-2, AD-6).
- **Backend**
  - `flight_plan.py`: Pydantic models gain `runway` and the straight-out distance, plus a port of the departure-path computation.
  - `kneeboard.py` and `overview_map_page.py`: draw the leg-1 departure path and include it in the map bounds.
- **Tests**
  - Vitest coverage for:
    - the speed-profile fit, including the inconsistent-data fallback;
    - the degenerate case where the turn is flown entirely at Vc, which must match `calculateStraighteningPoint`;
    - auto turn direction, the warnings, and wind along the track.
  - Backend parity tests on the same fixtures.
- **Compatibility:** plans and `.perf.json` files without the new fields load unchanged and behave as today (straight-out distance defaults to 2 NM; no runway means no departure path).
