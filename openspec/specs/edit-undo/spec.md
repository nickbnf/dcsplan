# Spec: Edit Undo

## Purpose

Edit undo lets a user reverse their most recent editing actions and reapply them, so an accidental change — nudging a waypoint, dragging a slider, deleting a marker — can be taken back immediately. It is an in-session working aid held in memory: it is discarded on reload and never reaches a server, which distinguishes it from durable version history. This capability is tier-independent; it behaves identically with and without an account.

## Requirements

### Requirement: Undo and redo of flight plan edits

The system SHALL allow the user to reverse the most recent flight plan edit, restoring the plan to its state immediately before that edit, and to reapply an edit that was just reversed. Undo SHALL be repeatable, walking back through successive edits in reverse order.

Performing a new edit SHALL discard any reversed edits that were available for reapplication.

#### Scenario: Undo restores the previous plan state
- **WHEN** the user makes an edit to the flight plan and then invokes undo
- **THEN** the flight plan returns to exactly the state it had immediately before that edit

#### Scenario: Redo reapplies a reversed edit
- **WHEN** the user invokes undo and then invokes redo without making any edit in between
- **THEN** the flight plan returns to the state it had before the undo

#### Scenario: Repeated undo walks back through successive edits
- **WHEN** the user makes three edits and invokes undo three times
- **THEN** the flight plan returns to the state it had before the first of those three edits

#### Scenario: A new edit discards the redo history
- **WHEN** the user invokes undo and then makes a new edit
- **THEN** redo is no longer available

#### Scenario: Undo with no history available
- **WHEN** no edit has been made since the flight plan was loaded and the user invokes undo
- **THEN** the flight plan is unchanged

---

### Requirement: Undo and redo controls reflect availability

The system SHALL expose undo and redo as buttons in the flight plan sidebar and as keyboard shortcuts. Each control SHALL be presented as unavailable when there is nothing for it to act on.

Keyboard bindings SHALL be `Ctrl+Z` (`Cmd+Z` on macOS) for undo, and both `Ctrl+Shift+Z` (`Cmd+Shift+Z`) and `Ctrl+Y` for redo.

#### Scenario: Controls unavailable before any edit
- **WHEN** the flight plan is loaded and no edit has been made
- **THEN** both the undo and redo controls are shown as unavailable

#### Scenario: Undo becomes available after an edit
- **WHEN** the user makes an edit to the flight plan
- **THEN** the undo control becomes available and the redo control remains unavailable

#### Scenario: Keyboard shortcut performs undo
- **WHEN** an edit has been made and the user presses `Ctrl+Z` (or `Cmd+Z`)
- **THEN** the same reversal occurs as pressing the undo button

#### Scenario: Both redo bindings are accepted
- **WHEN** an edit has been reversed and the user presses either `Ctrl+Shift+Z` (or `Cmd+Shift+Z`) or `Ctrl+Y`
- **THEN** the reversed edit is reapplied

---

### Requirement: Undo shortcuts yield to text entry and coordinate entry

The undo and redo keyboard shortcuts SHALL be ignored while a text input, textarea, or other editable field has keyboard focus, so that the field's own native undo continues to work. They SHALL also be ignored while coord entry mode is active, which owns the keyboard for the duration of the entry.

Ignoring a shortcut SHALL leave both the flight plan and the undo history unchanged.

#### Scenario: Shortcut ignored while editing a text field
- **WHEN** a waypoint comment textarea has focus and the user presses `Ctrl+Z`
- **THEN** the flight plan is unchanged and the keystroke is handled by the text field

#### Scenario: Shortcut ignored during coord entry
- **WHEN** coord entry mode is active and the user presses `Ctrl+Z`
- **THEN** coord entry mode remains active and the flight plan is unchanged

#### Scenario: Shortcut applies once focus leaves the field
- **WHEN** the user finishes editing a text field, moves focus away, and presses `Ctrl+Z`
- **THEN** the most recent flight plan edit is reversed

---

### Requirement: One history entry per user action

A single user action SHALL produce exactly one undoable entry, and one undo SHALL reverse the whole of that action. Sustained interaction with a single continuous control — such as dragging a value slider — SHALL collapse into one entry rather than one entry per intermediate value. Interactions with different controls, or separated interactions with the same control, SHALL remain distinct entries.

An update that leaves the flight plan unchanged SHALL NOT create an entry.

#### Scenario: Dragging a slider produces one entry
- **WHEN** the user drags the declination slider continuously from one value to another and then invokes undo
- **THEN** the declination returns to the value it had before the drag began, in a single undo

#### Scenario: Separate interactions with the same control stay distinct
- **WHEN** the user drags the declination slider, pauses, drags it again, and then invokes undo
- **THEN** only the second drag is reversed, and a further undo reverses the first

#### Scenario: Dragging a waypoint produces one entry
- **WHEN** the user drags a waypoint to a new position on the map and invokes undo
- **THEN** the waypoint returns to its position before the drag

#### Scenario: Rapid distinct actions remain separately undoable
- **WHEN** the user deletes one waypoint and immediately deletes another
- **THEN** the first undo restores only the most recently deleted waypoint

#### Scenario: An update that changes nothing creates no entry
- **WHEN** the flight plan is re-submitted with identical content
- **THEN** the undo history is unchanged and undo still targets the last real edit

---

### Requirement: Undo history covers the flight plan across every page

The undo history SHALL be scoped to the flight plan as a whole, not to the page on which an edit was made. An edit made on any page that modifies the flight plan SHALL be undoable, including from a different page.

Edits to the theatre library and to performance profiles are outside this capability's scope and SHALL NOT be reversed by flight plan undo.

#### Scenario: An edit made on another page is undoable
- **WHEN** the user changes a flight plan value on the attack planning page, navigates to the planner, and invokes undo
- **THEN** that change is reversed

#### Scenario: Library edits are not reversed by flight plan undo
- **WHEN** the user edits a theatre library entry and then invokes undo on the flight plan
- **THEN** the library entry retains its edited value

---

### Requirement: Wholesale-replacement operations are not undoable and clear the history

Operations that replace the working set outright — importing a flight plan, clearing the flight plan, changing theatre, and importing a performance package — SHALL NOT be undoable. Performing one SHALL discard the entire undo and redo history, so that no earlier state remains reachable.

Importing a performance package SHALL discard the history **whether or not** any waypoint is currently orphaned by the import, because an earlier entry may still reference a regime that existed only in the replaced profile.

Each such operation SHALL retain its own confirmation prompt as the user's safeguard.

#### Scenario: Import is not undoable
- **WHEN** the user imports a flight plan and then invokes undo
- **THEN** the imported plan is unchanged and the undo control is shown as unavailable

#### Scenario: Import discards history from before it
- **WHEN** the user makes several edits, imports a flight plan, and then invokes undo repeatedly
- **THEN** no state from before the import can be reached

#### Scenario: Clearing the flight plan is not undoable
- **WHEN** the user confirms clearing the flight plan and then invokes undo
- **THEN** the plan remains cleared

#### Scenario: Importing a performance package discards the history
- **WHEN** the user edits the flight plan, imports a performance package, and then invokes undo
- **THEN** the undo control is shown as unavailable and no earlier plan state can be reached

#### Scenario: Performance import discards the history even with no orphaned waypoint
- **WHEN** no waypoint references a regime missing from the imported package, the user imports it, and then invokes undo
- **THEN** the undo control is still shown as unavailable, so no earlier entry can restore a regime binding the replaced profile alone defined

---

### Requirement: Undo history is bounded and lasts only for the session

The system SHALL retain a bounded number of the most recent undoable actions, at least twenty. When the limit is exceeded, the oldest entry SHALL be discarded without notifying the user.

The history SHALL exist only in the current session: reloading or reopening the application SHALL start with an empty history, while leaving the persisted flight plan itself untouched.

#### Scenario: Oldest entries are discarded beyond the limit
- **WHEN** the user performs more distinct actions than the retention limit and invokes undo repeatedly
- **THEN** the earliest actions are no longer reachable and the flight plan stops changing once the retained history is exhausted

#### Scenario: History does not survive a reload
- **WHEN** the user makes an edit and then reloads the application
- **THEN** the edit is still present in the flight plan and the undo control is shown as unavailable

---

### Requirement: An undone state is persisted like any other edit

Reversing or reapplying an edit SHALL update the current flight plan through the normal persistence path, so the resulting state survives a reload exactly as a directly-made edit would.

#### Scenario: An undo survives a reload
- **WHEN** the user makes an edit, invokes undo, and then reloads the application
- **THEN** the flight plan loads in its undone state
