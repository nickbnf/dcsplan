# Spec: Space

## Purpose

Defines the space as the unit of ownership for a signed-in user's flight plans (AD-1): the Personal space and its membership, the plan collection it holds, which plan is active, unique plan naming, and how plan-scoped and space-scoped surfaces relate to the active-plan selection (AD-15). The anonymous tier is space-less and holds a single local plan (AD-9).

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

A signed-in user SHALL be able to view the list of flight plans held in their Personal space, each identified by name and theatre. The **anonymous** tier holds a single local plan and presents no plan list.

#### Scenario: Signed-in user views the plan list
- **WHEN** a signed-in user opens the plan list
- **THEN** every plan in their Personal space is shown with its name and theatre

#### Scenario: Anonymous user has a single plan and no list
- **WHEN** an anonymous user uses the app
- **THEN** there is exactly one plan and no plan list is presented

---

### Requirement: The user selects the active plan and the selection persists on the device

A signed-in user SHALL be able to select which plan in the space is active. The selection SHALL persist on the device across reloads. If the selected plan no longer resolves — removed on another device, or not in the space — the app SHALL fall back to the plan list rather than report an error. In the **anonymous** tier the single plan is always the active plan.

#### Scenario: Selecting a plan makes it active
- **WHEN** a signed-in user selects a plan from the list
- **THEN** that plan becomes the active plan and the plan-scoped surfaces operate on it

#### Scenario: The active plan is restored on reload
- **WHEN** a signed-in user reloads the app
- **THEN** the plan that was active before the reload is active again

#### Scenario: An unresolvable selection falls back to the list
- **WHEN** the active plan can no longer be resolved on load
- **THEN** the app shows the plan list instead of an error, and no plan is active until one is chosen

#### Scenario: Anonymous single plan is always active
- **WHEN** an anonymous user uses the app
- **THEN** the single local plan is the active plan with no selection step

---

### Requirement: Plan names are unique within a space

Naming or renaming a plan SHALL be rejected when the name, compared trimmed and exactly, collides with another plan in the same space. The user SHALL be informed and the colliding name SHALL NOT be applied. A name unique within the space SHALL be accepted. (The **anonymous** tier holds a single plan, so no collision is possible.)

#### Scenario: Renaming to a unique name succeeds
- **WHEN** a signed-in user renames a plan to a name no other plan in the space uses
- **THEN** the rename is applied

#### Scenario: Renaming to a colliding name is rejected
- **WHEN** a signed-in user renames a plan to a name another plan in the same space already uses
- **THEN** the rename is rejected, the user is informed the name must be unique, and the plan keeps its previous name

---

### Requirement: Plan-scoped surfaces follow the active plan; space-scoped surfaces do not

Plan-scoped surfaces (navigation, attack planning, and a plan's performance assignment and per-leg regime bindings) SHALL operate on the active plan. Space-scoped surfaces (the theatre library and the performance profiles) SHALL NOT change when the active plan changes, and SHALL be reached through an active plan or draft context.

#### Scenario: Switching the active plan changes only plan-scoped surfaces
- **WHEN** a signed-in user switches from one active plan to another on the same theatre
- **THEN** the navigation and attack surfaces reflect the newly active plan, and the theatre library is unchanged

#### Scenario: No active plan directs the user to choose or create one
- **WHEN** a signed-in user has no active plan or draft
- **THEN** the app directs them to select or create a plan, and does not present an empty editing surface
