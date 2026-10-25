# Spec Delta

## MODIFIED Requirements

### Requirement: Wholesale-replacement operations are not undoable and clear the history

Operations that replace the working set outright — importing a flight plan, clearing the flight plan, changing theatre, importing a performance package, and restoring a version (`version-history`) — SHALL NOT be undoable. Performing one SHALL discard the entire undo and redo history, so that no earlier state remains reachable.

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

#### Scenario: Restoring a version discards history (signed-in)
- **WHEN** a signed-in user edits the plan, restores an earlier version, and then invokes undo
- **THEN** the undo control is shown as unavailable and the restored plan is unchanged

#### Scenario: A restore on another device discards history (signed-in)
- **WHEN** a plan is open on two devices with edits in device B's undo history, and device A restores an earlier version
- **THEN** device B's undo and redo controls are shown as unavailable once it shows the restored plan

