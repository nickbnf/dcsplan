## MODIFIED Requirements

### Requirement: Climb / descent leg computation
Altitude is conceptually a property of the leg — its cruise altitude. By convention, the transition (climb or descent) between two consecutive legs of differing altitude SHALL occur at the start of the destination leg: the origin waypoint is crossed at the previous leg's altitude, then the aircraft transitions to the new leg's altitude, then cruises to the destination.

The altitude delta of a leg SHALL be computed as: `destination.alt − origin.alt` for every leg **except leg 1**. For **leg 1**, the delta SHALL be computed as `destination.alt − origin.groundAlt`, where `origin.groundAlt` is the first waypoint's takeoff field elevation per the `waypoint-field-elevation` capability (treated as `0` ft when undefined). The first waypoint's `alt` field SHALL NOT participate in leg-1 computation.

When a leg has a non-zero altitude delta AND the leg's regime has matching transition data filled in (climb data when delta > 0, descent data when delta < 0), leg time and fuel SHALL be computed as the sum of a transition segment plus a cruise segment. When the regime's transition data is absent, OR the leg has no regime, OR the altitude delta is zero, leg time and fuel SHALL be computed as level cruise over the full leg distance using the leg's TAS and FF (the existing pre-feature behaviour).

On **leg 1 only**, when the trigger conditions of the `aircraft-performance` capability are met (destination waypoint has a regime AND `aircraft.takeoff.timeSec > 0` AND `aircraft.takeoff.distance > 0`), a take-off segment SHALL be inserted at the start of the leg, before the climb/cruise computation defined by this requirement. The take-off segment's behaviour, wind correction, and contribution to leg time/fuel/distance are owned by the `aircraft-performance` capability. The take-off segment does not consume any altitude; the climb segment continues to cover the full altitude delta from `origin.groundAlt` to `destination.alt`. When the trigger conditions are not all met, leg 1 SHALL be computed by this requirement alone, exactly as legs 2..N (but still using `origin.groundAlt` for the start altitude).

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
