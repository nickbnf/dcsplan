# Attack Planning Page — Design

## Overview

Adds an Attack Planning page to DCSPlan that lets the user enter parameters for an oblique pop-up attack, then computes the full attack profile geometry from target back: end-of-roll-in, roll-in point, climb segment, and PUP.

---

## Data Model

New optional field added to `FlightPlan` (in `packages/frontend/src/types/flightPlan.ts`):

```ts
attackPlanning?: {
  params: {
    attackType: 'oblique_popup';   // dropdown, extensible
    angleOff: 30 | 45 | 60;       // degrees, dropdown
    climbTas: number;              // knots
    climbAngle: number;            // degrees
    diveAngle: number;             // degrees
    apexAltitude: number;          // feet
    dropAltitude: number;          // feet
    targetAltitude: number;        // feet
    windDir: number;               // degrees (direction wind is coming from)
    windSpeed: number;             // knots
    rollInG: number;               // g-load for roll-in and PUP turns
  };
  results?: {
    runInHeading: number;          // degrees (bearing EoRI → TGT, computed)
    runInDistance: number;         // nm (horizontal distance EoRI → TGT)
    climbHeading: number;          // degrees (IP→TGT heading ± angleOff)
    climbDistance: number;         // nm (horizontal distance PUP → roll-in point)
    climbTime: number;             // seconds (wind-corrected)
    endOfRollInLat: number;
    endOfRollInLon: number;
    rollInLat: number;
    rollInLon: number;
    pupLat: number;
    pupLon: number;
  };
}
```

`attackPlanning` is absent by default — no migration needed for existing flight plans. Results are `undefined` until the user presses Calculate.

---

## UI Layout

### Left panel (400px, same shell as PerformancePage)

Form fields, top to bottom:
- **Attack type** — dropdown (only "Oblique pop-up" for now)
- **Angle off** — dropdown: 30° / 45° / 60°
- **Climb TAS** — numeric input, knots
- **Climb angle** — numeric input, degrees
- **Dive angle** — numeric input, degrees
- **Apex altitude** — numeric input, feet
- **Drop altitude** — numeric input, feet
- **Target altitude** — numeric input, feet
- **Wind** — two numeric inputs side by side: dir° / speed kts
- **Roll-in g** — numeric input, g-load

**Calculate** button at the bottom of the form:
- Disabled when no TGT waypoint exists in the flight plan, with an inline message explaining why.

Reuse the existing `EditableField` component from `FlightPlanZone.tsx` for numeric inputs, and the existing `font-aero-label` / `font-aero-mono` typography throughout.

### Right panel (main area)

- No results yet: "Press Calculate to compute attack profile."
- Results present: read-only table showing all computed values (run-in heading/distance, climb heading/distance/time, EoRI coords, roll-in coords, PUP coords).

---

## Calculation Logic

New file: `packages/frontend/src/utils/attackPlanningUtils.ts`  
Single exported function: `calculateAttackProfile(flightPlan, params) → results`

### Inputs resolved from flight plan
- **IP**: first waypoint with `waypointType === 'ip'`
- **TGT**: first waypoint with `waypointType === 'tgt'`, consecutive after IP
- **IP→TGT heading**: course between IP and TGT (already computed by `flightPlanUtils`)
- **Ingress altitude**: TGT waypoint's `alt` field (used as the altitude at PUP/start-of-climb)

### Calculation steps

1. **Climb heading** = IP→TGT heading + angleOff (right turn), or IP→TGT heading − angleOff (left turn)
   We allow the user to choose if they want to turn left or right by using the sign of the angleOff. Both solutions should be symmetric anyway.

2. **Turn radius** R = V² / (g × √(n²−1))  
   where V = climbTas (converted to ft/s), n = rollInG, g = 32.174 ft/s²

3. **Cone radius** R_cone = (apexAltitude − targetAltitude) / tan(diveAngle)  
   This is the horizontal distance from TGT to the end-of-roll-in circle.

4. **End-of-roll-in (EoRI)**: find the point on the cone circle (radius R_cone, centered at TGT projected to apex altitude) such that the banked turn from climbHeading to bearing(EoRI→TGT), with radius R, lands exactly at EoRI. Solved geometrically — may yield two candidate solutions; pick the one geometrically consistent with the approach direction (PUP ahead of TGT on IP→TGT line, turn direction matching the angle-off side).

5. **Run-in heading** = bearing(EoRI → TGT) — computed result

6. **Roll-in point** = derived from EoRI and turn geometry. Turn direction (left or right) is determined by the angle-off side resolved in step 1. Turn center = EoRI + R × perp(runInHeading, turn_dir); roll-in = turn_center + R × perp(climbHeading, opposite_dir).

7. **Climb distance** (horizontal) = (apexAltitude − ingressAltitude) / tan(climbAngle)  
   *Note: AoA is ignored in this version. Add a note in UI if needed in future.*

8. **PUP** = roll-in point − (climbHeading unit vector × horizontal climb distance)  
   PUP is also the start-of-climb. The aircraft simultaneously begins climbing and turning from IP→TGT heading to climbHeading here. The PUP turn uses the same g-load (rollInG) — assumed consistent with the roll-in turn.

9. **Climb time** = climb slant distance / climbTas, with wind correction on climb heading  
   Climb slant distance = (apexAltitude − ingressAltitude) / sin(climbAngle)

### Storing results
The Calculate button writes `{ params, results }` into `flightPlan.attackPlanning` via `onFlightPlanUpdate`, persisting it alongside the rest of the flight plan.

### Debugging Calculation
To help in refining the calculation, the calculation function will dump the result of each step to the console.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/frontend/src/types/flightPlan.ts` | Add `attackPlanning` optional field to `FlightPlan` |
| `packages/frontend/src/utils/attackPlanningUtils.ts` | New — `calculateAttackProfile` |
| `packages/frontend/src/components/AttackPlanningPage.tsx` | Implement form, results panel, Calculate button |
