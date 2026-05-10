# Spec: Performance Regime

## Purpose

A **performance regime** is a named set of aircraft performance parameters (cruise TAS, cruise fuel flow, optional climb block, optional descent block) that can be attached to legs of the flight plan. Regimes allow users to model different flight phases (e.g., cruise at altitude vs. low-level transit) without manually entering performance values on every leg. When a regime is bound to a leg, the system uses it to compute leg time and fuel — including a climb or descent segment when the altitude changes.

---

## Requirements

### Requirement: Performance regime collection on flight plan
The flight plan's `aircraft` object (per the `aircraft-performance` capability) SHALL include a `regimes` collection — a list of named performance regimes definable by the user. The full path to the collection is `flightPlan.aircraft.regimes`. Each regime SHALL have an immutable opaque `id` (generated on creation), a user-editable `name`, an optional free-form `comment`, a mandatory `cruise` block (`tas` in knots, `ff` in pph), an optional `climb` block (`tas`, `ff`, `roc` in fpm) describing climbing UP TO the regime's cruise altitude, and an optional `descent` block (`tas`, `ff`, `rod` in fpm) describing descending DOWN TO the regime's cruise altitude. The collection SHALL round-trip through JSON serialisation without modification.

#### Scenario: New plan starts with no regimes
- **WHEN** a fresh flight plan is created
- **THEN** `aircraft.regimes` is an empty array

#### Scenario: Round-trip serialisation preserves regimes
- **WHEN** a plan with regimes is downloaded as JSON and re-imported
- **THEN** every regime is present in `aircraft.regimes` with identical id, name, comment, cruise, climb, and descent values

#### Scenario: Climb and descent blocks are optional
- **WHEN** a regime in `aircraft.regimes` has only cruise data filled in
- **THEN** the regime is valid; climb and descent fields are absent from the saved JSON

---

### Requirement: Waypoint regime reference
Each waypoint SHALL support an optional `regimeId` reference pointing to an entry in the plan's `regimes` collection. The reference SHALL be co-located with the existing per-waypoint planning fields (`tas`, `fuelFlow`, `alt`, `windDir`, `windSpeed`) and SHALL follow the same "into this waypoint" convention. When `regimeId` is set, `tas` and `fuelFlow` on the waypoint SHALL mirror the referenced regime's cruise values.

#### Scenario: Waypoint with no regimeId is Manual
- **WHEN** a waypoint has no `regimeId`
- **THEN** the leg ending at that waypoint is treated as Manual mode and uses the waypoint's stored `tas` and `fuelFlow`

#### Scenario: Waypoint with regimeId mirrors cruise values
- **WHEN** a waypoint has a `regimeId` matching a regime in the plan
- **THEN** the waypoint's `tas` equals the regime's cruise TAS and the waypoint's `fuelFlow` equals the regime's cruise FF

#### Scenario: Orphan regimeId is cleared on load
- **WHEN** a flight plan is loaded with a waypoint whose `regimeId` does not match any regime in the plan
- **THEN** the waypoint's `regimeId` is cleared on load and the waypoint is treated as Manual; the waypoint's stored `tas` and `fuelFlow` are retained

---

### Requirement: Regime CRUD on the Performance page
The Performance page (route `/performance`) SHALL provide a list-detail interface for managing the active flight plan's regimes: create, rename, edit values, edit comment, and delete. Validation SHALL enforce: (a) name required and unique within the plan; (b) cruise TAS and FF positive; (c) climb section either entirely filled (tas, ff, roc) or entirely empty; (d) descent section either entirely filled (tas, ff, rod) or entirely empty. The climb section header SHALL read "Climb up to this regime"; the descent section header SHALL read "Descent down to this regime".

#### Scenario: Add a new regime
- **WHEN** the user clicks "+ Add regime" on the Perf page
- **THEN** a new regime is appended to the plan's `regimes` collection with a default name and the editor selects it for editing

#### Scenario: Rename a regime preserves references
- **WHEN** the user changes a regime's name to a unique value and saves
- **THEN** the regime's `name` is updated; the regime's `id` is unchanged; every waypoint with `regimeId` matching this regime continues to reference it

#### Scenario: Reject duplicate name
- **WHEN** the user attempts to name a regime with a value already used by another regime in the plan
- **THEN** an inline validation error is shown and the change is not saved

#### Scenario: Edit cruise values propagates to referencing waypoints
- **WHEN** the user changes a regime's cruise TAS or FF
- **THEN** every waypoint whose `regimeId` references this regime has its `tas` / `fuelFlow` updated to the new cruise values

#### Scenario: Delete unreferenced regime
- **WHEN** the user deletes a regime that no waypoint references
- **THEN** the regime is removed from the plan with no further prompts

#### Scenario: Delete referenced regime requires confirmation
- **WHEN** the user attempts to delete a regime referenced by N ≥ 1 waypoints
- **THEN** a confirmation dialog states that the regime is used on N legs and that deleting will revert them to Manual; the deletion proceeds only on explicit confirm

#### Scenario: Referencing waypoints become Manual after deletion
- **WHEN** a referenced regime is deleted with confirmation
- **THEN** every referencing waypoint has `regimeId` cleared while retaining its current `tas` and `fuelFlow` values

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
When the active flight plan has at least one regime defined, each leg's `RouteCard` SHALL display a regime picker. When the plan has no regimes, the picker SHALL be hidden and the leg row UI SHALL be visually identical to the pre-feature behaviour.

The picker SHALL show the bound regime's name when one is selected, "—" when the leg is in Manual mode, and SHALL include all defined regimes plus an explicit "— Manual —" entry. Selecting a regime SHALL set `regimeId` on the destination waypoint and write the regime's cruise TAS/FF onto the waypoint. Selecting "— Manual —" SHALL clear `regimeId` while leaving `tas` and `fuelFlow` at their current values.

#### Scenario: Picker hidden when no regimes exist
- **WHEN** the plan's `regimes` collection is empty
- **THEN** no regime picker is rendered on any leg row and the leg row UI is unchanged from before the feature

#### Scenario: Picker shown on every leg when regimes exist
- **WHEN** the plan has at least one regime
- **THEN** every leg row displays a regime picker

#### Scenario: Picker shows dash for Manual leg
- **WHEN** a leg has no `regimeId`
- **THEN** its picker displays "—"

#### Scenario: Picker shows regime name for bound leg
- **WHEN** a leg has a `regimeId`
- **THEN** its picker displays the referenced regime's name

#### Scenario: Selecting a regime stamps cruise values
- **WHEN** the user picks a regime from the picker on a previously Manual leg
- **THEN** the destination waypoint's `regimeId` is set to that regime's id and its `tas` and `fuelFlow` are written to the regime's cruise values

#### Scenario: Selecting Manual unbinds without changing values
- **WHEN** the user picks "— Manual —" on a leg currently bound to a regime
- **THEN** the destination waypoint's `regimeId` is cleared and `tas` / `fuelFlow` retain their current values

---

### Requirement: Direct edits to TAS or FF revert the leg to Manual
When a leg is bound to a regime and the user directly edits the `tas` or `fuelFlow` field of its destination waypoint, the regime binding SHALL be cleared. Direct edits to altitude or wind SHALL preserve the regime binding (altitude is an input to the climb/descent computation, not a regime output; wind is unrelated to the regime).

#### Scenario: TAS edit clears regime binding
- **WHEN** the user types a new value into the TAS cell of a regime-bound leg and commits the edit
- **THEN** the destination waypoint's `regimeId` is cleared and the new TAS value is stored; `fuelFlow` retains its current value

#### Scenario: FF edit clears regime binding
- **WHEN** the user types a new value into the FF cell of a regime-bound leg and commits the edit
- **THEN** the destination waypoint's `regimeId` is cleared and the new FF value is stored; `tas` retains its current value

#### Scenario: Altitude edit preserves regime binding
- **WHEN** the user changes the altitude of a regime-bound leg
- **THEN** the regime binding is preserved; leg time and fuel are recomputed using the new altitude as input to the climb/descent computation

#### Scenario: Wind edit preserves regime binding
- **WHEN** the user changes wind direction or speed on a regime-bound leg
- **THEN** the regime binding is preserved

---

### Requirement: Climb / descent leg computation
Altitude is conceptually a property of the leg — its cruise altitude. By convention, the transition (climb or descent) between two consecutive legs of differing altitude SHALL occur at the start of the destination leg: the origin waypoint is crossed at the previous leg's altitude, then the aircraft transitions to the new leg's altitude, then cruises to the destination.

When a leg has a non-zero altitude delta from the previous leg AND the leg's regime has matching transition data filled in (climb data when delta > 0, descent data when delta < 0), leg time and fuel SHALL be computed as the sum of a transition segment plus a cruise segment. When the regime's transition data is absent, OR the leg has no regime, OR the altitude delta is zero, leg time and fuel SHALL be computed as level cruise over the full leg distance using the leg's TAS and FF (the existing pre-feature behaviour).

On **leg 1 only**, when the trigger conditions of the `aircraft-performance` capability are met (destination waypoint has a regime AND `aircraft.takeoff.timeSec > 0` AND `aircraft.takeoff.distance > 0`), a take-off segment SHALL be inserted at the start of the leg, before the climb/cruise computation defined by this requirement. The take-off segment's behaviour, wind correction, and contribution to leg time/fuel/distance are owned by the `aircraft-performance` capability. When the trigger conditions are not all met, leg 1 SHALL be computed by this requirement alone, exactly as legs 2..N.

#### Scenario: Level leg with regime uses cruise values
- **WHEN** a leg has altitude delta = 0 and is bound to a regime
- **THEN** leg time and fuel are computed at the regime's cruise TAS and FF over the full leg distance

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
- **THEN** the entire leg is computed at the leg's stored TAS and FF (the pre-feature behaviour)

#### Scenario: Leg 1 with take-off active gets three segments
- **WHEN** leg 1 is bound to a regime with climb data, `aircraft.takeoff.timeSec > 0`, and `aircraft.takeoff.distance > 0`
- **THEN** leg time and fuel equal the take-off segment plus the climb segment plus the cruise segment, per the `aircraft-performance` capability

#### Scenario: Leg 1 with take-off inactive computes as before
- **WHEN** leg 1 is bound to a regime but `aircraft.takeoff.timeSec = 0` or `aircraft.takeoff.distance = 0`
- **THEN** leg 1 is computed by this requirement alone, with no take-off segment inserted

#### Scenario: Legs 2..N never receive a take-off segment
- **WHEN** any leg with index ≥ 1 is computed
- **THEN** no take-off segment is applied; this requirement governs leg time and fuel exclusively

---

### Requirement: Climb / descent indicator and tooltip
The leg row SHALL display a `↗` icon when the leg climbs (altitude delta > 0), a `↘` icon when it descends (altitude delta < 0), and no glyph when level. When a regime with transition data is in use, hovering the icon SHALL show a tooltip with the segment breakdown. In Manual mode (or when transition data is absent), the tooltip SHALL show only the altitude delta and leg distance.

#### Scenario: Climb glyph rendered for upward leg
- **WHEN** a leg has altitude delta > 0
- **THEN** a `↗` glyph is rendered next to the altitude on the leg row

#### Scenario: Descent glyph rendered for downward leg
- **WHEN** a leg has altitude delta < 0
- **THEN** a `↘` glyph is rendered next to the altitude on the leg row

#### Scenario: No glyph for level leg
- **WHEN** a leg has altitude delta = 0
- **THEN** no climb or descent glyph is rendered next to the altitude

#### Scenario: Tooltip shows segment breakdown for regime-driven transition
- **WHEN** the user hovers the climb or descent glyph on a leg using a regime with transition data
- **THEN** a tooltip is displayed showing transition segment time, distance, and fuel, plus cruise segment time, distance, and fuel

#### Scenario: Tooltip shows simple delta for Manual mode
- **WHEN** the user hovers the climb or descent glyph on a Manual mode leg
- **THEN** a tooltip is displayed showing the altitude delta and leg distance only, with no segment breakdown

---

### Requirement: Long-transition warning indicator
When a leg's transition segment cannot complete within the leg's distance (the projected top-of-climb or top-of-descent falls beyond the destination waypoint), the leg row SHALL display a non-interactive `⚠ Fix` indicator. The indicator SHALL carry the same tooltip as the climb/descent glyph, showing the needed transition distance versus the available leg distance. The warning SHALL NOT silently extend the transition into the next leg. The user resolves the conflict using the standard editing tools (altitude field, regime picker, route editing).

#### Scenario: Warning fires on over-long climb
- **WHEN** a regime-driven leg's computed climb distance exceeds its leg distance
- **THEN** the leg row displays a `⚠ Fix` indicator

#### Scenario: Warning fires on over-long descent
- **WHEN** a regime-driven leg's computed descent distance exceeds its leg distance
- **THEN** the leg row displays a `⚠ Fix` indicator

#### Scenario: Warning indicator is non-interactive
- **WHEN** the user clicks the `⚠ Fix` indicator
- **THEN** no plan update occurs

#### Scenario: Warning indicator tooltip matches glyph tooltip
- **WHEN** the user hovers the `⚠ Fix` indicator
- **THEN** a tooltip is shown with the transition distance needed and the leg distance available (the same content as the climb/descent glyph tooltip)

#### Scenario: Warning persists until resolved
- **WHEN** a warning is displayed and the user has not yet resolved it
- **THEN** the warning remains visible on each render and the leg's transition does not silently extend into the next leg

---

### Requirement: Backwards compatibility with v1.1 plans
Plans saved in `FLIGHT_PLAN_VERSION` 1.1 SHALL load without user intervention. Missing `regimes` SHALL default to an empty array; missing `regimeId` on any waypoint SHALL be treated as Manual mode. Saving the plan after load SHALL write `FLIGHT_PLAN_VERSION` 1.2 along with the new fields.

#### Scenario: Load v1.1 plan
- **WHEN** a v1.1 flight plan JSON is loaded (no `regimes` field, no waypoint `regimeId`)
- **THEN** the in-memory plan has `regimes = []`, every waypoint has no `regimeId`, and the leg row UI behaves identically to before the feature

#### Scenario: Save promotes version to 1.2
- **WHEN** a plan loaded from v1.1 is saved (via auto-persistence or explicit download)
- **THEN** the saved JSON has `version` `"1.2"` and includes the `regimes` field (as an empty array if none have been added)

---

### Requirement: Backend computation parity and kneeboard rendering
The backend SHALL accept the new `regimes` field on the flight plan and the optional `regimeId` on waypoints. Backend kneeboard generation SHALL apply the same climb-segment-plus-cruise-segment computation as the frontend so that leg time and fuel printed on the kneeboard match what the frontend displays for the same inputs. Regime identifiers and regime names SHALL NOT appear on the kneeboard.

The doghouse (per-waypoint info box) SHALL display a `↑` glyph immediately before the altitude value when the leg climbs (destination altitude > origin altitude) and a `↓` glyph when it descends (destination altitude < origin altitude). No glyph is shown for level legs. This applies to both the full doghouse and the mini-doghouse. The glyph is driven by the altitude delta alone, independent of whether a regime is bound to the leg.

#### Scenario: Backend computes regime-driven leg values matching frontend
- **WHEN** the backend generates a kneeboard for a plan containing legs bound to regimes with climb/descent data
- **THEN** each leg's printed time and fuel are equal to the frontend-displayed values for the same inputs

#### Scenario: Backend handles legacy plans
- **WHEN** the backend receives a v1.1 plan without `regimes`
- **THEN** kneeboards are generated using the per-waypoint TAS and FF (the pre-feature behaviour)

#### Scenario: Kneeboard shows no regime identifiers
- **WHEN** a kneeboard is generated for a plan that uses regimes
- **THEN** no regime name or regime identifier appears on any kneeboard page

#### Scenario: Doghouse shows climb glyph on ascending leg
- **WHEN** the destination altitude is greater than the origin altitude
- **THEN** the doghouse displays `↑` immediately before the altitude value in both the full and mini doghouse

#### Scenario: Doghouse shows descent glyph on descending leg
- **WHEN** the destination altitude is less than the origin altitude
- **THEN** the doghouse displays `↓` immediately before the altitude value in both the full and mini doghouse

#### Scenario: Doghouse shows no glyph on level leg
- **WHEN** the destination altitude equals the origin altitude
- **THEN** no climb or descent glyph appears before the altitude value in the doghouse
