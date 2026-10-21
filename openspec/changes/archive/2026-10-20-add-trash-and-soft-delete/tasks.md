# Tasks

> Backend tests run under the project venv (`packages/backend/venv`). Frontend
> tests run with `pnpm --filter frontend exec vitest run` (the `test` script
> watches), and type-checking with
> `pnpm --filter frontend exec tsc --noEmit` (pnpm only, never npm). Do not
> `git commit`: the maintainer commits by hand. "D-n" refers to `design.md`.

## 1. Storage: trashed and purged states (design D1)

- [x] 1.1 Write migration `0005.add-plan-purge.sql` (`plans.purged_at TEXT`) and its rollback. Verify with a schema test in the style of `test_spaces_plans_schema.py`: the column exists after the migration and is gone after the rollback.
- [x] 1.2 Change `assets.delete_entry` and `assets.delete_profile` to keep `data` when writing the tombstone. Verify with unit tests:
  - a deleted live row keeps its data and has `deleted_at` set;
  - deleting an unknown id still records a data-less tombstone;
  - the existing D3 tests (stale edit ignored, create revives) still pass.
- [x] 1.3 Add `"trashed"` to the feed rows (`_public_entry` and `_public_profile`): true when deleted and data is present. The payload stays `null` for every deleted row. Verify with unit tests covering a live row, a trashed row and a purged row.
- [x] 1.4 Add `plans.trash_plan(plan_id)`. It sets `deleted_at`, and is a no-op on a plan that is already trashed. Make `get_plan` expose `deleted_at` and `purged_at`. Verify with unit tests:
  - a trashed plan is excluded by `list_plans`;
  - trashing twice keeps the first `deleted_at`;
  - `append_update` refuses a trashed plan.

## 2. Restore, Trash listing and purge (design D1, D2, D6, D7)

- [x] 2.1 Add the restore functions: `restore_plan`, `restore_entry` and `restore_profile`.
  - A restore clears `deleted_at`, and for entries and profiles takes a new `seq`.
  - Only a trashed item can be restored. A live, purged or unknown item raises not-trashed.

  Verify with unit tests: the restored content equals the content at deletion, a restored entry appears in `changes_since` after the old cursor, and each not-trashed case raises.
- [x] 2.2 Add `trash_contents(space_id)`, which lists trashed plans, entries (with their theatre) and profiles, newest deletion first, and excludes purged items and other spaces. Verify with unit tests.
- [x] 2.3 Add `RETENTION_DAYS = 30` and `purge_expired(now)`.
  - Plans: delete the `plan_updates` rows and set `purged_at`.
  - Entries and profiles: set `data = NULL` with a new `seq`.

  Verify with unit tests: items deleted 31 days ago are purged, items deleted 29 days ago are kept, the purge appears in the feed with `trashed: false`, and a purged plan's id still answers 409 on `POST /plans`.
- [x] 2.4 Start the purge from the FastAPI lifespan in `main.py`: once at startup, then every 6 hours, cancelled on shutdown. Verify with a test that the lifespan starts and cancels the task, and that a run calls `purge_expired`.
- [x] 2.5 Add `spaces.can_restore(role)`, true for `owner` and `admin`, and include the caller's `role` in `GET /spaces/me`. Verify with unit and route tests.

## 3. REST routes (design D2, D3)

- [x] 3.1 Add `DELETE /plans/{id}` (204), returning 404 for an unknown, foreign or already-trashed plan. Verify with route tests, including that `GET /plans` no longer lists the plan.
- [x] 3.2 Add `GET /trash`, which returns `{plans, entries, profiles, retentionDays}`. Verify with a route test that it holds all three kinds and excludes other spaces' items.
- [x] 3.3 Add the three restore routes (`POST /plans/{id}/restore`, `POST /libraries/{libraryId}/entries/{id}/restore` and `POST /profiles/{id}/restore`). Each returns 404 when the item isn't trashed and 403 when `can_restore` is false. Verify with route tests, including the 403 case for a non-admin member row inserted directly.
- [x] 3.4 Add `plan_refs(space_id)` in `sync.py` (D3). It reads `profileId` and `libraryRefs[].uuid` from each live plan's document, using an open room's doc if there is one and otherwise replaying the log. Verify with unit tests: a plan with refs, a plan with none, a trashed plan excluded, and an open room whose unpersisted state is read.
- [x] 3.5 Add `GET /references/profiles/{id}` and `GET /references/entries/{id}`, each returning `{plans: n}`. Verify with route tests that use real Yjs plan states.

## 4. Sync refuses trashed plans (design D4; capability `plan-sync`)

- [x] 4.1 Make `_authorize` refuse a trashed or purged plan with close code 4410, keeping 4403 for not allowed. Verify with a sync test.
- [x] 4.2 On `DELETE /plans/{id}`, close every socket in the plan's room with 4410 and drop the room. Verify with an integration test in `test_sync_integration.py`: a connected client is closed with 4410, a reconnect is refused with 4410, and no update is persisted after the deletion.

## 5. Client API and sync state

- [x] 5.1 In `planApi.ts`, add `deletePlan`, `getTrash`, `restorePlan` and the `role` on `SpaceSummary`. In `assetApi.ts`, add `restoreEntry`, `restoreProfile` and `countReferences(kind, id)`. Verify with tests in `planApi.test.ts` and `assetApi.test.ts`.
- [x] 5.2 Store the feed's `trashed` flag with tombstones in `assetCache.ts` and `assetSync.ts`, and expose `isTrashed(kind, id)` next to `entryStatus`. Add a `profileStatus(id)` with the same caught-up and online rules. Add a `pull()` that a page can trigger after a restore. Verify with unit tests: trashed then purged transitions, a restore turning the tombstone back into a live row, and `profileStatus` returning pending while not caught up.
- [x] 5.3 In `useYjsFlightPlan`, on a provider close with 4410: destroy the provider so it stops reconnecting, clear the plan's IndexedDB store, and notify `PlanSelectionContext` to reload the list. Verify with a hook test that 4410 leads to no reconnect, the store cleared and the reload requested, and that a normal close still reconnects.
- [x] 5.4 In `PlanSelectionContext`, on each list load, clear the local stores of plan ids that were in the previously cached server list and are now missing, never touching drafts. Verify with a context test.

## 6. Deletion no longer edits plans (design D5; capabilities `performance-profile`, `theatre-library`, `soft-delete`)

- [x] 6.1 Add a shared reference-count confirmation message. It covers "used/flown by N plans", "no plan uses it" and "could not be checked" when offline or the request failed. It fetches the count when the dialog opens. Verify with a component test for each case.
- [x] 6.2 Change `DeleteProfileButton` (`ProfileControls.tsx`) so it no longer calls `switchPlanProfile` and uses the count message. Verify with `PerformancePage.signedIn` tests:
  - deleting the flown profile with 12 bound legs leaves `profileId` and every `regimeId` unchanged, and the legs compute as Manual;
  - after the restore the legs compute from their regimes.
- [x] 6.3 Change library entry deletion in `TheatreLibraryPage.tsx` so it stops removing the open plan's ref in the signed-in tier and uses the count message; the anonymous path is unchanged. Verify with tests for both tiers.
- [x] 6.4 Add the deleted state to the profile chooser: "profile deleted", plus "can be restored from the Trash" when trashed, plus *Choose another profile*. It isn't shown while pending. Verify with component tests for trashed, purged and pending.
- [x] 6.5 Make the missing-object placeholder (`ObjectsZone.tsx`) say "can be restored from the Trash" for a trashed entry. Verify with tests for trashed versus purged, and that restoring an entry replaces the placeholder with a normal card.

## 7. Plan list and Trash view (design D8; capabilities `space`, `soft-delete`)

- [x] 7.1 On `PlansHomePage`, add *Delete* per plan with a confirmation that names the plan and states the 30-day restore window. Disable it offline. Deleting the active plan clears the selection. Verify with `PlansHomePage` tests: confirm, cancel, offline disabled, and the active plan cleared.
- [x] 7.2 Add a `/trash` route in `App.tsx`, a `TrashPage` linked from `/plans`, and the anonymous tier showing no link.
  - It lists all three kinds with kind, name or label, and deletion date, newest first.
  - It shows an empty state, and an offline notice instead of the list.
  - *Restore* is shown only when `can_restore`. After a restore it removes the row and triggers an asset pull, or a plan-list reload for plans.

  Verify with `TrashPage` tests for each of these states.
- [x] 7.3 Add a test that opening a trashed plan's address falls back to `/plans` (`PlanRoutes.test.tsx`).

## 8. Documentation and integration

- [x] 8.1 Amend AD-7 in `docs/architecture/centralized-flightplans.md`:
  - profile deletion warns and trashes rather than blocks;
  - trashing never edits plans;
  - references are counted at delete time, with the index deferred;
  - the AD table row notes `add-trash-and-soft-delete` as delivered.

  Verify by reading the section against `specs/soft-delete/spec.md`.
- [x] 8.2 Run the full backend suite (`pytest` in the venv), `pnpm --filter frontend test` and `pnpm --filter frontend exec tsc --noEmit`, and check that all pass.
- [x] 8.3 Check the end-to-end flow manually in the running app (two browser windows, signed in):
  - delete an open plan, and confirm the other window leaves it;
  - restore the plan;
  - delete the flown profile, see the deleted state, restore it, and confirm the legs are bound again;
  - delete a referenced library entry, see the Trash placeholder, and restore it.

## Workflow follow-up

- Run `/opsx:verify add-trash-and-soft-delete`, then archive the change once reviewed.
