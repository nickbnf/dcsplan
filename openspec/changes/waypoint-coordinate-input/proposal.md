## Why

Power users building or refining a flight plan need a way to set a waypoint to precise coordinates without dragging it on the map. Currently coordinates are display-only; the only way to position a waypoint is a mouse click or drag, which is slow and imprecise for known grid references or MGRS/lat-lon values from a briefing.

## What Changes

- Introduce a **selected waypoint** concept: exactly one waypoint (or none) can be selected at a time; selection is stored in app-level UI state, not in the flight plan data model.
- A keyboard shortcut (+ and -) allow the user to select the previous / next waypoint.
- When a waypoint is selected, its card on the flight plan is highlighted and (if needed) brought into view.
- Typing `N`, `S`, or a digit while a waypoint is selected enters **coord entry mode**: the map overlay shows a DMM template (`N--°--.--' E---°--.--'`) that fills slot-by-slot as the user types; Return commits the move, Escape cancels (waypoint stays selected).
- The coordinate line on the selected waypoint card is replaced by "entering coords…" while entry is in progress.
- Clicking a waypoint card in the sidebar, or the point itself on the map selects it; clicking the map background deselects.
- The same **coord entry mode** is also available when adding new waypoints (via the "Add Wpts" button): the same map overlay template appears, Return creates the new waypoint; there is no sidebar card effect in this case.
- The selected waypoint is visually highlighted on the map (distinct style) and in the sidebar card.

## Capabilities

### New Capabilities

- `waypoint-selection`: UI concept of a single selected waypoint with clear selection/deselection interactions across sidebar and map.
- `waypoint-coordinate-edit`: Slot-fill coord entry mode for moving an existing waypoint or creating a new one; triggered from both the selected-waypoint state and the "Add Wpts" drawing mode.

### Modified Capabilities

<!-- No existing spec-level requirements are changing. -->

## Impact

- `FlightPlanZone.tsx`: WaypointCard gains a selected state; coordinate line replaced by "entering coords…" during entry.
- `MapCoordinatesOverlay.tsx`: Extended to show the in-progress entry template (replaces hover coords during entry).
- `coordinateUtils.ts`: Add slot-fill template state and `parseCoordinate` to convert filled template to decimal degrees.
- `WaypointSelectionContext`: New React context tracking `selectedWaypointIndex` and coord entry mode state.
- `useDrawing.ts` / `Map.tsx`: Coord entry mode also triggered from `NEW_POINT` drawing state; Return calls `addTurnPoint`.
- `flightPlanLayer.ts`: Selected waypoint rendered with a distinct style (e.g., highlighted ring).
- No backend or data-model changes required.
