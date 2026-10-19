# Spec Delta

## ADDED Requirements

### Requirement: The device-local library is a permanent part of the anonymous tier

In the **anonymous** tier, the per-theatre library SHALL remain available on the device, with no account required. It SHALL reach an account only by being imported (`local-data-migration`). Imported entries SHALL then leave the device-local library. Entries not imported SHALL stay on the device and SHALL be available again in the anonymous tier after logout.

#### Scenario: Anonymous user keeps a library
- **WHEN** an anonymous user opens `/library`
- **THEN** the device-local library for the theatre is shown and can be edited

#### Scenario: Imported entries leave the device
- **WHEN** a user imports their local library on sign-in and the server accepts it
- **THEN** the device-local libraries no longer hold those entries

#### Scenario: Library not imported survives logout
- **WHEN** a user signs in, chooses Not now, and later logs out
- **THEN** the anonymous tier shows the same device-local library as before sign-in
