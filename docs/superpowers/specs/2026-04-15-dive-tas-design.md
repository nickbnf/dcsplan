# Dive TAS & Run-in Time Design

**Date:** 2026-04-15

## Overview

Add a configurable dive TAS (speed at weapon release) to the attack planning system. Use it to compute run-in time (EoRI → drop point) and display the drop point on the attack diagram.

## Changes

### `packages/frontend/src/types/flightPlan.ts`

- Add `diveTas: number` (knots) to `AttackPlanningParams`
- Add to `AttackPlanningResults`:
  - `dropLat: number` — latitude of the drop point (for diagram use only, not shown in UI)
  - `dropLon: number` — longitude of the drop point (for diagram use only, not shown in UI)
  - `runInTime: number` — time in seconds from EoRI to drop point

### `packages/frontend/src/utils/attackPlanningUtils.ts`

After Step 9 (run-in heading/distance), add a step to compute:

- **Drop point**: advance EoRI along `runInHeading` by `(apexAltitude − dropAltitude) / tan(diveAngle)` nm
- **Run-in time**: slant distance = `(apexAltitude − dropAltitude) / sin(diveAngle) / FT_PER_NM`, then wind-corrected with `diveTas` along run-in heading (same pattern as climb time)

Return `dropLat`, `dropLon`, `runInTime` in results.

### `packages/frontend/src/components/AttackPlanningPage.tsx`

- Add `NumericField` for "Dive TAS" (kts) with default value 400, alongside existing params
- Add "Run-in Time" row to `ResultsPanel` (formatted as `m:ss`)

### `packages/frontend/src/components/AttackDiagram.tsx`

- Compute drop point SVG position from `results.dropLat` / `results.dropLon` (same `toLocal` + `toSvgFn` pattern as other points)
- Do **not** include drop point in bounding box — it always lies between EoRI and TGT so it's already in view
- Render a labeled marker (small circle + "DROP" label) on the run-in line at the drop point

## Out of scope

- Drop point coordinates are not shown in the results panel
- No changes to diagram auto-scaling / bounding box
