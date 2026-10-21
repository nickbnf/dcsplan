# Spec: Space

## Purpose

Defines the space as the unit of ownership for a signed-in user's flight plans, theatre libraries and performance profiles (AD-1): the Personal space and its membership, the plans it holds, its flat list of profiles and its one library per theatre (AD-17), which plan is active, and how plan-scoped and space-scoped surfaces relate to the active-plan selection (AD-15). How the libraries and profiles sync is in `space-asset-sync`. The anonymous tier is space-less and holds a single local plan, library and profile (AD-9).

## Requirements

### Requirement: Each account has exactly one Personal space

A signed-in account SHALL have exactly one Personal space, materialized on first access and resolved to the same space on every later access. Ownership is held through membership — the account is the Personal space's sole `owner` member (AD-1). The **anonymous** tier has no space.

#### Scenario: First access materializes the Personal space
- **WHEN** a signed-in user accesses their space for the first time
- **THEN** a Personal space is created with that user as its sole owner member

#### Scenario: Later access resolves the same space
- **WHEN** a signed-in user who already has a Personal space accesses it again, including from another device
- **THEN** the same Personal space is returned, and no second Personal space is created

#### Scenario: Anonymous tier has no space
- **WHEN** an anonymous user uses the app
- **THEN** no space exists and no space is required to edit the single local plan

---

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

### Requirement: Plan-scoped surfaces follow the active plan; space-scoped surfaces do not

Plan-scoped surfaces (navigation, attack planning, and a plan's performance assignment and per-leg regime bindings) SHALL operate on the active plan. Space-scoped surfaces (the theatre library and the performance profiles) SHALL NOT change when the active plan changes, and SHALL be reached through an active plan or draft context.

#### Scenario: Switching the active plan changes only plan-scoped surfaces
- **WHEN** a signed-in user switches from one active plan to another on the same theatre
- **THEN** the navigation and attack surfaces reflect the newly active plan, and the theatre library is unchanged

#### Scenario: No active plan directs the user to choose or create one
- **WHEN** a signed-in user has no active plan or draft
- **THEN** the app directs them to select or create a plan, and does not present an empty editing surface

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

### Requirement: The plan list is where plans and local data are imported

In the **signed-in** tier, the plan list (`/plans`) SHALL offer *Import plan file* (`plan-import`). While the device holds local data, it SHALL also offer *Import local data from this device* (`local-data-migration`). Both import into the active space. The **anonymous** tier has no plan list; its plan import stays in the plan's sidebar.

#### Scenario: Plan list offers file import
- **WHEN** a signed-in user opens `/plans`
- **THEN** *Import plan file* is offered

#### Scenario: Plan list offers local data import only when there is some
- **WHEN** a signed-in user opens `/plans` on a device that holds local data
- **THEN** *Import local data from this device* is offered as well; on a device with none, it is not

#### Scenario: Imported plan appears in the list
- **WHEN** a signed-in user imports a plan from `/plans`
- **THEN** the plan is listed in the Personal space with its name and theatre

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
