# Spec Delta

## MODIFIED Requirements

### Requirement: Performance import is tier-branched
In the **anonymous** tier, importing a `.perf.json` file SHALL **replace** the single profile's aircraft data — the current behaviour. A `name` in the file SHALL be ignored.

In the **signed-in** tier, importing a `.perf.json` file SHALL **add** a new profile to the collection with a new id. It SHALL NOT replace any existing profile.

A flight-plan file's embedded profile is imported only when it is selected in the plan import chooser (`plan-import`).

#### Scenario: Anonymous import replaces
- **WHEN** an anonymous user imports a `.perf.json` file
- **THEN** the single profile's aircraft data is replaced with the imported data

#### Scenario: Signed-in import adds without replacing
- **WHEN** a signed-in user imports a `.perf.json` file while two profiles already exist
- **THEN** the collection grows from 2 to 3 profiles; the two existing profiles are unchanged

#### Scenario: Signed-in plan import with embedded performance snapshot
- **WHEN** a signed-in user imports a flight plan, with its profile selected, that carries a `performanceSnapshot` whose recorded profile id is absent or not in the collection
- **THEN** the snapshot is added as a new profile and the plan's `profileId` points at it

#### Scenario: Signed-in plan import with matching snapshot id reuses existing
- **WHEN** a signed-in user imports a flight plan whose recorded profile id (`performanceProfile.id`) matches a profile already in the collection
- **THEN** no profile is added; the plan's `profileId` is set to the existing profile's id, whether or not the profile is selected in the chooser

#### Scenario: Signed-in plan import with the profile deselected
- **WHEN** a signed-in user imports a flight plan with its profile deselected, and its recorded profile id is absent or not in the collection
- **THEN** no profile is added and the plan resolves to the null profile

---

### Requirement: Sign-in adoption
When a user signs in, the single local profile SHALL be adopted into the user's space when it is part of the local data imported (`local-data-migration`). This is silent for an empty account, and through the chooser otherwise. The adopted profile SHALL be added as a new profile with a new `id`. It is additive and never replaces. If the local plan is imported with it, the plan's `profileId` SHALL point at it. Once adopted, the local profile SHALL be reset to the default.

#### Scenario: Anonymous profile is adopted with a server-assigned id
- **WHEN** a user signs in and their local profile is imported
- **THEN** the local profile is uploaded to the server and given an `id`; if the local plan is imported too, its `profileId` is set to that id

#### Scenario: Profile is adopted into an empty account
- **WHEN** a user whose local profile differs from the default signs in to an empty account
- **THEN** the profile is added to the space with a new `id`, and the imported plan's `profileId` is set to that id

#### Scenario: Adoption into a space with existing profiles is additive
- **WHEN** a user signs in to a space that already has profiles and imports their local profile through the chooser
- **THEN** the adopted profile is added alongside the existing profiles; no existing profile is replaced

#### Scenario: Profile not chosen is not adopted
- **WHEN** a user deselects the profile in the sign-in chooser, or chooses Not now
- **THEN** no profile is added to the space and the local profile is unchanged

#### Scenario: Adopted profile leaves the device
- **WHEN** the server has accepted the adopted profile
- **THEN** the device's local profile is reset to the default profile
