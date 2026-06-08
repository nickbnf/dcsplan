## ADDED Requirements

### Requirement: Tab switch exits active drawing mode
Drawing modes (Add Waypoints on the Flight Plan tab; Add Marker on the Objects tab) are scoped to their respective tabs. When the user switches tabs, any active drawing mode SHALL be exited immediately, so the newly visible tab always starts in its default non-drawing state.

#### Scenario: Switching to Objects tab exits Add Waypoints mode
- **WHEN** Add Waypoints mode is active and the user switches to the Objects tab
- **THEN** Add Waypoints mode is deactivated and the map returns to its default interaction state

#### Scenario: Switching to Flight Plan tab exits Add Marker mode
- **WHEN** Add Marker mode is active and the user switches to the Flight Plan tab
- **THEN** Add Marker mode is deactivated and the map returns to its default interaction state

### Requirement: Add Marker mode intercepts all map clicks
When Add Marker mode is active, every map click SHALL place a new marker at the clicked position. No other click action (selecting an existing object, selecting a waypoint, adding a library ref via ghost click) SHALL occur while Add Marker mode is active.

#### Scenario: Click on coloured pictogram places marker instead of selecting
- **WHEN** Add Marker mode is active and the user clicks a coloured in-plan pictogram on the map
- **THEN** a new marker is placed at the clicked position and the existing pictogram is not selected

#### Scenario: Click on ghost places marker instead of adding library ref
- **WHEN** Add Marker mode is active and the user clicks a greyed library ghost on the map
- **THEN** a new marker is placed at the clicked position and no library ref is added to the plan

---

## MODIFIED Requirements

### Requirement: Objects sidebar tab
The planner sidebar SHALL display top-level tabs above the scrolling content. The existing flight plan list SHALL live behind a Flight Plan tab; a new Objects tab SHALL display only objects currently in the plan (library refs and plan-local markers).

#### Scenario: Tabs visible above scrolling content
- **WHEN** the planner is displayed
- **THEN** Flight Plan and Objects tabs are visible above the scrolling section

#### Scenario: Objects tab shows in-plan objects only
- **WHEN** the Objects tab is active
- **THEN** the tab lists every library ref and every marker currently in the plan, and nothing else

#### Scenario: Empty state on Objects tab
- **WHEN** the Objects tab is active and the plan has no library refs and no markers
- **THEN** an empty-state message is shown with hints for adding via the map or the library

#### Scenario: Switching tabs preserves scroll and editing state
- **WHEN** the user switches between tabs
- **THEN** the other tab's scroll position and in-progress editing state are preserved

#### Scenario: Switching tabs clears selection
- **WHEN** a waypoint or object is selected and the user switches tabs
- **THEN** the selection is cleared and no item appears highlighted in either the sidebar or the map

---

### Requirement: Selection mechanics in the Objects tab mirror waypoint selection
Selection of objects in the Objects tab SHALL obey the same contract as `waypoint-selection`: at most one object selected at a time, `#FFB300` orange highlight on both the sidebar card and the map pictogram, click either to select, click the map background or press Escape to deselect, `+` / `-` to cycle through objects in list order. Furthermore, object selection and waypoint selection SHALL be mutually exclusive globally: selecting an object while a waypoint is selected (or vice versa) SHALL NOT be possible, as the application maintains a single shared selection slot across both tabs.

#### Scenario: Click card selects object
- **WHEN** the user clicks an object card in the Objects tab
- **THEN** that object becomes selected and its pictogram on the map is highlighted in `#FFB300`

#### Scenario: Click pictogram selects object
- **WHEN** the user is on the Objects tab and clicks a coloured pictogram on the map
- **THEN** the corresponding sidebar card is highlighted in `#FFB300` and scrolled into view

#### Scenario: Escape deselects
- **WHEN** an object is selected on the Objects tab and coord entry is not active and the user presses Escape
- **THEN** the object is deselected

#### Scenario: Keyboard cycles objects
- **WHEN** an object is selected on the Objects tab and the user presses `+` or `-`
- **THEN** the next or previous object in list order becomes selected, wrapping at the ends

#### Scenario: Switching to Flight Plan tab clears object selection
- **WHEN** an object is selected and the user switches to the Flight Plan tab
- **THEN** the object is deselected and the orange highlight is removed from both the sidebar card and the map pictogram

#### Scenario: Switching to Flight Plan tab cancels coord entry
- **WHEN** object coord entry is active and the user switches to the Flight Plan tab
- **THEN** coord entry mode is cancelled and the object is deselected
