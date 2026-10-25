# Spec Delta

## MODIFIED Requirements

### Requirement: The space admin restores a trashed item unchanged

The space's admin SHALL be able to restore any trashed item. Restoring SHALL bring the item back under the same id with the content it had when deleted, and remove it from the Trash. A plan SHALL also come back with its version history; its unfinalized edits are finalized into a version when it is trashed (`version-history`). In a Personal space the owner is the admin (AD-1). Restoring requires a connection.

#### Scenario: Restore a plan
- **WHEN** the owner restores a trashed plan
- **THEN** the plan is listed again with its name and theatre, and opens at its address with the content it had when deleted

#### Scenario: A restored plan keeps its history
- **WHEN** a plan at Rev 6 with unfinalized edits is trashed, then restored by the owner
- **THEN** its history lists Revs 1 to 7, Rev 7 holding the edits made before it was trashed

#### Scenario: Restore a library entry
- **WHEN** the owner restores a trashed library entry
- **THEN** the entry is back in its theatre's library with the data it had when deleted

#### Scenario: Restore a profile
- **WHEN** the owner restores a trashed profile
- **THEN** the profile is back in the profile list with its aircraft data and regimes, under the same id and regime ids


### Requirement: Trashed items are purged after the retention period

A trashed item SHALL be purged 30 days after it was deleted. A purged item SHALL leave the Trash and SHALL NOT be restorable. References to a purged library entry or profile SHALL stay unresolved, and a purged plan's address SHALL not resolve. Purging a plan SHALL purge its versions with it. Versions of other plans that pinned a copy of a purged library entry or profile SHALL keep that copy (`version-history`).

#### Scenario: Item purged after 30 days
- **WHEN** a trashed profile was deleted more than 30 days ago
- **THEN** it is no longer listed in the Trash and cannot be restored

#### Scenario: Item within retention is kept
- **WHEN** a trashed plan was deleted 29 days ago
- **THEN** it is still listed in the Trash and can be restored

#### Scenario: Purging a plan purges its versions
- **WHEN** a trashed plan with five versions is purged
- **THEN** none of its versions can be listed or restored

#### Scenario: Purging an entry keeps pinned copies
- **WHEN** library entry X is purged, and Rev 5 of a live plan pinned a copy of X
- **THEN** Rev 5 still holds its copy of X, from which X can be recovered
