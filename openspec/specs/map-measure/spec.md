# Spec: Map Measure

## Purpose

A transient bearing/distance measuring aid on the planner map. The user measures the magnetic bearing and distance from one point to another and keeps the result on screen as a reference while editing the plan. A measurement is never part of the flight plan.

This capability is tier-independent. Measurements are ephemeral UI state, so the tool behaves the same for anonymous and signed-in users, and whether or not the user is connected.

## Requirements

### Requirement: Measure tool entry points
The planner map SHALL show a dedicated Measure button, separate from the display controls, and SHALL toggle the tool when the user presses `M` (either case). The shortcut SHALL be ignored while a text input or textarea has focus, and while coordinate entry is active. The button SHALL look pressed whenever a measurement is in progress or pinned.

#### Scenario: Arming from the button
- **WHEN** no measurement exists and the user clicks the Measure button
- **THEN** the tool is armed, the map cursor becomes a crosshair, and the button looks pressed

#### Scenario: Arming from the keyboard
- **WHEN** no measurement exists, no text field has focus, and the user presses `m` or `M`
- **THEN** the tool is armed exactly as if the button had been clicked

#### Scenario: Shortcut ignored while typing
- **WHEN** a waypoint comment or any other text field has focus and the user types `m`
- **THEN** the character is typed into the field and the tool's state does not change

#### Scenario: Shortcut ignored during coordinate entry
- **WHEN** coordinate entry is active and the user presses `M`
- **THEN** the key is handled by coordinate entry and the tool's state does not change

### Requirement: Placing a measurement
While the tool is armed, the first map click SHALL set the start point A. A line SHALL then follow the cursor from A, with a live readout. The second click SHALL set the end point B and pin the measurement. While a measurement is in progress, map clicks SHALL only place measure points: they SHALL NOT select or deselect waypoints or objects, add waypoints, or place markers.

#### Scenario: Live readout while moving
- **WHEN** the user has placed A and moves the cursor
- **THEN** a line is drawn from A to the cursor and the readout updates continuously for A → cursor

#### Scenario: Pinning the measurement
- **WHEN** the user has placed A and clicks the map again
- **THEN** B is fixed at the click position and the line and readout stop following the cursor

#### Scenario: Clicking on a waypoint while measuring
- **WHEN** the tool is armed or A is placed, and the user clicks on a waypoint
- **THEN** the click places a measure point at that position and the waypoint selection does not change

### Requirement: Readout format
The readout SHALL show the A → B magnetic bearing as three zero-padded integer degrees followed by `°M`, then the distance in nautical miles to one decimal place followed by `NM`. Then, visually subdued and in parentheses, it SHALL show the reciprocal (B → A) magnetic bearing in the same format. The line SHALL show its direction from A to B, and SHALL look clearly different from route legs.

#### Scenario: Readout content
- **WHEN** the A → B magnetic bearing is 87.4°, the distance 23.44 NM, and the reciprocal bearing 267.4°
- **THEN** the readout reads `087°M  23.4 NM` followed by a subdued `(267°M)`

#### Scenario: Bearing rounding to north
- **WHEN** the magnetic bearing is 359.6°
- **THEN** the readout shows `000°M`

#### Scenario: Direction is visible
- **WHEN** a measurement is shown
- **THEN** the user can tell from the line which end is A and which is B

### Requirement: Measurement matches leg computation
The bearing and distance SHALL use the same method as leg courses and distances: the theatre's navigation mode (geographic or projected) and the map projection. The bearing SHALL be converted to magnetic with the plan's current declination, following the `leg-geometry` declination convention. The readout SHALL follow declination changes made while a measurement is shown.

#### Scenario: Matches a straight leg
- **GIVEN** a plan with two waypoints and a non-zero declination
- **WHEN** the user measures from the first waypoint's position to the second's
- **THEN** the bearing equals the leg's magnetic course and the distance equals the leg's straight distance between the two positions

#### Scenario: Declination change
- **WHEN** a measurement is pinned and the user changes the plan's declination
- **THEN** the readout's bearings update to the new declination and the distance is unchanged

### Requirement: Pinned measurement persists during editing
After B is placed, the map SHALL return to normal interaction, and the pinned measurement SHALL stay visible while the user edits the plan. Editing the plan SHALL NOT move or remove a pinned measurement.

#### Scenario: Dragging a waypoint with a pinned measurement
- **WHEN** a measurement is pinned and the user drags a waypoint
- **THEN** the waypoint moves normally and the measurement stays where it is

#### Scenario: Selecting after pinning
- **WHEN** a measurement is pinned and the user clicks a waypoint
- **THEN** the waypoint becomes selected

### Requirement: Single measurement
At most one measurement SHALL exist at a time.

#### Scenario: No second measurement while one is pinned
- **WHEN** a measurement is pinned
- **THEN** map clicks behave normally and do not start another measurement

### Requirement: Cancelling and dismissing
`Esc` SHALL cancel only a measurement in progress. Pressed while A is placed, it SHALL remove A and leave the tool armed. Pressed while armed without A, it SHALL disarm the tool. `Esc` SHALL NOT remove a pinned measurement. The Measure button or `M` SHALL dismiss a pinned measurement and SHALL disarm the tool when a measurement is in progress.

#### Scenario: Esc after placing A
- **WHEN** A is placed and the user presses `Esc`
- **THEN** A and the line are removed and the tool stays armed

#### Scenario: Esc while armed
- **WHEN** the tool is armed with no point placed and the user presses `Esc`
- **THEN** the tool is disarmed and the map returns to normal interaction

#### Scenario: Esc does not dismiss a pinned measurement
- **WHEN** a measurement is pinned and the user presses `Esc`
- **THEN** the measurement stays on the map

#### Scenario: Dismissing a pinned measurement
- **WHEN** a measurement is pinned and the user clicks the Measure button or presses `M`
- **THEN** the measurement is removed and the tool is not armed

#### Scenario: Toggling off while in progress
- **WHEN** the tool is armed or A is placed and the user clicks the Measure button or presses `M`
- **THEN** any partial measurement is removed and the tool is disarmed

### Requirement: Interaction with other map modes
Arming the tool SHALL cancel waypoint drawing and add-marker placement. Starting waypoint drawing or add-marker placement SHALL cancel a measurement in progress, but SHALL keep a pinned measurement.

#### Scenario: Arming during waypoint drawing
- **WHEN** the user is adding waypoints and arms the Measure tool
- **THEN** waypoint drawing stops and the tool is armed

#### Scenario: Arming during marker placement
- **WHEN** add-marker placement is active and the user arms the Measure tool
- **THEN** marker placement is cancelled and the tool is armed

#### Scenario: Starting waypoint drawing while measuring
- **WHEN** A is placed and the user starts adding waypoints
- **THEN** the partial measurement is removed and waypoint drawing starts

#### Scenario: Starting waypoint drawing with a pinned measurement
- **WHEN** a measurement is pinned and the user starts adding waypoints
- **THEN** the pinned measurement stays visible while waypoints are added

### Requirement: Measurements are never part of the plan
A measurement SHALL NOT be stored in or synced with the flight plan. It SHALL NOT be recorded in undo history or versions, and SHALL NOT appear on the kneeboard. It SHALL be discarded when the plan is closed, when another plan is opened, when the map changes, and when the page reloads.

#### Scenario: Not on the kneeboard
- **WHEN** a measurement is pinned and the user generates a kneeboard
- **THEN** the kneeboard contains no trace of the measurement

#### Scenario: Not undoable
- **WHEN** the user pins a measurement and then presses undo
- **THEN** the last plan edit is undone and the measurement is unaffected

#### Scenario: Not seen by collaborators
- **WHEN** a signed-in user pins a measurement on a shared plan
- **THEN** other users editing the same plan do not see it

#### Scenario: Discarded on reload
- **WHEN** a measurement is pinned and the page is reloaded
- **THEN** no measurement is shown after the reload

#### Scenario: Discarded on map change
- **WHEN** a measurement is pinned and the user selects another map of the theatre
- **THEN** no measurement is shown on the new map

### Requirement: Theatre library map has no Measure tool
The theatre library map SHALL NOT offer the Measure tool. Neither the planner map's nor the library map's display controls SHALL contain a Measure switch.

#### Scenario: Library map
- **WHEN** the user opens a theatre library
- **THEN** there is no Measure button, no `M` shortcut, and no Measure switch in the display controls
