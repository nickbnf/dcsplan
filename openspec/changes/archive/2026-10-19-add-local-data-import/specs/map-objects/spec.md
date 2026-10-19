# Spec Delta

## MODIFIED Requirements

### Requirement: Library snapshot merge on plan import
When a flight plan is imported that contains embedded library snapshots, and library entries are selected in the import chooser (`plan-import`), each snapshot's UUID SHALL be merged into the library of the **imported plan's theatre**. UUIDs not present SHALL be added with the snapshot data, and UUIDs already present SHALL be left unchanged. In the **anonymous** tier that library is the device-local library; in the **signed-in** tier it is the active space's library. A summary of added vs kept counts SHALL be presented to the user as part of the import. When library entries are deselected, no entry SHALL be added. Entries already present still resolve, and the rest are shown as unresolved refs.

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

#### Scenario: Snapshot merges into the imported plan's theatre
- **WHEN** a signed-in user whose last opened plan is on Caucasus imports a Syria plan with library entries selected
- **THEN** the snapshot's new entries are added to the space's Syria library, and the Caucasus library is unchanged

#### Scenario: Deselected library entries are not merged
- **WHEN** a plan is imported with its library entries deselected, and its snapshot holds UUIDs the library lacks
- **THEN** no entry is added to the library, and the plan's refs to those UUIDs are shown as unresolved
