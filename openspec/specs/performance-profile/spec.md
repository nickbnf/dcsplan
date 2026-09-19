# Spec: Performance Profile

## Purpose

A **performance profile** is a named container holding one aircraft's performance data (model, take-off configuration, taxi fuel, take-off performance block) and its collection of regimes. In the anonymous tier, the single profile is implicit — it has a name but no id, no CRUD, and no switching. In the signed-in tier, profiles are a server-backed collection with stable ids, full CRUD, per-plan selection, and additive import.

---

## Requirements

### Requirement: Profile data model
Each performance profile SHALL have a user-editable `name` (non-empty, trimmed) and SHALL own the aircraft data block (model, takeoffConfiguration, taxiFuel, takeoff) and the regime collection previously located on `flightPlan.aircraft`. The profile SHALL round-trip through JSON serialisation without modification.

In the **signed-in** tier, each profile additionally has an immutable server-assigned `id`. Names SHALL be unique within the collection (case-insensitive).

In the **anonymous** tier, the single profile has no `id` — it is identified by being the only one. An `id` is assigned server-side when the profile is adopted into a space at sign-in.

#### Scenario: Anonymous profile has a name but no id
- **WHEN** an anonymous user views or exports their profile
- **THEN** the profile has a `name` and aircraft data but no `id` field

#### Scenario: Signed-in profile has a server-assigned id and unique name
- **WHEN** a signed-in user creates a new profile
- **THEN** it has a server-assigned `id`, a default name unique within the collection, and empty/zero aircraft data with no regimes

#### Scenario: Round-trip serialisation preserves profile data
- **WHEN** a profile is exported and re-imported
- **THEN** the profile's `name`, aircraft fields, and regimes are present with identical values

#### Scenario: Profile name uniqueness is enforced (signed-in)
- **WHEN** a signed-in user attempts to rename a profile to a name already used by another profile (case-insensitive)
- **THEN** an inline validation error is shown and the rename is not saved

---

### Requirement: Profile storage
In the **anonymous** tier, the single profile SHALL be stored under the localStorage key `dcsplan.performance` as a JSON object with the shape `{ version, name, aircraft }`. The key is written atomically.

In the **signed-in** tier, the profile collection SHALL be server-backed. The collection MAY be empty — a new user starts with no profiles, and all profiles may be deleted.

#### Scenario: Anonymous profile persists across reloads
- **WHEN** an anonymous user reloads the application
- **THEN** the profile is loaded from `dcsplan.performance` with all fields intact

#### Scenario: Signed-in collection may be empty
- **WHEN** a signed-in user has never created a profile, or has deleted all profiles
- **THEN** the collection is empty and the plan resolves to the null profile

---

### Requirement: Plan profile resolution
At runtime, a plan SHALL always resolve to exactly one profile — either a stored profile or the **null profile**.

The **null profile** is an implicit, runtime-only construct with empty/zero aircraft defaults (`{ model: "", takeoffConfiguration: "", taxiFuel: 0, takeoff: { timeSec: 0, fuel: 0, distance: 0 }, regimes: [] }`). It is never stored. A plan resolving to the null profile has no regimes, no take-off segment, no taxi fuel — it computes using only per-waypoint Manual values, matching the experience of a user who has not configured performance.

In the **anonymous** tier, the plan resolves implicitly to the single profile. No `profileId` field exists on the plan.

In the **signed-in** tier, `FlightPlan` SHALL include an optional `profileId` field referencing a profile in the collection. Resolution rules:
1. `profileId` present and matches a profile in the collection → use that profile.
2. `profileId` absent, dangling, or collection is empty → resolve to the **null profile**.

#### Scenario: Anonymous plan resolves to the single profile implicitly
- **WHEN** an anonymous user opens a plan
- **THEN** the plan uses the single profile's aircraft data and regimes; no `profileId` is stored

#### Scenario: Signed-in plan with valid profileId resolves to the referenced profile
- **WHEN** a signed-in user's plan with a `profileId` matching a profile in the collection is loaded
- **THEN** the plan uses that profile's aircraft data and regimes

#### Scenario: Signed-in plan with absent profileId resolves to null profile
- **WHEN** a signed-in user's plan without a `profileId` is loaded (legacy plan or older export)
- **THEN** the plan resolves to the null profile (empty aircraft, no regimes)

#### Scenario: Signed-in plan with dangling profileId resolves to null profile
- **WHEN** a signed-in user's plan's `profileId` does not match any profile in the collection
- **THEN** the plan resolves to the null profile

#### Scenario: Signed-in plan with empty collection resolves to null profile
- **WHEN** a signed-in user has no profiles in the collection
- **THEN** the plan resolves to the null profile regardless of `profileId`

---

### Requirement: Profile CRUD on the Performance page (signed-in only)
In the **signed-in** tier, the Performance page SHALL provide controls to create, rename, and delete profiles. The profile selector SHALL be distinct from the per-plan profile chooser: it controls which profile is displayed for editing, not which profile the plan flies (see *Profile selection split*).

In the **anonymous** tier, the Performance page SHALL display the single profile for editing directly, with a name field but no create, delete, or profile-switching controls.

#### Scenario: Signed-in user creates a new profile
- **WHEN** a signed-in user creates a new profile from the Performance page
- **THEN** a profile with a server-assigned id and default name is added to the collection and selected for editing

#### Scenario: Signed-in user renames a profile
- **WHEN** a signed-in user renames a profile to a unique, non-empty value
- **THEN** the profile's `name` is updated; its `id` is unchanged; any plan referencing it by `profileId` is unaffected

#### Scenario: Reject duplicate name on rename (signed-in)
- **WHEN** a signed-in user attempts to rename a profile to a name already taken (case-insensitive)
- **THEN** an inline validation error is shown and the rename is not saved

#### Scenario: Anonymous user sees single-profile editing
- **WHEN** an anonymous user navigates to the Performance page
- **THEN** the single profile is shown for editing with a name field; no profile creation, deletion, or switching controls are visible

---

### Requirement: Profile deletion (signed-in only)
In the **signed-in** tier, any profile MAY be deleted. When the plan's `profileId` references the profile being deleted AND at least one leg is bound to a regime, a confirmation dialog SHALL name the count of bound legs and state the consequence — the same wording as the profile-switching confirmation. On confirm, the profile is deleted, `profileId` is cleared, and the plan falls back to the null profile; all bound legs are cleared to Manual, retaining stored `tas` and `fuelFlow`. When no leg is bound, deletion proceeds without confirmation (or with a simpler "Delete this profile?" prompt). The collection MAY be empty after deletion.

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

#### Scenario: Anonymous user has no deletion control
- **WHEN** an anonymous user views the Performance page
- **THEN** no profile deletion control is visible

---

### Requirement: Profile switching resets legs to Manual (signed-in only)
In the **signed-in** tier, switching the plan's `profileId` to a different profile SHALL clear `regimeId` on every waypoint that references a regime, retaining the waypoint's stored `tas` and `fuelFlow`. Before the switch, a confirmation dialog SHALL name the count of bound legs and state the consequence: legs will be set to Manual while their TAS and fuel flow are kept. When **no** leg is bound to a regime, the switch SHALL proceed without confirmation.

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

---

### Requirement: Profile selection split (signed-in only)
In the **signed-in** tier, two distinct selections SHALL exist: (a) `plan.profileId` — which profile the plan flies, changed via the per-plan chooser with confirmation; and (b) `editingProfileId` — a UI-local selection on the Performance page controlling which profile is displayed for editing, changeable freely with no plan impact.

In the **anonymous** tier, there is one profile, so editing *is* flying — no split is needed.

#### Scenario: Viewing another profile does not switch the plan (signed-in)
- **WHEN** a signed-in user selects a different profile for editing on the Performance page without using the per-plan chooser
- **THEN** the plan's `profileId` is unchanged and no legs are reset

#### Scenario: Editing the flown profile updates computed values
- **WHEN** the user edits the regime data of the profile the plan currently flies (in either tier)
- **THEN** computed leg values reflect the new regime data immediately (via read-time resolution per `performance-regime`)

---

### Requirement: Migration from single-blob store
On first load after upgrade, a synchronous pre-mount bootstrap SHALL migrate data in `dcsplan.performance`. The migration SHALL run **after** `bootstrapPerformanceFromLegacyPlan()` so a pre-1.5 user gets both migrations in a single boot.

1. If `dcsplan.performance` already has a `name` field: no migration needed.
2. Else if `dcsplan.performance` exists: add a `name` derived from `aircraft.model` (falling back to `"Default profile"`), write back.
3. Else: write a default profile to `dcsplan.performance`.

No `id` is assigned (D2 — server-assigned). No `profileId` is set on the plan (D3 — anonymous resolves implicitly).

The migration SHALL be wrapped in try/catch: a failed migration starts the app on defaults rather than blocking boot.

#### Scenario: Existing single-blob data gains a name
- **WHEN** the app loads with `dcsplan.performance` present but no `name` field
- **THEN** a `name` is derived from `aircraft.model` and written back to `dcsplan.performance`

#### Scenario: Pre-1.5 user gets both migrations in one boot
- **WHEN** a user with a pre-1.5 plan (aircraft block still on the flight plan) loads the app for the first time after upgrade
- **THEN** `bootstrapPerformanceFromLegacyPlan()` runs first (extracting aircraft to `dcsplan.performance`), then the name migration runs, and the user ends up with a named profile

#### Scenario: Fresh install starts with a default profile
- **WHEN** the app loads with neither `dcsplan.performance` nor any prior data
- **THEN** a default profile with name `"Default profile"` is written to `dcsplan.performance`

#### Scenario: Failed migration falls back to defaults
- **WHEN** the migration throws an error (corrupted localStorage, unexpected shape)
- **THEN** the error is caught, a default profile is created, and the app starts normally

---

### Requirement: Performance import is tier-branched
In the **anonymous** tier, importing a `.perf.json` file SHALL **replace** the single profile's aircraft data — the current behaviour. If the file carries a `name`, the profile's name SHALL be updated; otherwise a name SHALL be derived from `aircraft.model`.

In the **signed-in** tier, importing a `.perf.json` file SHALL **add** a new profile to the collection with a fresh server-assigned id. It SHALL NOT replace any existing profile.

#### Scenario: Anonymous import replaces
- **WHEN** an anonymous user imports a `.perf.json` file
- **THEN** the single profile's aircraft data is replaced with the imported data; the profile's name is updated from the file or derived from `aircraft.model`

#### Scenario: Signed-in import adds without replacing
- **WHEN** a signed-in user imports a `.perf.json` file while two profiles already exist
- **THEN** the collection grows from 2 to 3 profiles; the two existing profiles are unchanged

#### Scenario: Signed-in plan import with embedded performance snapshot
- **WHEN** a signed-in user imports a flight plan that carries a `performanceSnapshot` with a profile id not in the collection
- **THEN** the snapshot is added as a new profile and the plan's `profileId` points at it

#### Scenario: Signed-in plan import with matching snapshot id reuses existing
- **WHEN** a signed-in user imports a flight plan whose `performanceSnapshot.id` matches a profile already in the collection
- **THEN** no profile is added; the plan's `profileId` is set to the existing profile's id

---

### Requirement: Sign-in adoption
When an anonymous user signs in, the single local profile SHALL be adopted into the user's space. The server SHALL assign an `id` to the adopted profile. If the user's space already contains profiles, the adopted profile SHALL be added to the collection (additive, not replacing). The plan SHALL gain a `profileId` pointing at the adopted profile.

#### Scenario: Anonymous profile is adopted with a server-assigned id
- **WHEN** an anonymous user signs in
- **THEN** the local profile is uploaded to the server, which assigns it an `id`; the plan's `profileId` is set to that id

#### Scenario: Adoption into a space with existing profiles is additive
- **WHEN** an anonymous user signs in to a space that already has profiles
- **THEN** the adopted profile is added alongside the existing profiles; no existing profile is replaced
