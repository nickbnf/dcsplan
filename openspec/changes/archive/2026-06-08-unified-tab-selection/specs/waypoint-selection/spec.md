## ADDED Requirements

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
