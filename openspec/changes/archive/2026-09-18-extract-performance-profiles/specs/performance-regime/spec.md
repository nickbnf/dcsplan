## MODIFIED Requirements

### Requirement: Performance regime collection on flight plan
The plan's regime collection SHALL be owned by the plan's resolved **performance profile** (per the `performance-profile` capability). The resolution path is tier-dependent: anonymous resolves implicitly to the single profile; signed-in resolves via the plan's `profileId`. In either case, regimes are at the profile's `aircraft.regimes`. Each regime SHALL have an immutable opaque `id` (generated on creation), a user-editable `name`, an optional free-form `comment`, a mandatory `cruise` block (`tas` in knots, `ff` in pph), an optional `climb` block (`tas`, `ff`, `roc` in fpm) describing climbing UP TO the regime's cruise altitude, and an optional `descent` block (`tas`, `ff`, `rod` in fpm) describing descending DOWN TO the regime's cruise altitude. The collection SHALL round-trip through JSON serialisation as part of the profile without modification.

#### Scenario: New plan starts with no regimes
- **WHEN** a fresh flight plan is created
- **THEN** the resolved profile's `aircraft.regimes` is an empty array

#### Scenario: Round-trip serialisation preserves regimes
- **WHEN** a profile with regimes is exported and re-imported
- **THEN** every regime is present with identical id, name, comment, cruise, climb, and descent values

#### Scenario: Climb and descent blocks are optional
- **WHEN** a regime has only cruise data filled in
- **THEN** the regime is valid; climb and descent fields are absent from the saved JSON

---

### Requirement: Waypoint regime reference
Each waypoint SHALL support an optional `regimeId` reference pointing to an entry in the plan's resolved profile's regime collection. The reference SHALL be co-located with the existing per-waypoint planning fields (`tas`, `fuelFlow`, `alt`, `windDir`, `windSpeed`) and SHALL follow the same "into this waypoint" convention.

When `regimeId` is set, leg computation SHALL resolve the leg's cruise TAS and fuel flow from the referenced regime at read time. The waypoint's stored `tas` and `fuelFlow` fields SHALL be used **only** when `regimeId` is absent (Manual mode). There SHALL be no mirrored copy of regime values on the waypoint — the regime is the single source of truth for bound legs.

When `regimeId` is absent, the leg is in Manual mode and uses the waypoint's stored `tas` and `fuelFlow`.

#### Scenario: Waypoint with no regimeId is Manual
- **WHEN** a waypoint has no `regimeId`
- **THEN** the leg ending at that waypoint is treated as Manual mode and uses the waypoint's stored `tas` and `fuelFlow`

#### Scenario: Waypoint with regimeId mirrors cruise values
- **WHEN** a waypoint has a `regimeId` matching a regime in the resolved profile
- **THEN** the leg's cruise TAS and fuel flow are the regime's current cruise TAS and FF, resolved at computation time — not mirrored onto the waypoint's stored `tas`/`fuelFlow` fields

#### Scenario: Editing a regime's cruise values is reflected immediately
- **WHEN** a regime's cruise TAS or FF is changed
- **THEN** every leg bound to that regime computes with the new values on the next render, without any write to waypoint fields

#### Scenario: Orphan regimeId is cleared on load
- **WHEN** a flight plan is loaded with a waypoint whose `regimeId` does not match any regime in the resolved profile
- **THEN** the waypoint's `regimeId` is cleared on load and the waypoint is treated as Manual; the waypoint's stored `tas` and `fuelFlow` are retained

---

### Requirement: Regime CRUD on the Performance page
The Performance page (route `/performance`) SHALL provide a list-detail interface for managing regimes within the resolved profile (anonymous: the single profile; signed-in: the editing profile per the `performance-profile` selection split). The interface SHALL support: create, rename, edit values, edit comment, and delete. Validation SHALL enforce: (a) name required and unique within the profile; (b) cruise TAS and FF positive; (c) climb section either entirely filled (tas, ff, roc) or entirely empty; (d) descent section either entirely filled (tas, ff, rod) or entirely empty. The climb section header SHALL read "Climb up to this regime"; the descent section header SHALL read "Descent down to this regime".

#### Scenario: Add a new regime
- **WHEN** the user clicks "+ Add regime" on the Perf page
- **THEN** a new regime is appended to the resolved profile's regime collection with a default name and the editor selects it for editing

#### Scenario: Rename a regime preserves references
- **WHEN** the user changes a regime's name to a unique value and saves
- **THEN** the regime's `name` is updated; the regime's `id` is unchanged; every waypoint with `regimeId` matching this regime continues to reference it

#### Scenario: Reject duplicate name
- **WHEN** the user attempts to name a regime with a value already used by another regime in the profile
- **THEN** an inline validation error is shown and the change is not saved

#### Scenario: Edit cruise values propagates to referencing waypoints
- **WHEN** the user changes a regime's cruise TAS or FF
- **THEN** every leg whose `regimeId` references this regime computes with the new values on the next render — values are resolved from the regime at read time, not written onto waypoint fields

#### Scenario: Delete unreferenced regime
- **WHEN** the user deletes a regime that no waypoint references
- **THEN** the regime is removed from the profile with no further prompts

#### Scenario: Delete referenced regime requires confirmation
- **WHEN** the user attempts to delete a regime referenced by N ≥ 1 waypoints
- **THEN** a confirmation dialog states that the regime is used on N legs and that deleting will revert them to Manual; the deletion proceeds only on explicit confirm

#### Scenario: Referencing waypoints become Manual after deletion
- **WHEN** a referenced regime is deleted with confirmation
- **THEN** every referencing waypoint has `regimeId` cleared while retaining its current stored `tas` and `fuelFlow` values

#### Scenario: Climb section all-or-nothing validation
- **WHEN** the user fills only some of the climb section's tas/ff/roc fields and attempts to save
- **THEN** validation fails with an error indicating the climb section must be either fully filled or fully empty

#### Scenario: Descent section all-or-nothing validation
- **WHEN** the user fills only some of the descent section's tas/ff/rod fields and attempts to save
- **THEN** validation fails with an error indicating the descent section must be either fully filled or fully empty

#### Scenario: Editor section labels make directionality explicit
- **WHEN** the user views the regime editor
- **THEN** the climb section header reads "Climb up to this regime" and the descent section header reads "Descent down to this regime"

---

### Requirement: Regime picker on the leg row
When the plan's resolved profile has at least one regime defined, each leg's `RouteCard` SHALL display a regime picker. When the profile has no regimes, the picker SHALL be hidden and the leg row UI SHALL be visually identical to the pre-feature behaviour.

The picker SHALL show the bound regime's name when one is selected, "—" when the leg is in Manual mode, and SHALL include all defined regimes plus an explicit "— Manual —" entry. Selecting a regime SHALL set `regimeId` on the destination waypoint. Selecting "— Manual —" SHALL clear `regimeId` while leaving `tas` and `fuelFlow` at their current stored values.

#### Scenario: Picker hidden when no regimes exist
- **WHEN** the resolved profile's regime collection is empty
- **THEN** no regime picker is rendered on any leg row and the leg row UI is unchanged from before the feature

#### Scenario: Picker shown on every leg when regimes exist
- **WHEN** the resolved profile has at least one regime
- **THEN** every leg row displays a regime picker

#### Scenario: Picker shows dash for Manual leg
- **WHEN** a leg has no `regimeId`
- **THEN** its picker displays "—"

#### Scenario: Picker shows regime name for bound leg
- **WHEN** a leg has a `regimeId`
- **THEN** its picker displays the referenced regime's name

#### Scenario: Selecting a regime stamps cruise values
- **WHEN** the user picks a regime from the picker on a previously Manual leg
- **THEN** the destination waypoint's `regimeId` is set to that regime's id; the leg now computes TAS and fuel flow from the regime at read time (no values are written onto the waypoint)

#### Scenario: Selecting Manual unbinds without changing values
- **WHEN** the user picks "— Manual —" on a leg currently bound to a regime
- **THEN** the destination waypoint's `regimeId` is cleared and `tas` / `fuelFlow` retain their current stored values

---

### Requirement: Direct edits to TAS or FF revert the leg to Manual
When a leg is bound to a regime and the user directly edits the `tas` or `fuelFlow` field of its destination waypoint, the regime binding SHALL be cleared and the user's entered value SHALL be stored on the waypoint. This is a structural consequence of de-mirroring: bound legs read from the regime, so writing a user value onto the waypoint means switching to Manual so the stored value takes effect. Direct edits to altitude or wind SHALL preserve the regime binding (altitude is an input to the climb/descent computation, not a regime output; wind is unrelated to the regime).

#### Scenario: TAS edit clears regime binding
- **WHEN** the user types a new value into the TAS cell of a regime-bound leg and commits the edit
- **THEN** the destination waypoint's `regimeId` is cleared and the new TAS value is stored; `fuelFlow` retains its current stored value

#### Scenario: FF edit clears regime binding
- **WHEN** the user types a new value into the FF cell of a regime-bound leg and commits the edit
- **THEN** the destination waypoint's `regimeId` is cleared and the new FF value is stored; `tas` retains its current stored value

#### Scenario: Altitude edit preserves regime binding
- **WHEN** the user changes the altitude of a regime-bound leg
- **THEN** the regime binding is preserved; leg time and fuel are recomputed using the new altitude as input to the climb/descent computation

#### Scenario: Wind edit preserves regime binding
- **WHEN** the user changes wind direction or speed on a regime-bound leg
- **THEN** the regime binding is preserved

---

### Requirement: Climb / descent leg computation
Altitude is conceptually a property of the leg — its cruise altitude. By convention, the transition (climb or descent) between two consecutive legs of differing altitude SHALL occur at the start of the destination leg: the origin waypoint is crossed at the previous leg's altitude, then the aircraft transitions to the new leg's altitude, then cruises to the destination.

The altitude delta of a leg SHALL be computed as: `destination.alt − origin.alt` for every leg **except leg 1**. For **leg 1**, the delta SHALL be computed as `destination.alt − origin.groundAlt`, where `origin.groundAlt` is the first waypoint's takeoff field elevation per the `waypoint-field-elevation` capability (treated as `0` ft when undefined). The first waypoint's `alt` field SHALL NOT participate in leg-1 computation.

When a leg has a non-zero altitude delta AND the leg's regime has matching transition data filled in (climb data when delta > 0, descent data when delta < 0), leg time and fuel SHALL be computed as the sum of a transition segment plus a cruise segment. The regime's cruise TAS and FF — resolved at computation time from the regime, not from any waypoint field — SHALL be used for the cruise segment. When the regime's transition data is absent, OR the leg has no regime, OR the altitude delta is zero, leg time and fuel SHALL be computed as level cruise over the full leg distance using the leg's effective TAS and FF (resolved from regime for bound legs, from stored waypoint values for Manual legs).

On **leg 1 only**, when the trigger conditions of the `aircraft-performance` capability are met (destination waypoint has a regime AND `aircraft.takeoff.timeSec > 0` AND `aircraft.takeoff.distance > 0`), a take-off segment SHALL be inserted at the start of the leg, before the climb/cruise computation defined by this requirement. The take-off segment's behaviour, wind correction, and contribution to leg time/fuel/distance are owned by the `aircraft-performance` capability. The take-off segment does not consume any altitude; the climb segment continues to cover the full altitude delta from `origin.groundAlt` to `destination.alt`. When the trigger conditions are not all met, leg 1 SHALL be computed by this requirement alone, exactly as legs 2..N (but still using `origin.groundAlt` for the start altitude).

#### Scenario: Level leg with regime uses cruise values
- **WHEN** a leg has altitude delta = 0 and is bound to a regime
- **THEN** leg time and fuel are computed at the regime's cruise TAS and FF (resolved from the regime) over the full leg distance

#### Scenario: Climbing leg with full climb regime data uses both segments
- **WHEN** a leg has altitude delta > 0 and is bound to a regime with climb data filled in
- **THEN** leg time equals the climb segment time plus the cruise segment time, and leg fuel equals the climb segment fuel plus the cruise segment fuel

#### Scenario: Climbing leg without climb regime data falls back to cruise
- **WHEN** a leg has altitude delta > 0 and is bound to a regime whose climb data is empty
- **THEN** the entire leg is computed at the regime's cruise TAS and FF

#### Scenario: Descending leg with full descent regime data uses both segments
- **WHEN** a leg has altitude delta < 0 and is bound to a regime with descent data filled in
- **THEN** leg time equals the descent segment time plus the cruise segment time, and leg fuel equals the descent segment fuel plus the cruise segment fuel

#### Scenario: Manual leg with altitude delta uses level cruise
- **WHEN** a leg has altitude delta ≠ 0 and is in Manual mode (no regime)
- **THEN** the entire leg is computed at the leg's stored TAS and FF

#### Scenario: Leg 1 altitude delta is sourced from groundAlt
- **WHEN** leg 1's origin (the first waypoint) has `groundAlt = E` ft and `alt = X` ft, and the destination has `alt = A` ft
- **THEN** the altitude delta used to compute leg 1 is `A − E` (independent of `X`)

#### Scenario: Leg 1 with undefined groundAlt uses 0 ft as start altitude
- **WHEN** leg 1's origin has no `groundAlt` (legacy plan) and the destination has `alt = A` ft
- **THEN** the altitude delta used to compute leg 1 is `A − 0 = A`

#### Scenario: Leg 1 with take-off active gets three segments
- **WHEN** leg 1 is bound to a regime with climb data, `aircraft.takeoff.timeSec > 0`, and `aircraft.takeoff.distance > 0`
- **THEN** leg time and fuel equal the take-off segment plus the climb segment plus the cruise segment, per the `aircraft-performance` capability; the climb segment covers the full `destination.alt − origin.groundAlt` delta

#### Scenario: Leg 1 with take-off inactive computes as before
- **WHEN** leg 1 is bound to a regime but `aircraft.takeoff.timeSec = 0` or `aircraft.takeoff.distance = 0`
- **THEN** leg 1 is computed by this requirement alone, with no take-off segment inserted, still using `origin.groundAlt` as the start altitude

#### Scenario: Legs 2..N never receive a take-off segment
- **WHEN** any leg with index ≥ 1 is computed
- **THEN** no take-off segment is applied; this requirement governs leg time and fuel exclusively

#### Scenario: Legs 2..N use origin.alt as start altitude
- **WHEN** a leg with index ≥ 1 is computed (i.e., not leg 1)
- **THEN** the altitude delta is `destination.alt − origin.alt`; `origin.groundAlt` is not consulted

---

### Requirement: Backwards compatibility with v1.1 plans
Plans saved in `FLIGHT_PLAN_VERSION` 1.1 SHALL load without user intervention. Missing `regimes` SHALL default to an empty array; missing `regimeId` on any waypoint SHALL be treated as Manual mode. The `performance-profile` migration ensures a profile exists for the plan to resolve to. Saving the plan after load SHALL write the current `FLIGHT_PLAN_VERSION` along with the new fields.

#### Scenario: Load v1.1 plan
- **WHEN** a v1.1 flight plan JSON is loaded (no `regimes` field, no waypoint `regimeId`)
- **THEN** the resolved profile has an empty `regimes` array, every waypoint has no `regimeId`, and the leg row UI behaves identically to before the feature

#### Scenario: Save promotes version to 1.2
- **WHEN** a plan loaded from v1.1 is saved (via auto-persistence or explicit download)
- **THEN** the saved JSON has the current `FLIGHT_PLAN_VERSION`

---

### Requirement: Backend computation parity and kneeboard rendering
The backend SHALL accept the marshalled `aircraft` block on the flight plan (including `regimes`) and the optional `regimeId` on waypoints. Backend kneeboard generation SHALL resolve a bound leg's cruise TAS and FF from the regime in the same way as the frontend, so that leg time and fuel printed on the kneeboard match what the frontend displays for the same inputs. Regime identifiers, regime names, and profile names SHALL NOT appear on the kneeboard.

The doghouse (per-waypoint info box) SHALL display a `↑` glyph immediately before the altitude value when the leg climbs (destination altitude > origin altitude) and a `↓` glyph when it descends (destination altitude < origin altitude). No glyph is shown for level legs. This applies to both the full doghouse and the mini-doghouse. The glyph is driven by the altitude delta alone, independent of whether a regime is bound to the leg.

#### Scenario: Backend computes regime-driven leg values matching frontend
- **WHEN** the backend generates a kneeboard for a plan containing legs bound to regimes with climb/descent data
- **THEN** each leg's printed time and fuel are equal to the frontend-displayed values for the same inputs

#### Scenario: Backend handles legacy plans
- **WHEN** the backend receives a v1.1 plan without `regimes`
- **THEN** kneeboards are generated using the per-waypoint TAS and FF (the pre-feature behaviour)

#### Scenario: Kneeboard shows no regime identifiers
- **WHEN** a kneeboard is generated for a plan that uses regimes
- **THEN** no regime name, regime identifier, or profile name appears on any kneeboard page

#### Scenario: Doghouse shows climb glyph on ascending leg
- **WHEN** the destination altitude is greater than the origin altitude
- **THEN** the doghouse displays `↑` immediately before the altitude value in both the full and mini doghouse

#### Scenario: Doghouse shows descent glyph on descending leg
- **WHEN** the destination altitude is less than the origin altitude
- **THEN** the doghouse displays `↓` immediately before the altitude value in both the full and mini doghouse

#### Scenario: Doghouse shows no glyph on level leg
- **WHEN** the destination altitude equals the origin altitude
- **THEN** no climb or descent glyph appears before the altitude value in the doghouse

## REMOVED Requirements

### Requirement: Regime cruise value mirroring onto waypoints

**Reason:** The behaviour where setting or changing a regime's cruise TAS/FF would write (mirror) those values onto every bound waypoint's `tas` and `fuelFlow` fields is removed. This mirroring was the root of a cross-entity undo defect (documented in AD-12): undoing a regime edit would rewind the mirrored copy on the waypoint but not the regime, leaving a bound leg whose stored values no longer matched its regime. De-mirroring (D11, decided 2026-09-17) resolves this by making the regime the single source of truth for bound-leg TAS/FF, read at computation time.

**Migration:** No user-facing migration. `propagateRegimeCruiseChange` is removed. Existing plans with mirrored values on waypoints are unaffected: the stored `tas`/`fuelFlow` on a bound waypoint are simply ignored at computation time (the regime's values are used instead); if the user unbinds the leg (reverts to Manual), the stored values — which were the last-mirrored cruise values — become active, which matches the current "retain TAS/FF on unbind" behaviour.
