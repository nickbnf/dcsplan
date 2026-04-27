## 1. WaypointSelectionContext

- [x] 1.1 Create `WaypointSelectionContext` with `selectedIndex: number | null`, `setSelectedIndex`, `coordEntryMode: boolean`, `setCoordEntryMode` — provide it at the app/tab level
- [x] 1.2 Wrap the relevant component tree with `WaypointSelectionProvider` so both `FlightPlanZone` and `Map` can consume it

## 2. Sidebar — Selected Waypoint Card

- [x] 2.1 Read `selectedIndex` from context in `WaypointCard`; apply a highlight style (border/background accent) when the card matches the selected index
- [x] 2.2 On card click, call `setSelectedIndex` with that waypoint's index
- [x] 2.3 When `coordEntryMode` is true and the card is selected, replace the coordinate line with "entering coords…"
- [x] 2.4 When `selectedIndex` changes (via `+`/`-` or map click), scroll the card into view with `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`

## 3. Map — Selected Waypoint Highlight

- [x] 3.1 Pass `selectedIndex` into `flightPlanLayer` (or as a separate style override); render the selected feature with a distinct outer ring style
- [x] 3.2 In the map `click` handler, hit-test features first: if a `turnpoint` feature is hit, call `setSelectedIndex` with its `waypointIndex` attribute instead of adding a new waypoint
- [x] 3.3 If the click hits empty map area, call `setSelectedIndex(null)` to deselect

## 4. Keyboard — Selection Cycling and Deselection

- [x] 4.1 Add a global `keydown` listener (guarded: skip if any input/textarea has focus) that handles `+` / `-` to cycle `selectedIndex` through the waypoint list, wrapping at ends
- [x] 4.2 In the same listener, handle `Escape` when not in coord entry mode: call `setSelectedIndex(null)`

## 5. Coord Entry — Template State and Parsing

- [x] 5.1 Model the template state as a struct: `{ latHem: 'N'|'S', latDeg: string, latMin: string, lonHem: 'E'|'W', lonDeg: string, lonMin: string, cursor: slot }` — store it in `WaypointSelectionContext` (null when not in entry mode)
- [x] 5.2 Implement `applyKey(state, key)` — pure function that returns the next template state given a keypress (`digit`, `N`/`S`/`E`/`W`, `Backspace`, `Space`) and current cursor slot
- [x] 5.3 Add `parseCoordinate(template): { lat: number, lon: number } | null` to `coordinateUtils.ts`; validates minimum (degrees + at least one minute digit per axis); returns `null` if invalid
- [x] 5.4 Add unit tests for `applyKey` and `parseCoordinate` covering: hemisphere defaults, override, digit fill, backspace, advance triggers, minimum validation, valid partial examples (`N45°1' E34°15.4'`), rejection of bare degrees

## 6. Coord Entry — Activation and Global Key Handling

- [x] 6.1 Extend the global `keydown` listener to detect entry-mode triggers (`N`, `S`, or digit) when `selectedIndex` is not null and not already in coord entry mode; initialise template state and set `coordEntryMode = true`
- [x] 6.2 When in coord entry mode, route all keydown events through `applyKey`; handle `Return` (attempt commit), `Escape` (cancel), and `Backspace`/`Space` as defined
- [x] 6.3 Detect entry-mode triggers when `drawingState.isDrawing === 'NEW_POINT'` (even with no selected waypoint); initialise template state; on Return call `addTurnPoint` and reset template for next entry

## 7. Map Overlay — Entry Template Display

- [x] 7.1 Extend `MapCoordinatesOverlay` to accept an optional `entryTemplate: string | null` prop; when present, render the formatted template string instead of hover coordinates (same font and pill style)
- [x] 7.2 Format the template string from state for display: show filled slots as digits, unfilled slots as `–`, fixed separators (`°`, `.`, `'`) always visible
- [x] 7.3 Show a subtle error indicator (e.g. red tint on the template pill) when Return is pressed with insufficient data; clear it on next keypress

## 8. Commit and Cancel Wiring

- [x] 8.1 On Return with a valid parse result from a selected waypoint: call `moveTurnPoint(flightPlan, selectedIndex, lat, lon)`, dispatch `onFlightPlanUpdate`, exit coord entry mode, keep `selectedIndex`
- [x] 8.2 On Return with a valid parse result from drawing mode: call `addTurnPoint(flightPlan, lat, lon)`, dispatch `onFlightPlanUpdate`, reset template state, remain in drawing mode
- [x] 8.3 On Escape in coord entry mode: clear template state, set `coordEntryMode = false`, restore card display (selectedIndex unchanged)
- [x] 8.4 On drag-end (`DRAG_POINT` → `NO_DRAWING` transition) while `coordEntryMode` is true: cancel coord entry mode (clear template, `coordEntryMode = false`)

## 9. Integration Testing

- [ ] 9.1 Verify full flow: select waypoint via click → type `N4512.30E03430.00` → Return → waypoint moves on map and card shows updated coords
- [ ] 9.2 Verify full flow: select waypoint → press `+` / `-` → different card highlighted and scrolled into view
- [ ] 9.3 Verify Add Wpts flow: activate drawing mode → type `N4512.30` → `Space` → `E03430.00` → Return → waypoint created, template resets
- [ ] 9.4 Verify Escape chain: in coord entry → Escape (entry cancelled, waypoint still selected) → Escape again (deselected)
- [ ] 9.5 Verify global key guard: focus the altitude field → press `+` → selection does not change
<!-- Integration tests 9.1–9.5 require manual UI verification -->
