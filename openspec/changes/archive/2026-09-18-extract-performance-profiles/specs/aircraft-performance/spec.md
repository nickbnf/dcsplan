## MODIFIED Requirements

### Requirement: Aircraft block on the flight plan
The aircraft data block — `model` (string, may be empty), `takeoffConfiguration` (string, may be empty), `taxiFuel` (number, lbs, ≥ 0), `takeoff` ({ `timeSec`: integer seconds ≥ 0, `fuel`: lbs ≥ 0, `distance`: NM ≥ 0 }) — SHALL be owned by a **performance profile** (per the `performance-profile` capability) rather than living directly on the flight plan.

In the **anonymous** tier, the plan resolves its aircraft data implicitly from the single profile stored in `dcsplan.performance`. In the **signed-in** tier, the plan reaches its aircraft data through its `profileId` reference, which resolves to a profile in the server-backed collection. In either tier, the flight plan itself SHALL NOT carry an `aircraft` field at rest.

The regime collection previously held at `aircraft.regimes` is likewise owned by the profile (see `performance-regime`).

For backend kneeboard generation, the frontend SHALL continue to marshal the resolved profile's aircraft data (including regimes) into the plan body sent to the kneeboard endpoint, so the backend interface is unchanged. The aircraft block SHALL round-trip through JSON serialisation as part of the profile without modification.

#### Scenario: New plan starts with an empty aircraft
- **WHEN** a fresh flight plan is created and the resolved profile is new
- **THEN** the profile's aircraft data is `{ model: "", takeoffConfiguration: "", taxiFuel: 0, takeoff: { timeSec: 0, fuel: 0, distance: 0 }, regimes: [] }`

#### Scenario: Round-trip serialisation preserves aircraft fields
- **WHEN** a profile with non-default aircraft fields and at least one regime is exported and re-imported
- **THEN** every field of the aircraft block (including each regime's id, name, comment, cruise, climb, descent) is present after re-import with identical values

#### Scenario: Plan resolves aircraft data through its profile
- **WHEN** a plan is loaded (anonymous: implicitly from single profile; signed-in: via `profileId`)
- **THEN** the aircraft data used for computation and display is the resolved profile's aircraft block

#### Scenario: Backend receives marshalled aircraft unchanged
- **WHEN** the frontend sends a plan to the kneeboard endpoint
- **THEN** the request body contains the resolved profile's aircraft data nested under `flightPlan.aircraft`, matching the existing backend contract

---

### Requirement: Performance package export
The Perf page SHALL provide an `⬇ Export performance` button that writes the profile to a JSON file. The `aircraft` field SHALL be a deep copy of the profile's aircraft data (no shared references). The download filename SHALL be `<slug>.perf.json`, where `<slug>` is `aircraft.model` slugified (per the existing `slugifyPlanName` helper); when `aircraft.model` is empty, the filename SHALL be `performance.json`. The button SHALL always be enabled.

The envelope SHALL be `{ "version": "1.0", "name": <profileName>, "aircraft": <aircraft> }`, where `version` is the constant `PERFORMANCE_FILE_VERSION = "1.0"`. No profile `id` is included — the file is a portable performance package for cross-squadron exchange; identity is not portable and is assigned by the recipient's server on import. This format is tier-independent.

#### Scenario: Export with non-empty aircraft model
- **WHEN** the user clicks Export for a profile named "F-15E" with `aircraft.model = "F-15E Strike Eagle"`
- **THEN** the browser downloads a file named `f-15e-strike-eagle.perf.json` whose content includes `name: "F-15E"` and the full aircraft block

#### Scenario: Export with empty aircraft model
- **WHEN** the user clicks Export for a profile with `aircraft.model = ""`
- **THEN** the browser downloads a file named `performance.json` whose envelope contains the profile's name and aircraft data

#### Scenario: Export of an empty aircraft is allowed
- **WHEN** the profile has zero T/O, empty strings, and no regimes
- **THEN** the export still succeeds; the resulting file contains the profile's name and default-zero aircraft data

#### Scenario: Export does not mutate the plan
- **WHEN** the user clicks Export and then continues editing
- **THEN** the in-memory profile is unchanged by the export and the exported file is unaffected by subsequent edits

---

### Requirement: Performance package import — validation
The Perf page SHALL provide an `⬆ Import performance` button that opens a file picker filtered to `.json` files. On file selection, the application SHALL parse the file as JSON and validate it before showing any apply prompt. Validation SHALL be performed entirely on the frontend and SHALL apply these rules:

1. The top-level object MUST have `version === "1.0"`. Any other value SHALL be rejected as an unsupported version.
2. `name` (string) is optional; when absent, a name SHALL be derived from `aircraft.model` at apply time.
3. `aircraft` MUST be an object containing `model` (string), `takeoffConfiguration` (string), `taxiFuel` (number ≥ 0), `takeoff` (object with `timeSec`, `fuel`, `distance`, all numbers ≥ 0; either all zero or all strictly positive), and `regimes` (array, may be empty).
4. Each entry of `regimes` MUST satisfy the existing regime validation: non-empty `id`, non-empty `name`, `cruise.tas > 0`, `cruise.ff > 0`; `climb` (if present) MUST have all of `tas > 0`, `ff > 0`, `roc > 0`; `descent` (if present) MUST have all of `tas > 0`, `ff > 0`, `rod > 0`. Regime names MUST be unique within the imported set.
5. Unknown keys at any level SHALL be ignored, not rejected.

If validation fails, the application SHALL surface a clear error message identifying the failing field(s) and SHALL NOT apply the import.

#### Scenario: Accept v1.0 file with name
- **WHEN** the imported file has `version: "1.0"` with valid aircraft data and a `name`
- **THEN** validation passes

#### Scenario: Accept v1.0 file without name (legacy)
- **WHEN** the imported file has `version: "1.0"` with valid aircraft data but no `name`
- **THEN** validation passes; a name will be derived from `aircraft.model` at apply time

#### Scenario: Reject unsupported version
- **WHEN** the imported file has `version: "2.0"`
- **THEN** an error message identifies the unsupported version and the import is not applied

#### Scenario: Reject mixed-state take-off block
- **WHEN** the imported file has `aircraft.takeoff = { timeSec: 75, fuel: 0, distance: 1.8 }`
- **THEN** an error message identifies the take-off block and the import is not applied

#### Scenario: Reject duplicate regime names
- **WHEN** the imported file has two regimes both named "Cruise"
- **THEN** an error message identifies the duplicate name and the import is not applied

#### Scenario: Accept empty regimes array
- **WHEN** the imported file has `aircraft.regimes = []`
- **THEN** validation passes

#### Scenario: Ignore unknown keys
- **WHEN** the imported file has `aircraft.unknownExtra = "whatever"`
- **THEN** validation passes and `unknownExtra` is silently dropped

---

### Requirement: Performance package import — confirmation and apply
After successful validation, the application SHALL display a confirmation dialog showing: the file name and a preview of the imported data (model, takeoff configuration, regime count).

Import behaviour is **tier-branched** (per `performance-profile`):

**Anonymous tier:** the dialog SHALL provide `Cancel` and `Replace` buttons (`Replace` styled as destructive). On `Replace`:
1. The single profile's `aircraft` block SHALL be replaced by a deep copy of the imported aircraft data.
2. If the file carries a `name`, the profile's name SHALL be updated; otherwise a name SHALL be derived from `aircraft.model`.
3. Every waypoint whose `regimeId` does not match the `id` of any regime in the imported set SHALL have its `regimeId` cleared (the waypoint becomes Manual; existing stored `tas`/`fuelFlow` are retained).

**Signed-in tier:** the dialog SHALL provide `Cancel` and `Add profile` buttons. On `Add profile`:
1. A new profile SHALL be added to the collection with a fresh server-assigned id (additive, never replaces).
2. The profile's name SHALL be taken from the file's `name` (auto-suffixed if it collides with an existing name), or derived from `aircraft.model` (falling back to the filename stem, then `"Imported profile"`) when `name` is absent.
3. All other profiles in the collection SHALL be preserved unchanged.
4. The dialog SHALL NOT mention plan `profileId` or "legs reverting to Manual" — the import adds a profile; it does not switch the plan to it.

#### Scenario: Cancel leaves the plan untouched
- **WHEN** the user picks a valid file and clicks `Cancel`
- **THEN** the profile and plan are unchanged and the dialog closes

#### Scenario: Replace overwrites aircraft block
- **WHEN** an anonymous user picks a valid file and clicks `Replace`
- **THEN** the single profile's aircraft data is replaced with the imported data; if the file carries a `name`, the profile's name is updated

#### Scenario: Imported regimes with new IDs orphan existing bindings
- **WHEN** an anonymous user replaces with a file whose regime IDs do not match the plan's existing bindings
- **THEN** every waypoint whose `regimeId` does not match an imported regime has its `regimeId` cleared; stored `tas` and `fuelFlow` are retained

#### Scenario: Imported regimes with matching IDs preserve bindings
- **WHEN** an anonymous user replaces with a file containing a regime whose `id` matches one already referenced by a waypoint
- **THEN** the waypoint's `regimeId` is preserved and now points to the imported regime

#### Scenario: Signed-in import adds without replacing
- **WHEN** a signed-in user picks a valid file and clicks `Add profile`
- **THEN** a new profile is added to the collection with a fresh server-assigned id; existing profiles are unchanged; no waypoint bindings are affected

#### Scenario: Signed-in import with duplicate name auto-suffixes
- **WHEN** a signed-in user imports a file whose `name` matches an existing profile's name
- **THEN** a new profile is added with the name auto-suffixed to maintain uniqueness

---

### Requirement: Backwards compatibility with v1.2 plans
Plans saved with `FLIGHT_PLAN_VERSION === "1.2"` SHALL load without user intervention. On load, the `performance-profile` migration (if not already run) SHALL have ensured a named profile exists in `dcsplan.performance`. The plan resolves to that profile implicitly (anonymous) or via `profileId` fallback (signed-in). Any legacy top-level `regimes` on the plan SHALL be ignored in favour of the regimes in the resolved profile. The in-memory version SHALL be set to the current version so the next save writes the new shape.

The combined effect on a legacy plan SHALL be: identical computed leg times, fuels, and distances; identical EFR chain (since `taxiFuel` is sourced from the profile, which has the same value as the old `aircraft.taxiFuel`); identical regime bindings (every `regimeId` is preserved, pointing at regimes now in the profile).

#### Scenario: Load v1.2 plan synthesises aircraft and relocates regimes
- **WHEN** a v1.2 plan is loaded after the profile migration has run
- **THEN** the plan resolves to the migrated profile, whose aircraft data (including regimes) matches the old `dcsplan.performance` content; the plan computes identically to before

#### Scenario: Load v1.2 plan preserves regime bindings
- **WHEN** a v1.2 plan has waypoints referencing regimes by `regimeId`
- **THEN** those `regimeId` values are unchanged after migration and continue to resolve through the profile's regimes

#### Scenario: Save promotes version to 1.3
- **WHEN** a plan loaded from v1.2 is saved
- **THEN** the saved JSON carries the current `FLIGHT_PLAN_VERSION` and does not contain an `aircraft` block

#### Scenario: v1.2 plan computes leg-1 unchanged
- **WHEN** a v1.2 plan is loaded and leg 1 is computed
- **THEN** the leg-1 ETE, fuel, and distance match the values produced before this change (because the migrated profile's `aircraft.takeoff` block matches the old data)

---

### Requirement: Kneeboard waypoint page header
The waypoint page (front of the kneeboard) SHALL display a header line containing the resolved profile's `aircraft.model` and `aircraft.takeoffConfiguration` separated by ` · ` (e.g., `F-15E Strike Eagle · MIL @ 60klb`). When both fields are empty, the header SHALL be omitted entirely. When only one of the two is empty, the separator SHALL also be omitted (e.g., `F-15E Strike Eagle`). No regime identifiers, taxi fuel, or take-off block values SHALL appear on the kneeboard.

#### Scenario: Header rendered with both fields
- **WHEN** the kneeboard is generated for a plan whose resolved profile has `aircraft.model = "F-15E"` and `aircraft.takeoffConfiguration = "MIL @ 60klb"`
- **THEN** the waypoint page shows the header line `F-15E · MIL @ 60klb`

#### Scenario: Header rendered with only the model
- **WHEN** `aircraft.model = "F-15E"` and `aircraft.takeoffConfiguration = ""`
- **THEN** the waypoint page shows the header line `F-15E` (no separator)

#### Scenario: Header omitted when both fields are empty
- **WHEN** both `aircraft.model` and `aircraft.takeoffConfiguration` are empty
- **THEN** no header line is rendered on the waypoint page

#### Scenario: Kneeboard does not leak other aircraft fields
- **WHEN** the kneeboard is generated for any plan
- **THEN** no regime name, regime id, profile name, `taxiFuel` value, or `takeoff` block value appears on any kneeboard page
