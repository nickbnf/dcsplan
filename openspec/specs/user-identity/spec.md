# Spec: User Identity

## Purpose

Defines how a user authenticates with dcsplan: signing in with Discord, having an account created on first sign-in, staying signed in across sessions, and signing out — while the anonymous tier stays fully usable (AD-9, AD-11).

## Requirements

### Requirement: Sign in with Discord

The system SHALL allow a user to sign in using Discord as the identity provider (AD-11). Signing in SHALL be optional — the app is fully usable without it (see "Anonymous tier remains fully functional").

#### Scenario: Successful Discord sign-in

- **WHEN** an anonymous user starts Discord sign-in and authorizes the app on Discord
- **THEN** they are returned to the app in a signed-in state

### Requirement: Account creation on first sign-in

The first time a given Discord identity signs in, the system SHALL create a persistent account associated with that identity. A subsequent sign-in by the same Discord identity SHALL reuse that account and SHALL NOT create a duplicate.

#### Scenario: First sign-in creates an account

- **WHEN** a Discord identity signs in for the first time
- **THEN** an account is created and associated with that identity

#### Scenario: Returning sign-in reuses the account

- **WHEN** a Discord identity that already has an account signs in again
- **THEN** the existing account is used and no duplicate account is created

### Requirement: Persistent signed-in session

While signed in, the system SHALL keep the user signed in across page reloads and separate requests until they log out or the session expires. The system SHALL report the current user's identity (such as display name and avatar) while signed in, and report an anonymous state otherwise.

#### Scenario: Session persists across reload

- **WHEN** a signed-in user reloads the app
- **THEN** they remain signed in

#### Scenario: Querying the current user

- **WHEN** the app asks who the current user is
- **THEN** it receives the signed-in user's identity if signed in, or an anonymous state if not

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

### Requirement: Anonymous tier remains fully functional

The anonymous tier SHALL remain a first-class, fully usable tier (AD-9). Within this capability, signing in SHALL NOT change where the user's data is stored or how many plans they may hold; all three entities remain on-device exactly as for an anonymous user.

#### Scenario: Full use without an account

- **WHEN** a user never signs in
- **THEN** they can create and edit a flight plan, drop plan-local markers, and keep a performance profile with no loss of functionality

#### Scenario: Signing in does not alter local data

- **WHEN** a user signs in
- **THEN** their local data is neither moved to a server nor changed, and no server-backed plan or space behaviour is unlocked

### Requirement: Reject unverified authentication callbacks

The system SHALL complete sign-in only for an authentication callback that corresponds to a sign-in it initiated. A callback that cannot be verified as originating from a sign-in this app started SHALL be rejected without establishing a session.

#### Scenario: Callback that does not match an initiated sign-in

- **WHEN** an authentication callback arrives that does not correspond to a sign-in the app initiated
- **THEN** sign-in is rejected and the user remains anonymous

### Requirement: Cancelled or failed authorization

If the user cancels sign-in at Discord, or Discord denies authorization, the system SHALL leave the user in the anonymous state with no change to any account, and the app SHALL remain fully usable.

#### Scenario: User cancels at Discord

- **WHEN** a user cancels authorization at Discord
- **THEN** they return to the app anonymous, no account is created, and the app continues to work normally

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
