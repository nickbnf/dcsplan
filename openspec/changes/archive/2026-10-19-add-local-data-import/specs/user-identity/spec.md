# Spec Delta

## MODIFIED Requirements

### Requirement: Log out

A signed-in user SHALL be able to log out, returning to the anonymous state. Logging out SHALL NOT delete or modify the anonymous local flight plan, theatre library, or performance profile held on the device. (Cached copies of synced plans are cleared on logout; see `plan-sync`.) Items imported into the account were already removed from the device when imported (`local-data-migration`); logout does not bring them back.

#### Scenario: Logout returns to anonymous

- **WHEN** a signed-in user logs out
- **THEN** the app returns to the anonymous state

#### Scenario: Logout preserves local data

- **WHEN** a user logs out
- **THEN** their anonymous local flight plan, theatre library, and performance profile remain intact and usable, as they were left after any import

#### Scenario: Imported local data stays in the account

- **WHEN** a user who imported their local profile logs out
- **THEN** the anonymous tier uses the default profile, and the imported profile is only in the account
