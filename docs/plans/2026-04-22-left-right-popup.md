# Left/Right Oblique Pop-Up Attack

## Context

The attack planning feature currently only supports a right-turning oblique pop-up. The user wants to offer both right and left turning options via the attack type dropdown: "Oblique pop-up (R)" and "Oblique pop-up (L)". The geometry is a mirror — the left variant subtracts the angle-off instead of adding it, and the roll-in turn direction is inverted.

## Approach: `turnSign` parameterization

Derive a `turnSign` (+1 for R, -1 for L) from the attack type and use it in the 3 direction-dependent expressions. This keeps all code shared.

## Changes

### 1. Types — `packages/frontend/src/types/flightPlan.ts`

- Widen `attackType` from `'oblique_popup'` to `'oblique_popup' | 'oblique_popup_l'`
- `'oblique_popup'` remains the right variant (backwards compatible with persisted data)
- No changes to `AttackPlanningResults` (headings and positions are already direction-agnostic)
- No version bump needed

### 2. Calculation — `packages/frontend/src/utils/attackPlanningUtils.ts`

Add a `sidePerp` helper (or inline the sign multiplication):
```ts
function sidePerp(hdgDeg: number, sign: 1 | -1): [number, number] {
  const [e, n] = rightPerp(hdgDeg);
  return [sign * e, sign * n];
}
```

At top of `calculateAttackProfile`, derive `turnSign`:
```ts
const turnSign = params.attackType === 'oblique_popup_l' ? -1 : 1;
```

Three lines change:

| Line | Current | New |
|------|---------|-----|
| 97 (climb heading) | `iptgtHdgDeg + params.angleOff` | `iptgtHdgDeg + turnSign * params.angleOff` |
| 128 (perp for arc center) | `rightPerp(climbHeadingDeg)` | `sidePerp(climbHeadingDeg, turnSign)` |
| 184 (roll-in validation) | `norm360(climbHeadingDeg - runInHdg)` | `norm360(turnSign * (climbHeadingDeg - runInHdg))` |

Lines 174 and 177 (roll-in point P and PUP) use `ch_rp` so they propagate automatically from the line 128 change.

Lines 253-269 (ECT computation) already handle both R/L PUP turns dynamically — no change needed.

### 3. Diagram — `packages/frontend/src/components/AttackDiagram.tsx`

- Add `attackType` prop to `AttackDiagramProps`
- Compute `riSweep` from attack type instead of hardcoding 0:
  ```ts
  const riSweep = attackType === 'oblique_popup_l' ? 1 : 0;
  ```
- PUP arc sweep (lines 118-119) is already computed dynamically from `pupCwAngle` and should work correctly for the left variant (produces `pupSweep = 0` when `pupCwAngle > 180`)

### 4. UI — `packages/frontend/src/components/AttackPlanningPage.tsx`

- Update attack type dropdown to two options:
  ```html
  <option value="oblique_popup">Oblique pop-up (R)</option>
  <option value="oblique_popup_l">Oblique pop-up (L)</option>
  ```
- Fix the `onChange` cast: `e.target.value as AttackPlanningParams['attackType']`
- Pass `attackType={params.attackType}` to `AttackDiagram`
- DEFAULT_PARAMS stays `attackType: 'oblique_popup'` (right is default)

### 5. Tests — `packages/frontend/src/utils/attackPlanningUtils.test.ts`

Add `BASE_PARAMS_LEFT = { ...BASE_PARAMS, attackType: 'oblique_popup_l' }` and new tests:
- Climb heading = IPTGT - angleOff (should be 330° for IPTGT=0, angleOff=30)
- EoRI on cone circle (same radius, NW quadrant instead of NE)
- PUP still on IP-TGT line (lon ≈ 36.0)
- PUP south of TGT
- Symmetry test: R and L produce identical distances/times with zero wind

### 6. Map PUP icon — `packages/frontend/src/utils/flightPlanLayer.ts`

- The PUP icon SVG (line 195) shows a circle on the left + arrow going up-right (right turn)
- For `oblique_popup_l`, mirror the icon: arrow goes up-left, circle on the right side
- Read attack type from `flightPlan.attackPlanning?.params?.attackType` (already available in the function)
- Mirrored SVG: circle at cx=32 (instead of 8), diagonal from (20,17) to (6,3), arrowhead polyline mirrored
- Anchor flips from `[0.2, 0.5]` to `[0.8, 0.5]` for the left variant

### No changes needed
- `FlightPlanContext.tsx` — auto-clear logic is type-agnostic
- `usePersistedFlightPlan.ts` — `'oblique_popup'` still valid, no migration

## Verification

1. Run tests: `pnpm test` in the frontend package — all existing tests pass, new left-variant tests pass
2. Start dev server, open Attack Planning page
3. Test right variant: select "Oblique pop-up (R)", set params, Calculate — diagram and results should be identical to current behavior
4. Test left variant: select "Oblique pop-up (L)", same params, Calculate — diagram should be a mirror image (PUP turn to the left, roll-in arc to the right)
5. Verify PUP marker on map: position correct for both, arrow points right for R / left for L
6. Switch between R and L, re-calculate — verify results update correctly
