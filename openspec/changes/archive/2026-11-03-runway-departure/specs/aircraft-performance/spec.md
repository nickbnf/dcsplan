# Spec Delta

## ADDED Requirements

### Requirement: Straight-out distance on the profile
The aircraft data block SHALL carry `straightOutDistance` (NM, strictly positive): the along-track distance from brake release to the start of the departure turn (`departure`). When absent, it SHALL be treated as 2 NM, including in the null profile. A value that is not strictly positive SHALL show an inline error and SHALL NOT be saved. It is independent of the take-off block's all-or-nothing rule.

#### Scenario: Default when absent
- **WHEN** a profile, a stored profile from before this feature, or the null profile has no `straightOutDistance`
- **THEN** departure computations use 2 NM

#### Scenario: Edited value is used
- **WHEN** the user sets the straight-out distance to 3.5 NM on the plan's profile
- **THEN** the departure turn starts 3.5 NM from brake release

#### Scenario: Non-positive value rejected
- **WHEN** the user enters `0` or a negative value for the straight-out distance and commits
- **THEN** an inline error is shown and the stored value is unchanged

#### Scenario: Independent of the take-off block
- **WHEN** the take-off block is all zero and the straight-out distance is 2 NM
- **THEN** no validation error is shown

## MODIFIED Requirements

### Requirement: Perf page header section
The Performance page (route `/performance`) SHALL render, above the regimes, the profile's aircraft identity — `model` (text input) and `takeoffConfiguration` (text input) — and below it, on its own line under a **General performance** heading, `taxiFuel` (number, lbs), the take-off block (`timeSec` displayed as `mm:ss` editor, `fuel` in lbs, `distance` in NM), and `straightOutDistance` (number, NM, labelled "Straight out"). There is no separate profile name field: the profile is labelled from `model` and `takeoffConfiguration` (`performance-profile`). An information icon next to the take-off row SHALL display the tooltip: *"Time, fuel, and distance covered from brake release through acceleration to climb speed. Use values from your aircraft's performance charts for your T/O configuration. Or obtain by flight testing the difference between a cruise climb and the same climb from brake release."* An information icon next to the straight-out field SHALL display the tooltip: *"Distance from brake release, along the runway heading, before turning on course. Used when a departure runway is set on the first waypoint."*

The page SHALL also expose `⬇ Export performance` and `⬆ Import performance`, both wired to the performance-package file flow described below (signed in: export beside the aircraft identity, import with the profile list).

#### Scenario: Header is always visible on the Perf page
- **WHEN** the user navigates to `/performance`
- **THEN** the aircraft identity, the general performance line, and the Export/Import controls are rendered above the regimes, regardless of whether any regimes are defined

#### Scenario: Tooltip wording for the T/O perf block
- **WHEN** the user hovers the information icon next to the take-off row
- **THEN** the tooltip displays the exact text above

#### Scenario: Tooltip wording for the straight-out field
- **WHEN** the user hovers the information icon next to the straight-out field
- **THEN** the tooltip displays the exact straight-out text above

#### Scenario: Straight-out field shows the default
- **WHEN** the profile has no stored `straightOutDistance`
- **THEN** the straight-out field displays `2`

#### Scenario: Editing aircraft fields persists immediately
- **WHEN** the user changes `model`, `takeoffConfiguration`, `taxiFuel`, any of the three take-off fields, or `straightOutDistance` and commits the edit
- **THEN** the in-memory plan is updated and the change is persisted via the existing auto-persistence mechanism

---

### Requirement: Take-off segment on leg 1
On leg 1 only, when the destination waypoint has a `regimeId` matching a regime in `aircraft.regimes` AND `aircraft.takeoff.timeSec > 0` AND `aircraft.takeoff.distance > 0`, leg time and fuel SHALL be computed as the sum of a take-off segment, the existing climb segment (if any), and the existing cruise segment.

The take-off segment SHALL contribute the user-entered `aircraft.takeoff.timeSec` (verbatim) as time and `aircraft.takeoff.fuel` (verbatim) as fuel. Its ground distance SHALL be wind-corrected: an effective TAS is derived as `TAS_to = aircraft.takeoff.distance / (aircraft.takeoff.timeSec / 3600)` (knots, no-wind average); the segment's ground speed is `applyWind(TAS_to, originWind, course)`; and its ground distance is `groundSpeed × (aircraft.takeoff.timeSec / 3600)` NM. Wind correction SHALL use the **origin** waypoint's wind, consistent with the existing climb-segment convention.

When leg 1 flies a departure path (`departure`), the take-off segment's time and fuel SHALL still be counted verbatim. Its ground distance SHALL instead be the distance covered under the take-off acceleration profile, with the origin wind taken along the departure track, as defined by the `departure` capability.

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
- **WHEN** the take-off block is `{ timeSec: 75, fuel: 250, distance: 1.8 }` (yielding `TAS_to = 86.4 kts`), the origin wind is a 20-knot direct headwind on the leg course, and no departure runway is set
- **THEN** the take-off segment's ground distance is approximately `(86.4 − 20) × (75 / 3600) ≈ 1.38 NM`, less than the chart distance

#### Scenario: Take-off ground distance on a departure path uses the runway wind
- **WHEN** leg 1 flies a departure path with the take-off segment active, and the origin wind is a 20-knot headwind along the runway heading
- **THEN** the take-off ground distance is the profile's take-off distance reduced by the headwind over the take-off time, regardless of the WP0→WP1 course

#### Scenario: Other legs are unaffected
- **WHEN** a leg with index ≥ 1 is computed
- **THEN** no take-off segment is applied; the existing 2-phase or level cruise computation is used unchanged

---

### Requirement: Performance package import — validation
The Perf page SHALL provide an `⬆ Import performance` button that opens a file picker filtered to `.json` files. On file selection, the application SHALL parse the file as JSON and validate it before showing any apply prompt. Validation SHALL be performed entirely on the frontend and SHALL apply these rules:

1. The top-level object MUST have `version === "1.0"`. Any other value SHALL be rejected as an unsupported version.
2. `name` (written by earlier versions) is optional and SHALL be ignored.
3. `aircraft` MUST be an object containing `model` (string), `takeoffConfiguration` (string), `taxiFuel` (number ≥ 0), `takeoff` (object with `timeSec`, `fuel`, `distance`, all numbers ≥ 0; either all zero or all strictly positive), and `regimes` (array, may be empty). `straightOutDistance` is optional; when present it MUST be a number > 0, and when absent the default of 2 NM SHALL apply.
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

#### Scenario: Accept file without straight-out distance
- **WHEN** the imported file's `aircraft` has no `straightOutDistance` (a file exported before this feature)
- **THEN** validation passes and the imported profile uses 2 NM

#### Scenario: Reject non-positive straight-out distance
- **WHEN** the imported file has `aircraft.straightOutDistance = 0`
- **THEN** an error message identifies `straightOutDistance` and the import is not applied
