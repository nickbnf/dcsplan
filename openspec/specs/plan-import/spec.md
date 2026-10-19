# plan-import Specification

## Purpose
Importing a flight-plan file into the app: where the import is offered in each tier, which parts of the file the user chooses to bring in, and whether the imported plan replaces the current plan or joins the space as a new one.

## Requirements

### Requirement: Plan import is offered where plans are managed in each tier

In the **anonymous** tier, plan import SHALL be offered from the plan's sidebar, which holds the single plan. In the **signed-in** tier, plan import SHALL be offered from the Flight Plans home (`/plans`), and SHALL NOT be offered from inside a plan.

#### Scenario: Anonymous user imports from the sidebar
- **WHEN** an anonymous user views the plan's sidebar
- **THEN** an Import control is offered there

#### Scenario: Signed-in user imports from the plans list
- **WHEN** a signed-in user opens `/plans`
- **THEN** an *Import plan file* control is offered there

#### Scenario: No import inside a signed-in plan
- **WHEN** a signed-in user has a plan open at `/p/:id/:slug`
- **THEN** the plan's sidebar offers no plan import control

---

### Requirement: Plan export is a secondary control in the signed-in tier

In the **signed-in** tier, exporting the open plan SHALL remain available from the plan, but as a secondary control rather than a primary sidebar button. In the **anonymous** tier, Export SHALL remain a primary sidebar button.

#### Scenario: Signed-in export is still reachable
- **WHEN** a signed-in user has a plan open
- **THEN** they can export it to a file without leaving the plan, through a secondary control

#### Scenario: Anonymous export is unchanged
- **WHEN** an anonymous user views the plan's sidebar
- **THEN** Export is offered as a primary button, as before

---

### Requirement: The import chooser lists what the file holds

Before anything is changed, the import SHALL show a chooser with one item per part of the file. The items are the **flight plan** (always included), the **library entries** the plan references, and the **performance profile**. An item SHALL only be listed when the file carries it. All listed items SHALL be selected by default. Applies in both tiers.

#### Scenario: All parts listed and selected
- **WHEN** a user picks a file whose plan references library entries and which carries a performance profile
- **THEN** the chooser lists the flight plan, the library entries and the profile, all selected

#### Scenario: Parts absent from the file are not listed
- **WHEN** a user picks a file with no library snapshot and no performance profile
- **THEN** the chooser lists only the flight plan

#### Scenario: The flight plan cannot be deselected
- **WHEN** the chooser is shown
- **THEN** the flight plan item is included and offers no way to deselect it

#### Scenario: Cancelling changes nothing
- **WHEN** a user cancels the chooser
- **THEN** no plan, library entry or profile is changed

---

### Requirement: The chooser states what each item would add

For library entries, the chooser SHALL show how many are *new* to the destination library and how many are *already in your library*, plus how many of those differ from the file (see `map-objects`). For the profile, it SHALL state whether it is new or already present. The destination is the library and profile set of the destination tier, as defined in the next requirements.

#### Scenario: Library counts split new and existing
- **WHEN** a file references twelve library entries, eight of which the destination library already holds
- **THEN** the chooser shows four new and eight already in your library

#### Scenario: Signed-in profile already in the space
- **WHEN** a signed-in user imports a file whose recorded profile id matches a profile in the space
- **THEN** the chooser states that the profile is already in the space

---

### Requirement: Deselecting an item only skips what the destination lacks

Items the destination already holds SHALL be used by the imported plan whether or not their item is selected. Deselecting library entries SHALL skip only the new ones, which the plan then shows as unresolved refs (`map-objects`). Deselecting the profile SHALL skip adding it. The chooser SHALL state these effects while an item is deselected.

#### Scenario: Deselected library entries become placeholders
- **WHEN** a user deselects library entries and imports a plan referencing four entries the destination lacks
- **THEN** the destination library is unchanged and the plan shows those four refs as unresolved

#### Scenario: Existing entries still resolve when deselected
- **WHEN** a user deselects library entries and the destination already holds some referenced entries
- **THEN** the plan's refs to those entries resolve normally

#### Scenario: Consequence is stated before import
- **WHEN** a user deselects an item whose skipping would leave refs unresolved or the plan without its profile
- **THEN** the chooser says so before the user confirms

---

### Requirement: Library entries the destination already holds are not a choice

When the destination already holds every library entry the source lists, the library item SHALL read as all already held, stay selected, and offer no way to deselect it. Applies in both tiers.

#### Scenario: Library entries all held cannot be deselected
- **WHEN** the destination already holds all 56 library entries the source lists
- **THEN** the library item reads "56 objects, all already in your account" (signed in) or "…in your library" (anonymous), stays selected, and cannot be deselected

---

### Requirement: Anonymous import replaces the single plan

In the **anonymous** tier, confirming the import SHALL replace the single plan with the imported one, after warning that the current plan will be replaced. Selected library entries SHALL merge into the device-local library of the imported plan's theatre. A selected profile SHALL replace the single local profile. A deselected profile SHALL leave the local profile as it is.

#### Scenario: Anonymous import replaces the plan
- **WHEN** an anonymous user confirms an import
- **THEN** the imported plan becomes the single plan and the previous plan is no longer present

#### Scenario: Anonymous import with profile selected
- **WHEN** an anonymous user imports a file with its profile selected
- **THEN** the local profile's aircraft data is replaced by the file's

#### Scenario: Anonymous import with profile deselected
- **WHEN** an anonymous user imports a file with its profile deselected
- **THEN** the local profile is unchanged and the imported plan flies it

---

### Requirement: Signed-in import adds a new plan to the space

In the **signed-in** tier, confirming the import SHALL add the imported plan to the active space as a new plan with a newly generated id (`plan-addressing`). It keeps the file's name and theatre, and SHALL open at its address. No existing plan SHALL be replaced or changed. The plan SHALL be listed in the space at once, without being a draft (`plan-lifecycle`).

#### Scenario: Import adds without replacing
- **WHEN** a signed-in user with three plans imports a plan file
- **THEN** the space holds four plans and the three existing plans are unchanged

#### Scenario: Imported plan opens at its own address
- **WHEN** the import completes
- **THEN** the imported plan opens at `/p/:id/:slug` with a new id, and its name and theatre are the file's

#### Scenario: Importing the same file twice yields two plans
- **WHEN** a signed-in user imports the same file twice
- **THEN** the space holds two distinct plans with different ids

---

### Requirement: Signed-in import places library entries and profile in the space

In the **signed-in** tier, selected library entries SHALL merge into the space's library for the **imported plan's** theatre, whatever plan was last open. A selected profile SHALL be added to the space, or reused when its recorded id is already there (`performance-profile`). The plan's `profileId` SHALL point at the added or reused profile.

#### Scenario: Entries land in the imported plan's theatre
- **WHEN** a signed-in user whose last plan is on Caucasus imports a Syria plan with library entries selected
- **THEN** the new entries are added to the space's Syria library and the Caucasus library is unchanged

#### Scenario: Imported plan flies the imported profile
- **WHEN** a signed-in user imports a file with its profile selected
- **THEN** the new plan's `profileId` points at the profile added or reused for it

#### Scenario: Deselected new profile leaves the plan on the null profile
- **WHEN** a signed-in user deselects a profile that the space does not hold
- **THEN** no profile is added and the new plan resolves to the null profile

---

### Requirement: An import that cannot complete changes nothing

A file that is not a valid flight plan SHALL be rejected with an error before the chooser is confirmed. If the import cannot complete because the server cannot be reached, the user SHALL be told. In the **signed-in** tier this includes a disconnected device. The plan SHALL be added last, so a failed import never leaves a plan whose selected items are missing. Retrying SHALL NOT duplicate library entries or a profile already added.

#### Scenario: Invalid file is rejected
- **WHEN** a user picks a file that is not a valid flight plan
- **THEN** an error is shown and nothing is imported

#### Scenario: Signed-in import while disconnected
- **WHEN** a signed-in user tries to import a plan file while the device cannot reach the server
- **THEN** they are told the import needs a connection, and no plan, library entry or profile is added

#### Scenario: Retry after a partial failure does not duplicate
- **WHEN** a signed-in import added its library entries and profile but failed before adding the plan, and the user imports the same file again
- **THEN** one plan is added, and the library and profile hold no duplicates of the entries and profile added by the first attempt
