# Spec: Aircraft Performance

## Purpose

The **aircraft-performance** capability adds an `aircraft` block to the flight plan, holding aircraft-level performance data: model name, take-off configuration, taxi fuel, and a take-off performance block (time, fuel, and chart distance). On leg 1 only, when a take-off block is configured and the leg is bound to a regime, a take-off segment is inserted at the start of the leg, before the normal climb/cruise computation. The aircraft block also owns the regime collection (relocated from the top level of `FlightPlan`). Users can export and import the entire aircraft block as a portable performance package.

---

## Requirements

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

### Requirement: Take-off performance validation
The three take-off fields (`timeSec`, `fuel`, `distance`) SHALL be validated as all-or-nothing positive: either all three are zero (the take-off block is unused), or all three are strictly positive. Any mixed state (one positive, others zero) SHALL display an inline validation error and SHALL NOT be saved.

#### Scenario: All zero is valid
- **WHEN** every take-off field is `0`
- **THEN** no validation error is shown and the plan is saved

#### Scenario: All positive is valid
- **WHEN** every take-off field has a strictly positive value
- **THEN** no validation error is shown and the plan is saved

#### Scenario: Mixed state is rejected
- **WHEN** the user sets `timeSec = 60` while leaving `fuel = 0`
- **THEN** an inline error is shown next to the take-off block and the partial change is not saved

---

### Requirement: Take-off segment on leg 1
On leg 1 only, when the destination waypoint has a `regimeId` matching a regime in `aircraft.regimes` AND `aircraft.takeoff.timeSec > 0` AND `aircraft.takeoff.distance > 0`, leg time and fuel SHALL be computed as the sum of a take-off segment, the existing climb segment (if any), and the existing cruise segment.

The take-off segment SHALL contribute the user-entered `aircraft.takeoff.timeSec` (verbatim) as time and `aircraft.takeoff.fuel` (verbatim) as fuel. Its ground distance SHALL be wind-corrected: an effective TAS is derived as `TAS_to = aircraft.takeoff.distance / (aircraft.takeoff.timeSec / 3600)` (knots, no-wind average); the segment's ground speed is `applyWind(TAS_to, originWind, course)`; and its ground distance is `groundSpeed × (aircraft.takeoff.timeSec / 3600)` NM. Wind correction SHALL use the **origin** waypoint's wind, consistent with the existing climb-segment convention.

After the take-off segment, the climb segment (if the regime has climb data and the leg climbs) SHALL run from the origin altitude over the climb distance computed by the existing rules; cruise SHALL cover the remainder of the leg distance.

When the trigger conditions are not all met (leg index ≠ 0, OR no `regimeId`, OR `timeSec ≤ 0`, OR `distance ≤ 0`), leg 1 SHALL be computed exactly as it was before this change (the existing 2-phase or level cruise computation).

#### Scenario: Three-phase computation when conditions are met
- **WHEN** leg 1 is bound to a regime with climb data, the aircraft's take-off has positive `timeSec` and `distance`, and the leg has a non-zero altitude delta
- **THEN** leg time equals `T/O time + climb time + cruise time`, leg fuel equals `T/O fuel + climb fuel + cruise fuel`, and the three segments sum to the full leg distance

#### Scenario: Two-phase computation when leg 1 has no climb data on the regime
- **WHEN** leg 1 is bound to a regime without climb data and the take-off has positive `timeSec` and `distance`
- **THEN** leg time equals `T/O time + cruise time` and leg fuel equals `T/O fuel + cruise fuel` (the climb segment is skipped)

#### Scenario: Take-off segment skipped when leg 1 is Manual
- **WHEN** leg 1's destination waypoint has no `regimeId`
- **THEN** no take-off segment is applied and leg 1 is computed exactly as before this change

#### Scenario: Take-off segment skipped when take-off block is zero
- **WHEN** leg 1 is bound to a regime but `aircraft.takeoff.timeSec = 0` (or `distance = 0`)
- **THEN** no take-off segment is applied and leg 1 is computed exactly as before this change

#### Scenario: Take-off segment time and fuel are used verbatim
- **WHEN** the take-off block is `{ timeSec: 75, fuel: 250, distance: 1.8 }` and leg 1's origin wind would otherwise alter ground speed
- **THEN** the take-off segment contributes exactly `75` seconds and `250` lbs to the leg total, regardless of wind

#### Scenario: Take-off segment ground distance is wind-corrected
- **WHEN** the take-off block is `{ timeSec: 75, fuel: 250, distance: 1.8 }` (yielding `TAS_to = 86.4 kts`) and the origin wind is a 20-knot direct headwind on the leg course
- **THEN** the take-off segment's ground distance is approximately `(86.4 − 20) × (75 / 3600) ≈ 1.38 NM`, less than the chart distance

#### Scenario: Other legs are unaffected
- **WHEN** a leg with index ≥ 1 is computed
- **THEN** no take-off segment is applied; the existing 2-phase or level cruise computation is used unchanged

---

### Requirement: Long-segment warning includes the take-off distance
When the take-off segment is active on leg 1, the existing long-transition warning SHALL fire when `(takeoff_ground_distance + climb_distance) > leg_distance`. The warning indicator (`⚠ Fix`) and its tooltip SHALL behave as defined by the `performance-regime` capability, but the tooltip SHALL include the take-off segment row in the breakdown so the user can identify which segment is over-running.

#### Scenario: Warning fires on combined T/O + climb overflow
- **WHEN** leg 1's `takeoff_ground_distance + climb_distance` exceeds `leg_distance`
- **THEN** the leg row displays the `⚠ Fix` indicator and the tooltip shows take-off, climb, and cruise rows with their distances

#### Scenario: Warning fires on T/O distance alone exceeding leg distance
- **WHEN** the take-off segment alone exceeds `leg_distance` (regime has no climb data, or the climb has zero distance)
- **THEN** the leg row displays the `⚠ Fix` indicator and the tooltip shows the take-off row

#### Scenario: No warning when T/O is inactive
- **WHEN** leg 1 has no regime, or the take-off block is zero
- **THEN** the warning behaviour matches the unchanged `performance-regime` rules

---

### Requirement: Taxi fuel deducted before leg 1
The leg-calculation chain SHALL deduct `aircraft.taxiFuel` from the cumulative EFR at the start of leg 1, before any leg-1 fuel is consumed. Concretely, the EFR at the destination of leg 1 SHALL equal `initFob − taxiFuel − leg1Fuel`. The plan's `initFob` field SHALL NOT be mutated; it remains the pre-taxi fuel-on-board.

#### Scenario: Taxi fuel reduces EFR at waypoint 1
- **WHEN** `initFob = 13000`, `taxiFuel = 400`, and `leg1Fuel = 800` (computed from the plan)
- **THEN** the EFR shown at waypoint 1 is `11800`, and the displayed `initFob` is still `13000`

#### Scenario: Zero taxi fuel is a no-op
- **WHEN** `aircraft.taxiFuel = 0`
- **THEN** the EFR at waypoint 1 equals `initFob − leg1Fuel`, identical to behaviour before this change

#### Scenario: Taxi fuel applied only once
- **WHEN** the plan has multiple legs
- **THEN** `taxiFuel` is deducted only at the start of leg 1 and does not appear in the EFR chain for legs 2..N

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

### Requirement: Backend computation parity for take-off segment
The backend SHALL accept the new `aircraft` block on the flight plan (Pydantic model) and SHALL apply the same three-phase leg-1 computation as the frontend so that leg time and fuel printed on the kneeboard match what the frontend displays for the same inputs. The backend SHALL also deduct `aircraft.taxiFuel` from the EFR chain at the start of leg 1.

#### Scenario: Backend leg-1 with active take-off matches frontend
- **WHEN** the backend renders a kneeboard for a plan with `aircraft.takeoff.timeSec > 0`, `aircraft.takeoff.distance > 0`, and a regime bound to leg 1
- **THEN** the leg-1 ETE and fuel printed on the kneeboard equal the frontend-displayed values for the same inputs

#### Scenario: Backend respects taxi fuel
- **WHEN** the backend renders a kneeboard for a plan with `aircraft.taxiFuel > 0`
- **THEN** the EFR at waypoint 1 on the kneeboard equals `initFob − taxiFuel − leg1Fuel`

#### Scenario: Backend handles legacy plans
- **WHEN** the backend receives a v1.2 plan (no `aircraft` block, top-level `regimes`)
- **THEN** the kneeboard is generated with `taxiFuel = 0` and no take-off segment, and the regime-driven leg computation matches the pre-change behaviour

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
