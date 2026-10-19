# local-data-migration Specification

## Purpose
Bringing the work a user did without an account on this device into their account: when it is offered, which parts are taken, how they merge into the Personal space without overwriting anything (AD-8), and what is left on the device afterwards.

## Requirements

### Requirement: Local data is defined per item

The device's **local data** SHALL be the anonymous tier's data, made of up to three items:
- the **plan**, when it differs from a freshly created plan;
- the **library**, when any theatre's device-local library holds at least one entry;
- the **profile**, when it differs from the default profile.

An item that does not meet its condition SHALL NOT be offered.

#### Scenario: A fresh device has no local data
- **WHEN** a device holds only a fresh plan, empty libraries and the default profile
- **THEN** it has no local data and nothing is offered for import

#### Scenario: Only the changed items are offered
- **WHEN** a device holds an edited plan, empty libraries and the default profile
- **THEN** only the plan is offered for import

---

### Requirement: An empty account imports local data silently on sign-in

When a user signs in and their Personal space holds no plans, no library entries and no profiles, every local data item SHALL be imported without asking or reporting. When the plan is imported, it SHALL open as the active plan, so the user carries on with the plan they had. If the space's contents cannot be determined, the account SHALL be treated as not empty.

#### Scenario: First sign-in on a device with local work
- **WHEN** a user with an edited local plan, a local library and a changed profile signs in to an empty account
- **THEN** all three are imported into the Personal space with no prompt or notice, and the imported plan is open

#### Scenario: Unknown account contents are not treated as empty
- **WHEN** a user signs in and the space's contents cannot be read
- **THEN** no silent import happens; the user is offered the chooser instead

---

### Requirement: An account with data offers a chooser on sign-in

When a user signs in to a Personal space that holds any plan, library entry or profile, and the device has local data, the app SHALL offer a chooser. It lists each local data item, all selected by default, and offers *Import* and *Not now*. *Not now* SHALL change nothing, and the local data SHALL stay on the device.

#### Scenario: Chooser on sign-in to an existing account
- **WHEN** a user with local data signs in to an account that already holds plans
- **THEN** a chooser lists the local plan, library and profile that apply, all selected

#### Scenario: Not now keeps everything local
- **WHEN** the user chooses Not now
- **THEN** nothing is added to the account and the device's local data is unchanged

#### Scenario: Second device prompts too
- **WHEN** a user already signed in on one device signs in on a second device that has its own local work
- **THEN** the second device offers the chooser

---

### Requirement: Local data can be imported later from the plans list

While a signed-in user's device holds local data, `/plans` SHALL offer *Import local data from this device*, opening the same chooser. The offer SHALL disappear once no local data remains. This covers users who chose *Not now* and users who signed in before this capability existed.

#### Scenario: Declined data can be imported later
- **WHEN** a user chose Not now at sign-in and later opens `/plans`
- **THEN** *Import local data from this device* is offered and opens the chooser

#### Scenario: Offer disappears once nothing is left
- **WHEN** every local data item has been imported
- **THEN** `/plans` no longer offers *Import local data from this device*

---

### Requirement: Imported local data merges additively

Importing local data SHALL never overwrite or remove anything in the account (AD-8):
- the plan SHALL be added as a new plan with a newly generated id, its name and theatre unchanged, listed in the space at once;
- library entries SHALL merge into the space's library of their theatre by UUID; an entry the space already holds SHALL be kept unchanged;
- the profile SHALL be added as a new profile.

#### Scenario: Plan is appended
- **WHEN** a user imports their local plan into a space holding two plans
- **THEN** the space holds three plans and the two existing plans are unchanged

#### Scenario: Library entries merge per theatre
- **WHEN** a user imports a local library holding Caucasus and Syria entries
- **THEN** each entry lands in the space's library for its own theatre

#### Scenario: Existing entry is kept, and the user is told
- **WHEN** an imported entry's UUID is already in the space's library with different fields
- **THEN** the space's copy is kept unchanged, and the chooser has stated beforehand how many entries differ and that the library's version is kept

#### Scenario: Duplicate plans across devices are accepted
- **WHEN** the same local plan is imported from two devices
- **THEN** the space holds two plans; no content-level deduplication is done

---

### Requirement: The imported plan keeps its library refs and profile together

When the plan and the profile are both imported, the plan's `profileId` SHALL point at the profile added for it. When the profile is not imported, the plan SHALL resolve to the null profile. Its plan-local markers SHALL travel with it. Refs to entries that neither the import nor the space provides SHALL show as unresolved (`map-objects`).

#### Scenario: Plan flies the imported profile
- **WHEN** a user imports both the local plan and the local profile
- **THEN** the imported plan's `profileId` points at the newly added profile

#### Scenario: Plan without its profile
- **WHEN** a user imports the local plan but not the local profile
- **THEN** the imported plan resolves to the null profile

#### Scenario: Markers travel with the plan
- **WHEN** a local plan with plan-local markers is imported
- **THEN** the imported plan carries the same markers

---

### Requirement: Import moves local data off the device

Once the server has accepted an imported item, the item SHALL be removed from the device's anonymous data:
- the anonymous plan is replaced by a fresh plan;
- the imported library entries leave the device-local library;
- the local profile is reset to the default.

Items that were not imported SHALL stay on the device unchanged.

#### Scenario: Imported items leave the device
- **WHEN** a user imports the local plan and library but not the profile
- **THEN** the device's anonymous plan is fresh, its local libraries are empty, and its local profile is unchanged

#### Scenario: Local duplicates of entries the account holds leave the device
- **WHEN** every local library entry is already in the space's library
- **THEN** the chooser offers no way to keep them, and once the import is accepted they are removed from the device-local library

#### Scenario: Nothing is removed before the server accepts it
- **WHEN** an imported item has not yet been accepted by the server
- **THEN** it is still present in the device's anonymous data

---

### Requirement: A failed import keeps the local data

If an import cannot complete, for example because the device loses its connection, items the server did not accept SHALL stay on the device, and the user SHALL be told that they were not imported. The import SHALL be retryable from `/plans`. A retry SHALL NOT duplicate items the server already accepted.

#### Scenario: Connection lost during import
- **WHEN** the connection drops after the library was accepted but before the plan was
- **THEN** the library has left the device, the plan is still local, and the user is told the plan was not imported

#### Scenario: Retry imports only what remains
- **WHEN** the user retries from `/plans`
- **THEN** only the remaining local items are offered and imported

---

### Requirement: Local data is not shown while signed in

In the **signed-in** tier, the device's anonymous data SHALL NOT be shown or edited, except through the import chooser. In the **anonymous** tier it is the user's working data, as before. After logout, the anonymous tier SHALL show whatever local data remains, which is a fresh plan and default profile for any item that was imported.

#### Scenario: Signed-in user sees only the space
- **WHEN** a signed-in user with un-imported local data opens the library
- **THEN** the space's library is shown, not the device-local one

#### Scenario: After logout, remaining local data is back
- **WHEN** a user who imported only their plan logs out
- **THEN** the anonymous tier shows a fresh plan, and the local library and profile they did not import
