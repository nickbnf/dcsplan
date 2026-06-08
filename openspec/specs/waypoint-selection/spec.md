## ADDED Requirements

### Requirement: Single selected waypoint state
The application SHALL maintain a single selected waypoint index (or none) in `WaypointSelectionContext`. This state is purely UI-level and SHALL NOT affect the `FlightPlan` data model.

#### Scenario: No waypoint selected initially
- **WHEN** the application loads or a new flight plan is opened
- **THEN** no waypoint is selected

#### Scenario: Selecting a waypoint via sidebar card click
- **WHEN** the user clicks a waypoint card in the flight plan sidebar
- **THEN** that waypoint becomes selected, its card is visually highlighted, and the sidebar scrolls it into view if it is not already visible

#### Scenario: Selecting a waypoint via map point click
- **WHEN** the user clicks on a waypoint point feature on the map
- **THEN** that waypoint becomes selected (instead of adding a new waypoint)

#### Scenario: Switching selection directly
- **WHEN** a waypoint is already selected and the user clicks a different waypoint card or map point
- **THEN** the new waypoint becomes selected immediately, without an intermediate deselect step

#### Scenario: Deselecting via map background click
- **WHEN** a waypoint is selected and the user clicks on an empty area of the map
- **THEN** the waypoint is deselected

#### Scenario: Deselecting via Escape key
- **WHEN** a waypoint is selected and not in coord entry mode and the user presses Escape
- **THEN** the waypoint is deselected

### Requirement: Keyboard cycling through waypoints
The application SHALL allow the user to cycle the selection forward and backward through the waypoint list using keyboard shortcuts, wrapping at the ends.

#### Scenario: Advancing selection with +
- **WHEN** a waypoint is selected and the user presses `+`
- **THEN** the next waypoint in the list becomes selected (wrapping from last to first)

#### Scenario: Moving selection back with -
- **WHEN** a waypoint is selected and the user presses `-`
- **THEN** the previous waypoint in the list becomes selected (wrapping from first to last)

#### Scenario: Keyboard cycling when no waypoint is selected
- **WHEN** no waypoint is selected and the user presses `+` or `-`
- **THEN** the first waypoint becomes selected

#### Scenario: Keyboard shortcuts do not interfere with other inputs
- **WHEN** any text input or numeric field in the sidebar has focus
- **THEN** `+` and `-` keypresses are handled by that input and do not change the selection

### Requirement: Selected waypoint visual distinction
The selected waypoint SHALL be rendered distinctly in both the sidebar and the map so the user can always identify which waypoint is active.

#### Scenario: Sidebar card highlight
- **WHEN** a waypoint is selected
- **THEN** its card in the sidebar has a visually distinct orange (`#FFB300`) border and ring highlight, matching the map ring colour

#### Scenario: Map point highlight
- **WHEN** a waypoint is selected
- **THEN** its point on the map is rendered with an orange (`#FFB300`) outer ring, matching the sidebar card highlight colour

#### Scenario: Map point click tolerance
- **WHEN** the user clicks within 8 pixels of a waypoint circle on the map
- **THEN** that waypoint is selected (hit tolerance extends the clickable zone around the circle geometry)

#### Scenario: Selected card scrolled into view
- **WHEN** a waypoint is selected via `+`/`-` keys or a map click and its card is outside the visible scroll area of the sidebar
- **THEN** the sidebar scrolls smoothly to centre the card in the visible scroll area

### Requirement: Tab switch clears waypoint selection
When the user switches from the Flight Plan tab to the Objects tab, any active waypoint selection SHALL be cleared immediately. The previously selected waypoint SHALL no longer be highlighted in the sidebar or on the map.

#### Scenario: Switching to Objects tab clears waypoint selection
- **WHEN** a waypoint is selected and the user switches to the Objects tab
- **THEN** the waypoint is deselected and the orange highlight is removed from both the sidebar card and the map point

#### Scenario: Switching to Objects tab cancels coord entry
- **WHEN** waypoint coord entry is active and the user switches to the Objects tab
- **THEN** coord entry mode is cancelled and the waypoint is deselected

### Requirement: Clicking a waypoint on the map activates the Flight Plan tab
When the user clicks a waypoint on the map while the Objects tab is active, the application SHALL switch to the Flight Plan tab and select that waypoint, so the selection is always visible in the active tab.

#### Scenario: Map waypoint click while on Objects tab switches tab and selects
- **WHEN** the Objects tab is active and the user clicks a waypoint point feature on the map
- **THEN** the Flight Plan tab becomes active and the clicked waypoint is selected and highlighted

### Requirement: Coord entry is scoped to the active tab
Coord entry to add or edit items is only available within the tab that owns those items. Waypoint coord entry (adding a new waypoint or moving a selected one) is only available when the Flight Plan tab is active. Object coord entry (adding a new marker or moving a selected one) is only available when the Objects tab is active. Switching tabs while coord entry is active cancels it.

#### Scenario: Coord entry adds new waypoint on Flight Plan tab
- **WHEN** the Flight Plan tab is active and Add Waypoints mode is active and the user presses a digit, `N`, or `S` and commits with Return
- **THEN** a new waypoint is added to the flight plan at the entered coordinates

#### Scenario: Coord entry adds new marker on Objects tab
- **WHEN** the Objects tab is active and Add Marker mode is active and the user presses a digit, `N`, or `S` and commits with Return
- **THEN** a new marker is added to the plan at the entered coordinates

#### Scenario: Coord entry not available for waypoints when Objects tab is active
- **WHEN** the Objects tab is active
- **THEN** pressing a digit, `N`, or `S` does not activate waypoint coord entry

#### Scenario: Coord entry not available for objects when Flight Plan tab is active
- **WHEN** the Flight Plan tab is active
- **THEN** pressing a digit, `N`, or `S` does not activate object coord entry
