# Spec Delta

## Purpose

Defines how a flight plan is addressed in the app: a short, stable id per plan, the `/p/:id/:slug` address and the plan-scoped tabs under it, id-only resolution with a cosmetic slug that follows the plan's name, and what happens when an address does not resolve. One scheme serves both tiers; the anonymous plan uses the reserved id `local`.

## ADDED Requirements

### Requirement: Each plan has a short, stable id

Every plan SHALL have an id of 12 characters drawn from a base58 alphabet, generated on the device when the plan is created, and never changed afterwards (including on rename). Ids SHALL be random enough to be unguessable. The **anonymous** tier's single plan SHALL use the reserved id `local`, which is never generated for other plans.

#### Scenario: A new signed-in plan gets a short id
- **WHEN** a signed-in user creates a plan
- **THEN** the plan receives a 12-character id, available immediately, before the plan has any waypoint

#### Scenario: Renaming keeps the id
- **WHEN** a plan is renamed
- **THEN** its id is unchanged

#### Scenario: The anonymous plan uses the reserved id
- **WHEN** an anonymous user uses the app
- **THEN** their single plan's id is `local`

---

### Requirement: A plan and its plan-scoped tabs are addressed under /p/:id/:slug

A plan's navigation view SHALL be addressed as `/p/:id/:slug`, its performance view as `/p/:id/:slug/perf`, and its attack view as `/p/:id/:slug/attack`. The slug SHALL be derived from the plan's name (lowercase, hyphen-separated, `plan` when the name yields no characters). The theatre library (`/library`) and the Flight Plans home (`/plans`) SHALL NOT be under a plan's address. This applies to **both tiers**.

#### Scenario: Opening a plan shows its navigation address
- **WHEN** a user opens a plan named "Ingress Alpha" with id `k7Hq2mXv9B3n`
- **THEN** the address is `/p/k7Hq2mXv9B3n/ingress-alpha`

#### Scenario: Plan-scoped tabs stay under the plan's address
- **WHEN** the user switches to the performance or attack tab
- **THEN** the address becomes `…/perf` or `…/attack` under the same `/p/:id/:slug`

#### Scenario: A slug that matches a tab name is not confused with the tab
- **WHEN** a plan is named "perf"
- **THEN** its navigation view is `/p/:id/perf` and its performance view is `/p/:id/perf/perf`

#### Scenario: Anonymous plan uses the same scheme
- **WHEN** an anonymous user opens their plan
- **THEN** it is addressed as `/p/local/:slug`

---

### Requirement: An address resolves by id and its slug is corrected in place

The app SHALL resolve a plan address by its id alone. When the slug in the address does not match the plan's current name, including a missing or outdated slug, the app SHALL replace the address with the current slug without reloading the view and without adding a browser history entry.

#### Scenario: An outdated slug still opens the plan
- **WHEN** a user opens `/p/:id/old-name` for a plan now named "New Name"
- **THEN** the plan opens and the address becomes `/p/:id/new-name`

#### Scenario: A missing slug is filled in
- **WHEN** a user opens `/p/:id`
- **THEN** the plan opens at `/p/:id/:slug`

#### Scenario: Renaming updates the address without reloading
- **WHEN** a user renames the open plan in the editor
- **THEN** the address's slug updates, the editor is not reloaded, and in-progress editing state such as the active map tool is kept

#### Scenario: A rename from another device updates the address
- **WHEN** the open plan is renamed on another device and the change syncs
- **THEN** the address's slug updates in place

#### Scenario: A rename adds no history entry
- **WHEN** a user renames the open plan and then goes back in the browser
- **THEN** the browser returns to the page before the plan was opened, not to the old slug

---

### Requirement: An unresolvable address falls back by tier

When a plan address does not resolve, the app SHALL NOT show an error. A **signed-in** user SHALL be taken to the Flight Plans home when the id is not a plan in their space nor their current draft (including `local`). An **anonymous** user SHALL be taken to their local plan when the id is not `local`. A signed-in user's address SHALL NOT be judged unresolved before their plan list has loaded.

#### Scenario: Signed-in user opens an unknown plan
- **WHEN** a signed-in user opens `/p/:id/…` for an id that is not in their space
- **THEN** they are taken to the Flight Plans home

#### Scenario: Signed-in user opens the anonymous address
- **WHEN** a signed-in user opens `/p/local/…`
- **THEN** they are taken to the Flight Plans home

#### Scenario: Anonymous user opens a signed-in plan's address
- **WHEN** an anonymous user opens `/p/:id/…` for an id other than `local`
- **THEN** they are taken to their local plan's address

#### Scenario: Resolution waits for the plan list
- **WHEN** a signed-in user opens a valid plan address while their plan list is still loading
- **THEN** the app shows a loading state and then opens the plan, without passing through the Flight Plans home

---

### Requirement: Legacy flat routes redirect to the plan's address

The routes `/`, `/performance`, and `/attack` SHALL redirect to the corresponding view of the active plan's address. When a **signed-in** user has no plan to open, they SHALL be taken to the Flight Plans home. An **anonymous** user always has their local plan.

#### Scenario: Root redirects to the active plan
- **WHEN** a user opens `/` with an active plan
- **THEN** they are taken to that plan's `/p/:id/:slug`

#### Scenario: Legacy tab routes redirect to the plan's tab
- **WHEN** a user opens `/performance` or `/attack`
- **THEN** they are taken to `…/perf` or `…/attack` under the active plan's address

#### Scenario: Signed-in user with no plan lands on Home
- **WHEN** a signed-in user with no plan to open opens `/`
- **THEN** they are taken to the Flight Plans home
