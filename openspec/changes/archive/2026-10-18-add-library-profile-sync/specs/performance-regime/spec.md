# Spec Delta

## MODIFIED Requirements

### Requirement: Waypoint regime reference
Each waypoint SHALL support an optional `regimeId` reference pointing to an entry in the plan's resolved profile's regime collection. The reference SHALL be co-located with the existing per-waypoint planning fields (`tas`, `fuelFlow`, `alt`, `windDir`, `windSpeed`) and SHALL follow the same "into this waypoint" convention.

When `regimeId` is set, leg computation SHALL resolve the leg's cruise TAS and fuel flow from the referenced regime at read time. The waypoint's stored `tas` and `fuelFlow` fields SHALL be used **only** when `regimeId` is absent (Manual mode). There SHALL be no mirrored copy of regime values on the waypoint — the regime is the single source of truth for bound legs.

When `regimeId` is absent, the leg is in Manual mode and uses the waypoint's stored `tas` and `fuelFlow`.

A `regimeId` that does not match any regime in the resolved profile is an **orphan**. In the **anonymous** tier, an orphan SHALL be cleared on load. In the **signed-in** tier, an orphan SHALL NOT be cleared or otherwise written to the plan by loading or syncing; the leg SHALL compute as Manual while the orphan does not resolve, and SHALL resolve again as soon as the regime is available.

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
- **WHEN** an anonymous user's flight plan is loaded with a waypoint whose `regimeId` does not match any regime in the resolved profile
- **THEN** the waypoint's `regimeId` is cleared on load and the waypoint is treated as Manual; the waypoint's stored `tas` and `fuelFlow` are retained

#### Scenario: Orphan regimeId is kept while unresolved (signed-in)
- **WHEN** a signed-in user opens a plan on a device where the plan's profile has not yet synced
- **THEN** the bound legs compute as Manual from their stored `tas` and `fuelFlow`, and the plan's `regimeId` values are not changed

#### Scenario: Orphan regimeId resolves once the profile arrives (signed-in)
- **WHEN** the missing profile then syncs to that device
- **THEN** the bound legs compute from their regimes again, with no user action
