## ADDED Requirements

### Requirement: Coord entry mode triggered from selected waypoint
When a waypoint is selected, the user SHALL be able to enter coord entry mode by pressing `N`, `S`, or any digit key, without requiring a mouse click.

#### Scenario: Entry mode triggered by cardinal key
- **WHEN** a waypoint is selected and the user presses `N` or `S`
- **THEN** coord entry mode is activated with the pressed hemisphere pre-filled for latitude

#### Scenario: Entry mode triggered by digit key
- **WHEN** a waypoint is selected and the user presses a digit key
- **THEN** coord entry mode is activated, North and East are assumed as hemisphere defaults, and the digit is placed in the first latitude degree slot

#### Scenario: Sidebar card feedback during entry
- **WHEN** coord entry mode is active for a selected waypoint
- **THEN** the coordinate line on that waypoint's card is displayed dimmed with an amber pencil icon (✎) prepended, keeping the old position visible for context

### Requirement: Coord entry mode triggered from Add Wpts drawing mode
When the "Add Wpts" drawing mode is active, the user SHALL be able to enter coord entry mode by pressing `N`, `S`, or any digit key.

#### Scenario: Entry mode triggered during drawing mode
- **WHEN** the Add Wpts drawing mode is active and the user presses `N`, `S`, or a digit key
- **THEN** coord entry mode is activated with the same template and rules as when triggered from a selected waypoint; no sidebar card effect is shown

#### Scenario: Commit creates a new waypoint
- **WHEN** coord entry mode was triggered from drawing mode and the user presses Return with a valid template
- **THEN** a new waypoint is created at the entered coordinates via `addTurnPoint` and drawing mode remains active for the next entry

### Requirement: DMM slot-fill template
Coord entry mode SHALL display a fixed-width DMM template (`N--°--.--' E---°--.--'`) on the map overlay in place of the hover coordinates, filling slots left-to-right as the user types.

#### Scenario: Template shown on map overlay
- **WHEN** coord entry mode is active
- **THEN** the map coordinate overlay shows the in-progress template using the same font and styling as the normal hover coordinate display, and the hover coordinates are hidden

#### Scenario: Digit fills the next slot
- **WHEN** coord entry mode is active and the user presses a digit key
- **THEN** the digit is placed in the next unfilled slot in the template and the cursor advances

#### Scenario: Visual cursor shown in template
- **WHEN** coord entry mode is active
- **THEN** a blinking `|` cursor is rendered in the map overlay template at the current input position, indicating where the next digit will be placed

#### Scenario: Space advances from degrees to minutes within an axis
- **WHEN** coord entry mode is active, the cursor is in the degrees slot of an axis, and at least one degree digit has been entered
- **THEN** pressing `Space` moves the cursor to the minutes slot of the same axis (without requiring all degree slots to be filled)

#### Scenario: Space in the minutes slot advances to the next axis
- **WHEN** coord entry mode is active and the cursor is in the latitude minutes slot
- **THEN** pressing `Space` advances to the longitude degrees slot (same behaviour as before)

#### Scenario: Non-digit non-control keys ignored
- **WHEN** coord entry mode is active and the user presses a key that is not a digit, cardinal letter, or control key
- **THEN** nothing happens

#### Scenario: Backspace clears last filled slot
- **WHEN** coord entry mode is active and the user presses Backspace
- **THEN** the last filled slot is cleared and the cursor moves back one position

### Requirement: Hemisphere handling
The template SHALL default to North and East hemispheres. The user MAY override the hemisphere by pressing a cardinal key (`N`, `S`, `E`, `W`) before the corresponding axis is committed.

#### Scenario: Default hemispheres
- **WHEN** coord entry mode is activated by pressing a digit
- **THEN** the latitude hemisphere is set to N and the longitude hemisphere to E

#### Scenario: Cardinal key overrides latitude hemisphere
- **WHEN** coord entry mode is active and the latitude axis has not yet been committed and the user presses `S`
- **THEN** the latitude hemisphere is changed to S

#### Scenario: Cardinal key overrides longitude hemisphere
- **WHEN** coord entry mode is active and the cursor is in the longitude part and the user presses `W`
- **THEN** the longitude hemisphere is changed to W

### Requirement: Advancing from latitude to longitude
After entering latitude data, the user SHALL be able to advance the cursor to the longitude part.

#### Scenario: Advance via Space or Return from latitude minutes to longitude
- **WHEN** coord entry mode is active, the cursor is in the latitude minutes slot, latitude has at least degrees and one minute digit filled, and the user presses `Space` or `Return`
- **THEN** the cursor advances to the longitude degrees slot

#### Scenario: Advance via E or W key
- **WHEN** coord entry mode is active and the cursor is in the latitude part and the user presses `E` or `W`
- **THEN** the longitude hemisphere is set accordingly and the cursor advances to the longitude degrees slot

### Requirement: Commit and cancel
A completed or sufficiently filled template SHALL be committable with Return; the entry SHALL be cancellable with Escape at any point.

#### Scenario: Successful commit moves existing waypoint
- **WHEN** coord entry mode was triggered from a selected waypoint and both axes have at least degrees and one minute digit filled and the user presses Return
- **THEN** `moveTurnPoint` is called with the parsed coordinates, the waypoint moves, the map updates, and coord entry mode closes while the waypoint remains selected

#### Scenario: Successful commit creates new waypoint
- **WHEN** coord entry mode was triggered from Add Wpts drawing mode and both axes have at least degrees and one minute digit filled and the user presses Return
- **THEN** `addTurnPoint` is called with the parsed coordinates and drawing mode remains active

#### Scenario: Return rejected when minimum data not met
- **WHEN** coord entry mode is active and either axis is missing degrees or any minute digit and the user presses Return
- **THEN** the commit is rejected, a subtle error indicator is shown on the template, and entry mode remains open

#### Scenario: Escape cancels entry from selected waypoint
- **WHEN** coord entry mode is active for a selected waypoint and the user presses Escape
- **THEN** coord entry mode closes, the previous coordinate display is restored on the card, and the waypoint remains selected

#### Scenario: Escape cancels entry from drawing mode
- **WHEN** coord entry mode is active from Add Wpts drawing mode and the user presses Escape
- **THEN** coord entry mode closes and drawing mode remains active

#### Scenario: Double Escape deselects waypoint
- **WHEN** a waypoint is selected and not in coord entry mode and the user presses Escape
- **THEN** the waypoint is deselected (this is the natural result of Escape-to-cancel-entry followed by Escape-to-deselect)

### Requirement: Drag cancels coord entry mode
If the user drags the selected waypoint on the map while coord entry mode is active, the entry SHALL be cancelled and the dragged position used instead.

#### Scenario: Drag cancels in-progress entry
- **WHEN** coord entry mode is active for a selected waypoint and the user drags that waypoint on the map
- **THEN** coord entry mode is cancelled, `moveTurnPoint` is called with the dragged position, and the card returns to its normal selected display
