# Spec Delta

## MODIFIED Requirements

### Requirement: Theatre-scoped library persistence
The library SHALL be partitioned per theatre. In the **anonymous** tier it SHALL be persisted to localStorage using a per-theatre key namespace. In the **signed-in** tier it SHALL be the active space's library for that theatre, persisted and synchronized as defined by `space-asset-sync`. Loading a different theatre SHALL load that theatre's library; an absent library SHALL be treated as an empty library.

A theatre's library SHALL persist until the user deletes its entries deliberately. No other operation SHALL clear it — in particular, creating a flight plan on a different theatre SHALL leave the previous theatre's library untouched. (Logout clearing the signed-in tier's cached copy is not a deletion: the server copy is retained.)

Entries SHALL never be persisted under a theatre they were not loaded for. While the active theatre is changing, the system SHALL NOT write the outgoing theatre's entries into the incoming theatre's library, even transiently.

#### Scenario: Switching theatres loads the new library
- **WHEN** the user selects a different theatre with an existing library
- **THEN** the previously loaded library is replaced with the new theatre's library

#### Scenario: Empty library for new theatre
- **WHEN** the user switches to a theatre with no library entries persisted
- **THEN** the library is treated as empty (not as an error)

#### Scenario: Library survives reloads
- **WHEN** the user reloads the app while on a theatre with library entries
- **THEN** all entries reappear unchanged

#### Scenario: A theatre's library survives moving to another theatre and back
- **WHEN** the user builds a library on one theatre, creates a plan on a second theatre, and later returns to the first
- **THEN** the first theatre's entries are all present and unchanged

#### Scenario: Entries are not written under the wrong theatre
- **WHEN** the active theatre changes from one theatre to another
- **THEN** the incoming theatre's stored library is never overwritten with the outgoing theatre's entries, including at any intermediate point during the change

#### Scenario: A reload during a theatre change preserves both libraries
- **WHEN** the active theatre changes and the application is reloaded immediately afterwards
- **THEN** both theatres' stored libraries hold their own entries

#### Scenario: Anonymous library stays on the device
- **WHEN** an anonymous user adds entries to a theatre's library
- **THEN** they are stored on the device only

#### Scenario: Signed-in library is the space's library
- **WHEN** a signed-in user adds entries to a theatre's library on one device
- **THEN** the same entries appear in that theatre's library on their other devices

---

### Requirement: Library entry deletion with reference detection
The user SHALL be able to delete a library entry via a control on its card, requiring a confirmation dialog. If the current flight plan references the entry, the confirmation dialog SHALL state this explicitly, and confirming the deletion SHALL remove the reference from the plan as well.

In the **signed-in** tier, other plans in the space MAY also reference the entry. Their references SHALL be left in place and become unresolved, shown as a missing-object placeholder as defined by `map-objects`.

#### Scenario: Delete simple case
- **WHEN** the user clicks delete on a library entry not referenced by the current plan and confirms
- **THEN** the entry is removed from the library

#### Scenario: Delete with current-plan reference
- **WHEN** the user clicks delete on a library entry that the current plan references
- **THEN** the confirmation dialog states that the entry is referenced by the current plan, and confirming removes the entry from the library and the reference from the plan

#### Scenario: Cancel preserves entry
- **WHEN** the user clicks delete on a library entry and cancels the confirmation
- **THEN** the entry remains in the library

#### Scenario: Another plan's reference to a deleted entry is ignored (signed-in)
- **WHEN** a signed-in user deletes a library entry that another plan in the space references, then opens that plan
- **THEN** the plan opens normally, the deleted entry appears as a missing-object placeholder, and the plan's other objects are unaffected
