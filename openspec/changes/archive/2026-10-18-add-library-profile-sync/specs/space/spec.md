# Spec Delta

## ADDED Requirements

### Requirement: The Personal space holds a flat collection of performance profiles

A signed-in user's Personal space SHALL hold the user's performance profiles as a single flat collection, with no grouping or nesting. Every signed-in profile belongs to exactly one space (AD-1, AD-2). The collection MAY be empty. The **anonymous** tier has no space and holds its single profile on the device.

#### Scenario: Profiles belong to the space
- **WHEN** a signed-in user creates a profile on one device
- **THEN** it is part of their Personal space's profile collection and is visible from their other devices

#### Scenario: A new space has no profiles
- **WHEN** a signed-in user's Personal space is first materialized
- **THEN** its profile collection is empty

#### Scenario: Anonymous profile belongs to no space
- **WHEN** an anonymous user edits their profile
- **THEN** the profile is held on the device and is not part of any space

---

### Requirement: The Personal space holds exactly one library per theatre

A signed-in user's Personal space SHALL hold at most one theatre library per theatre, created the first time an entry is stored for that theatre. Every signed-in library entry belongs to exactly one library of one space. A theatre with no library SHALL be presented as an empty library. The **anonymous** tier holds one device-local library per theatre.

#### Scenario: Entries for one theatre share a library
- **WHEN** a signed-in user adds entries for the same theatre from two different plans
- **THEN** both entries are in the same library of their Personal space

#### Scenario: A theatre without a library reads as empty
- **WHEN** a signed-in user opens the theatre library for a theatre they have never added entries to
- **THEN** an empty library is shown and no error is reported

#### Scenario: Anonymous library is per theatre on the device
- **WHEN** an anonymous user adds library entries for a theatre
- **THEN** they are held in that theatre's device-local library

---

### Requirement: The library shown is the active space's library for the active plan's theatre

Space-scoped library surfaces SHALL show the active space's library for the theatre of the active plan or draft. Switching to a plan on a different theatre SHALL switch to that theatre's library; switching to a plan on the same theatre SHALL leave the library unchanged. The performance profiles shown SHALL be the active space's collection, whatever the active plan's theatre.

#### Scenario: Switching theatre switches the library
- **WHEN** a signed-in user switches from a plan on one theatre to a plan on another
- **THEN** the library shown is the space's library for the second theatre

#### Scenario: Profiles are independent of theatre
- **WHEN** a signed-in user switches between plans on different theatres
- **THEN** the same profile collection is offered on both
