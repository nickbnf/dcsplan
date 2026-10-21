# Spec Delta

## MODIFIED Requirements

### Requirement: Profile deletion (signed-in only)
In the **signed-in** tier, any profile MAY be deleted, including one that plans fly. Deletion SHALL require a confirmation naming the profile by its label and stating how many plans fly it (`soft-delete`). On confirm, the profile moves to the Trash, and the collection MAY be empty afterwards. What happens to the plans that fly it is defined by *Deleting a profile never modifies a plan*. In the **anonymous** tier, deletion SHALL NOT be offered — there is exactly one profile.

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

### Requirement: Deleting a profile never modifies a plan (signed-in only)
In the **signed-in** tier, deleting a profile SHALL NOT modify any plan, the current one included. Every plan that flies it keeps its `profileId` and its legs' `regimeId` values, resolves to the null profile while the profile is trashed or purged, and computes its bound legs as Manual (see `performance-regime`).

#### Scenario: Bindings survive the purge (signed-in)
- **WHEN** a profile flown by a plan with bound legs is deleted and later purged from the Trash
- **THEN** the plan still holds its `profileId` and every `regimeId`, resolves to the null profile, and computes those legs as Manual

#### Scenario: Several plans keep the profile (signed-in)
- **WHEN** a signed-in user deletes a profile that three plans fly
- **THEN** none of the three plans is modified, and each resolves to the null profile until the profile is restored
