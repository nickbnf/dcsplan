# Proposal

## Why

Three defects in leg geometry make plans with a non-zero declination, wind, or regime-bound legs wrong, in both the frontend and the backend:

1. **Turns start from the wrong direction.** Each turn begins from the previous leg's magnetic, wind-corrected *heading* instead of its true *track*. This leaves a corner at every turn point equal to declination plus the wind correction angle (measured: exactly 6.00° with 6° declination and no wind; −5.74° with 0° declination and 40 kt crosswind). It also shifts the roll-out point and therefore the leg distance, ETE, and fuel.
2. **The declination sign is reversed.** The magnetic course is computed as `true + declination`, while the UI labels a positive declination as East. With 6°E, a true course of 090° is shown as 096° instead of 084°. This was confirmed against a runway in DCS.

3. **Turns and headings ignore the regime TAS.** On regime-bound legs, the turn radius and the heading's wind correction read the destination waypoint's stored `tas`. Per `performance-regime`, that value is not mirrored from the regime and may be stale. ETE, fuel, and the sidebar use the regime's cruise TAS. So the geometry is computed at a speed the user cannot see: a stale 400 kt against a 480 kt regime gives a turn radius about 44% too small.

The upcoming `runway-departure` change reuses both the turn construction and the true↔magnetic conversion, so all of these must be correct first.

## What Changes

- **Turns start tangent to the arrival track.** The turn at a waypoint SHALL start along the true ground track of the previous leg's final straight segment. This replaces the magnetic, wind-corrected heading in both the drawing and the leg calculation, frontend and backend. Wind keeps affecting time and fuel, not the drawn shape, as today.
- **Correct declination sign, using the canonical convention.** Declination (magnetic variation) is East-positive, as in the World Magnetic Model and on aeronautical charts ("VAR 6°E" = +6). Magnetic course SHALL be `true − declination` ("East is least, West is best"). This applies to the course, and therefore the heading, shown in the sidebar and printed on the kneeboard, frontend and backend.
- **Unambiguous declination label.** The declination slider's readout SHALL show the sign as well as the E/W letter: `(+) 6.5°E`, `(−) 6.5°W`, and `0°` for zero. The user can then see both the stored value and its meaning.
- **Effective destination TAS for geometry.** The turn radius and the heading's wind correction SHALL use the leg's effective TAS, following the "a leg is flown at its destination's TAS" convention: the regime's cruise TAS on bound legs, and the stored `tas` on Manual legs. This is the same value that ETE, fuel, and the sidebar already use. Frontend and backend.
- **Textbook wind correction angle.** The heading's wind correction angle SHALL be `asin(crosswind / TAS)`, using the effective TAS. Today it divides by ground speed (`tas + tailwind`) in both the frontend and the backend. The difference is usually under a degree and grows with strong head- or tailwind components.
- **Wind direction is true.** A waypoint's `windDir` is the true direction the wind blows from, as given by the DCS weather. Ground speed, wind correction angle, and every wind component SHALL be computed against the leg's **true** course. Today they are computed against the magnetic course, which rotates the wind by the declination. The sidebar SHALL label the wind direction `°T`.
- **BREAKING (computed values):** every plan with a non-zero declination gets corrected courses and headings, shifted by twice the declination. Every plan with a non-zero declination or wind gets slightly different turn geometry, leg distances, ETE, ETA, fuel, and EFR. Stored plan data is not rewritten, and `FLIGHT_PLAN_VERSION` is not bumped.
- **Stored declinations are kept as they are.** We cannot tell whether a stored value was entered as labelled (East-positive) or flipped by the user to compensate for the bug, so the code does not try to guess. This is called out in the release notes.

## Capabilities

### New Capabilities
- `leg-geometry`: How a leg's path and navigation values are derived from its waypoints. It covers:
  - a turn that starts tangent to the arrival track, at the plan's bank angle, with the shorter turn direction;
  - the straight segment to the destination;
  - true-to-magnetic course conversion with the canonical East-positive declination convention, and how the declination is displayed;
  - the wind-corrected heading;
  - frontend/backend parity.
  
  No existing spec covers this behaviour. It was implicit in the code.

### Modified Capabilities
<!-- none: no existing spec states turn construction or the course/declination convention -->

## Non-goals

- Migrating or flipping stored `declination` values.
- Grid convergence in "projected" navigation mode. There, bearings are grid bearings and are treated as true, unchanged by this change.
- Flying the turn at the climb or descent TAS when the leg changes altitude. Turns use the leg's effective cruise TAS, as stated above. The first leg's departure turn is handled by `runway-departure`.
- Wind drift in the drawn turn geometry.
- Attack-planning headings, which do not use declination today.
- The runway departure itself (`runway-departure`).

## Impact

- **Frontend:** `packages/frontend/src/utils/legCalculations.ts`
  - In `calculateAllLegDrawData` and `calculateAllLegData`, the inbound-bearing hand-off between legs changes.
  - The course formula changes at both computation sites.
  - The turn radius and the heading resolve the effective TAS (regime cruise TAS when bound). The drawing path then needs the resolved profile's regimes, which it does not receive today.
- **Frontend UI:** `packages/frontend/src/components/sidebar/ButtonZone.tsx` changes the declination readout to show the sign with E/W.
- **Backend:** `packages/backend/flight_plan.py`
  - The inbound-bearing hand-off in the leg loop changes.
  - The `LegData.course` formula changes.
  - The turn radius and the heading use the effective TAS.
  - Kneeboard leg maps, the overview map, and the printed course/heading follow from these.
- **Tests:**
  - New Vitest and backend tests:
    - the turn joins the arrival track smoothly, with non-zero declination and wind;
    - magnetic course for a known case (true 090°, 6°E → 084° M);
    - frontend/backend parity on the same fixture.
  - Existing fixtures that use a non-zero declination or wind and assert exact course, heading, distance, or time values will need updated expectations.
- **Users:** courses and headings change for plans with a non-zero declination, and leg times and fuel change slightly where there is a turn and a non-zero declination or wind. Users who entered a West-positive declination to compensate must re-enter it as labelled.
- **Dependent change:** `runway-departure` relies on this change and should be implemented after it.
