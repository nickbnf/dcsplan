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
