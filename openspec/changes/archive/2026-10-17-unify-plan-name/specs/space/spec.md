# Spec Delta

## MODIFIED Requirements

### Requirement: The Personal space holds the user's flight plans and the list is viewable

A signed-in user SHALL be able to view the list of flight plans held in their Personal space, each identified by name and theatre. Names in the list SHALL be read-only; a plan is renamed only from its editor. Selecting a plan in the list SHALL open it at its address. The **anonymous** tier holds a single local plan and presents no plan list.

#### Scenario: Signed-in user views the plan list
- **WHEN** a signed-in user opens the plan list
- **THEN** every plan in their Personal space is shown with its name and theatre

#### Scenario: The list offers no rename
- **WHEN** a signed-in user views the plan list
- **THEN** no control to rename a plan is offered there

#### Scenario: Selecting a plan opens its address
- **WHEN** a signed-in user selects a plan in the list
- **THEN** the plan opens at `/p/:id/:slug`

#### Scenario: Anonymous user has a single plan and no list
- **WHEN** an anonymous user uses the app
- **THEN** there is exactly one plan and no plan list is presented

---

### Requirement: The user selects the active plan and the selection persists on the device

The active plan SHALL be the plan addressed by the current `/p/:id/…` address. On surfaces outside a plan's address (such as the theatre library), the active plan SHALL be the plan last opened on the device. If the addressed or last-opened plan no longer resolves, the app SHALL fall back to the plan list rather than report an error. In the **anonymous** tier the single plan is always the active plan.

#### Scenario: Selecting a plan makes it active
- **WHEN** a signed-in user opens a plan's address
- **THEN** that plan becomes the active plan and the plan-scoped surfaces operate on it

#### Scenario: The active plan is restored on reload
- **WHEN** a signed-in user reloads the app on a plan's address
- **THEN** that plan is active again

#### Scenario: The last-opened plan backs space-scoped surfaces
- **WHEN** a signed-in user moves from a plan's address to the theatre library
- **THEN** the plan they last opened remains the active plan

#### Scenario: An unresolvable selection falls back to the list
- **WHEN** the active plan can no longer be resolved on load
- **THEN** the app shows the plan list instead of an error, and no plan is active until one is chosen

#### Scenario: Anonymous single plan is always active
- **WHEN** an anonymous user uses the app
- **THEN** the single local plan is the active plan with no selection step

## REMOVED Requirements

### Requirement: Plan names are unique within a space

**Reason**: The plan's name now lives only inside the plan's synced document, where concurrent or offline renames cannot be rejected after the fact, and plan addresses use the id rather than the name, so duplicate names no longer collide.

**Migration**: None for users. Duplicate names are allowed; plans are told apart by their address. A duplicate-name hint may be added later if duplicates prove confusing.
