## MODIFIED Requirements

### Requirement: Theatre-scoped library persistence
The library SHALL be partitioned per theatre and persisted to localStorage using a per-theatre key namespace. Loading a different theatre SHALL load that theatre's library; an absent key SHALL be treated as an empty library.

A theatre's library SHALL persist until the user deletes its entries deliberately. No other operation SHALL clear it — in particular, creating a flight plan on a different theatre SHALL leave the previous theatre's library untouched.

Entries SHALL never be persisted under a theatre they were not loaded for. While the active theatre is changing, the system SHALL NOT write the outgoing theatre's entries into the incoming theatre's key, even transiently.

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

## REMOVED Requirements

### Requirement: Theatre change confirmation mentions the library

**Reason:** The behaviour this requirement described — blanking the current theatre's library when the theatre changes — is being removed as data loss, and the operation it described no longer exists. A plan's theatre is fixed at creation (`plan-lifecycle`), so there is no theatre-switch confirmation left to word. The requirement also contradicted *Theatre-scoped library persistence* in the same spec, which states that a library is loaded and reloaded per theatre; both could not hold, and the destructive reading is the one being discarded.

**Migration:** No user or data migration is required; stored libraries keep their existing per-theatre keys and are simply no longer deleted. Where a user previously changed theatre to start over, the replacement is to create a new flight plan on the desired theatre, which leaves every library intact. Libraries destroyed by the previous behaviour cannot be recovered. The confirmation that survives is the one defined by `plan-lifecycle`, which refers only to the flight plan and is explicitly forbidden from claiming the library is affected.
