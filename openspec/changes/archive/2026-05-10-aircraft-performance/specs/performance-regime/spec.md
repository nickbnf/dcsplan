## MODIFIED Requirements

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
