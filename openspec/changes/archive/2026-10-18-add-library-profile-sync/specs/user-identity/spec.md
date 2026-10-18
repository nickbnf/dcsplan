# Spec Delta

## ADDED Requirements

### Requirement: Signed-in state survives starting offline

When the app starts and the server cannot be reached, a device on which a user was last signed in SHALL start in that user's signed-in tier, marked as disconnected, rather than in the anonymous tier. It SHALL check the session again once the server is reachable. Only a server answer that the session is invalid SHALL end the signed-in state. A device with no remembered user starts anonymous.

#### Scenario: Offline start keeps the signed-in tier
- **WHEN** a user who was signed in on this device opens the app with no connection
- **THEN** the app starts signed in as that user, shows that it is disconnected, and offers the space's cached plans, library and profiles

#### Scenario: Session confirmed on reconnect
- **WHEN** the connection returns and the server confirms the session
- **THEN** the disconnected indication clears and syncing resumes, with no reload

#### Scenario: Session found invalid on reconnect
- **WHEN** the connection returns and the server reports the session as expired or invalid
- **THEN** the app leaves the signed-in tier as for a logout, warning first if changes are still waiting to be sent

#### Scenario: No remembered user starts anonymous
- **WHEN** the app is opened with no connection on a device where nobody was signed in
- **THEN** the app starts in the anonymous tier
