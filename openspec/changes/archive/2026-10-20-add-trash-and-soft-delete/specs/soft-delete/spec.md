# Spec Delta

## Purpose

Defines what deleting a space-owned flight plan, library entry or performance profile means (AD-7): the item moves to a space-level Trash rather than being destroyed, the space admin can restore it unchanged until it is purged after a retention period, and trashing never edits the plans that reference it. The anonymous tier has no trash.

## ADDED Requirements

### Requirement: Deleting a space-owned item moves it to the space's Trash

In the **signed-in** tier, deleting a plan, library entry or profile SHALL move it to the Trash of the space that owns it instead of destroying it. A trashed item SHALL no longer appear on any surface that lists live items, and SHALL keep its content and id. The **anonymous** tier has no Trash; its deletions are immediate and unchanged.

#### Scenario: A deleted plan is in the Trash
- **WHEN** a signed-in user deletes a plan
- **THEN** the plan no longer appears in the plan list, and it appears in the space's Trash

#### Scenario: A deleted library entry is in the Trash
- **WHEN** a signed-in user deletes a library entry
- **THEN** the entry no longer appears in the theatre library, and it appears in the space's Trash

#### Scenario: A deleted profile is in the Trash
- **WHEN** a signed-in user deletes a profile
- **THEN** the profile no longer appears in the profile list, and it appears in the space's Trash

#### Scenario: Anonymous deletion is immediate
- **WHEN** an anonymous user deletes a library entry
- **THEN** the entry is removed from the device-local library and no Trash exists to hold it

---

### Requirement: The Trash lists trashed items of the space

The Trash SHALL list every trashed plan, library entry and profile of the active space that has not been purged. Each item SHALL show its kind, its name (a plan's name, an entry's name and theatre, a profile's label), and when it was deleted. Items SHALL be ordered most recently deleted first. The Trash SHALL be reachable from the plan list.

#### Scenario: Trash shows all three kinds
- **WHEN** a signed-in user has deleted one plan, one library entry and one profile, and opens the Trash
- **THEN** all three are listed, each with its kind, name and deletion date, the most recently deleted first

#### Scenario: Empty Trash
- **WHEN** a signed-in user opens the Trash and nothing is trashed
- **THEN** the Trash states it is empty

#### Scenario: Trash requires a connection
- **WHEN** a signed-in user opens the Trash while disconnected
- **THEN** the Trash states that it needs a connection, and offers no restore

---

### Requirement: The space admin restores a trashed item unchanged

The space's admin SHALL be able to restore any trashed item. Restoring SHALL bring the item back under the same id with the content it had when deleted, and remove it from the Trash. In a Personal space the owner is the admin (AD-1). Restoring requires a connection.

#### Scenario: Restore a plan
- **WHEN** the owner restores a trashed plan
- **THEN** the plan is listed again with its name and theatre, and opens at its address with the content it had when deleted

#### Scenario: Restore a library entry
- **WHEN** the owner restores a trashed library entry
- **THEN** the entry is back in its theatre's library with the data it had when deleted

#### Scenario: Restore a profile
- **WHEN** the owner restores a trashed profile
- **THEN** the profile is back in the profile list with its aircraft data and regimes, under the same id and regime ids

---

### Requirement: Trashing never edits a plan

Deleting or purging a library entry or profile SHALL NOT modify any plan, including the plan open while deleting. A plan's library refs, `profileId` and per-leg regime bindings SHALL be left in place and become unresolved while the item is trashed or once it is purged.

#### Scenario: The open plan keeps its profile and bindings
- **WHEN** a signed-in user deletes the profile the open plan flies, with 12 legs bound to its regimes
- **THEN** the plan's `profileId` and the 12 legs' regime bindings are unchanged, and the legs compute as Manual while the profile is trashed

#### Scenario: The open plan keeps its library ref
- **WHEN** a signed-in user deletes a library entry the open plan references
- **THEN** the plan still holds the ref, shown as a placeholder

#### Scenario: Restoring heals every plan
- **WHEN** the owner restores a profile that three plans fly, none of them edited meanwhile
- **THEN** all three plans fly the profile again with their legs bound to the same regimes as before

---

### Requirement: Deletion confirmation states how many plans reference the item

Deleting a library entry or profile SHALL require confirmation. While connected, the confirmation SHALL state how many live plans in the space reference the item (library ref or `profileId`), counted at the moment of deletion, and that those plans keep the reference and can be repaired by restoring it. It SHALL NOT block the deletion. While disconnected, it SHALL state that other plans could not be checked.

#### Scenario: Entry used by several plans
- **WHEN** a signed-in, connected user deletes a library entry referenced by 3 live plans
- **THEN** the confirmation states it is used by 3 plans, and confirming moves it to the Trash

#### Scenario: Unreferenced item
- **WHEN** a signed-in, connected user deletes a profile no live plan flies
- **THEN** the confirmation states that no plan uses it

#### Scenario: Trashed plans are not counted
- **WHEN** a profile is flown by one live plan and one trashed plan
- **THEN** the confirmation states it is flown by 1 plan

#### Scenario: Disconnected deletion cannot count
- **WHEN** a signed-in user deletes a library entry while disconnected
- **THEN** the confirmation states that other plans could not be checked, and confirming deletes the entry

---

### Requirement: Plan deletion is confirmed

Deleting a plan SHALL require a confirmation naming the plan and stating that it moves to the Trash and can be restored for the retention period. Plan deletion requires a connection.

#### Scenario: Confirm a plan deletion
- **WHEN** a signed-in user chooses Delete on a plan
- **THEN** a confirmation names the plan and states it can be restored from the Trash for 30 days; the plan is deleted only on confirm

#### Scenario: Cancel keeps the plan
- **WHEN** the user cancels the confirmation
- **THEN** the plan remains in the list unchanged

---

### Requirement: Trashed items are purged after the retention period

A trashed item SHALL be purged 30 days after it was deleted. A purged item SHALL leave the Trash and SHALL NOT be restorable. References to a purged library entry or profile SHALL stay unresolved, and a purged plan's address SHALL not resolve.

#### Scenario: Item purged after 30 days
- **WHEN** a trashed profile was deleted more than 30 days ago
- **THEN** it is no longer listed in the Trash and cannot be restored

#### Scenario: Item within retention is kept
- **WHEN** a trashed plan was deleted 29 days ago
- **THEN** it is still listed in the Trash and can be restored
