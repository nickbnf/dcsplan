# Spec Delta

## ADDED Requirements

### Requirement: Missing-object placeholder card for unresolved library refs
A library ref whose entry is not in the library for the plan's theatre is **unresolved**. The Objects tab SHALL list it as a placeholder card, in place of a library ref card. The card SHALL show a generic pictogram, the ref's per-plan comment if set, and the reason it is unresolved (*deleted* or *not synced yet*). Opening a plan SHALL NOT remove or modify its unresolved refs.

#### Scenario: Unresolved ref is listed, not hidden
- **WHEN** a plan whose refs include one with no matching library entry is open on the Objects tab
- **THEN** the tab lists a placeholder card for it alongside the plan's other objects

#### Scenario: Placeholder shows the per-plan comment
- **WHEN** an unresolved ref carries a per-plan comment
- **THEN** the placeholder card shows that comment as read-only text

#### Scenario: Opening a plan keeps its unresolved refs
- **WHEN** a plan with unresolved refs is opened and closed without the user acting on them
- **THEN** the plan's refs are unchanged

---

### Requirement: Placeholder distinguishes deleted from not-yet-synced entries
An unresolved ref SHALL be shown as **deleted** when its entry is known to be deleted, or is absent while the device is caught up with the server; it offers *Remove from plan* with the usual ref-removal confirmation. It SHALL be shown as **not synced yet** while the device is disconnected or still syncing: not styled as an error, no removal, replaced by a normal card once the entry arrives. In the **anonymous** tier every unresolved ref SHALL be shown as deleted.

#### Scenario: Entry deleted elsewhere (signed-in)
- **WHEN** a signed-in user opens a plan referencing an entry that was deleted from the space's library
- **THEN** the placeholder states the object was deleted from the library and offers Remove from plan

#### Scenario: Remove a deleted placeholder
- **WHEN** the user chooses Remove from plan on a deleted placeholder and confirms
- **THEN** the ref is removed from the plan

#### Scenario: Entry not yet on this device (signed-in)
- **WHEN** a signed-in user opens a plan on a device whose library has not yet received a referenced entry
- **THEN** the placeholder states the object is not synced yet, offers no removal, and is not styled as an error

#### Scenario: Absent entry after catching up is shown as deleted (signed-in)
- **WHEN** a signed-in, connected device has caught up with the server and a plan references an entry the space's library does not hold
- **THEN** the placeholder states the object was deleted and offers Remove from plan

#### Scenario: Not-synced placeholder resolves when the entry arrives (signed-in)
- **WHEN** the missing entry then syncs to that device
- **THEN** the placeholder is replaced by a normal library ref card, and the object is drawn on the map

#### Scenario: Anonymous unresolved ref is shown as deleted
- **WHEN** an anonymous user opens a plan referencing an entry absent from the device-local library
- **THEN** the placeholder states the object was deleted and offers Remove from plan

---

### Requirement: Unresolved library refs are not drawn
An unresolved library ref SHALL NOT be drawn on the planner map or on the kneeboard, SHALL NOT contribute a threat range ring, and SHALL NOT cause an error in either. This applies in both tiers.

#### Scenario: Map omits unresolved refs
- **WHEN** a plan with one unresolved ref and two resolved refs is shown on the planner map
- **THEN** exactly the two resolved objects are drawn, with their range rings if ranged

#### Scenario: Kneeboard omits unresolved refs
- **WHEN** a kneeboard is generated for a plan with an unresolved ref
- **THEN** generation succeeds and the unresolved ref does not appear on any page

## MODIFIED Requirements

### Requirement: Library snapshot merge on plan import
When a flight plan is imported that contains embedded library snapshots, each snapshot's UUID SHALL be merged into the current theatre's library: UUIDs not present SHALL be added with the snapshot data, UUIDs already present SHALL be left unchanged. A summary of added vs kept counts SHALL be presented to the user as part of the import.

Among the kept entries, the summary SHALL separately count those whose library-owned fields (type, position, name, default comment, range) differ from the file's snapshot, and SHALL state that the plan will show the library's version of them. In the **signed-in** tier, an entry already held by the space's library on the server SHALL be kept even if the device's local copy did not yet hold it (see `space-asset-sync`).

#### Scenario: New UUIDs added on import
- **WHEN** a plan is imported whose snapshot contains a UUID not in the current library
- **THEN** the library gains an entry matching the snapshot data

#### Scenario: Existing UUIDs kept unchanged
- **WHEN** a plan is imported whose snapshot contains a UUID already present in the current library with different field values
- **THEN** the current library entry is left unchanged

#### Scenario: Merge summary shown
- **WHEN** a plan is imported with non-empty library snapshots
- **THEN** the user is shown counts of "added" and "kept" library entries

#### Scenario: Kept entries that differ are reported
- **WHEN** a plan is imported whose snapshot holds five UUIDs already in the library, two of them with a different position or name
- **THEN** the summary reports five kept, of which two differ from the file, and states that the plan shows the library's version of those two

#### Scenario: Identical kept entries are not reported as differing
- **WHEN** every kept entry in the snapshot matches the library's copy field for field
- **THEN** the summary reports no differing entries

#### Scenario: A previously deleted entry is added back (signed-in)
- **WHEN** a signed-in user imports a plan whose snapshot holds an entry they had deleted from the space's library
- **THEN** the entry is added back to the library with the snapshot's data and counted as added
