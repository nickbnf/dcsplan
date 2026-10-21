# space-asset-sync Specification

## Purpose
Defines how the space-owned theatre libraries and performance profiles persist and propagate for signed-in users: server persistence, last-write-wins sync per library entry and per profile across a user's devices (AD-6), offline editing, and what survives logout. The anonymous tier is permanently local-only.

## Requirements

### Requirement: Signed-in library and profiles persist to the server
For a signed-in user, every change to a library entry or a performance profile of the active space SHALL be persisted to the server with no explicit save action. In the **anonymous** tier, the library and the profile SHALL be persisted only on the device and SHALL never be sent to the server.

#### Scenario: Signed-in edit reaches the server
- **WHEN** a signed-in, connected user renames a library entry
- **THEN** the new name is stored on the server without the user pressing any save control

#### Scenario: Anonymous edit stays on the device
- **WHEN** an anonymous user adds a library entry or edits their profile
- **THEN** the change is stored on the device only and no request carrying it is sent to the server

---

### Requirement: Changes propagate across a signed-in user's devices
A change to a library entry or profile made on one of a signed-in user's devices SHALL appear on their other devices without a reload. The device SHALL pick up remote changes when the app loads, when it regains focus or connectivity, and periodically while open. The **anonymous** tier does not synchronize.

#### Scenario: Profile edit appears on a second device
- **WHEN** a signed-in user edits a regime of a profile on device A, and device B is open and connected
- **THEN** device B shows the edited regime without a reload

#### Scenario: Library entry created elsewhere appears on load
- **WHEN** a signed-in user adds a library entry on device A, then opens the app on device B
- **THEN** device B's library for that theatre contains the new entry

---

### Requirement: Concurrent edits resolve by last write per entry and per profile
The unit of conflict SHALL be one library entry or one profile. Edits to different entries or profiles SHALL never conflict. When two devices edit the same entry or profile, the later write SHALL win as a whole, and all devices SHALL converge to that value.

#### Scenario: Edits to different entries both survive
- **WHEN** device A moves library entry X and device B renames library entry Y at the same time
- **THEN** both devices end up with X moved and Y renamed

#### Scenario: Same entry edited on two devices
- **WHEN** device A sets entry X's name to "SA-10" and device B later sets X's range to 25 NM before seeing A's change
- **THEN** all devices converge to device B's version of X, and device A's rename is lost

#### Scenario: Same profile edited on two devices
- **WHEN** two devices edit different regimes of the same profile concurrently
- **THEN** all devices converge to the version of the whole profile written last

---

### Requirement: Deletions win over stale edits
A deleted library entry or profile SHALL stay deleted, whether it is in the Trash or purged. A device that edits it without having seen the deletion SHALL NOT bring it back, and SHALL converge to the deletion. Only restoring it from the Trash (`soft-delete`) or re-creating it SHALL bring it back.

#### Scenario: Offline edit of a deleted entry does not resurrect it
- **WHEN** device A deletes library entry X, and device B, offline and unaware, edits X then reconnects
- **THEN** X remains deleted on every device

#### Scenario: Offline edit of a trashed profile does not take it out of the Trash
- **WHEN** device A deletes profile P, and device B, offline and unaware, edits P then reconnects
- **THEN** P remains in the Trash, with the content it had when deleted

### Requirement: Creating an entry or profile never overwrites one the server holds
Creating a library entry or a profile whose id the server already holds as live SHALL NOT change the server's copy. The device SHALL adopt the server's copy instead. This holds when the device's local copy is behind the server, as when importing while disconnected or before the first sync completes. Creating an entry whose id was deleted SHALL restore it.

#### Scenario: Import on a device that is behind keeps the server copy
- **WHEN** a signed-in user, before their device has synced, imports a plan whose snapshot holds entry X, and the space's library already holds X with a different position
- **THEN** after syncing, X has the position held by the space's library on every device, and the imported plan shows X there

#### Scenario: Re-creating a deleted entry restores it
- **WHEN** a signed-in user imports a library or plan file holding an entry that was deleted from the space's library
- **THEN** the entry is restored with the file's data on every device

---

### Requirement: Signed-in but disconnected users keep editing
A signed-in but disconnected user SHALL be able to view and edit the active space's library entries and profiles against a local copy, including creating and deleting them. On reconnection, local changes SHALL be sent to the server and resolved by the last-write rule. This is not the anonymous tier: the user keeps their space's library and profiles.

#### Scenario: Create a profile while offline
- **WHEN** a signed-in user with no connection creates a profile and assigns it to the active plan
- **THEN** the plan flies the new profile immediately, and the profile reaches the server when the connection returns

#### Scenario: Offline edits converge on reconnect
- **WHEN** a signed-in user edits library entries offline, and another device edits other entries meanwhile
- **THEN** after reconnection both devices hold both sets of edits

---

### Requirement: Space library and profiles are available on the device
The library entries and profiles of a signed-in user's space, once loaded on a device, SHALL remain available there without a network round-trip, including while disconnected. On load, the app SHALL show the local copy and indicate that it is syncing until it has caught up with the server.

#### Scenario: Reopen offline
- **WHEN** a signed-in user who has used the app on this device opens it with no connection
- **THEN** the space's library and profiles are shown from the local copy, and the active plan resolves its profile and library references

#### Scenario: Syncing indicator on load
- **WHEN** a signed-in user opens the app while connected and the local copy is behind the server
- **THEN** a syncing indication is shown until the local copy has caught up

---

### Requirement: Logout clears the space's cached library and profiles
On logout, the device's cached copies of the space's library entries and profiles SHALL be cleared, because the server retains them. Changes not yet sent to the server SHALL be warned about before logout proceeds. The anonymous, device-local library and profile SHALL be preserved.

#### Scenario: Logout leaves no space data behind
- **WHEN** a signed-in user logs out with all changes sent
- **THEN** the space's library entries and profiles are no longer on the device, and the anonymous local library and profile are as they were

#### Scenario: Logout with unsent changes warns
- **WHEN** a signed-in user logs out while library or profile changes are still waiting to be sent
- **THEN** the user is warned that those changes will be lost before logout proceeds

---

### Requirement: Tiers keep separate libraries and profiles on the device
The signed-in tier's library and profiles SHALL be held separately from the anonymous tier's on the device. Signing in SHALL NOT show, upload, or modify the anonymous library or profile, and signing out SHALL NOT merge the space's data into them. (Importing local data into the account is out of scope; see AD-8.)

#### Scenario: Signing in does not upload the local library
- **WHEN** an anonymous user with library entries signs in to an account whose space has none
- **THEN** the space's library is shown empty, and the anonymous entries remain on the device untouched

#### Scenario: Signing out restores the anonymous library
- **WHEN** a user signs out after editing the space's library
- **THEN** the anonymous library shown is the one held before signing in, without the space's entries

### Requirement: Restoring from the Trash propagates to every device
When a library entry or profile is restored from the Trash, it SHALL reappear on each of the user's devices without a reload, picked up like any other remote change, with the content it had when deleted. Whether a deleted entry or profile is still in the Trash or purged SHALL also reach every device, so placeholders and profile choosers can state it. The **anonymous** tier does not synchronize and has no Trash.

#### Scenario: Restored entry appears on a second device
- **WHEN** a signed-in user restores a library entry from the Trash on device A, and device B is open and connected
- **THEN** device B's library shows the entry again without a reload, and plans open on B resolve their refs to it

#### Scenario: Purge reaches every device
- **WHEN** a trashed profile is purged while device B is offline, and B later reconnects
- **THEN** B treats the profile as purged: plans flying it no longer offer restoring it from the Trash
