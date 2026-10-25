# Spec Delta

## Purpose

Version history keeps restorable, finalized versions of a signed-in flight plan, roughly one per editing session (AD-5), each pinning the library entries and profile it used (AD-3). It lets a user return the plan to an earlier state without touching the shared library or profiles (AD-4), and stamps kneeboards with the version they were generated from.

## ADDED Requirements

### Requirement: Versions are kept for signed-in plans only

In the **signed-in** tier, every plan SHALL have a version history. In the **anonymous** tier, plans SHALL have no versions and the app SHALL offer no version history (AD-9).

#### Scenario: Signed-in plan has a history
- **WHEN** a signed-in user opens a plan they have edited in an earlier session
- **THEN** the plan's version history is available and lists at least one version

#### Scenario: Anonymous plan has no history
- **WHEN** an anonymous user opens their plan
- **THEN** no version history control is shown

### Requirement: A version is finalized at the end of each editing session

A signed-in plan's edits SHALL be finalized into a new version when 10 minutes pass without an edit to the plan, or when the last device that has the plan open leaves it, whichever comes first. A session with no edits SHALL create no version. Edits from every device and every member count towards the same session. Autosave alone SHALL NOT create a version (AD-5).

#### Scenario: Ten minutes of inactivity finalizes a version
- **WHEN** a user edits a plan that is at Rev 4 and makes no further edit for 10 minutes
- **THEN** the plan has a Rev 5 holding those edits

#### Scenario: Continued editing stays in one session
- **WHEN** a user edits a plan every few minutes for an hour, never pausing for 10 minutes, and keeps it open
- **THEN** no version is finalized during that hour

#### Scenario: Leaving the plan finalizes a version
- **WHEN** a user edits a plan and closes it, and no other device has it open
- **THEN** a new version holding those edits is finalized without waiting 10 minutes

#### Scenario: Opening without editing creates nothing
- **WHEN** a user opens a plan, looks at it and closes it without editing
- **THEN** no new version is created

#### Scenario: Offline edits join the session when they reach the server
- **WHEN** a user edits a plan while disconnected and later reconnects
- **THEN** those edits are finalized into a version once they reach the server and the session ends, like edits made while connected

### Requirement: Destructive operations finalize the session first

Before an operation that discards authored plan content wholesale is applied to a signed-in plan, any unfinalized edits SHALL be finalized into a version, so that a version boundary separates the work from the operation (AD-5). The operations are switching the plan's performance profile (`performance-profile`) and restoring a version.

#### Scenario: Profile switch keeps the bindings it clears in a version
- **WHEN** a user binds legs to regimes, then within the same session switches the plan to another profile
- **THEN** a version holding the regime bindings is finalized before they are cleared, and restoring it brings them back

#### Scenario: No unfinalized edits means no extra version
- **WHEN** a user switches a plan's profile and the plan has no edits since its last version
- **THEN** no version is finalized before the switch

#### Scenario: Profile switch while disconnected
- **WHEN** a signed-in user switches a plan's profile while disconnected
- **THEN** the switch proceeds without finalizing a version, and the edits before and after it join the same session once they reach the server

### Requirement: Version identity

Each version SHALL be identified by a revision number, the time it was finalized and its editors. Revision numbers SHALL start at 1 for each plan, increase by one with each version and never be reused. The editors are every user whose edits the version holds. The last of them to edit SHALL be shown first, followed by the count of the others when there are any.

#### Scenario: Single editor
- **WHEN** only Falcon edited the plan during the session finalized as Rev 14 at 14:32 on 2026-07-23
- **THEN** the version is shown with its revision number Rev 14, its finalization time and the editor Falcon (the kneeboard stamp's exact format is set by *Kneeboards are stamped with the plan's version*)

#### Scenario: Several editors
- **WHEN** Viper and Hawk edited a session, then Falcon made the last edit
- **THEN** the version's editors read `Falcon +2`

#### Scenario: Numbers are never reused
- **WHEN** a plan at Rev 7 has Rev 3 restored
- **THEN** the restored state becomes Rev 8, and Revs 1 to 7 remain in the history

### Requirement: Each version pins its dependencies

Each version SHALL hold, alongside the plan's content, a copy of every library entry the plan referenced and of the profile it flew, as they stood when the version was finalized (AD-3). A reference that did not resolve at that time SHALL be recorded as missing. A version SHALL NOT change after it is finalized, whatever later happens to the library or the profiles. The pinned copies SHALL never be used to change the space's library or profiles, except through an explicit recovery.

#### Scenario: A later library edit does not change a version
- **WHEN** Rev 5 references SAM site X, and X is later moved 5 NM in the space's library
- **THEN** Rev 5's pinned copy of X still holds the old position

#### Scenario: Deleting a dependency does not change a version
- **WHEN** Rev 5 references SAM site X, and X is later deleted and purged
- **THEN** Rev 5 still holds its copy of X

### Requirement: Version history panel

In the **signed-in** tier, the open plan SHALL offer a version history panel listing its versions newest first, each with its revision number, finalization time (in the viewer's local time) and editors. When the plan has edits not yet finalized, the panel SHALL say so above the newest version. Listing versions SHALL require a connection; a disconnected device SHALL say that history is unavailable offline.

#### Scenario: Versions listed newest first
- **WHEN** a user opens the history panel of a plan at Rev 3
- **THEN** it lists Rev 3, Rev 2 and Rev 1 in that order, each with its time and editors

#### Scenario: Unfinalized edits are indicated
- **WHEN** a user has edited a plan at Rev 3 within the current session and opens the history panel
- **THEN** the panel shows that there are changes since Rev 3 not yet in a version

#### Scenario: History unavailable while disconnected
- **WHEN** a signed-in user opens the history panel while disconnected
- **THEN** the panel states that version history is unavailable offline and lists no versions

### Requirement: Restoring a version

In the **signed-in** tier, the user SHALL be able to restore any version of the open plan after a confirmation naming the version. Restoring SHALL set the plan's content to that version's: waypoints, parameters, comments, plan-local markers, name, and which library entries and profile it references. The plan's theatre is unchanged. Restoring SHALL require a connection.

#### Scenario: Restore after confirmation
- **WHEN** a user picks Rev 3 in the history panel and confirms
- **THEN** the plan's waypoints, parameters, comments, name and references are those of Rev 3

#### Scenario: Cancelling leaves the plan alone
- **WHEN** a user picks Rev 3 in the history panel and cancels the confirmation
- **THEN** the plan is unchanged and no version is created

#### Scenario: Restore refused while disconnected
- **WHEN** a signed-in user tries to restore a version while disconnected
- **THEN** the restore is not offered and the panel states that a connection is needed

### Requirement: Restore binds references to the live library and profile

A restored plan's references SHALL resolve against the space's current library and profiles, not against the version's pinned copies (AD-4). Restoring SHALL NOT change any library entry or profile.

#### Scenario: A moved threat shows its current position
- **WHEN** Rev 3 references SAM site X, X has since been moved in the library, and Rev 3 is restored
- **THEN** the plan shows X at its current position, and the library entry is unchanged

#### Scenario: Regime bindings resolve against the current profile
- **WHEN** Rev 3 binds a leg to a regime whose cruise speed has since been edited, and Rev 3 is restored
- **THEN** the leg is bound to that regime and uses its current cruise speed

#### Scenario: A deleted profile stays deleted
- **WHEN** Rev 3 flies profile P, P has since been deleted, and Rev 3 is restored
- **THEN** the plan's profile chooser states that its profile was deleted (`performance-profile`), and P is still in the Trash

### Requirement: Restore creates a new version and reaches every device

Restoring SHALL finalize any unfinalized edits first, then SHALL immediately finalize the restored content as a new version whose editor is the user who restored. Every device that has the plan open SHALL show the restored plan without a reload. Edits made on a disconnected device before the restore SHALL be merged on top of the restored plan when that device reconnects.

#### Scenario: Restore with unfinalized edits
- **WHEN** a plan at Rev 7 has unfinalized edits and the user restores Rev 3
- **THEN** the edits become Rev 8, and the restored content becomes Rev 9 with the restoring user as its editor

#### Scenario: Another device follows the restore
- **WHEN** a plan is open on two devices and one restores Rev 3
- **THEN** the other device shows Rev 3's content without a reload

#### Scenario: Offline edits are not lost to a restore
- **WHEN** device B, disconnected, renames a waypoint, while device A restores Rev 3, and then B reconnects
- **THEN** the plan shows Rev 3's content with B's rename applied, if that waypoint exists in Rev 3

### Requirement: Recovering a missing library entry from a version

In the **signed-in** tier, when a plan references a library entry that does not resolve and a version of the plan pinned a copy of it, the missing-object placeholder SHALL offer to recover it. Recovering SHALL re-create the entry under its id, with the newest pinned copy's data, in the plan's theatre library (`space-asset-sync`). Offering recovery SHALL require a connection; a recovery made offline is sent on reconnection.

#### Scenario: Recover a purged entry
- **WHEN** a restored plan references SAM site X, X was purged from the library, and Rev 5 pinned a copy of X
- **THEN** the placeholder offers recovery, and recovering puts X back in the library with Rev 5's data, resolved in the plan on every device

#### Scenario: Recover a trashed entry
- **WHEN** a plan references entry X, which is in the Trash, and a version pinned a copy of X
- **THEN** recovering brings X back to the library with the pinned copy's data, and X leaves the Trash

#### Scenario: Recovery while disconnected
- **WHEN** the placeholder offered recovery of entry X, the device then loses its connection, and the user recovers X
- **THEN** X is back in the library on that device at once, and reaches the server and the user's other devices on reconnection

#### Scenario: Nothing to recover from
- **WHEN** a plan references entry Y, which no version of the plan ever pinned
- **THEN** the placeholder offers no recovery

### Requirement: Kneeboards are stamped with the plan's version

In the **signed-in** tier, generating a kneeboard SHALL first finalize any unfinalized edits into a version, including every edit shown on the generating device. The kneeboard's waypoint list page SHALL then carry the stamp `Rev N · date · editor` of the plan's latest version, with the date in UTC marked `Z`. In the **anonymous** tier, the waypoint list page SHALL carry the generation date in UTC and no revision. Other pages SHALL carry no stamp in either tier.

#### Scenario: Generating with unfinalized edits
- **WHEN** a signed-in user edits a plan at Rev 4 and generates a kneeboard at once
- **THEN** Rev 5 is finalized with those edits and the waypoint list page is stamped with Rev 5

#### Scenario: Generating with no new edits
- **WHEN** a signed-in user generates a kneeboard for a plan at Rev 4 with no edits since
- **THEN** no version is created and the waypoint list page is stamped with Rev 4

#### Scenario: The stamp names a restorable version
- **WHEN** a pilot holds a kneeboard stamped Rev 5 and the plan has since moved on to Rev 9
- **THEN** Rev 5 is listed in the plan's history and can be restored

#### Scenario: Anonymous kneeboard carries the date only
- **WHEN** an anonymous user generates a kneeboard
- **THEN** the waypoint list page shows the generation date in UTC and no revision number

#### Scenario: Kneeboard needs the server
- **WHEN** a signed-in user tries to generate a kneeboard while disconnected
- **THEN** generation fails with an error, as it does without a connection today, and no version is created

#### Scenario: Only the waypoint list page is stamped
- **WHEN** a signed-in user generates the full kneeboard, or a single leg page
- **THEN** the stamp appears on the waypoint list page only, and no leg or overview page carries it
