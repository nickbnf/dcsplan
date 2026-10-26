# Spec: Theatre Maps

## Purpose

A theatre can offer several maps — different chart styles, tile sets or projections — while the flight plan and library stay the same. This capability defines the theatre → map hierarchy, keeps navigation calculations independent of the displayed map, and covers how a user picks a map and how that choice drives the planner map, the Library page map and the generated kneeboard.

This capability is tier-independent: maps are static application configuration, and the map choice is a device-local preference that behaves identically with or without an account.

## Requirements

### Requirement: Theatres offer one or more maps
Each theatre SHALL offer at least one map and SHALL designate exactly one of them as its default map. Each map SHALL have an id unique within its theatre and a display name. The set of maps and the default SHALL be discoverable by the frontend for every theatre.

#### Scenario: Theatre with several maps
- **WHEN** a theatre is configured with two maps, one marked default
- **THEN** the frontend can list both maps with their names and identify which one is the default

#### Scenario: Existing theatres after migration
- **WHEN** the application is started after this change
- **THEN** Caucasus, Syria and Germany each offer exactly one map, which is their default, and it renders identically to the theatre's map before this change

---

### Requirement: Theatre ids are unchanged
Introducing maps SHALL NOT change any theatre id. Plans, libraries and imported files referring to a theatre SHALL continue to resolve to the same theatre, and SHALL NOT record a map.

#### Scenario: Existing plan opens unchanged
- **WHEN** a plan created before this change on the Germany theatre is opened
- **THEN** it opens on the Germany theatre with its waypoints, legs and library references unchanged

#### Scenario: Plan export carries no map
- **WHEN** a flight plan is exported to JSON
- **THEN** the file records the theatre and no map id

---

### Requirement: Navigation is independent of the displayed map
Leg headings, distances, turn geometry and every other value derived from the flight plan SHALL be computed from the theatre's navigation settings alone. Choosing a different map SHALL NOT change any computed value shown in the planner or printed on the kneeboard.

#### Scenario: Switching maps does not change leg values
- **WHEN** the user switches the planner from one map of a theatre to another
- **THEN** every leg's heading, distance, time and fuel, and every turn point position, is unchanged

#### Scenario: Kneeboard numbers identical across maps
- **WHEN** the same plan generates a kneeboard once with each map of its theatre
- **THEN** the headings, distances and other figures printed on each leg page are identical between the two kneeboards

---

### Requirement: Navigation settings initially match the default map
For each existing theatre, the navigation settings after this change SHALL produce the same computed values as before this change.

#### Scenario: No regression in computed legs
- **WHEN** a plan on any existing theatre is opened after this change with its default map selected
- **THEN** every leg's heading, distance and turn geometry equals the value computed before this change

---

### Requirement: Per-device map choice per theatre
The user SHALL be able to choose one map per theatre. The choice SHALL be stored on the device only, SHALL persist across page reloads, and SHALL NOT be stored in the plan, the space or the user account. The choice for one theatre SHALL NOT affect any other theatre.

#### Scenario: Anonymous user choice persists
- **WHEN** an anonymous user selects a non-default map for Germany and reloads the page
- **THEN** the Germany theatre is shown with the selected map

#### Scenario: Signed-in user choice is per device
- **WHEN** a signed-in user selects a non-default map for Germany on one device and opens the same plan on another device
- **THEN** the other device shows the map chosen on that device, or the default map if none was chosen there

#### Scenario: Choice does not travel with a shared plan
- **WHEN** a collaborator opens a plan whose author selected a non-default map
- **THEN** the collaborator sees their own chosen map for that theatre, or the default map

#### Scenario: Choices are per theatre
- **WHEN** the user selects a non-default map for Germany and then opens a plan on Syria
- **THEN** Syria is shown with its own chosen map, or its default map

---

### Requirement: Map choice falls back to the default map
When no map has been chosen for a theatre, or the stored choice names a map the theatre no longer offers, the system SHALL use the theatre's default map.

#### Scenario: No choice made
- **WHEN** the user opens a theatre for the first time on a device
- **THEN** the theatre's default map is shown

#### Scenario: Stored map removed
- **WHEN** the stored choice for a theatre names a map that is no longer configured
- **THEN** the theatre's default map is shown and no error is displayed

---

### Requirement: Map selector in the planner display controls
The planner's display controls SHALL offer a map selector listing the current theatre's maps and indicating the selected one. Selecting a map SHALL apply it immediately. When a theatre has only one map, the selector SHALL NOT be shown. The kneeboard generation dialog SHALL NOT offer a map selector.

#### Scenario: Switching map from the planner
- **WHEN** the user picks another map in the planner display controls
- **THEN** the planner map redraws with that map's tiles and projection without reloading the page

#### Scenario: Single-map theatre
- **WHEN** the current theatre offers only one map
- **THEN** no map selector is shown in the display controls

---

### Requirement: Selected map applies to every map view of the theatre
The planner map and the Theatre Library page map SHALL both display the selected map for their theatre. A map choice made in the planner SHALL be reflected on the Library page for the same theatre, and vice versa.

#### Scenario: Library page follows the planner choice
- **WHEN** the user selects a non-default map for Germany in the planner and then opens the Theatre Library page on Germany
- **THEN** the Library page map is displayed with the selected map

---

### Requirement: View is preserved across a map switch
When the user switches map, the map SHALL stay centred on the same geographic position and SHALL show a scale as close as possible to the previous one, within the new map's available zoom range.

#### Scenario: Centre preserved
- **WHEN** the planner map is centred over a given airfield and the user switches map
- **THEN** the new map is centred over the same airfield

#### Scenario: Scale matched, not zoom number
- **WHEN** the user switches between two maps whose zoom levels correspond to different scales
- **THEN** the new map is shown at the zoom level whose scale is closest to the scale shown before the switch

---

### Requirement: Kneeboard rendered with the selected map
Kneeboard generation SHALL render leg pages and the overview page using the map currently selected for the plan's theatre. A kneeboard request that names no map SHALL be rendered with the theatre's default map. A request naming a map that the theatre does not offer SHALL be rejected with an error.

#### Scenario: Kneeboard uses selected map
- **WHEN** the user has selected a non-default map for the plan's theatre and generates a kneeboard
- **THEN** the leg and overview pages show that map's imagery

#### Scenario: Request without a map
- **WHEN** a kneeboard request specifies no map
- **THEN** the kneeboard is rendered with the theatre's default map

#### Scenario: Unknown map
- **WHEN** a kneeboard request names a map that the plan's theatre does not offer
- **THEN** the request is rejected with an error identifying the unknown map

---

### Requirement: Legs are drawn as straight lines on every map
On the planner map and on kneeboard pages, each leg segment SHALL be drawn as a straight line between its endpoints in the displayed map's projection, and each kneeboard leg page SHALL be oriented so that drawn line is vertical. A small angular difference between the drawn line and the printed heading is accepted when the map's projection differs from the navigation settings.

#### Scenario: Straight leg on a different projection
- **WHEN** a plan is displayed on a map whose projection differs from the theatre's navigation projection
- **THEN** each leg is drawn as a straight segment between its endpoints and the printed headings are unchanged

#### Scenario: Kneeboard leg page orientation
- **WHEN** a kneeboard leg page is rendered on any map
- **THEN** the drawn leg line runs vertically on the page
