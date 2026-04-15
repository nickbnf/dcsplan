# Attack Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Attack Planning page that lets the user enter oblique pop-up attack parameters and compute the full attack profile geometry (EoRI, roll-in point, PUP, run-in heading/distance, climb data).

**Architecture:** Flight plan state is lifted into a React context so it can be shared between the NAV page (PlannerApp) and the Attack Planning page. A new pure utility function (`calculateAttackProfile`) handles all geometry using a flat-earth Cartesian approach. The AttackPlanningPage reads params from local state, writes results into the flight plan on Calculate.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind CSS, Radix UI (existing patterns)

---

## File Map

| File | Change |
|------|--------|
| `packages/frontend/src/types/flightPlan.ts` | Add `AttackPlanningParams`, `AttackPlanningResults`, update `FlightPlan` |
| `packages/frontend/src/contexts/FlightPlanContext.tsx` | **New** — React context providing `flightPlan` + `onFlightPlanUpdate` |
| `packages/frontend/src/components/App.tsx` | Wrap routes in `FlightPlanProvider` |
| `packages/frontend/src/components/PlannerApp.tsx` | Consume `useFlightPlan()` context instead of `usePersistedFlightPlan` |
| `packages/frontend/src/utils/attackPlanningUtils.ts` | **New** — `calculateAttackProfile` function |
| `packages/frontend/src/utils/attackPlanningUtils.test.ts` | **New** — geometry tests |
| `packages/frontend/src/components/AttackPlanningPage.tsx` | Implement form, Calculate button, results panel |
| `packages/frontend/src/components/AttackDiagram.tsx` | **New** — SVG north-up diagram of the attack profile |

---

## Task 1: Extend FlightPlan types

**Files:**
- Modify: `packages/frontend/src/types/flightPlan.ts`

- [ ] **Step 1: Add AttackPlanningParams and AttackPlanningResults types, update FlightPlan**

Replace the closing of the file with:

```typescript
// In packages/frontend/src/types/flightPlan.ts
// Add BEFORE the FlightPlan type definition:

export type AttackPlanningParams = {
  attackType: 'oblique_popup';
  angleOff: 30 | 45 | 60;    // degrees, dropdown
  climbTas: number;           // knots
  climbAngle: number;         // degrees
  diveAngle: number;          // degrees
  apexAltitude: number;       // feet
  dropAltitude: number;       // feet
  targetAltitude: number;     // feet
  windDir: number;            // degrees (direction wind is coming from)
  windSpeed: number;          // knots
  rollInG: number;            // g-load for roll-in and PUP turns
};

export type AttackPlanningResults = {
  climbHeading: number;       // degrees (IP→TGT heading + angleOff)
  runInHeading: number;       // degrees (bearing EoRI → TGT, computed)
  runInDistance: number;      // nm (horizontal distance EoRI → TGT = cone radius)
  climbDistance: number;      // nm (horizontal distance PUP → roll-in point)
  climbTime: number;          // seconds (wind-corrected)
  endOfRollInLat: number;
  endOfRollInLon: number;
  rollInLat: number;
  rollInLon: number;
  pupLat: number;
  pupLon: number;
};
```

Then add to the `FlightPlan` type (after `name: string`):

```typescript
  attackPlanning?: {
    params: AttackPlanningParams;
    results?: AttackPlanningResults;
  };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/types/flightPlan.ts
git commit -m "feat: add AttackPlanningParams and AttackPlanningResults types to FlightPlan"
```

---

## Task 2: Create FlightPlanContext

The flight plan state currently lives in `PlannerApp`. `AttackPlanningPage` is a sibling route that also needs it. We lift state into a context wrapping all routes.

**Files:**
- Create: `packages/frontend/src/contexts/FlightPlanContext.tsx`
- Modify: `packages/frontend/src/components/App.tsx`
- Modify: `packages/frontend/src/components/PlannerApp.tsx`

- [ ] **Step 1: Create the context**

```typescript
// packages/frontend/src/contexts/FlightPlanContext.tsx
import React, { createContext, useContext } from 'react';
import type { FlightPlan } from '../types/flightPlan';
import { usePersistedFlightPlan } from '../hooks/usePersistedFlightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';

interface FlightPlanContextValue {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
}

const FlightPlanContext = createContext<FlightPlanContextValue | null>(null);

export const FlightPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flightPlan, setFlightPlan] = usePersistedFlightPlan(() =>
    flightPlanUtils.newFlightPlan()
  );

  return (
    <FlightPlanContext.Provider value={{ flightPlan, onFlightPlanUpdate: setFlightPlan }}>
      {children}
    </FlightPlanContext.Provider>
  );
};

export const useFlightPlan = (): FlightPlanContextValue => {
  const ctx = useContext(FlightPlanContext);
  if (!ctx) throw new Error('useFlightPlan must be used inside FlightPlanProvider');
  return ctx;
};
```

- [ ] **Step 2: Wrap routes in App.tsx**

Open `packages/frontend/src/components/App.tsx`. Change:

```tsx
      <Routes>
        <Route element={<Layout />}>
```

to:

```tsx
      <Routes>
        <Route element={<FlightPlanProvider><Layout /></FlightPlanProvider>}>
```

And add the import at the top:

```tsx
import { FlightPlanProvider } from '../contexts/FlightPlanContext';
```

- [ ] **Step 3: Update PlannerApp to consume context**

Open `packages/frontend/src/components/PlannerApp.tsx`.

Remove the import:
```tsx
import { usePersistedFlightPlan } from '../hooks/usePersistedFlightPlan';
```

Add the import:
```tsx
import { useFlightPlan } from '../contexts/FlightPlanContext';
```

Replace:
```tsx
  const [flightPlan, setFlightPlan] = usePersistedFlightPlan(() => {
    let plan = flightPlanUtils.newFlightPlan();
    return plan;
  });
```

with:
```tsx
  const { flightPlan, onFlightPlanUpdate: setFlightPlan } = useFlightPlan();
```

- [ ] **Step 4: Verify the app still works**

```bash
cd packages/frontend && npm run dev
```

Open `http://localhost:5173`. Navigate to NAV — flight plan should load and persist as before.

- [ ] **Step 5: Run existing tests**

```bash
cd packages/frontend && npm test
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/contexts/FlightPlanContext.tsx \
        packages/frontend/src/components/App.tsx \
        packages/frontend/src/components/PlannerApp.tsx
git commit -m "feat: lift flight plan state into FlightPlanContext for cross-route sharing"
```

---

## Task 3: Implement calculateAttackProfile (TDD)

**Geometry summary:**

Working in a flat-Earth local coordinate system (East/North, nautical miles) centered at TGT:
1. **Climb heading** CH = (IP→TGT heading) + angleOff
2. **Turn radius** R = V² / (g × √(n²−1)), where V = climbTas in ft/s, n = rollInG, g = 32.174 ft/s²
3. **Cone radius** R_cone = (apexAltitude − targetAltitude) / tan(diveAngle) [in nm]
4. **EoRI + PUP**: solved analytically — PUP traces a circle of radius R_eff = √(R_cone² + R²) offset by a constant C (see below). Intersect with the IP→TGT line to get 0–2 candidates; pick the one where PUP is before TGT.
5. **Climb distance** = (apexAltitude − ingressAlt) / tan(climbAngle) [nm], ingressAlt = TGT waypoint's `alt`
6. **PUP** = roll-in point − climbHeading × climbDistance

For CCW roll-in (angleOff positive):
- Turn center at EoRI: `O = EoRI + R × leftPerp(runInHeading)`  
- Roll-in point: `P = O + R × rightPerp(CH)`  
- PUP: `PUP = P − distClimb × headingVec(CH) = O + C` where `C = R×rightPerp(CH) − distClimb×headingVec(CH)`
- O lies on a circle of radius R_eff centered at TGT
- Constraint (PUP on IPTGT line): `R_eff × sin(ψ − IPTGT_rad) = −K` where `K = C_E×cos(IPTGT_rad) − C_N×sin(IPTGT_rad)`, ψ = φ + atan2(R, R_cone)

**Files:**
- Create: `packages/frontend/src/utils/attackPlanningUtils.ts`
- Create: `packages/frontend/src/utils/attackPlanningUtils.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/frontend/src/utils/attackPlanningUtils.test.ts
import { describe, it, expect } from 'vitest';
import { calculateAttackProfile } from './attackPlanningUtils';
import type { FlightPlan, AttackPlanningParams } from '../types/flightPlan';

const BASE_PLAN: FlightPlan = {
  theatre: 'syria_old',
  points: [],
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test Plan',
};

const BASE_PARAMS: AttackPlanningParams = {
  attackType: 'oblique_popup',
  angleOff: 30,
  climbTas: 300,
  climbAngle: 20,
  diveAngle: 45,
  apexAltitude: 8000,
  dropAltitude: 3000,
  targetAltitude: 100,
  windDir: 0,
  windSpeed: 0,
  rollInG: 3,
};

// IP at lat=35.8, lon=36.0; TGT at lat=36.0, lon=36.0
// IPTGT heading = 0° (due North). TGT.alt = 500 (ingress altitude).
const PLAN_WITH_IP_TGT: FlightPlan = {
  ...BASE_PLAN,
  points: [
    { lat: 35.8, lon: 36.0, tas: 300, alt: 500, fuelFlow: 5000, windSpeed: 0, windDir: 0, waypointType: 'ip' },
    { lat: 36.0, lon: 36.0, tas: 300, alt: 500, fuelFlow: 5000, windSpeed: 0, windDir: 0, waypointType: 'tgt' },
  ],
};

const FT_PER_NM = 6076.115;
const toRad = (d: number) => (d * Math.PI) / 180;
const LAT_NM = 60;
const lonNmPerDeg = (lat: number) => 60 * Math.cos(toRad(lat));

describe('calculateAttackProfile', () => {
  it('returns null when no IP waypoint', () => {
    const plan: FlightPlan = {
      ...BASE_PLAN,
      points: [
        { lat: 36.0, lon: 36.0, tas: 300, alt: 500, fuelFlow: 5000, windSpeed: 0, windDir: 0, waypointType: 'tgt' },
      ],
    };
    expect(calculateAttackProfile(plan, BASE_PARAMS)).toBeNull();
  });

  it('returns null when no TGT waypoint after IP', () => {
    const plan: FlightPlan = {
      ...BASE_PLAN,
      points: [
        { lat: 35.8, lon: 36.0, tas: 300, alt: 500, fuelFlow: 5000, windSpeed: 0, windDir: 0, waypointType: 'ip' },
      ],
    };
    expect(calculateAttackProfile(plan, BASE_PARAMS)).toBeNull();
  });

  it('computes climb heading as IPTGT heading + angleOff', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    // IPTGT = 0° (North), angleOff = 30° → climbHeading = 30°
    expect(result!.climbHeading).toBeCloseTo(30, 1);
  });

  it('places EoRI on the cone circle (distance from TGT = cone radius)', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();

    const R_cone_nm = (8000 - 100) / Math.tan(toRad(45)) / FT_PER_NM; // ≈ 1.300 nm
    const tgtLat = 36.0, tgtLon = 36.0;
    const dLat = result!.endOfRollInLat - tgtLat;
    const dLon = result!.endOfRollInLon - tgtLon;
    const eoriDistNm = Math.sqrt((dLat * LAT_NM) ** 2 + (dLon * lonNmPerDeg(tgtLat)) ** 2);

    expect(eoriDistNm).toBeCloseTo(R_cone_nm, 2);
  });

  it('places PUP on the IP→TGT line (lon ≈ 36.0 for N-S axis)', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    // IPTGT axis is lon = 36.0 (due North)
    expect(result!.pupLon).toBeCloseTo(36.0, 3);
  });

  it('places PUP south of TGT (before TGT on IPTGT line)', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    expect(result!.pupLat).toBeLessThan(36.0);
  });

  it('run-in heading equals bearing from EoRI to TGT', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();

    const tgtLat = 36.0, tgtLon = 36.0;
    const dE = (tgtLon - result!.endOfRollInLon) * lonNmPerDeg(tgtLat);
    const dN = (tgtLat - result!.endOfRollInLat) * LAT_NM;
    const expectedRIH = (((Math.atan2(dE, dN) * 180) / Math.PI) + 360) % 360;

    expect(result!.runInHeading).toBeCloseTo(expectedRIH, 1);
  });

  it('run-in distance equals cone radius', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    const R_cone_nm = (8000 - 100) / Math.tan(toRad(45)) / FT_PER_NM;
    expect(result!.runInDistance).toBeCloseTo(R_cone_nm, 2);
  });

  it('returns positive climb time', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    expect(result!.climbTime).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/frontend && npm test -- attackPlanningUtils
```

Expected: FAIL — `calculateAttackProfile` not found.

- [ ] **Step 3: Implement calculateAttackProfile**

```typescript
// packages/frontend/src/utils/attackPlanningUtils.ts
import type { FlightPlan, AttackPlanningParams, AttackPlanningResults } from '../types/flightPlan';

const FT_PER_NM = 6076.115;
const G_FT_S2 = 32.174;
const KNOTS_TO_FT_S = 1.68781;
const LAT_NM_PER_DEG = 60.0;

function toRad(deg: number): number { return (deg * Math.PI) / 180; }
function toDeg(rad: number): number { return (rad * 180) / Math.PI; }
function normalizeHdg(deg: number): number { return ((deg % 360) + 360) % 360; }

// Unit vector [East, North] for a heading in degrees (CW from North)
function headingVec(hdg: number): [number, number] {
  const r = toRad(hdg);
  return [Math.sin(r), Math.cos(r)];
}

// Left perpendicular of heading (90° CCW): [-cos, sin]
function leftPerp(hdg: number): [number, number] {
  const r = toRad(hdg);
  return [-Math.cos(r), Math.sin(r)];
}

// Right perpendicular of heading (90° CW): [cos, -sin]
function rightPerp(hdg: number): [number, number] {
  const r = toRad(hdg);
  return [Math.cos(r), -Math.sin(r)];
}

function add(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]];
}
function scale(v: [number, number], s: number): [number, number] {
  return [v[0] * s, v[1] * s];
}
function dot(a: [number, number], b: [number, number]): number {
  return a[0] * b[0] + a[1] * b[1];
}

// Bearing from (aE, aN) to (bE, bN), degrees CW from North
function bearingTo(aE: number, aN: number, bE: number, bN: number): number {
  return normalizeHdg(toDeg(Math.atan2(bE - aE, bN - aN)));
}

// Convert lat/lon to local [East, North] nm relative to reference point
function toLocal(lat: number, lon: number, refLat: number, refLon: number): [number, number] {
  const lonNm = LAT_NM_PER_DEG * Math.cos(toRad(refLat));
  return [(lon - refLon) * lonNm, (lat - refLat) * LAT_NM_PER_DEG];
}

// Convert local [East, North] nm to lat/lon
function fromLocal(E: number, N: number, refLat: number, refLon: number): [number, number] {
  const lonNm = LAT_NM_PER_DEG * Math.cos(toRad(refLat));
  return [refLat + N / LAT_NM_PER_DEG, refLon + E / lonNm];
}

export function calculateAttackProfile(
  flightPlan: FlightPlan,
  params: AttackPlanningParams,
): AttackPlanningResults | null {
  // --- Step 1: Find IP and TGT ---
  const ipIdx = flightPlan.points.findIndex(p => p.waypointType === 'ip');
  if (ipIdx === -1) {
    console.log('[Attack] No IP waypoint found');
    return null;
  }
  const tgtIdx = flightPlan.points.findIndex((p, i) => p.waypointType === 'tgt' && i > ipIdx);
  if (tgtIdx === -1) {
    console.log('[Attack] No TGT waypoint after IP found');
    return null;
  }
  const ip = flightPlan.points[ipIdx];
  const tgt = flightPlan.points[tgtIdx];
  const ingressAlt = tgt.alt ?? 0;
  console.log('[Attack] IP:', ip.lat, ip.lon, '| TGT:', tgt.lat, tgt.lon, '| ingressAlt:', ingressAlt);

  // --- Step 2: IP→TGT heading (TGT at local origin) ---
  const [ipE, ipN] = toLocal(ip.lat, ip.lon, tgt.lat, tgt.lon);
  const iptgtHeading = bearingTo(ipE, ipN, 0, 0);
  console.log('[Attack] IPTGT heading:', iptgtHeading.toFixed(2), '°');

  // --- Step 3: Climb heading (CCW roll-in: +angleOff) ---
  const climbHeading = normalizeHdg(iptgtHeading + params.angleOff);
  console.log('[Attack] Climb heading:', climbHeading.toFixed(2), '°');

  // --- Step 4: Turn radius (nm) ---
  const V_fps = params.climbTas * KNOTS_TO_FT_S;
  const R_nm = (V_fps * V_fps) / (G_FT_S2 * Math.sqrt(params.rollInG ** 2 - 1)) / FT_PER_NM;
  console.log('[Attack] Turn radius:', R_nm.toFixed(4), 'nm');

  // --- Step 5: Cone radius (nm) ---
  const R_cone_nm = (params.apexAltitude - params.targetAltitude) / Math.tan(toRad(params.diveAngle)) / FT_PER_NM;
  console.log('[Attack] Cone radius:', R_cone_nm.toFixed(4), 'nm');

  // --- Step 6: Horizontal climb distance (nm) ---
  const distClimb_nm = (params.apexAltitude - ingressAlt) / Math.tan(toRad(params.climbAngle)) / FT_PER_NM;
  console.log('[Attack] Climb distance:', distClimb_nm.toFixed(4), 'nm');

  // --- Step 7: Analytical solve for EoRI, roll-in, PUP ---
  // For CCW roll-in:
  //   O(ψ) = R_eff × (sin ψ, cos ψ),  ψ = φ + α,  R_eff = √(R_cone²+R²),  α = atan2(R, R_cone)
  //   C = R × rightPerp(CH) − distClimb × headingVec(CH)  (constant offset)
  //   PUP = O + C  (traces circle of radius R_eff centred at C)
  //   PUP on IPTGT line ⟹ R_eff × sin(ψ − IPTGT_rad) = −K
  //   K = C_E×cos(IPTGT_rad) − C_N×sin(IPTGT_rad)
  const R_eff = Math.sqrt(R_cone_nm ** 2 + R_nm ** 2);
  const alpha = Math.atan2(R_nm, R_cone_nm); // radians
  const CH = climbHeading;
  const IPTGT_rad = toRad(iptgtHeading);

  const rp = rightPerp(CH);
  const hv = headingVec(CH);
  const C_E = R_nm * rp[0] - distClimb_nm * hv[0];
  const C_N = R_nm * rp[1] - distClimb_nm * hv[1];
  console.log('[Attack] C:', C_E.toFixed(4), C_N.toFixed(4));

  const K = C_E * Math.cos(IPTGT_rad) - C_N * Math.sin(IPTGT_rad);
  const sinVal = -K / R_eff;
  console.log('[Attack] K:', K.toFixed(4), '| sinVal:', sinVal.toFixed(4));

  if (Math.abs(sinVal) > 1) {
    console.log('[Attack] No solution: geometry infeasible');
    return null;
  }

  const asinVal = Math.asin(sinVal);
  const psiCandidates = [IPTGT_rad + asinVal, IPTGT_rad + Math.PI - asinVal];
  const u_IPTGT = headingVec(iptgtHeading);

  let best: AttackPlanningResults | null = null;
  let bestT = -Infinity;

  for (const psi of psiCandidates) {
    const O: [number, number] = [R_eff * Math.sin(psi), R_eff * Math.cos(psi)];
    const phi = psi - alpha;

    const eoriE = R_cone_nm * Math.sin(phi);
    const eoriN = R_cone_nm * Math.cos(phi);

    // Roll-in point: O + R × rightPerp(CH)  (CCW turn: centre is left of CH at roll-in)
    const P = add(O, scale(rightPerp(CH), R_nm));

    // PUP: P − distClimb × headingVec(CH)
    const PUP = add(P, scale(headingVec(CH), -distClimb_nm));

    // t = projection of PUP onto IPTGT direction (negative = between IP and TGT)
    const t = dot(PUP, u_IPTGT);
    console.log(`[Attack] ψ=${toDeg(psi).toFixed(1)}°: EoRI=(${eoriE.toFixed(3)},${eoriN.toFixed(3)}) PUP=(${PUP[0].toFixed(3)},${PUP[1].toFixed(3)}) t=${t.toFixed(3)}`);

    if (t < 0 && t > bestT) {
      bestT = t;
      const runInHeading = bearingTo(eoriE, eoriN, 0, 0);
      const [eoriLat, eoriLon] = fromLocal(eoriE, eoriN, tgt.lat, tgt.lon);
      const [rollInLat, rollInLon] = fromLocal(P[0], P[1], tgt.lat, tgt.lon);
      const [pupLat, pupLon] = fromLocal(PUP[0], PUP[1], tgt.lat, tgt.lon);

      // Climb time: wind-corrected
      const climbSlant_nm = (params.apexAltitude - ingressAlt) / Math.sin(toRad(params.climbAngle)) / FT_PER_NM;
      const windComp = params.windSpeed * Math.cos(toRad(params.windDir - climbHeading));
      const groundSpeed = Math.max(params.climbTas - windComp, 1);
      const climbTime = (climbSlant_nm / groundSpeed) * 3600;

      best = {
        climbHeading,
        runInHeading,
        runInDistance: R_cone_nm,
        climbDistance: distClimb_nm,
        climbTime,
        endOfRollInLat: eoriLat,
        endOfRollInLon: eoriLon,
        rollInLat,
        rollInLon,
        pupLat,
        pupLon,
      };
    }
  }

  console.log('[Attack] Final result:', best);
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/frontend && npm test -- attackPlanningUtils
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/utils/attackPlanningUtils.ts \
        packages/frontend/src/utils/attackPlanningUtils.test.ts
git commit -m "feat: implement calculateAttackProfile geometry utility with tests"
```

---

## Task 4: Implement AttackPlanningPage

**Files:**
- Modify: `packages/frontend/src/components/AttackPlanningPage.tsx`

- [ ] **Step 1: Replace the stub with the full implementation**

```tsx
// packages/frontend/src/components/AttackPlanningPage.tsx
import React, { useState, useCallback } from 'react';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { calculateAttackProfile } from '../utils/attackPlanningUtils';
import type { AttackPlanningParams, AttackPlanningResults } from '../types/flightPlan';

const DEFAULT_PARAMS: AttackPlanningParams = {
  attackType: 'oblique_popup',
  angleOff: 30,
  climbTas: 300,
  climbAngle: 20,
  diveAngle: 45,
  apexAltitude: 8000,
  dropAltitude: 3000,
  targetAltitude: 100,
  windDir: 0,
  windSpeed: 20,
  rollInG: 3,
};

// Reusable numeric row for the form
const NumericField: React.FC<{
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}> = ({ label, value, unit, onChange }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-aero-label text-gray-600 w-32">{label}</span>
    <div className="flex items-center space-x-1">
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 text-right text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
      />
      <span className="text-xs font-aero-label text-gray-500 w-8">{unit}</span>
    </div>
  </div>
);

// Read-only result row
const ResultRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-xs font-aero-label text-gray-600">{label}</span>
    <span className="text-xs font-aero-mono text-gray-900">{value}</span>
  </div>
);

const formatLatLon = (lat: number, lon: number): string => {
  const latDeg = Math.trunc(lat);
  const latMin = Math.abs((lat - latDeg) * 60);
  const lonDeg = Math.trunc(lon);
  const lonMin = Math.abs((lon - lonDeg) * 60);
  return `${latDeg}°${latMin.toFixed(2)}' / ${lonDeg}°${lonMin.toFixed(2)}'`;
};

const formatTime = (seconds: number): string => {
  const m = Math.trunc(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const ResultsPanel: React.FC<{ results: AttackPlanningResults }> = ({ results }) => (
  <div className="p-6 bg-white rounded shadow min-w-[340px]">
    <h3 className="text-sm font-aero-label text-gray-900 mb-3 uppercase">Attack Profile</h3>
    <div className="space-y-1">
      <ResultRow label="Climb Heading" value={`${results.climbHeading.toFixed(0)}°`} />
      <ResultRow label="Run-in Heading" value={`${results.runInHeading.toFixed(0)}°`} />
      <ResultRow label="Run-in Distance" value={`${results.runInDistance.toFixed(2)} nm`} />
      <ResultRow label="Climb Distance" value={`${results.climbDistance.toFixed(2)} nm`} />
      <ResultRow label="Climb Time" value={formatTime(results.climbTime)} />
      <div className="border-t border-gray-200 my-2" />
      <ResultRow label="EoRI" value={formatLatLon(results.endOfRollInLat, results.endOfRollInLon)} />
      <ResultRow label="Roll-in" value={formatLatLon(results.rollInLat, results.rollInLon)} />
      <ResultRow label="PUP" value={formatLatLon(results.pupLat, results.pupLon)} />
    </div>
  </div>
);

const AttackPlanningPage: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate } = useFlightPlan();
  const [params, setParams] = useState<AttackPlanningParams>(
    flightPlan.attackPlanning?.params ?? DEFAULT_PARAMS
  );

  const hasTgt = flightPlan.points.some(p => p.waypointType === 'tgt');
  const hasIp = flightPlan.points.some(p => p.waypointType === 'ip');
  const canCalculate = hasTgt && hasIp;
  const results = flightPlan.attackPlanning?.results;

  const handleCalculate = useCallback(() => {
    const newResults = calculateAttackProfile(flightPlan, params);
    if (newResults) {
      onFlightPlanUpdate({
        ...flightPlan,
        attackPlanning: { params, results: newResults },
      });
    }
  }, [flightPlan, params, onFlightPlanUpdate]);

  const set = (key: keyof AttackPlanningParams, val: unknown) =>
    setParams(p => ({ ...p, [key]: val }));

  return (
    <div className="flex flex-1 w-full overflow-hidden">
      {/* Left panel: form */}
      <div className="w-[400px] shrink-0 h-full bg-gray-50 border-r border-gray-300 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-aero-label text-gray-900">Attack Planning</h2>
        </div>

        <div className="p-4 space-y-3 flex-1">
          {/* Attack type */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-aero-label text-gray-600 w-32">Attack type</span>
            <select
              value={params.attackType}
              onChange={e => set('attackType', e.target.value)}
              className="text-sm font-aero-label border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
            >
              <option value="oblique_popup">Oblique pop-up</option>
            </select>
          </div>

          {/* Angle off */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-aero-label text-gray-600 w-32">Angle off</span>
            <select
              value={params.angleOff}
              onChange={e => set('angleOff', parseInt(e.target.value) as 30 | 45 | 60)}
              className="text-sm font-aero-label border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
            >
              <option value={30}>30°</option>
              <option value={45}>45°</option>
              <option value={60}>60°</option>
            </select>
          </div>

          <NumericField label="Climb TAS" value={params.climbTas} unit="kts" onChange={v => set('climbTas', v)} />
          <NumericField label="Climb angle" value={params.climbAngle} unit="°" onChange={v => set('climbAngle', v)} />
          <NumericField label="Dive angle" value={params.diveAngle} unit="°" onChange={v => set('diveAngle', v)} />
          <NumericField label="Apex altitude" value={params.apexAltitude} unit="ft" onChange={v => set('apexAltitude', v)} />
          <NumericField label="Drop altitude" value={params.dropAltitude} unit="ft" onChange={v => set('dropAltitude', v)} />
          <NumericField label="Target altitude" value={params.targetAltitude} unit="ft" onChange={v => set('targetAltitude', v)} />
          <NumericField label="Roll-in g" value={params.rollInG} unit="g" onChange={v => set('rollInG', v)} />

          {/* Wind */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-aero-label text-gray-600 w-32">Wind</span>
            <div className="flex items-center space-x-1">
              <input
                type="number"
                value={params.windDir}
                onChange={e => set('windDir', parseFloat(e.target.value) || 0)}
                className="w-14 text-right text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
              />
              <span className="text-xs font-aero-label text-gray-500">°/</span>
              <input
                type="number"
                value={params.windSpeed}
                onChange={e => set('windSpeed', parseFloat(e.target.value) || 0)}
                className="w-14 text-right text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
              />
              <span className="text-xs font-aero-label text-gray-500 w-8">kts</span>
            </div>
          </div>
        </div>

        {/* Calculate button pinned to bottom of panel */}
        <div className="p-4 border-t border-gray-200 space-y-2">
          {!canCalculate && (
            <p className="text-xs font-aero-label text-gray-500">
              {!hasIp && !hasTgt
                ? 'Add IP and TGT waypoints to enable calculation.'
                : !hasIp
                ? 'Add an IP waypoint to enable calculation.'
                : 'Add a TGT waypoint to enable calculation.'}
            </p>
          )}
          <button
            onClick={handleCalculate}
            disabled={!canCalculate}
            className="w-full py-2 font-aero-label text-sm bg-avio-primary text-white rounded hover:bg-avio-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Calculate
          </button>
        </div>
      </div>

      {/* Right panel: results */}
      <div className="flex-1 h-full flex items-center justify-center bg-gray-100">
        {results ? (
          <ResultsPanel results={results} />
        ) : (
          <p className="font-aero-label text-gray-500">Press Calculate to compute attack profile.</p>
        )}
      </div>
    </div>
  );
};

export default AttackPlanningPage;
```

- [ ] **Step 2: Run all tests**

```bash
cd packages/frontend && npm test
```

Expected: all tests pass (including the existing ones).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test in browser**

```bash
cd packages/frontend && npm run dev
```

1. Go to `http://localhost:5173`
2. On the NAV page, add an IP waypoint and a TGT waypoint
3. Navigate to ATTACK tab
4. Verify all form fields display with defaults
5. Press Calculate — results panel should show heading, distance, time, and coordinates
6. Navigate back to NAV — flight plan still intact
7. Return to ATTACK — params and results still populated

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/AttackPlanningPage.tsx
git commit -m "feat: implement AttackPlanningPage with form fields and results display"
```

---

## Task 5: Attack Profile Diagram (SVG, north-up)

Replaces the plain text results in the right panel with a north-up SVG diagram of the attack geometry. The text results table moves to a compact panel below (or alongside) the diagram.

**Files:**
- Create: `packages/frontend/src/components/AttackDiagram.tsx`
- Modify: `packages/frontend/src/components/AttackPlanningPage.tsx` (swap results panel)

### Diagram elements

| Element | Style |
|---------|-------|
| IP→TGT course line | Grey dashed line, full extent of diagram |
| Climb segment (PUP → roll-in) | Solid blue line |
| Roll-in turn arc (roll-in → EoRI) | Solid blue arc |
| Run-in segment (EoRI → TGT) | Solid red line |
| PUP | Filled blue circle + label "PUP" |
| Roll-in point | Filled blue circle + label "Roll-in" |
| EoRI | Filled blue circle + label "EoRI" |
| IP | Open grey circle + label "IP" |
| TGT | Downward triangle (▼), filled red + label "TGT" |
| North arrow | Top-right corner, "N" label with upward arrow |

### Coordinate system

Working in local flat-earth [East, North] (nm), centred at TGT:

```
svgX = padding + (E - minE) * scale
svgY = height - padding - (N - minN) * scale
```

Scale is chosen to fit all points (IP, TGT, PUP, roll-in, EoRI) with 40px padding on all sides.

### Roll-in arc

The roll-in turn is a circular arc from the roll-in point to EoRI. Render as an SVG `<path>` using the `A` (arc) command:

```
A rx ry x-rotation large-arc-flag sweep-flag x y
```

- `rx = ry = R_px` (turn radius in pixels)
- `large-arc-flag`: 0 if the arc spans < 180°, else 1
- `sweep-flag`: 1 for CW (right turn), 0 for CCW (left turn). Since the current implementation uses CCW roll-in (angleOff positive), use `sweep-flag = 0`.

The heading change angle = `normalizeHdg(runInHeading - climbHeading)`. If this is > 180°, set `large-arc-flag = 1`.

- [ ] **Step 1: Create AttackDiagram component**

```tsx
// packages/frontend/src/components/AttackDiagram.tsx
import React, { useMemo } from 'react';
import type { AttackPlanningResults } from '../types/flightPlan';

interface Point { lat: number; lon: number }

interface AttackDiagramProps {
  results: AttackPlanningResults;
  ip: Point;
  tgt: Point;
}

const LAT_NM = 60;
const toRad = (d: number) => (d * Math.PI) / 180;
const lonNmPerDeg = (lat: number) => LAT_NM * Math.cos(toRad(lat));
const normalizeHdg = (d: number) => ((d % 360) + 360) % 360;

// Convert lat/lon to local [East, North] nm relative to TGT
function toLocal(lat: number, lon: number, tgtLat: number, tgtLon: number): [number, number] {
  return [
    (lon - tgtLon) * lonNmPerDeg(tgtLat),
    (lat - tgtLat) * LAT_NM,
  ];
}

const PADDING = 48; // px
const SVG_W = 480;
const SVG_H = 480;

const AttackDiagram: React.FC<AttackDiagramProps> = ({ results, ip, tgt }) => {
  const { points, scale, toSvg, R_px, headingChange } = useMemo(() => {
    const ref = { lat: tgt.lat, lon: tgt.lon };

    const pts: Record<string, [number, number]> = {
      ip: toLocal(ip.lat, ip.lon, ref.lat, ref.lon),
      tgt: [0, 0],
      pup: toLocal(results.pupLat, results.pupLon, ref.lat, ref.lon),
      rollIn: toLocal(results.rollInLat, results.rollInLon, ref.lat, ref.lon),
      eori: toLocal(results.endOfRollInLat, results.endOfRollInLon, ref.lat, ref.lon),
    };

    const allE = Object.values(pts).map(p => p[0]);
    const allN = Object.values(pts).map(p => p[1]);
    const minE = Math.min(...allE);
    const maxE = Math.max(...allE);
    const minN = Math.min(...allN);
    const maxN = Math.max(...allN);

    const rangeE = maxE - minE || 1;
    const rangeN = maxN - minN || 1;
    const drawW = SVG_W - 2 * PADDING;
    const drawH = SVG_H - 2 * PADDING;
    const scaleVal = Math.min(drawW / rangeE, drawH / rangeN);

    const toSvgFn = ([E, N]: [number, number]): [number, number] => [
      PADDING + (E - minE) * scaleVal,
      SVG_H - PADDING - (N - minN) * scaleVal,
    ];

    const R_px = results.runInDistance * scaleVal; // turn radius in pixels (approx — use cone radius as proxy for diagram scale)

    const hdgChange = normalizeHdg(results.runInHeading - results.climbHeading);

    return { points: pts, scale: scaleVal, toSvg: toSvgFn, R_px, headingChange: hdgChange };
  }, [results, ip, tgt]);

  const [ipX, ipY] = toSvg(points.ip);
  const [tgtX, tgtY] = toSvg(points.tgt);
  const [pupX, pupY] = toSvg(points.pup);
  const [riX, riY] = toSvg(points.rollIn);
  const [eoriX, eoriY] = toSvg(points.eori);

  // Extend IP→TGT line to fill diagram (dashed course line)
  const iptgtDx = tgtX - ipX;
  const iptgtDy = tgtY - ipY;
  const iptgtLen = Math.sqrt(iptgtDx ** 2 + iptgtDy ** 2) || 1;
  const extend = 600; // px beyond the diagram bounds
  const courseX1 = ipX - (iptgtDx / iptgtLen) * extend;
  const courseY1 = ipY - (iptgtDy / iptgtLen) * extend;
  const courseX2 = tgtX + (iptgtDx / iptgtLen) * extend;
  const courseY2 = tgtY + (iptgtDy / iptgtLen) * extend;

  // Roll-in arc: from (riX, riY) to (eoriX, eoriY), CCW (sweep=0), radius R_px
  const largeArc = headingChange > 180 ? 1 : 0;
  const arcPath = `M ${riX} ${riY} A ${R_px} ${R_px} 0 ${largeArc} 0 ${eoriX} ${eoriY}`;

  // TGT triangle (downward-pointing, 10px)
  const tri = `M ${tgtX} ${tgtY + 12} L ${tgtX - 8} ${tgtY - 4} L ${tgtX + 8} ${tgtY - 4} Z`;

  return (
    <svg width={SVG_W} height={SVG_H} className="bg-white rounded shadow">
      <defs>
        <clipPath id="diagram-clip">
          <rect x={0} y={0} width={SVG_W} height={SVG_H} />
        </clipPath>
        <marker id="arrow-n" markerWidth="6" markerHeight="6" refX="3" refY="6" orient="auto">
          <path d="M3,0 L6,6 L3,4 L0,6 Z" fill="#374151" />
        </marker>
      </defs>

      {/* IP→TGT course (dashed grey) */}
      <line
        x1={courseX1} y1={courseY1} x2={courseX2} y2={courseY2}
        stroke="#9ca3af" strokeWidth={1} strokeDasharray="6,4"
        clipPath="url(#diagram-clip)"
      />

      {/* Climb segment: PUP → roll-in */}
      <line x1={pupX} y1={pupY} x2={riX} y2={riY} stroke="#3b82f6" strokeWidth={2} />

      {/* Roll-in arc: roll-in → EoRI */}
      <path d={arcPath} fill="none" stroke="#3b82f6" strokeWidth={2} />

      {/* Run-in: EoRI → TGT */}
      <line x1={eoriX} y1={eoriY} x2={tgtX} y2={tgtY} stroke="#ef4444" strokeWidth={2} />

      {/* IP marker */}
      <circle cx={ipX} cy={ipY} r={5} fill="white" stroke="#9ca3af" strokeWidth={1.5} />
      <text x={ipX + 8} y={ipY + 4} fontSize={11} fontFamily="monospace" fill="#6b7280">IP</text>

      {/* PUP marker */}
      <circle cx={pupX} cy={pupY} r={5} fill="#3b82f6" />
      <text x={pupX + 8} y={pupY + 4} fontSize={11} fontFamily="monospace" fill="#1d4ed8">PUP</text>

      {/* Roll-in marker */}
      <circle cx={riX} cy={riY} r={4} fill="#3b82f6" />
      <text x={riX + 8} y={riY + 4} fontSize={11} fontFamily="monospace" fill="#1d4ed8">Roll-in</text>

      {/* EoRI marker */}
      <circle cx={eoriX} cy={eoriY} r={4} fill="#3b82f6" />
      <text x={eoriX + 8} y={eoriY + 4} fontSize={11} fontFamily="monospace" fill="#1d4ed8">EoRI</text>

      {/* TGT triangle */}
      <path d={tri} fill="#ef4444" />
      <text x={tgtX + 10} y={tgtY + 4} fontSize={11} fontFamily="monospace" fill="#dc2626">TGT</text>

      {/* North arrow (top-right) */}
      <line x1={SVG_W - 24} y1={SVG_H - PADDING + 10} x2={SVG_W - 24} y2={SVG_H - PADDING - 20}
        stroke="#374151" strokeWidth={1.5} markerEnd="url(#arrow-n)" />
      <text x={SVG_W - 29} y={SVG_H - PADDING - 24} fontSize={11} fontFamily="monospace" fill="#374151">N</text>
    </svg>
  );
};

export default AttackDiagram;
```

- [ ] **Step 2: Update AttackPlanningPage right panel**

In `packages/frontend/src/components/AttackPlanningPage.tsx`:

Add import at the top:
```tsx
import AttackDiagram from './AttackDiagram';
```

Replace the `ResultsPanel` usage and "Press Calculate" fallback in the right panel:

```tsx
      {/* Right panel: diagram + compact results */}
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-gray-100 gap-4 p-4 overflow-auto">
        {results ? (
          <>
            <AttackDiagram
              results={results}
              ip={flightPlan.points.find(p => p.waypointType === 'ip')!}
              tgt={flightPlan.points.find(p => p.waypointType === 'tgt')!}
            />
            <ResultsPanel results={results} />
          </>
        ) : (
          <p className="font-aero-label text-gray-500">Press Calculate to compute attack profile.</p>
        )}
      </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test**

```bash
cd packages/frontend && npm run dev
```

1. Add IP and TGT waypoints on the NAV page
2. Navigate to ATTACK
3. Press Calculate
4. Right panel should show the north-up SVG diagram with all elements labeled, and the compact results table below it

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/AttackDiagram.tsx \
        packages/frontend/src/components/AttackPlanningPage.tsx
git commit -m "feat: add north-up SVG attack profile diagram to Attack Planning page"
```
