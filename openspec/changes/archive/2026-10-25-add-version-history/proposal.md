# Proposal

## Why

Signed-in plans now autosave and sync, but nothing keeps what they used to be: a bad edit, a careless collaborator or a sync merge that went the wrong way can only be repaired by hand. Version history is the remaining half of the "first usable release" (product brief, Phase 1), and the kneeboard has no revision stamp tying a printed brief to a state of the plan that can be found again.

## What Changes

- **Finalized plan versions, server-side.** For a signed-in plan, the server finalizes a version at the end of each editing session, coalesced as AD-5 sets out: after 10 minutes without edits, when the last device leaves the plan, and on kneeboard generation. Autosave still creates no version (AD-5). Each version is identified as `Rev N · date · editor`, numbered per plan from 1. When several members edit in one session, every contributor is recorded and the last editor is shown first (`Falcon +2`, AD-5).
- **Each version pins a snapshot** of the library entries and the profile the plan referenced when it was finalized (AD-3). The snapshot is read-only and is never used to change shared state.
- **A version history panel** for the open plan lists its versions newest first. Each version can be restored with one click after a confirmation.
- **Restore** reverts only the plan's own content, including which library entries and profile it references, and binds those references to the current live library and profile (AD-4). It finalizes the current session first, then creates a new current version. It reaches every device viewing the plan through normal sync (AD-6).
- **Missing dependencies after restore.** A library entry that a restored version references but that has since been deleted is shown as a missing object, as today. When the chosen version's snapshot holds it, a one-click **recover into the library** is offered from that snapshot (AD-3, AD-4).
- **Switching the plan's performance profile finalizes the current session first**, so the regime bindings it clears are kept in a version (AD-5's destructive-operation rule). In the signed-in tier, import and New flight plan add a plan rather than replace one, so they are not affected.
- **Kneeboard revision stamp.** Generating a kneeboard for a signed-in plan finalizes a version when there are unfinalized edits, then stamps the kneeboard's waypoint list page with that version's `Rev N · date · editor`. An anonymous plan has no versions (AD-9), so its kneeboard carries the generation date only.
- **Restore is not undoable** with Undo. Like the other operations that replace the plan wholesale, it clears the plan's undo and redo history (AD-12).
- **A trashed plan keeps its versions**, so restoring it from the Trash brings its history back. Purging a plan purges its versions.

## Capabilities

### New Capabilities

- `version-history`: finalized plan versions. Covers when a version is finalized (session coalescing and forced finalization), its identity and contributors, the pinned dependency snapshot, the history list, restore and re-binding, recovering a missing dependency from a snapshot, and the kneeboard revision stamp.

### Modified Capabilities

- `performance-profile`: switching the plan's profile in the signed-in tier finalizes the current session before clearing regime bindings.
- `edit-undo`: restoring a version is added to the operations that are not undoable and that clear the undo history.
- `soft-delete`: a trashed plan's versions are kept and come back with it on restore, and purging a plan purges its versions.

## Non-goals

- **Library and profile history.** AD-4 gives each entity its own history. This change covers the plan's only; library and profile versioning are a follow-up.
- **Regenerating an old version's kneeboard.** The pinned snapshot holds everything needed to reproduce `Rev N`, but producing a kneeboard from a past version is left for later. Kneeboards are generated from the current plan only.
- **Viewing a past version on the map or comparing versions.** The history panel lists versions and restores them; it does not open them for inspection or show differences.
- **Manual or named versions.** There is no Save button and versions are not named (AD-5).
- **Pruning old versions.** Every version is kept (*Deferred — unbounded history growth*).
- **Squadron behaviour.** Versions belong to plans in the Personal space; how squadron members see each other's versions arrives with squadrons. The model already records several contributors per version.
- **Versioning the anonymous tier** (AD-9).

## Impact

- **Backend.** A new migration adds a plan-versions table: per-plan revision number, finalization time, contributors, the Yjs document state, and the pinned snapshot. It also records which user sent each plan update, so contributors can be attributed. `sync.py` gains a per-plan inactivity timer and a hook on last-device-leave to finalize. New REST routes list versions, finalize on demand (used before kneeboard generation and before a profile switch), restore a version, and read an entry from a version's snapshot. The trash purge also purges versions.
- **Kneeboard.** `KneeboardRequest` and the page renderers in `kneeboard.py` accept an optional revision stamp. The frontend kneeboard flow (`wireFormat.ts` and its callers) asks for finalization first when the plan is signed in.
- **Frontend.** A version history panel for the open plan, restore through the plan's Y.Doc, clearing Y.UndoManager on restore, a finalize call before the profile switch, and recover-into-library on the missing-object placeholder.
- **Interaction with `squash_plan`.** Compacting the update log must not lose any state a version needs. Versions store their own document state, so the log stays housekeeping only.
- **No new dependencies.** `pycrdt` already materializes the document server-side (AD-14).
