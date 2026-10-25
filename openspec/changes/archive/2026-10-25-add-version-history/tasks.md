# Tasks

> Backend tests run under the project venv (`packages/backend/venv`). Frontend
> tests run with `pnpm --filter frontend exec vitest run` (the `test` script
> watches), and type-checking with
> `pnpm --filter frontend exec tsc --noEmit` (pnpm only, never npm). Do not
> `git commit`: the maintainer commits by hand. "D-n" refers to `design.md`.

## 1. Spike: merging through the room (design D3, D5)

- [x] 1.1 Confirm that applying an update to an open room's `ydoc` from outside the socket (as a REST route will) is persisted through `PlanYStore.write` and broadcast to connected clients. Verify with an integration test in `test_sync_integration.py`: two sockets are open on a plan, an update is applied to the room's doc directly, and the second socket receives it and a `plan_updates` row is written. If it is not broadcast, record the workaround in `design.md` D5 before going on.

## 2. Storage (design D1)

- [x] 2.1 Write migration `0006.create-plan-versions.sql` (`plan_versions`, `plan_pending_editors`) and its rollback. Verify with a schema test in the style of `test_plan_purge_schema.py`: both tables exist after the migration and are gone after the rollback.
- [x] 2.2 Add a `versions.py` module (hand-written SQL, AD-13) with: `latest_version`, `list_versions`, `get_version_state`, `insert_version` (next `rev` computed in the insert's transaction), `record_editor` (upsert), `take_pending_editors`, and `pinned_entries`. Verify with unit tests in `test_versions.py`:
  - revs start at 1 per plan and increase by one, independently across plans;
  - `record_editor` twice keeps one row with the later time;
  - `take_pending_editors` returns the last editor first and deletes only the rows it returned;
  - `pinned_entries` returns, for each entry id, the data from the newest version that pinned it.
- [x] 2.3 Purge a plan's versions and pending editors in `plans.purge_plans`, in the same transaction. Verify with a test in `test_trash.py`: after `purge_expired`, a purged plan has no `plan_versions` or `plan_pending_editors` rows, and a live plan's versions are untouched.

## 3. Finalize (design D2, D3)

- [x] 3.1 Add `content_hash(ydoc)`: SHA-256 of the canonical JSON of the `flightPlan` map. Verify with unit tests:
  - equal content built in two different orders gives the same hash;
  - deleting a waypoint changes the hash;
  - an empty document hashes as empty.
- [x] 3.2 Add `pin_dependencies(space_id, ydoc)`, built on `doc_plan_refs`. It copies live entries and the live profile, and records the rest as missing. Verify with unit tests: a live entry is pinned with its data, a trashed or purged entry and a deleted profile are listed as missing, and a plan with no `profileId` pins `null`.
- [x] 3.3 Add `sync.finalize_plan(plan_id, update=None, restored_from=None, actor=None)` under a per-plan `asyncio.Lock`, following D3's five steps, with the editor fallback from D4. Verify with unit tests:
  - unchanged content returns the latest version and writes nothing;
  - changed content writes Rev N+1 with its editors and pinned copies;
  - `restored_from` always writes a version credited to the actor alone;
  - `update` is merged before hashing;
  - two concurrent calls on one plan produce one version.

## 4. Finalize triggers and attribution (design D3, D4)

- [x] 4.1 Wrap the socket channel in `serve_plan_socket` so that sync step 2 and update messages that change the plan's content call `record_editor`. Have `create_plan` with an `initial_update` record its caller. Verify with integration tests: an editing socket records its user, a socket that only reads records nothing, and a reconnect that sends offline edits records that user.
- [x] 4.2 Finalize when the last client leaves, before `squash_plan`. Verify with an integration test: a client edits and disconnects, and Rev 1 exists without waiting.
- [x] 4.3 Add the inactivity sweep: every 60 s, started and cancelled in the lifespan next to the purge loop, it finalizes live plans whose pending editors have all been idle for 10 minutes. Verify with tests: a plan idle for 11 minutes is finalized, a plan idle for 9 minutes is not, a plan with no change since its version is skipped, and the lifespan starts and cancels the task.
- [x] 4.4 Finalize in `DELETE /plans/{id}` before `close_plan_room`. Verify with a route test: a plan with edits after Rev 6 is trashed and restored, and lists Revs 1 to 7 (`soft-delete` scenario).

## 5. Version routes (design D5)

- [x] 5.1 Add `GET /plans/{id}/versions`, returning the versions newest first with editors' display names, `restoredFrom` and `pending`. Verify with route tests, including 404 for an unknown or foreign plan (as the other plan routes) and 410 for a trashed plan.
- [x] 5.2 Add `POST /plans/{id}/versions` (`{ update, restoredFrom? }`), which returns the latest version. Verify with route tests: posting a state with new content creates a version, posting it again returns the same version, `restoredFrom` credits the caller, a malformed update gives 422 (as `initialState` does), and access is refused as in 5.1.
- [x] 5.3 Add `GET /plans/{id}/versions/{rev}/state` and `GET /plans/{id}/pinned-entries`. Verify with route tests: the returned state applies to a fresh doc with the version's content, an unknown rev gives 404, and pinned entries carry their theatre.
- [x] 5.4 Add the matching calls to `frontend/src/api/planApi.ts` (`listVersions`, `finalizeVersion`, `getVersionState`, `getPinnedEntries`), with base64 encoding of `Y.encodeStateAsUpdate`. Verify with `planApi.test.ts` cases for each, against a mocked `fetch`.

## 6. Kneeboard stamp (design D8)

- [x] 6.1 Add the optional `revision` field to `KneeboardRequest` and pass it through `task_queue` to `generate_waypoint_list_page`. Have that page draw `Rev N · YYYY-MM-DD HH:MMZ · editor` in its bottom margin, or the generation time alone when `revision` is absent. Verify with tests in `test_waypoint_list_page.py` (the stamp is formatted for both cases and the page renders) and `test_kneeboard.py` (the leg and overview pages are unchanged by a revision, and a request without `revision` is accepted). Settle the font and position against a rendered page and remove the open question from `design.md`.
- [x] 6.2 In `GenerateDialog`, for a signed-in plan, call `finalizeVersion` first and include its result in `buildKneeboardRequest`. If the call fails, show the error and don't generate. Verify with component tests: the finalize call precedes the kneeboard POST and the revision is in its body, a failure produces an error and no POST, and an anonymous plan makes no finalize call.

## 7. History panel and restore (design D6, D10)

- [x] 7.1 Add a `restorePlan(rev)` action to `FlightPlanContext`, following D6's four steps: finalize, fetch the state, apply the diff with origin `restore` and bump `history.restoreSeq`, then finalize with `restoredFrom`. It clears the local `Y.UndoManager`. Verify with tests: the plan equals the restored version, undo is unavailable afterwards, and an offline edit to a waypoint that exists in both versions survives a merged restore (spec scenario).
- [x] 7.2 Clear the `Y.UndoManager` when `history.restoreSeq` changes from a remote origin. Verify with a test: two docs are synced, one restores, and the other's undo and redo become unavailable (`edit-undo` scenario).
- [x] 7.3 Add the History button after Redo in `ButtonZone` (signed-in only), and the dialog: versions newest first in local time, the unsaved-changes line, a restore control on each version with a confirmation naming the Rev, and the offline message when disconnected. Verify with component tests: the button is hidden for anonymous plans, versions list in order, the pending line follows `pending`, cancelling restores nothing, confirming calls `restorePlan`, and the offline state shows no list and no restore.

## 8. Profile switch and recovery (design D7, D9)

- [x] 8.1 In the profile chooser (`ProfileControls` / `PerformancePage`), call `finalizeVersion` after the switch is confirmed and before it is applied, when connected. Skip the call when disconnected, and go ahead with the switch if the call fails. Verify with component tests for the connected, disconnected and failing cases.
- [x] 8.2 Have `MissingObjectCard` in `ObjectsZone` offer "Recover into library" when `getPinnedEntries` lists its id (fetched once per plan open, only when there are unresolved refs). Recovering creates the entry through `assetApi` with its id and pinned data. Verify with component tests: the action shows only for a pinned id, recovery creates the entry with the pinned data and the placeholder resolves, and nothing is offered when disconnected.

## 9. Documentation

- [x] 9.1 Update the module docstring of `sync.py`, which says versioning is a later change. In `docs/architecture/centralized-flightplans.md`, set the decision → change map rows for AD-3, AD-4 and AD-5 to show `add-version-history` as delivered for plans only. Verify by reading both against the code.

## 10. End-to-end check

- [x] 10.1 With the backend and frontend dev servers running and a user signed in, check by hand:
  - edit a plan, close it, reopen it, and see Rev 1 in History;
  - edit again, wait 10 minutes, and see Rev 2;
  - generate a kneeboard and find the stamp on the waypoint list page only;
  - restore Rev 1 with a second window open, and see the second window follow and its Undo become unavailable;
  - switch the profile with bound legs, then restore the version before the switch and see the bindings back;
  - delete and purge a referenced library entry, restore a version holding it, and recover it from the placeholder.

## Workflow follow-up

- Run `/opsx:verify add-version-history`, then archive the change once reviewed.
