# Spec Delta

## MODIFIED Requirements

### Requirement: The Personal space holds the user's flight plans and the list is viewable

A signed-in user SHALL be able to view the list of flight plans held in their Personal space, each identified by name and theatre. Trashed plans SHALL NOT be listed (`soft-delete`). Names in the list SHALL be read-only; a plan is renamed only from its editor. Selecting a plan in the list SHALL open it at its address. The **anonymous** tier holds a single local plan and presents no plan list.

#### Scenario: Signed-in user views the plan list
- **WHEN** a signed-in user opens the plan list
- **THEN** every plan in their Personal space that is not trashed is shown with its name and theatre

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

The active plan SHALL be the plan addressed by the current `/p/:id/…` address. On surfaces outside a plan's address (such as the theatre library), the active plan SHALL be the plan last opened on the device. If the addressed or last-opened plan no longer resolves, including because it was trashed, the app SHALL fall back to the plan list rather than report an error. In the **anonymous** tier the single plan is always the active plan.

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

#### Scenario: A trashed plan's address falls back to the list
- **WHEN** a signed-in user opens the address of a plan that is in the Trash
- **THEN** the app shows the plan list instead of the plan

#### Scenario: Anonymous single plan is always active
- **WHEN** an anonymous user uses the app
- **THEN** the single local plan is the active plan with no selection step

## ADDED Requirements

### Requirement: The plan list offers plan deletion and the Trash

In the **signed-in** tier, the plan list SHALL offer *Delete* on each plan, which moves it to the Trash after confirmation (`soft-delete`), and SHALL offer a way to open the space's Trash. While disconnected, *Delete* SHALL be unavailable. The **anonymous** tier has no plan list, no plan deletion and no Trash; its single plan is replaced only by creating a new one (`plan-lifecycle`).

#### Scenario: Delete a plan from the list
- **WHEN** a signed-in, connected user chooses Delete on a plan in the list and confirms
- **THEN** the plan leaves the list and is in the Trash

#### Scenario: Deleting the last-opened plan
- **WHEN** a signed-in user deletes the plan that is the active plan on this device
- **THEN** no plan is active, and space-scoped surfaces direct the user to select or create a plan

#### Scenario: Trash is reachable from the list
- **WHEN** a signed-in user opens the plan list
- **THEN** a control opening the space's Trash is offered

#### Scenario: Delete is unavailable offline
- **WHEN** a signed-in user views the plan list while disconnected
- **THEN** Delete is not available on any plan

#### Scenario: Anonymous user cannot delete the plan
- **WHEN** an anonymous user uses the app
- **THEN** no plan deletion control and no Trash are offered
