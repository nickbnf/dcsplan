# Spec Delta

## MODIFIED Requirements

### Requirement: Deletions win over stale edits
A deleted library entry or profile SHALL stay deleted, whether it is in the Trash or purged. A device that edits it without having seen the deletion SHALL NOT bring it back, and SHALL converge to the deletion. Only restoring it from the Trash (`soft-delete`) or re-creating it SHALL bring it back.

#### Scenario: Offline edit of a deleted entry does not resurrect it
- **WHEN** device A deletes library entry X, and device B, offline and unaware, edits X then reconnects
- **THEN** X remains deleted on every device

#### Scenario: Offline edit of a trashed profile does not take it out of the Trash
- **WHEN** device A deletes profile P, and device B, offline and unaware, edits P then reconnects
- **THEN** P remains in the Trash, with the content it had when deleted

## ADDED Requirements

### Requirement: Restoring from the Trash propagates to every device
When a library entry or profile is restored from the Trash, it SHALL reappear on each of the user's devices without a reload, picked up like any other remote change, with the content it had when deleted. Whether a deleted entry or profile is still in the Trash or purged SHALL also reach every device, so placeholders and profile choosers can state it. The **anonymous** tier does not synchronize and has no Trash.

#### Scenario: Restored entry appears on a second device
- **WHEN** a signed-in user restores a library entry from the Trash on device A, and device B is open and connected
- **THEN** device B's library shows the entry again without a reload, and plans open on B resolve their refs to it

#### Scenario: Purge reaches every device
- **WHEN** a trashed profile is purged while device B is offline, and B later reconnects
- **THEN** B treats the profile as purged: plans flying it no longer offer restoring it from the Trash
