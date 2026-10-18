# Spec Delta

## ADDED Requirements

### Requirement: Performance profile data model
A performance profile SHALL own the aircraft data block (model, takeoffConfiguration, taxiFuel, takeoff) and the regime collection previously located on `flightPlan.aircraft`. It SHALL have no name of its own: it is shown by its **label**, "`model` · `takeoffConfiguration`", or whichever of the two is non-empty, or "Untitled profile" when both are empty. Labels need not be unique. The profile SHALL round-trip through JSON serialisation without modification.

#### Scenario: Round-trip serialisation preserves profile data
- **WHEN** a profile is exported and re-imported
- **THEN** the profile's aircraft fields and regimes are present with identical values

#### Scenario: Label from aircraft and take-off configuration
- **WHEN** a profile has `model = "F-15E"` and `takeoffConfiguration = "MIL @ 60klb"`
- **THEN** it is labelled "F-15E · MIL @ 60klb"

#### Scenario: Label with missing fields
- **WHEN** a profile has only `model = "A-10C"`, or neither field set
- **THEN** it is labelled "A-10C", or "Untitled profile" respectively

---

### Requirement: Profile identity
In the **signed-in** tier, each profile SHALL have an immutable `id`, generated on the device that creates it, so that a profile can be created while disconnected. Two profiles MAY carry the same label; they remain distinct by `id`.

In the **anonymous** tier, the single profile has no `id` — it is identified by being the only one. An `id` is assigned when the profile is adopted into a space at sign-in.

#### Scenario: Anonymous profile has no id
- **WHEN** an anonymous user views or exports their profile
- **THEN** the profile has aircraft data but no `id` field

#### Scenario: Signed-in profile has an id generated on creation
- **WHEN** a signed-in user creates a new profile, connected or not
- **THEN** it has an `id` immediately and empty/zero aircraft data with no regimes, labelled "Untitled profile"

#### Scenario: Profiles with the same label stay distinct (signed-in)
- **WHEN** a signed-in user gives two profiles the same aircraft and take-off configuration
- **THEN** both are kept, and both appear in the profile list

---

### Requirement: Profile list on the Performance page (signed-in only)
In the **signed-in** tier, the Performance page SHALL list the space's profiles by label in a sidebar, with the edited profile in bold and the flown profile marked. Selecting one SHALL show it for editing without changing which profile the plan flies (*Profile selection split*). The list SHALL offer creating and importing; the edited profile's area SHALL offer exporting and deleting.

#### Scenario: The list shows every profile by label (signed-in)
- **WHEN** a signed-in user opens the Performance view of a space with three profiles
- **THEN** the sidebar lists the three profiles by label, with the edited one in bold and the flown one marked

#### Scenario: Selecting a profile shows it for editing (signed-in)
- **WHEN** a signed-in user clicks another profile in the list
- **THEN** that profile is shown for editing and in bold; the plan's profile is unchanged

#### Scenario: Signed-in user creates a new profile
- **WHEN** a signed-in user creates a new profile from the list
- **THEN** an "Untitled profile" with a new id is added to the list and selected for editing

#### Scenario: An empty space offers creation and import (signed-in)
- **WHEN** a signed-in user's space has no profiles
- **THEN** the page offers to create or import a profile, and shows no profile editor

---

### Requirement: Profile editing layout on the Performance page
The edited profile SHALL be laid out top to bottom as: the aircraft identity (model, take-off configuration), then a **general performance** line (taxi fuel, take-off block), then the **regimes** as a wrapping row of selectable chips with an add control, then the selected regime's editor at full width. This layout applies in both tiers; the **anonymous** tier shows it for its single profile with no profile list and no plan chooser.

#### Scenario: Sections in order (both tiers)
- **WHEN** a user opens the Performance view
- **THEN** the aircraft identity, the general performance line, the regime chips and the regime editor appear in that order

#### Scenario: Selecting a regime chip opens its editor
- **WHEN** the user clicks a regime chip
- **THEN** that chip is highlighted and its regime is shown in the editor below

#### Scenario: Anonymous user sees single-profile editing
- **WHEN** an anonymous user navigates to the Performance page
- **THEN** the single profile is shown for editing; no profile list, plan chooser, creation or deletion controls are visible

---

### Requirement: Per-plan profile chooser in the Performance page header (signed-in only)
In the **signed-in** tier, the per-plan chooser SHALL be the only control in a header band at the top of the Performance page, labelled as the profile the active plan flies and listing profiles by label plus a "no profile" choice. It SHALL be visually separated from the profile list and the edited profile. In the **anonymous** tier no chooser is shown.

#### Scenario: Chooser shown in the header (signed-in)
- **WHEN** a signed-in user opens a plan's Performance view
- **THEN** the header band shows which profile the plan flies, with a control to change it, and nothing else

#### Scenario: No chooser for anonymous users
- **WHEN** an anonymous user opens the Performance view
- **THEN** no per-plan profile chooser is shown

---

### Requirement: Anonymous profile bootstrap
On load, a synchronous pre-mount bootstrap SHALL ensure `dcsplan.performance` holds a profile, running **after** `bootstrapPerformanceFromLegacyPlan()` so a pre-1.5 user gets both in a single boot. If the key is absent, a default (empty) profile SHALL be written. A `name` left by earlier versions SHALL be ignored. A failed bootstrap SHALL start the app on defaults rather than block boot. No `id` is assigned and no `profileId` is set on the plan.

#### Scenario: Pre-1.5 user gets both migrations in one boot
- **WHEN** a user with a pre-1.5 plan (aircraft block still on the flight plan) loads the app for the first time after upgrade
- **THEN** `bootstrapPerformanceFromLegacyPlan()` runs first, and the user ends up with that aircraft as their profile

#### Scenario: Fresh install starts with a default profile
- **WHEN** the app loads with neither `dcsplan.performance` nor any prior data
- **THEN** a default empty profile is written to `dcsplan.performance`

#### Scenario: A stored name is ignored
- **WHEN** `dcsplan.performance` carries a `name` from an earlier version
- **THEN** the profile loads with its aircraft data and the name plays no part in it

#### Scenario: Failed bootstrap falls back to defaults
- **WHEN** the bootstrap throws an error (corrupted localStorage, unexpected shape)
- **THEN** the error is caught, a default profile is used, and the app starts normally

## MODIFIED Requirements

### Requirement: Profile storage
In the **anonymous** tier, the single profile SHALL be stored under the localStorage key `dcsplan.performance` as a JSON object with the shape `{ version, aircraft }`. The key is written atomically.

In the **signed-in** tier, the profile collection SHALL be the active space's collection, persisted and synchronized as defined by `space-asset-sync`. The collection MAY be empty — a new user starts with no profiles, and all profiles may be deleted.

#### Scenario: Anonymous profile persists across reloads
- **WHEN** an anonymous user reloads the application
- **THEN** the profile is loaded from `dcsplan.performance` with all fields intact

#### Scenario: Signed-in collection may be empty
- **WHEN** a signed-in user has never created a profile, or has deleted all profiles
- **THEN** the collection is empty and the plan resolves to the null profile

#### Scenario: Signed-in collection is shared across devices
- **WHEN** a signed-in user creates a profile on one device
- **THEN** the profile is in the collection on their other devices

---

### Requirement: Profile deletion (signed-in only)
In the **signed-in** tier, any profile MAY be deleted. When the plan's `profileId` references the profile being deleted AND at least one leg is bound to a regime, a confirmation dialog SHALL name the count of bound legs and state the consequence — the same wording as the profile-switching confirmation. On confirm, the profile is deleted, `profileId` is cleared, and the plan falls back to the null profile; all bound legs are cleared to Manual, retaining stored `tas` and `fuelFlow`. When no leg is bound, deletion asks a simpler confirmation naming the profile by its label. The collection MAY be empty after deletion.

Other plans in the space that reference the deleted profile SHALL NOT be modified by the deletion. They resolve to the null profile when opened, and their bound legs compute as Manual (see `performance-regime`).

In the **anonymous** tier, deletion SHALL NOT be offered — there is exactly one profile.

#### Scenario: Delete unreferenced profile (signed-in)
- **WHEN** a signed-in user deletes a profile that the plan does not reference
- **THEN** the profile is removed from the collection; the plan is unaffected

#### Scenario: Delete referenced profile with bound legs requires confirmation (signed-in)
- **WHEN** a signed-in user deletes the profile the plan flies and 12 legs are bound to regimes
- **THEN** a confirmation dialog states the bound-leg count and consequence; on confirm, the profile is deleted, the plan falls back to the null profile, and all bound legs are cleared to Manual

#### Scenario: Delete referenced profile with no bound legs (signed-in)
- **WHEN** a signed-in user deletes the profile the plan flies and no legs are bound
- **THEN** the profile is deleted and the plan falls back to the null profile without a bound-leg warning

#### Scenario: Delete last profile leaves collection empty (signed-in)
- **WHEN** a signed-in user deletes the only profile in the collection
- **THEN** the collection is empty and the plan resolves to the null profile

#### Scenario: Another plan flying the deleted profile falls back (signed-in)
- **WHEN** a signed-in user deletes a profile, then opens a different plan whose `profileId` referenced it
- **THEN** that plan resolves to the null profile and its bound legs compute as Manual, and its `profileId` and `regimeId` values are not changed by opening it

#### Scenario: Anonymous user has no deletion control
- **WHEN** an anonymous user views the Performance page
- **THEN** no profile deletion control is visible

---

### Requirement: Performance import is tier-branched
In the **anonymous** tier, importing a `.perf.json` file SHALL **replace** the single profile's aircraft data — the current behaviour. A `name` in the file SHALL be ignored.

In the **signed-in** tier, importing a `.perf.json` file SHALL **add** a new profile to the collection with a new id. It SHALL NOT replace any existing profile.

#### Scenario: Anonymous import replaces
- **WHEN** an anonymous user imports a `.perf.json` file
- **THEN** the single profile's aircraft data is replaced with the imported data

#### Scenario: Signed-in import adds without replacing
- **WHEN** a signed-in user imports a `.perf.json` file while two profiles already exist
- **THEN** the collection grows from 2 to 3 profiles; the two existing profiles are unchanged

#### Scenario: Signed-in plan import with embedded performance snapshot
- **WHEN** a signed-in user imports a flight plan that carries a `performanceSnapshot` whose recorded profile id is absent or not in the collection
- **THEN** the snapshot is added as a new profile and the plan's `profileId` points at it

#### Scenario: Signed-in plan import with matching snapshot id reuses existing
- **WHEN** a signed-in user imports a flight plan whose recorded profile id (`performanceProfile.id`) matches a profile already in the collection
- **THEN** no profile is added; the plan's `profileId` is set to the existing profile's id

---

### Requirement: Profile switching resets legs to Manual (signed-in only)
In the **signed-in** tier, switching the plan's `profileId` to a different profile SHALL clear `regimeId` on every waypoint **bound** to a regime of the current profile, retaining the waypoint's stored `tas` and `fuelFlow`. A `regimeId` that does not resolve in the current profile (an orphan, see `performance-regime`) is not bound: the switch SHALL leave it unchanged, and it becomes bound if it resolves in the new profile. Before the switch, a confirmation dialog SHALL name the count of bound legs and state the consequence: legs will be set to Manual while their TAS and fuel flow are kept. When **no** leg is bound to a regime, the switch SHALL proceed without confirmation.

The reset is one-way: switching *back* to the original profile does **not** restore any previously cleared `regimeId`. Recovery is available only through the planner's undo stack.

In the **anonymous** tier, there is one profile and no switching — this requirement does not apply.

#### Scenario: Switching with bound legs requires confirmation (signed-in)
- **WHEN** a signed-in user's plan has 12 legs bound to regimes and the user selects a different profile
- **THEN** a confirmation dialog states "12 legs are bound to regimes in this profile. Switching will set them to Manual. Their TAS and fuel flow are kept." and the switch proceeds only on explicit confirm

#### Scenario: Switching with no bound legs skips confirmation (signed-in)
- **WHEN** a signed-in user's plan has no legs bound to any regime and the user selects a different profile
- **THEN** the switch happens immediately with no confirmation dialog

#### Scenario: TAS and fuel flow are retained after switch (signed-in)
- **WHEN** a leg had `regimeId` set and the profile is switched
- **THEN** the leg's stored `tas` and `fuelFlow` are unchanged; only `regimeId` is cleared

#### Scenario: Switching back does not restore bindings (signed-in)
- **WHEN** a signed-in user switches from profile A to profile B, then back to profile A
- **THEN** all legs remain Manual; no `regimeId` is restored from before the switch

#### Scenario: Orphan bindings survive a switch and resolve in the new profile (signed-in)
- **WHEN** a signed-in user's plan resolves to the null profile, its legs carry `regimeId`s from a profile no longer in the space, and the user selects a profile that contains regimes with those ids
- **THEN** the switch happens with no confirmation, no `regimeId` is cleared, and the legs compute from the new profile's regimes

## REMOVED Requirements

### Requirement: Profile data model
**Reason**: Signed-in profile ids were server-assigned and names unique within the collection. Both rules break offline creation and offline rename under last-write-wins sync (`space-asset-sync`): a device cannot obtain a server id while disconnected, and a duplicate name cannot be rejected after the fact.
**Migration**: Replaced by *Performance profile data model* and *Profile identity*: ids are generated on the creating device, and profiles are shown by a label derived from the aircraft and take-off configuration instead of a name.

### Requirement: Profile CRUD on the Performance page (signed-in only)
**Reason**: Its scenarios assert a server-assigned id on creation and the rejection of duplicate names, both dropped with the data-model change.
**Migration**: Replaced by *Profile list on the Performance page (signed-in only)* and *Profile editing layout on the Performance page*. Profiles have no names to rename.

### Requirement: Migration from single-blob store
**Reason**: It added a `name` to `dcsplan.performance`; profiles no longer have names.
**Migration**: Replaced by *Anonymous profile bootstrap*, which keeps the pre-1.5 ordering and the defaults, and ignores any stored name.
