# Spec Delta

## MODIFIED Requirements

### Requirement: Profile deletion (signed-in only)
In the **signed-in** tier, any profile MAY be deleted, including one that plans fly. Deletion SHALL require a confirmation naming the profile by its label and stating how many plans fly it, as defined by `soft-delete`. On confirm, the profile moves to the Trash. Deletion SHALL NOT modify any plan: every plan that flies it, including the current one, keeps its `profileId` and its legs' `regimeId` values, resolves to the null profile while the profile is trashed or purged, and computes its bound legs as Manual (see `performance-regime`). The collection MAY be empty after deletion.

In the **anonymous** tier, deletion SHALL NOT be offered — there is exactly one profile.

#### Scenario: Delete unreferenced profile (signed-in)
- **WHEN** a signed-in user deletes a profile that no plan flies
- **THEN** the profile moves to the Trash and leaves the profile list; no plan is affected

#### Scenario: Delete referenced profile with bound legs requires confirmation (signed-in)
- **WHEN** a signed-in user deletes the profile the current plan flies, with 12 legs bound to its regimes, and confirms
- **THEN** the confirmation states how many plans fly the profile; on confirm the profile moves to the Trash, the plan keeps its `profileId` and the 12 legs keep their `regimeId`, and the plan computes from the null profile with those legs as Manual

#### Scenario: Delete referenced profile with no bound legs (signed-in)
- **WHEN** a signed-in user deletes the profile the current plan flies and no legs are bound
- **THEN** the profile moves to the Trash, the plan keeps its `profileId`, and it resolves to the null profile

#### Scenario: Restoring the flown profile restores the plan's performance (signed-in)
- **WHEN** the profile deleted in the previous scenario is restored from the Trash, the plan having not been edited meanwhile
- **THEN** the plan flies the profile again and the 12 legs compute from their regimes, with no edit to the plan

#### Scenario: Delete last profile leaves collection empty (signed-in)
- **WHEN** a signed-in user deletes the only profile in the collection
- **THEN** the collection is empty and the plan resolves to the null profile

#### Scenario: Another plan flying the deleted profile falls back (signed-in)
- **WHEN** a signed-in user deletes a profile, then opens a different plan whose `profileId` referenced it
- **THEN** that plan resolves to the null profile and its bound legs compute as Manual, and its `profileId` and `regimeId` values are not changed by opening it

#### Scenario: Anonymous user has no deletion control
- **WHEN** an anonymous user views the Performance page
- **THEN** no profile deletion control is visible

## ADDED Requirements

### Requirement: A plan whose profile is deleted says so (signed-in only)
In the **signed-in** tier, when a plan's `profileId` is set but does not resolve because the profile is trashed or purged, the plan's profile chooser SHALL state that the plan's profile was deleted instead of naming a profile, and SHALL offer choosing another profile. When the profile is trashed rather than purged, it SHALL also say it can be restored from the Trash. While the device is still syncing or disconnected, an unresolved `profileId` SHALL NOT be presented as deleted.

#### Scenario: Plan flying a trashed profile (signed-in)
- **WHEN** a signed-in user opens a plan whose profile is in the Trash
- **THEN** the profile chooser states the plan's profile was deleted and can be restored from the Trash, and offers choosing another profile

#### Scenario: Plan flying a purged profile (signed-in)
- **WHEN** a signed-in user opens a plan whose profile was purged
- **THEN** the profile chooser states the plan's profile was deleted, without offering restore, and offers choosing another profile

#### Scenario: Choosing another profile keeps the orphan bindings (signed-in)
- **WHEN** the user chooses another profile for that plan
- **THEN** the switch follows *Profile switching resets legs to Manual*: orphan `regimeId` values are left unchanged

#### Scenario: Not yet synced is not deleted (signed-in)
- **WHEN** a signed-in user opens a plan on a device that has not yet received its profile
- **THEN** the chooser does not state that the profile was deleted
