# Proposal

## Why

While drawing a plan, users often need the bearing and distance between two arbitrary points: IP to target, a threat to a turn point, a landmark to a hold. Today the only way to get them is to add a temporary waypoint and read the leg values. That edits the plan and pollutes undo. The planner map already has a "Measure" switch in its display controls, but it does nothing.

## What Changes

- Add a **Measure** tool to the planner map, reached from a dedicated button under the Display button and from the `M` keyboard shortcut.
- The user clicks a start point A, then moves the cursor. A live line and label show the **magnetic bearing** and **distance** from A to the cursor. A second click pins point B.
- The label reads as a vector A → B: `087°M  23.4 NM`, with the reciprocal bearing shown as secondary information `(267°M)`.
- Bearing and distance use the same computations as leg courses: the theatre's navigation mode, the projection, and the plan's declination. A measurement between two waypoints therefore matches the leg between them.
- The pinned measurement stays on the map while the user goes back to normal editing (dragging waypoints, editing comments). It is dismissed by pressing the Measure button or `M` again. Closing the plan or reloading the page also removes it.
- Only one measurement exists at a time. A pinned measurement cannot be edited; the user re-measures instead.
- Arming the tool cancels waypoint drawing and add-marker placement. `Esc` only cancels a measurement in progress.
- Remove the non-functional "Measure" switch from the shared display controls, so from the theatre library map as well, along with its unused state.

## Non-goals

- Measurements are **not** part of the flight plan. They are never stored, synced, versioned or undone, and never appear on the kneeboard. That keeps them outside the Yjs plan document (AD-6).
- No snapping of endpoints to waypoints, markers or library objects.
- No true bearing, and no unit other than nautical miles.
- No editing of a pinned measurement by dragging its endpoints.
- No multiple simultaneous measurements.
- No Measure tool on the theatre library map. It has no plan, so it has no declination.

## Capabilities

### New Capabilities
- `map-measure`: the planner map's transient bearing/distance measuring tool. Covers how it is reached, its states, the readout format and computation, how it interacts with other map modes, and its lifetime.

### Modified Capabilities
<!-- None. The removed "Measure" switch had no specified behaviour. -->

## Impact

- **Frontend only.** No backend, data-model, API or kneeboard change, and no `FLIGHT_PLAN_VERSION` bump.
- `packages/frontend/src/components/Map.tsx`: measure layer, the click handler gets measure as its highest priority, pointer-move rubber band, `M`/`Esc` in the global keydown handler, cancelling the drawing and add-marker modes.
- New: a `useMeasureTool` hook and a `MeasureButton` component under `components/map/`.
- `components/map/DisplayButton.tsx` and `DisplayControls.tsx`, `components/LibraryMap.tsx`: remove the Measure switch and `measureEnabled` state.
- Reuses `calculateBearing` and `calculateDistanceM` from `utils/legCalculations.ts` and the declination convention from the `leg-geometry` spec.
