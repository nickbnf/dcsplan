## ADDED Requirements

### Requirement: Library entry data model
The system SHALL maintain a library of map objects per theatre. Each library entry SHALL have a stable UUID (immutable, generated on creation), a pictogram type from a closed catalog, a position (latitude and longitude in degrees), an optional name (free text), an optional default comment (free text), and an optional range in nautical miles that is present only when the entry's pictogram type is "ranged". Entries SHALL be preserved through JSON serialisation and deserialisation without modification.

#### Scenario: Library entry round-trips through JSON
- **WHEN** a library entry with all fields set is exported and re-imported
- **THEN** every field matches the original

#### Scenario: Range absent on non-ranged entries
- **WHEN** a library entry has a non-ranged pictogram type
- **THEN** the entry SHALL NOT carry a range field

#### Scenario: Range present on ranged entries
- **WHEN** a library entry has a ranged pictogram type
- **THEN** the entry SHALL carry a range field in NM

---

### Requirement: Theatre-scoped library persistence
The library SHALL be partitioned per theatre and persisted to localStorage using a per-theatre key namespace. Loading a different theatre SHALL load that theatre's library; an absent key SHALL be treated as an empty library.

#### Scenario: Switching theatres loads the new library
- **WHEN** the user selects a different theatre with an existing library
- **THEN** the previously loaded library is replaced with the new theatre's library

#### Scenario: Empty library for new theatre
- **WHEN** the user switches to a theatre with no library entries persisted
- **THEN** the library is treated as empty (not as an error)

#### Scenario: Library survives reloads
- **WHEN** the user reloads the app while on a theatre with library entries
- **THEN** all entries reappear unchanged

---

### Requirement: Theatre change confirmation mentions the library
The existing theatre-switch confirmation dialog SHALL state that the library will be blanked when the theatre changes, in addition to the flight plan.

#### Scenario: Theatre switch with non-empty library
- **WHEN** the user attempts to switch theatres and the current theatre's library is non-empty
- **THEN** the confirmation dialog mentions both the flight plan and the library being blanked

#### Scenario: Theatre switch with empty library
- **WHEN** the user attempts to switch theatres and the current theatre's library is empty
- **THEN** the confirmation dialog need not mention the library

---

### Requirement: Library JSON file format
A library JSON file SHALL contain a top-level `version` field matching `LIBRARY_FILE_VERSION` and a `library` array of entries. Each entry SHALL conform to the library entry data model.

#### Scenario: Valid library file
- **WHEN** a library file with the current version and a valid entry array is loaded
- **THEN** entries are parsed successfully

#### Scenario: Missing version is rejected
- **WHEN** a library file without a `version` field is loaded
- **THEN** the import fails with an error message about invalid format

---

### Requirement: Library import defaults to merge
By default, importing a library file SHALL add entries whose UUIDs are not already present in the current library and SHALL leave entries whose UUIDs already exist unchanged. A summary of added vs kept counts SHALL be shown to the user before commit.

#### Scenario: Merge adds new UUIDs
- **WHEN** the user imports a library file containing 5 entries, 3 of which are new UUIDs
- **THEN** the 3 new entries are added and the 2 existing entries are unchanged

#### Scenario: Merge summary shown before commit
- **WHEN** the user selects a library file in the import dialog
- **THEN** the dialog displays counts of entries to be added and entries already present before requesting confirmation

---

### Requirement: Library import supports explicit replace
The library import dialog SHALL offer an opt-in Replace mode that, when enabled and confirmed, clears the current library before adding the file's entries.

#### Scenario: Replace clears existing library
- **WHEN** the user imports a library file with the Replace option enabled and confirms
- **THEN** the previous library is discarded and only the file's entries remain

#### Scenario: Replace requires explicit opt-in
- **WHEN** a library file is selected in the import dialog
- **THEN** the Replace option is off by default and must be ticked manually

---

### Requirement: Library JSON export
The user SHALL be able to export the current theatre's library as a JSON file conforming to the library file format.

#### Scenario: Export downloads a JSON file
- **WHEN** the user invokes the Export Library action
- **THEN** a JSON file containing the current library's entries and the current `LIBRARY_FILE_VERSION` is downloaded by the browser

#### Scenario: Empty library export
- **WHEN** the user invokes Export Library with no entries
- **THEN** a JSON file with an empty `library` array is downloaded

---

### Requirement: Theatre Library page exists at /library
The application SHALL expose a top-level Theatre Library page routed at `/library`, parallel to `/attack` and `/performance`. The page SHALL be reachable from the top navigation and from a Manage Library link inside the planner's Objects tab.

#### Scenario: Page reachable from top navigation
- **WHEN** the user clicks the Library entry in the top navigation
- **THEN** the Theatre Library page is displayed

#### Scenario: Page reachable from Objects tab
- **WHEN** the user is on the planner page on the Objects tab and clicks Manage Library
- **THEN** the Theatre Library page is displayed

---

### Requirement: Theatre Library page layout and content
The Library page SHALL use a side-by-side layout with a scrollable list of library entries on the left and a map on the right showing all entries. The map SHALL show only library objects; no flight plan route, no waypoints, and no plan markers SHALL appear on it.

#### Scenario: List and map visible side-by-side
- **WHEN** the Library page is displayed
- **THEN** the entry list and map are visible simultaneously

#### Scenario: Map shows only library objects
- **WHEN** the Library page is displayed
- **THEN** no waypoints, route lines, or plan markers are drawn on the map

#### Scenario: Auto-zoom on page load
- **WHEN** the Library page is opened and the library has at least one entry
- **THEN** the map auto-zooms to fit the bounds of all library entries

---

### Requirement: Library entry selection mechanics mirror waypoint selection
Selection on the Library page SHALL obey the same contract as `waypoint-selection`: at most one entry selected at a time, `#FFB300` orange highlight on both the sidebar card and the map pictogram, click either to select, click the map background or press Escape to deselect, and `+` / `-` to cycle through entries in list order (wrapping at ends).

#### Scenario: Click card selects entry
- **WHEN** the user clicks a library entry card in the sidebar
- **THEN** that entry becomes selected and its pictogram on the map is highlighted in `#FFB300`

#### Scenario: Click map pictogram selects entry
- **WHEN** the user clicks a library entry's pictogram on the map
- **THEN** that entry becomes selected and its card in the sidebar is highlighted in `#FFB300`

#### Scenario: Map background click deselects
- **WHEN** an entry is selected and the user clicks an empty area of the map
- **THEN** the entry is deselected

#### Scenario: Escape deselects
- **WHEN** an entry is selected and coord entry is not active and the user presses Escape
- **THEN** the entry is deselected

#### Scenario: Keyboard cycles through entries
- **WHEN** an entry is selected and the user presses `+` or `-`
- **THEN** the next or previous entry in list order becomes selected, wrapping at the ends

#### Scenario: Selected card scrolled into view
- **WHEN** selection changes and the newly selected card is outside the visible scroll area
- **THEN** the sidebar scrolls smoothly to centre the card

---

### Requirement: Library entry coordinate entry mirrors waypoint coordinate entry
With a library entry selected, the user SHALL be able to edit its position by keyboard using the same DMM slot-fill template overlay defined by `waypoint-coordinate-edit`. The same triggers (`N`, `S`, digit), the same in-progress display (dimmed coordinates with amber pencil ✎ on the card), the same hemisphere overrides, and the same commit/cancel semantics SHALL apply.

#### Scenario: Digit or cardinal triggers coord entry
- **WHEN** a library entry is selected and the user presses a digit, `N`, or `S` key
- **THEN** the DMM slot-fill template appears on the map overlay in the same form as the waypoint flow

#### Scenario: Sidebar feedback during entry
- **WHEN** coord entry is active for a selected library entry
- **THEN** the coordinate line on the card is dimmed with an amber pencil (✎) prepended

#### Scenario: Return commits and moves the entry
- **WHEN** coord entry is active for a selected library entry and the template is sufficiently filled and the user presses Return
- **THEN** the entry's position is updated to the entered coordinates and coord entry mode closes with the entry still selected

#### Scenario: Escape cancels entry
- **WHEN** coord entry is active for a selected library entry and the user presses Escape
- **THEN** coord entry mode closes, the entry's position is unchanged, and the entry remains selected

---

### Requirement: Library entry drag-to-move
The user SHALL be able to move a library entry by dragging its pictogram on the map. If coord entry is active when the drag begins, the entry SHALL be cancelled and the dragged position used.

#### Scenario: Drag updates position
- **WHEN** the user drags a library entry's pictogram on the map and releases
- **THEN** the entry's position is updated to the release position

#### Scenario: Drag cancels coord entry
- **WHEN** coord entry is active for a selected library entry and the user drags that entry's pictogram
- **THEN** coord entry mode is cancelled and the drag position is used

---

### Requirement: Add library entry via type-stamped toggle
The Library page SHALL provide a type-stamped Add Object toggle button that mirrors the structure of the existing Add Wpts toggle. The button SHALL expose a dropdown to pick a pictogram type and SHALL toggle a placement mode in which each map click or committed coord entry creates a new library entry of the selected type at that position. The mode SHALL remain active until toggled off.

#### Scenario: Toggle enters placement mode
- **WHEN** the user clicks the Add Object toggle button
- **THEN** placement mode is active and the cursor renders the selected pictogram

#### Scenario: Map click creates entry
- **WHEN** placement mode is active and the user clicks a position on the map
- **THEN** a new library entry of the selected type is created at that position with a fresh UUID

#### Scenario: Coord entry creates entry
- **WHEN** placement mode is active and the user presses a digit, `N`, or `S` and commits with Return
- **THEN** a new library entry is created at the entered coordinates

#### Scenario: Mode stays active for batch placement
- **WHEN** placement mode is active and an entry has just been created
- **THEN** placement mode remains active until the user toggles it off

#### Scenario: Type can be changed mid-batch
- **WHEN** placement mode is active and the user opens the toggle's type dropdown and selects a different type
- **THEN** subsequent placements create entries of the new type

---

### Requirement: Library entry card inline editing
Each library entry card SHALL allow inline editing of pictogram type, name, range (only when the type is ranged), and default comment. Position editing SHALL be by map drag or coord entry only; there SHALL NOT be a coordinate text field on the card. Field changes SHALL auto-save to the library; there SHALL NOT be a per-field Save button.

#### Scenario: Pictogram picker on card
- **WHEN** an entry card is expanded
- **THEN** a pictogram type picker is visible and changes apply immediately

#### Scenario: Range field shown only for ranged types
- **WHEN** an entry's type is ranged
- **THEN** the range field is visible and editable on the card

#### Scenario: Range field hidden for non-ranged types
- **WHEN** an entry's type is non-ranged
- **THEN** no range field is shown on the card

#### Scenario: Field edits auto-save
- **WHEN** the user commits a change to a name, range, or default comment field
- **THEN** the new value is persisted to the library immediately

#### Scenario: Coordinates shown read-only on card
- **WHEN** an entry's card is displayed
- **THEN** the coordinates are shown as read-only text; editing is via keyboard coord entry or map drag only

---

### Requirement: Library entry deletion with reference detection
The user SHALL be able to delete a library entry via a control on its card, requiring a confirmation dialog. If the current flight plan references the entry, the confirmation dialog SHALL state this explicitly, and confirming the deletion SHALL remove the reference from the plan as well.

#### Scenario: Delete simple case
- **WHEN** the user clicks delete on a library entry not referenced by the current plan and confirms
- **THEN** the entry is removed from the library

#### Scenario: Delete with current-plan reference
- **WHEN** the user clicks delete on a library entry that the current plan references
- **THEN** the confirmation dialog states that the entry is referenced by the current plan, and confirming removes the entry from the library and the reference from the plan

#### Scenario: Cancel preserves entry
- **WHEN** the user clicks delete on a library entry and cancels the confirmation
- **THEN** the entry remains in the library
