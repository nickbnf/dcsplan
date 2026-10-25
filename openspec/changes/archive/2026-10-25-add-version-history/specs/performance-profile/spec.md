# Spec Delta

## MODIFIED Requirements

### Requirement: Profile switching resets legs to Manual (signed-in only)
In the **signed-in** tier, switching the plan's `profileId` to a different profile SHALL clear `regimeId` on every waypoint **bound** to a regime of the current profile, retaining the waypoint's stored `tas` and `fuelFlow`. A `regimeId` that does not resolve in the current profile (an orphan, see `performance-regime`) is not bound: the switch SHALL leave it unchanged, and it becomes bound if it resolves in the new profile. Before the switch, a confirmation dialog SHALL name the count of bound legs and state the consequence: legs will be set to Manual while their TAS and fuel flow are kept. When **no** leg is bound to a regime, the switch SHALL proceed without confirmation.

The reset is one-way: switching *back* to the original profile does **not** restore any previously cleared `regimeId`. Recovery is available through the planner's undo stack, and through version history: before the switch is applied, any unfinalized edits SHALL be finalized into a version (`version-history`), so the cleared bindings remain restorable after the session ends.

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

#### Scenario: Cleared bindings are kept in a version (signed-in)
- **WHEN** a signed-in user binds legs to regimes and, in the same session, confirms a switch to another profile
- **THEN** a version holding the bindings is finalized before they are cleared, and restoring that version brings the bindings back

#### Scenario: Orphan bindings survive a switch and resolve in the new profile (signed-in)
- **WHEN** a signed-in user's plan resolves to the null profile, its legs carry `regimeId`s from a profile no longer in the space, and the user selects a profile that contains regimes with those ids
- **THEN** the switch happens with no confirmation, no `regimeId` is cleared, and the legs compute from the new profile's regimes
