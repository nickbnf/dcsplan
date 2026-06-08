## Why

Currently the Flight Plan and Objects tabs each maintain independent selection state, which means a waypoint and a map object can both appear "selected" simultaneously. This creates an ambiguous UI — the user has no single focus point, and operations triggered by selection (coord entry, keyboard cycling, Escape to deselect) have undefined target when both are active. Clearing selection on tab switch eliminates the ambiguity and makes the active selection unambiguous at all times.

## What Changes

- At most one item (waypoint **or** map object) may be selected globally at any given time — the two tabs share a single selection slot.
- Switching from Flight Plan to Objects tab immediately clears the waypoint selection (if any).
- Switching from Objects to Flight Plan tab immediately clears the object selection (if any).
- Within each tab the existing single-selection mechanics are unchanged.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `waypoint-selection`: Add requirement that tab switch clears waypoint selection; add scenario for this case.
- `map-objects`: Clarify that the global selection is exclusive (waypoint selection and object selection cannot coexist); add scenario stating object selection is cleared when the user switches to the Flight Plan tab.

## Impact

- `WaypointSelectionContext` (or equivalent) must be cleared when the Objects tab becomes active.
- Object selection context must be cleared when the Flight Plan tab becomes active.
- No data model changes; no API changes; no kneeboard impact.
- Keyboard shortcuts (`+`, `-`, Escape) and coord entry continue to operate on whichever tab is currently active.
