# Spec Delta

## ADDED Requirements

### Requirement: A trashed plan stops synchronizing

Once a signed-in plan is trashed, the server SHALL accept no further edits to it and SHALL stop synchronizing it to any device. A device that has the plan open SHALL leave it and show the plan list. A device holding a local copy SHALL discard that copy when it learns the plan is trashed, including edits made while disconnected that never reached the server. The **anonymous** tier does not synchronize and has no plan deletion.

#### Scenario: Plan deleted while open on another device
- **WHEN** a signed-in user deletes a plan on device A while it is open and connected on device B
- **THEN** device B leaves the plan and shows the plan list

#### Scenario: Offline edits do not bring a trashed plan back
- **WHEN** device B, disconnected, edits a plan that device A then deletes, and B reconnects
- **THEN** the plan stays in the Trash, B shows the plan list, and B's offline edits are discarded

#### Scenario: A restored plan syncs again
- **WHEN** a trashed plan is restored from the Trash and then opened on any device
- **THEN** it opens with the content it had when deleted and synchronizes as before

#### Scenario: Trashed plan's local copy is not opened offline
- **WHEN** a signed-in device that has learned a plan is trashed is later disconnected
- **THEN** the plan is not offered or opened from a local copy
