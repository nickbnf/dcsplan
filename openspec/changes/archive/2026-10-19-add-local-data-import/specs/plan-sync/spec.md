# Spec Delta

## MODIFIED Requirements

### Requirement: Logout clears synced plan caches but preserves the anonymous local plan

On logout, the device's cached copies of **synced** plans SHALL be cleared, because the server retains those copies. The anonymous, local-only plan SHALL be preserved, as it may be the user's only copy. If that plan was imported into the account, it was already replaced by a fresh plan on import (`local-data-migration`), and the fresh plan is what remains. The device is not wiped beyond this.

#### Scenario: Synced plans are cleared on logout
- **WHEN** a signed-in user logs out
- **THEN** the device no longer holds cached copies of their synced plans

#### Scenario: The anonymous local plan survives logout
- **WHEN** a signed-in user who did not import their local plan logs out
- **THEN** the local-only anonymous plan on the device is preserved

#### Scenario: An imported local plan is not restored on logout
- **WHEN** a user who imported their local plan into the account logs out
- **THEN** the anonymous tier shows a fresh plan, and the imported plan exists only in the account
