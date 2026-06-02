## ADDED Requirements

### Requirement: Plan library reference and marker data model
The `FlightPlan` data model SHALL gain two optional collections: `libraryRefs`, an array of references to library entries each consisting of the referenced UUID and an optional per-plan `comment` override; and `markers`, an array of plan-local marker objects each consisting of its own pictogram type from the closed catalog, a position (lat, lon), an optional name, an optional range in NM (only when the marker's type is ranged), and an optional comment. Both collections SHALL be optional in the JSON serialised form; absent and empty arrays SHALL be treated identically.

#### Scenario: Round-trip serialisation
- **WHEN** a flight plan with library refs and markers is downloaded as JSON and re-imported
- **THEN** all refs and markers are restored with matching content

#### Scenario: Legacy plan compatibility
- **WHEN** a flight plan JSON without `libraryRefs` or `markers` is loaded
- **THEN** the plan loads with both collections treated as empty arrays

#### Scenario: Marker range presence follows type
- **WHEN** a marker has a ranged pictogram type
- **THEN** the marker SHALL carry a range field; for non-ranged types it SHALL NOT

---

### Requirement: Flight plan version bump
`FLIGHT_PLAN_VERSION` SHALL be incremented from `1.3` to `1.4` to indicate the new optional fields. Importers SHALL accept both versions; for `1.3` files the new collections default to empty arrays.

#### Scenario: Export uses version 1.4
- **WHEN** a flight plan is exported
- **THEN** the exported JSON's `version` field is `1.4`

#### Scenario: Version 1.3 import accepted
- **WHEN** a `1.3` plan file is imported
- **THEN** the plan loads with empty `libraryRefs` and `markers`

---

### Requirement: Snapshot of library objects embedded in exported plans
When a flight plan is exported, the JSON file SHALL include a snapshot of every library entry referenced by `libraryRefs`. The snapshot SHALL contain the full library entry data (UUID, type, position, name, default comment, range) so that the exported file remains standalone.

#### Scenario: Snapshot present on export
- **WHEN** a flight plan with three library refs is exported
- **THEN** the exported JSON contains snapshots of all three referenced library entries

#### Scenario: Snapshot contains full entry data
- **WHEN** a library ref's underlying entry has name, default comment, and range
- **THEN** all those fields are present in the snapshot

#### Scenario: No snapshots when no refs
- **WHEN** a flight plan with no library refs is exported
- **THEN** the exported JSON contains no library snapshots

---

### Requirement: Library snapshot merge on plan import
When a flight plan is imported that contains embedded library snapshots, each snapshot's UUID SHALL be merged into the current theatre's library: UUIDs not present SHALL be added with the snapshot data, UUIDs already present SHALL be left unchanged. A summary of added vs kept counts SHALL be presented to the user as part of the import.

#### Scenario: New UUIDs added on import
- **WHEN** a plan is imported whose snapshot contains a UUID not in the current library
- **THEN** the library gains an entry matching the snapshot data

#### Scenario: Existing UUIDs kept unchanged
- **WHEN** a plan is imported whose snapshot contains a UUID already present in the current library with different field values
- **THEN** the current library entry is left unchanged

#### Scenario: Merge summary shown
- **WHEN** a plan is imported with non-empty library snapshots
- **THEN** the user is shown counts of "added" and "kept" library entries

---

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

#### Scenario: Switching tabs preserves the other's state
- **WHEN** the user switches between tabs
- **THEN** the other tab's scroll position and in-progress editing state are preserved

---

### Requirement: Library ghosts visible only in Objects tab
Library entries that are not yet referenced by the current plan SHALL be rendered as greyed pictograms on the map only when the Objects tab is active. They SHALL NOT be visible in the Flight Plan tab. Greyed ghosts SHALL NOT display threat range rings.

#### Scenario: Ghosts visible in Objects tab
- **WHEN** the Objects tab is active and the current theatre's library contains entries not referenced by the current plan
- **THEN** those entries appear as greyed pictograms on the map

#### Scenario: Ghosts hidden in Flight Plan tab
- **WHEN** the Flight Plan tab is active
- **THEN** no greyed library pictograms appear on the map

#### Scenario: Ghosted entries do not show range rings
- **WHEN** a greyed library entry has a ranged type
- **THEN** no range ring is drawn for it

---

### Requirement: Click greyed pictogram adds reference to plan
Clicking a greyed library pictogram on the map SHALL add a `libraryRef` for that entry to the current plan, transitioning the pictogram from greyed to coloured. If the entry is ranged, its threat range ring SHALL appear once it is in the plan.

#### Scenario: Click adds reference
- **WHEN** the user clicks a greyed library pictogram on the map
- **THEN** a `libraryRef` is appended to the plan referencing that entry and the pictogram becomes coloured

#### Scenario: Range ring appears on inclusion
- **WHEN** the user clicks a greyed library pictogram of a ranged type
- **THEN** a threat range ring is drawn around the pictogram once it is in the plan

---

### Requirement: Click coloured pictogram selects card
Clicking a coloured pictogram on the map (whether a library ref or a marker) SHALL select that object, highlight its card in the sidebar, and scroll the card into view. It SHALL NOT remove the object from the plan.

#### Scenario: Click selects card
- **WHEN** the user clicks a coloured pictogram on the map
- **THEN** the corresponding sidebar card is highlighted and scrolled into view

#### Scenario: Click does not remove
- **WHEN** the user clicks a coloured pictogram on the map
- **THEN** the plan's collections of refs and markers are unchanged

---

### Requirement: Removal of plan objects only from the sidebar card
Removing a library ref or marker from the plan SHALL be done only via the sidebar card's delete control. No map gesture (click, right-click, drag-off) SHALL remove an object.

#### Scenario: Delete control on library ref card
- **WHEN** the user clicks the delete control on a library ref card and confirms
- **THEN** the ref is removed from the plan and the underlying library entry is unaffected

#### Scenario: Delete control on marker card
- **WHEN** the user clicks the delete control on a marker card and confirms
- **THEN** the marker is removed from the plan

#### Scenario: No map gesture removes
- **WHEN** the user clicks or right-clicks a coloured pictogram on the map
- **THEN** no removal occurs

---

### Requirement: Add Marker via type-stamped toggle
The Objects tab SHALL provide a type-stamped Add Marker toggle button mirroring the structure of the existing Add Wpts toggle. The button SHALL expose a dropdown to pick a pictogram type and SHALL toggle a placement mode in which each map click or committed coord entry creates a new plan-local marker of the selected type at that position. The mode SHALL remain active until toggled off.

#### Scenario: Toggle enters placement mode
- **WHEN** the user clicks the Add Marker toggle button
- **THEN** placement mode is active and the cursor renders the selected pictogram

#### Scenario: Map click creates marker
- **WHEN** placement mode is active and the user clicks a position on the map
- **THEN** a new marker of the selected type is appended to the plan's markers at that position

#### Scenario: Coord entry creates marker
- **WHEN** placement mode is active and the user presses a digit, `N`, or `S` and commits with Return
- **THEN** a new marker is created at the entered coordinates

#### Scenario: Mode stays active for batch placement
- **WHEN** placement mode is active and a marker has just been created
- **THEN** placement mode remains active until toggled off

#### Scenario: Type can be changed mid-batch
- **WHEN** placement mode is active and the user opens the type dropdown and selects a different type
- **THEN** subsequent placements use the new type

---

### Requirement: Library ref card content and editing
A library ref card SHALL display the underlying library entry's pictogram, name, coordinates, and range (if ranged) as read-only on the card, plus an editable per-plan comment override field. The comment editor SHALL behave like the existing waypoint comment editor: inline textarea, save on blur or Enter, discard on Escape.

#### Scenario: Library-owned fields are read-only on the card
- **WHEN** a library ref card is displayed
- **THEN** pictogram, name, coordinates, and range are shown as read-only

#### Scenario: Per-plan comment editing
- **WHEN** the user clicks the comment editor on a library ref card and types a comment then commits
- **THEN** the per-plan comment override is set on that ref

#### Scenario: Empty per-plan comment falls back to default
- **WHEN** a library ref card has no per-plan comment and the underlying library entry has a default comment
- **THEN** the default comment is displayed as a preview on the card

#### Scenario: Comment editor save and discard
- **WHEN** the user edits the per-plan comment textarea and blurs or presses Enter
- **THEN** the change is saved; pressing Escape reverts the textarea to the previous value

---

### Requirement: Marker card content and editing
A marker card SHALL display and allow inline editing of its pictogram type (via a picker dropdown), name, range (only when the type is ranged), and comment. Coordinates SHALL be shown as read-only on the card; position editing is via map drag or coord entry only.

#### Scenario: Marker pictogram picker
- **WHEN** a marker card is expanded
- **THEN** a pictogram picker dropdown is visible and changes apply immediately

#### Scenario: Changing type updates range visibility
- **WHEN** the user changes a marker's pictogram from a non-ranged type to a ranged type
- **THEN** the range field appears on the card; changing back hides it again

#### Scenario: Marker comment editing
- **WHEN** the user edits a marker's comment field
- **THEN** the marker's comment is updated immediately

#### Scenario: No coordinate text field on marker card
- **WHEN** a marker card is displayed
- **THEN** coordinates are shown read-only; editing is via map drag or coord entry only

---

### Requirement: Pictograms identical on map regardless of origin
On the map, a plan-local marker and a library ref of the same pictogram type SHALL render identically. The distinction between marker and library ref SHALL be made only in the sidebar (e.g., via differing card structure or labelling).

#### Scenario: Same visual for same type
- **WHEN** a library ref and a marker share a pictogram type
- **THEN** their map renderings are visually indistinguishable

#### Scenario: Sidebar distinguishes origin
- **WHEN** both kinds appear in the sidebar
- **THEN** they are visually distinguished so the user can identify the origin

---

### Requirement: Threat range rings on map
A threat range ring SHALL be drawn for every in-plan object (ref or marker) whose pictogram type is ranged. The ring radius SHALL equal the entry's range. Rings SHALL NOT be drawn for greyed library ghosts.

#### Scenario: Ring drawn for in-plan threat
- **WHEN** an in-plan ref or marker has a ranged pictogram type
- **THEN** a circular ring of radius equal to the entry's range is drawn around its position

#### Scenario: Ring not drawn for greyed ghost
- **WHEN** a library entry is a greyed ghost in the Objects tab
- **THEN** no range ring is drawn for it

---

### Requirement: Z-order on the map
On the planner map, layers SHALL be drawn in the following bottom-to-top order: pictograms, then threat range rings, then waypoints and the route. Pictograms SHALL be the lowest of the new layers; the route SHALL remain on top.

#### Scenario: Route drawn above rings
- **WHEN** a route line crosses a threat range ring
- **THEN** the route is drawn above the ring

#### Scenario: Rings drawn above pictograms
- **WHEN** a threat range ring overlaps the pictogram of another object
- **THEN** the ring is drawn above the pictogram

---

### Requirement: Hover tooltips on map pictograms
Hovering a pictogram on the map SHALL show a tooltip whose contents depend on the pictogram's state. Greyed library ghosts SHALL show only the entry's name. Coloured in-plan pictograms SHALL show the name plus comment plus range (when applicable).

#### Scenario: Tooltip on greyed pictogram
- **WHEN** the user hovers a greyed library pictogram
- **THEN** a tooltip showing only the entry's name is displayed

#### Scenario: Tooltip on coloured pictogram
- **WHEN** the user hovers a coloured in-plan pictogram
- **THEN** a tooltip showing the name, the effective comment (per-plan override or default), and the range (if applicable) is displayed

---

### Requirement: Selection mechanics in the Objects tab mirror waypoint selection
Selection of objects in the Objects tab SHALL obey the same contract as `waypoint-selection`: at most one object selected at a time, `#FFB300` orange highlight on both the sidebar card and the map pictogram, click either to select, click the map background or press Escape to deselect, `+` / `-` to cycle through objects in list order.

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

---

### Requirement: Drag-to-move markers on the planner map
A plan-local marker SHALL be movable by dragging its pictogram on the map. Library refs SHALL NOT be movable from the planner page; attempting to drag a library ref's pictogram SHALL not change its position (library positions are edited only on the Library page).

#### Scenario: Drag a marker
- **WHEN** the user drags a marker's pictogram on the planner map and releases
- **THEN** the marker's position is updated to the release position

#### Scenario: Library ref drag inert on planner page
- **WHEN** the user attempts to drag a library ref's pictogram on the planner map
- **THEN** the position is unchanged

---

### Requirement: Coord entry to move a selected marker
With a marker selected, the user SHALL be able to edit its position via the same DMM slot-fill template overlay as `waypoint-coordinate-edit`. Coord entry on a selected library ref on the planner page SHALL NOT activate (library positions are owned by the Library page).

#### Scenario: Coord entry moves the marker
- **WHEN** a marker is selected and the user presses a digit, `N`, or `S`, fills the template, and presses Return
- **THEN** the marker's position is updated to the entered coordinates

#### Scenario: Coord entry inert on selected library ref
- **WHEN** a library ref is selected on the planner page and the user presses a digit, `N`, or `S`
- **THEN** coord entry mode does not activate

---

### Requirement: Kneeboard renders objects inside the leg crop
For every kneeboard leg page, the system SHALL render every plan object (library ref or marker) whose position falls inside the leg's map crop. Each rendered object SHALL be drawn at its position using its pictogram.

#### Scenario: Object inside crop renders
- **WHEN** a plan object is positioned inside a leg's map crop
- **THEN** its pictogram appears at the corresponding position on the kneeboard page

#### Scenario: Object outside crop omitted
- **WHEN** a plan object is positioned outside the leg's map crop
- **THEN** no pictogram for that object is drawn on the page

---

### Requirement: Kneeboard renders inline comment labels
For each rendered object whose effective comment is non-empty, a comment label SHALL be drawn inline on the kneeboard map crop near the pictogram. The label SHALL use a small font and a semi-transparent background consistent with the visual style of other labels on the kneeboard (e.g., the existing waypoint name). For library refs the effective comment is the per-plan override if set, otherwise the library entry's default comment. For markers it is the marker's own comment.

#### Scenario: Per-plan override displayed for library ref
- **WHEN** a library ref has a non-empty per-plan comment override
- **THEN** the override is drawn next to the pictogram

#### Scenario: Default comment used when no override
- **WHEN** a library ref has no per-plan comment and the library entry has a default comment
- **THEN** the library entry's default comment is drawn next to the pictogram

#### Scenario: Marker comment displayed
- **WHEN** a marker has a non-empty comment
- **THEN** the comment is drawn next to the marker's pictogram

#### Scenario: No label when effective comment empty
- **WHEN** an object's effective comment is empty
- **THEN** no comment label is drawn

#### Scenario: Label style consistent with other kneeboard labels
- **WHEN** a comment label is drawn for an object on a kneeboard leg page
- **THEN** the label uses a small font and a semi-transparent background matching the visual treatment of other kneeboard labels

---

### Requirement: Kneeboard threat range rings render across the crop boundary
A threat range ring SHALL be drawn on a kneeboard leg page whenever the ring intersects the crop, even when the threat's centre is outside the crop bounds. The visible portion of the ring (a full circle or an arc fragment) SHALL be drawn.

#### Scenario: Full ring when centre inside crop
- **WHEN** a threat's centre is inside the leg's crop
- **THEN** the full ring is drawn within the crop

#### Scenario: Arc when centre outside crop
- **WHEN** a threat's centre is outside the leg's crop but the ring intersects the crop
- **THEN** the visible arc is drawn even though the pictogram is not

#### Scenario: Nothing when no intersection
- **WHEN** a threat's ring does not intersect the leg's crop
- **THEN** nothing is drawn for that threat on that leg

---

### Requirement: Kneeboard z-order matches planner
The z-order of layers on a kneeboard leg page SHALL match the planner: pictograms at the bottom, threat range rings above, waypoints and the route on top.

#### Scenario: Route on top of rings
- **WHEN** route lines overlap threat range rings
- **THEN** the route is drawn above the rings

#### Scenario: Pictograms below rings
- **WHEN** pictograms overlap threat range rings
- **THEN** the rings are drawn above the pictograms
