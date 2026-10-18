# Spec Delta

## ADDED Requirements

### Requirement: Performance package import — apply by tier
After validation, a confirmation dialog SHALL show the file name and a preview (model, take-off configuration, regime count). **Anonymous:** `Cancel` and a destructive `Replace`, which replaces the single profile's aircraft block and clears every `regimeId` that matches no imported regime, keeping stored `tas`/`fuelFlow`. **Signed in:** `Cancel` and `Add profile`, which adds a new profile and selects it for editing, leaving other profiles and leg bindings unchanged.

#### Scenario: Cancel leaves the plan untouched
- **WHEN** the user picks a valid file and clicks `Cancel`
- **THEN** the profile and plan are unchanged and the dialog closes

#### Scenario: Replace overwrites aircraft block (anonymous)
- **WHEN** an anonymous user picks a valid file and clicks `Replace`
- **THEN** the single profile's aircraft data is replaced with the imported data

#### Scenario: Imported regimes with new IDs orphan existing bindings (anonymous)
- **WHEN** an anonymous user replaces with a file whose regime IDs do not match the plan's existing bindings
- **THEN** every waypoint whose `regimeId` does not match an imported regime has its `regimeId` cleared; stored `tas` and `fuelFlow` are retained

#### Scenario: Imported regimes with matching IDs preserve bindings (anonymous)
- **WHEN** an anonymous user replaces with a file containing a regime whose `id` matches one already referenced by a waypoint
- **THEN** the waypoint's `regimeId` is preserved and now points to the imported regime

#### Scenario: Signed-in import adds a profile
- **WHEN** a signed-in user picks a valid file and clicks `Add profile`
- **THEN** a new profile appears in the list, labelled from the file's aircraft, and is selected for editing; existing profiles and leg bindings are unchanged

## MODIFIED Requirements

### Requirement: Perf page header section
The Performance page (route `/performance`) SHALL render, above the regimes, the profile's aircraft identity — `model` (text input) and `takeoffConfiguration` (text input) — and below it, on its own line under a **General performance** heading, `taxiFuel` (number, lbs) and the take-off block (`timeSec` displayed as `mm:ss` editor, `fuel` in lbs, `distance` in NM). There is no separate profile name field: the profile is labelled from `model` and `takeoffConfiguration` (`performance-profile`). An information icon next to the take-off row SHALL display the tooltip: *"Time, fuel, and distance covered from brake release through acceleration to climb speed. Use values from your aircraft's performance charts for your T/O configuration. Or obtain by flight testing the difference between a cruise climb and the same climb from brake release."*

The page SHALL also expose `⬇ Export performance` and `⬆ Import performance`, both wired to the performance-package file flow described below (signed in: export beside the aircraft identity, import with the profile list).

#### Scenario: Header is always visible on the Perf page
- **WHEN** the user navigates to `/performance`
- **THEN** the aircraft identity, the general performance line, and the Export/Import controls are rendered above the regimes, regardless of whether any regimes are defined

#### Scenario: Tooltip wording for the T/O perf block
- **WHEN** the user hovers the information icon next to the take-off row
- **THEN** the tooltip displays the exact text above

#### Scenario: Editing aircraft fields persists immediately
- **WHEN** the user changes `model`, `takeoffConfiguration`, `taxiFuel`, or any of the three take-off fields and commits the edit
- **THEN** the in-memory plan is updated and the change is persisted via the existing auto-persistence mechanism

---

### Requirement: Performance package export
The Perf page SHALL provide an `⬇ Export performance` button that writes the profile to a JSON file. The `aircraft` field SHALL be a deep copy of the profile's aircraft data (no shared references). The download filename SHALL be `<slug>.perf.json`, where `<slug>` is `aircraft.model` slugified (per the existing `slugifyPlanName` helper); when `aircraft.model` is empty, the filename SHALL be `performance.json`. The button SHALL always be enabled.

The envelope SHALL be `{ "version": "1.0", "aircraft": <aircraft> }`, where `version` is the constant `PERFORMANCE_FILE_VERSION = "1.0"`. No profile `id` is included — the file is a portable performance package for cross-squadron exchange; identity is not portable and is assigned by the recipient's server on import. This format is tier-independent.

#### Scenario: Export with non-empty aircraft model
- **WHEN** the user clicks Export for a profile with `aircraft.model = "F-15E Strike Eagle"`
- **THEN** the browser downloads a file named `f-15e-strike-eagle.perf.json` whose content is the version and the full aircraft block, with no `name`

#### Scenario: Export with empty aircraft model
- **WHEN** the user clicks Export for a profile with `aircraft.model = ""`
- **THEN** the browser downloads a file named `performance.json` whose envelope contains the aircraft data

#### Scenario: Export of an empty aircraft is allowed
- **WHEN** the profile has zero T/O, empty strings, and no regimes
- **THEN** the export still succeeds; the resulting file contains default-zero aircraft data

#### Scenario: Export does not mutate the plan
- **WHEN** the user clicks Export and then continues editing
- **THEN** the in-memory profile is unchanged by the export and the exported file is unaffected by subsequent edits

---

### Requirement: Performance package import — validation
The Perf page SHALL provide an `⬆ Import performance` button that opens a file picker filtered to `.json` files. On file selection, the application SHALL parse the file as JSON and validate it before showing any apply prompt. Validation SHALL be performed entirely on the frontend and SHALL apply these rules:

1. The top-level object MUST have `version === "1.0"`. Any other value SHALL be rejected as an unsupported version.
2. `name` (written by earlier versions) is optional and SHALL be ignored.
3. `aircraft` MUST be an object containing `model` (string), `takeoffConfiguration` (string), `taxiFuel` (number ≥ 0), `takeoff` (object with `timeSec`, `fuel`, `distance`, all numbers ≥ 0; either all zero or all strictly positive), and `regimes` (array, may be empty).
4. Each entry of `regimes` MUST satisfy the existing regime validation: non-empty `id`, non-empty `name`, `cruise.tas > 0`, `cruise.ff > 0`; `climb` (if present) MUST have all of `tas > 0`, `ff > 0`, `roc > 0`; `descent` (if present) MUST have all of `tas > 0`, `ff > 0`, `rod > 0`. Regime names MUST be unique within the imported set.
5. Unknown keys at any level SHALL be ignored, not rejected.

If validation fails, the application SHALL surface a clear error message identifying the failing field(s) and SHALL NOT apply the import.

#### Scenario: Accept v1.0 file with name
- **WHEN** the imported file has `version: "1.0"` with valid aircraft data and a `name` from an earlier version
- **THEN** validation passes and the `name` is ignored

#### Scenario: Accept v1.0 file without name (legacy)
- **WHEN** the imported file has `version: "1.0"` with valid aircraft data but no `name`
- **THEN** validation passes

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

## REMOVED Requirements

### Requirement: Performance package import — confirmation and apply
**Reason**: It named profiles from the file's `name` and auto-suffixed duplicate names; profiles no longer have names.
**Migration**: Replaced by *Performance package import — apply by tier*, with the same anonymous behaviour and an additive signed-in import.
