## Context

The flight plan sidebar renders waypoints as `WaypointCard` components inside `FlightPlanZone.tsx`. Each card shows the waypoint's coordinates in DMM format (via `formatCoordinate`) as read-only text. Waypoint positions can only be changed by clicking the map or dragging the point. The existing `moveTurnPoint` utility already handles the position update; the missing piece is a way to trigger it from typed input.

There is no existing concept of a "selected" waypoint — all cards are treated identically. Selection state is purely a UI concern and does not belong in the `FlightPlan` data model.

## Goals / Non-Goals

**Goals:**
- Single selected waypoint tracked in React UI state.
- `+`/`-` keyboard shortcuts cycle selection forward/backward through the waypoint list.
- Clicking a waypoint card in the sidebar or its point on the map selects it; clicking the map background deselects.
- Selected card is scrolled into view in the sidebar if needed.
- Typing `N`, `S`, or a digit while a waypoint is selected enters "coord entry mode" — no click required.
- Coord entry mode shows the in-progress template (`N--°--.--' E---°--.--'`) in the map overlay (replacing the hover coordinates); hemisphere defaults to N/E unless the user presses a cardinal key; `Space`/`Return`/`E`/`W` advance to the longitude part; a final `Return` commits if degrees + at least one minute digit are present for both axes; `Escape` cancels entry.
- When triggered from a selected waypoint: card shows "entering coords…"; Return calls `moveTurnPoint`; waypoint stays selected after commit.
- When triggered from "Add Wpts" drawing mode: no sidebar effect; Return calls `addTurnPoint` and keeps drawing mode active for the next waypoint.
- Parsing the filled template back to decimal degrees (`parseCoordinate` in `coordinateUtils.ts`).
- Selected waypoint visually distinct in both sidebar and map.

**Non-Goals:**
- Multi-select or selection ranges.
- Support for MGRS, UTM, or decimal-degree input formats (DMM only, matching existing display).
- Backend changes.

## Decisions

### D1 — Selection state lives in a new React context (not lifted into FlightPlanContext)

`FlightPlanContext` holds data model state. Selection is ephemeral UI state with no effect on the flight plan itself. Mixing them would couple data and view concerns and require threading `selectedIndex` through every consumer.

A dedicated `WaypointSelectionContext` (or a simple `useState` lifted to the `App` / tab level and passed via context) keeps the concern isolated. The map layer needs access to it (to style the selected point), so context is preferable over local state inside `FlightPlanZone`.

**Alternative considered**: Store selection in `FlightPlanZone` local state and pass a callback down to the map. Rejected — map and sidebar are siblings, making prop drilling awkward.

### D2 — Coordinate inputs use the existing DMM display format

The current format (`N 41°12.30'`) is what pilots read from briefings. Keeping the same format for input avoids any mental translation. `parseCoordinate` will accept the same string `formatCoordinate` produces, so round-tripping is lossless. The degree symbol (°) is part of the template and is never typed by the user.

**Alternative considered**: Plain decimal degrees (simpler to parse). Rejected — less readable for the target user.

### D3 — Selection triggered by card click, map-point click, or `+`/`-` keys

Clicking a waypoint card or its OpenLayers feature selects it. Clicking the empty map background deselects. `+` advances selection to the next waypoint (wrapping); `-` goes to the previous one. Clicking a different card switches selection directly.

`Escape` when a waypoint is selected but not in entry mode deselects. When in entry mode, the first `Escape` cancels the entry (returning to selected state); a second `Escape` then deselects. This gives a natural "Esc Esc to fully exit" flow.

The sidebar scrolls the newly selected card into view (`scrollIntoView({ behavior: 'smooth', block: 'nearest' })`).

**Alternative considered**: A dedicated "Select" button per card. Rejected — adds visual noise; click-on-card is the natural affordance.

### D4 — Coord entry mode: template-fill, not free-text; available in two contexts

Coord entry mode is triggered in two situations:
1. **Selected waypoint** (`WaypointSelectionContext` has an index): pressing `N`, `S`, or any digit starts entry; Return calls `moveTurnPoint`; the waypoint card shows "entering coords…".
2. **Add Wpts drawing mode** (`drawingState.isDrawing === 'NEW_POINT'`): pressing `N`, `S`, or any digit starts entry; Return calls `addTurnPoint` and keeps drawing mode active for the next waypoint; no sidebar card effect.

In both contexts the template and key rules are identical. Escape cancels entry mode and returns to the prior state (selected / drawing).

When a waypoint is selected, pressing `N`, `S`, or any digit triggers coord entry mode. The coordinate display is replaced by a fixed-width template: `N--°--.--' E---°--.--'`. A cursor tracks the current digit slot; each keypress fills the next slot left-to-right. Non-digit, non-control keys are ignored.

Hemisphere defaults: if the user does not press `N`/`S` before the first degree digit, North is assumed for latitude. If the user does not press `E`/`W` before the first longitude digit, East is assumed. Pressing a cardinal key at any point before that axis is committed overrides the default.

Advancement rules:
- `Space`, `Return`, or `E`/`W` after at least the latitude degrees and one minute digit are entered: advance cursor to the longitude degrees slot.
- Final `Return`: commit via `moveTurnPoint` if both lat and lon meet the minimum — degrees plus at least one minute digit (e.g. `N45°1' E34°15.4'` is valid; `N45° E34°` is not).
- `Escape`: cancel entry mode and restore the previous coordinate display (waypoint remains selected).
- `Backspace`: clear the last filled slot.

**Why template-fill over free-text**: Free-text requires full DMM parsing with many edge cases (separator variants, leading zeros, partial entry). A fixed template makes the expected format self-evident, eliminates ambiguity, and lets parsing be trivially deterministic — the slot positions are fixed.

**Alternative considered**: Click-to-edit text inputs (existing `EditableField` pattern). Rejected — requires an extra click and is slower for keyboard-centric users who already know their target coordinates.

### D5 — Coord entry template displayed on the map overlay, not in the sidebar

The in-progress entry template (`N--°--.--' E---°--.--'` with filled slots) is shown in `MapCoordinatesOverlay`, just above where the mouse coordinates normally appear, using the same `font-aero-mono` styling and dark-background pill. This makes the entry prominent and visually consistent with the existing coordinate display.

While in coord entry mode:
- The mouse hover coordinates are hidden (replaced by the entry template).
- The waypoint card in the sidebar replaces its coordinate line with an "entering coords…" label, giving a clear visual link between the selected card and the active entry on the map.

`MapCoordinatesOverlay` receives an optional `entryTemplate` prop (the current template string). When present, it renders the template instead of the hover coordinates; no new overlay component is needed.

**Alternative considered**: Show the template inside the sidebar card as editable fields. Rejected — less prominent; requires the user to look away from the map where the result will appear.

## Risks / Trade-offs

- **Global keydown capture** → `+`/`-` cycling and coord entry mode require a global `keydown` listener. This must yield to any active text input elsewhere (name field, altitude, etc.) to avoid intercepting normal typing. Guard: only handle keys when no other input element has focus.
- **Map click conflicts** → Existing map click handler adds a waypoint. A click on an existing point feature must select it instead. The `flightPlanLayer` already attaches `waypointIndex` to each feature; the `click` handler branches on whether a feature was hit.
- **Coordinate update from drag while in entry mode** → If the user drags the waypoint on the map while coord entry mode is open, cancel entry mode and show the updated coordinates. Both paths call `moveTurnPoint`; the drag completing is treated as an implicit cancel of the in-progress entry.
- **Partial template commit** → `Return` is accepted only when both axes have at least degrees and one minute digit filled (e.g. `N45°1' E34°15.4'` is valid; `N45° E34°` is rejected with a subtle error indicator on the template).
