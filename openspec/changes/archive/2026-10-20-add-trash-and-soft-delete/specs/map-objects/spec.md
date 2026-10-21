# Spec Delta

## MODIFIED Requirements

### Requirement: Placeholder distinguishes deleted from not-yet-synced entries
An unresolved ref SHALL be shown as **deleted** when its entry is known to be deleted, or is absent while the device is caught up with the server; it offers *Remove from plan* with the usual ref-removal confirmation. In the **signed-in** tier, a deleted placeholder whose entry is in the Trash SHALL also state that it can be restored from the Trash. It SHALL be shown as **not synced yet** while the device is disconnected or still syncing: not styled as an error, no removal, replaced by a normal card once the entry arrives. In the **anonymous** tier every unresolved ref SHALL be shown as deleted.

#### Scenario: Entry deleted elsewhere (signed-in)
- **WHEN** a signed-in user opens a plan referencing an entry that was deleted from the space's library
- **THEN** the placeholder states the object was deleted from the library and offers Remove from plan

#### Scenario: Trashed entry can be restored (signed-in)
- **WHEN** a signed-in user opens a plan referencing an entry that is in the Trash
- **THEN** the placeholder states the object was deleted and can be restored from the Trash, and offers Remove from plan

#### Scenario: Purged entry cannot be restored (signed-in)
- **WHEN** a signed-in user opens a plan referencing an entry that was purged from the Trash
- **THEN** the placeholder states the object was deleted, does not mention restoring, and offers Remove from plan

#### Scenario: Restoring the entry resolves the placeholder (signed-in)
- **WHEN** a trashed entry referenced by the open plan is restored from the Trash
- **THEN** the placeholder is replaced by a normal library ref card, and the object is drawn on the map

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
