# Spec: Plan Sync

## Purpose

Defines how a flight plan's working copy persists and propagates: continuous server autosave for signed-in plans (AD-5), synchronization across a user's devices with conflict-free merge (AD-6), behaviour while disconnected (the connectivity axis), local caching of opened plans, and what survives logout. The anonymous tier is permanently local-only (AD-9).

## Requirements

### Requirement: A signed-in plan's working copy is continuously persisted to the server

For a signed-in user, the active plan's working copy SHALL be continuously persisted to the server as it is edited, with no explicit save action. This persistence SHALL NOT create a finalized version (AD-5). In the **anonymous** tier the plan is persisted only on the device and never sent to the server.

#### Scenario: Signed-in edits persist to the server
- **WHEN** a signed-in, connected user edits the active plan
- **THEN** the change is persisted to the server without an explicit save, and is present when the plan is opened again

#### Scenario: Server persistence creates no version
- **WHEN** a signed-in user's edits are persisted to the server
- **THEN** no finalized version is created by that persistence

#### Scenario: Anonymous plan persists only locally
- **WHEN** an anonymous user edits their plan
- **THEN** the change is persisted on the device only and nothing is sent to the server

---

### Requirement: A signed-in plan synchronizes across the user's devices

A signed-in plan SHALL synchronize across the user's devices: a change made on one device SHALL appear on another. Concurrent edits SHALL merge without losing either edit; two edits to different parts of the plan SHALL both survive, and two edits to the same field SHALL resolve deterministically without corrupting the plan. The **anonymous** tier does not synchronize.

#### Scenario: A change on one device appears on another
- **WHEN** a signed-in user edits the active plan on one device while the same plan is open on a second device
- **THEN** the change appears on the second device

#### Scenario: Concurrent edits to different parts both survive
- **WHEN** two edits are made concurrently to different waypoints of the same plan
- **THEN** both edits are present after the plan converges

#### Scenario: Concurrent edits to the same field do not corrupt the plan
- **WHEN** two edits are made concurrently to the same field of the same waypoint
- **THEN** the plan converges to one of the two values and remains valid, with no corruption

#### Scenario: Anonymous plan does not synchronize
- **WHEN** an anonymous user edits their plan
- **THEN** nothing is synchronized to any server or other device

---

### Requirement: A signed-in user can keep editing while disconnected

A signed-in but disconnected user SHALL be able to keep editing the active plan against its local copy. On reconnection, local edits SHALL converge with the server, merging any edits made elsewhere in the meantime. Being signed in but disconnected is distinct from the anonymous tier: the user still has their space and plans.

#### Scenario: Editing continues while disconnected
- **WHEN** a signed-in user loses connectivity and edits the active plan
- **THEN** the edits are retained locally and the user can continue working

#### Scenario: Edits converge on reconnection
- **WHEN** connectivity returns after a signed-in user edited the active plan offline
- **THEN** the local edits converge with the server, and any edits made elsewhere while offline are merged in

#### Scenario: Disconnected is not anonymous
- **WHEN** a signed-in user is disconnected
- **THEN** they still have their space and the plans in it, rather than being treated as an anonymous single-plan user

---

### Requirement: Previously opened plans remain available locally and reopen with a syncing state

Plans the signed-in user has opened before SHALL remain available on the device without a network round-trip, including while disconnected. On reopening a plan, the app SHALL load the local copy and indicate that it is syncing until the server copy has synced, rather than presenting the local copy as authoritative.

#### Scenario: Reopening a cached plan works offline
- **WHEN** a signed-in but disconnected user reopens a plan they had opened before
- **THEN** the plan loads from the local copy and is editable

#### Scenario: Reopening a plan edited elsewhere shows syncing then merges
- **WHEN** a signed-in user reopens a plan that was edited on another device since they last had it open
- **THEN** the app shows a syncing state and then reflects the merged, up-to-date plan

---

### Requirement: Logout clears synced plan caches but preserves the anonymous local plan

On logout, the device's cached copies of **synced** plans SHALL be cleared, because the server retains those copies. The anonymous, local-only plan SHALL be preserved, as it may be the user's only copy. (Full device wipe is out of scope, AD-8.)

#### Scenario: Synced plans are cleared on logout
- **WHEN** a signed-in user logs out
- **THEN** the device no longer holds cached copies of their synced plans

#### Scenario: The anonymous local plan survives logout
- **WHEN** a signed-in user logs out
- **THEN** the local-only anonymous plan on the device is preserved
