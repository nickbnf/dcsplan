# Design

## Context

See proposal.md for the motivation, and the `soft-delete` spec plus the deltas for the required behaviour. The current state that shapes the approach:

- **Plans.** `plans.deleted_at` exists ("reserved for AD-7") and `list_plans` already filters on it, but nothing sets it. Plan content is a Yjs update log (`plan_updates`) served by `PlanSyncServer` (`sync.py`). `_authorize` admits any member of the plan's space.
- **Library entries and profiles.** These are LWW rows with a `seq` change feed (`assets.py`, `add-library-profile-sync` D3). Delete writes a tombstone that sets `data = NULL`, so the content is lost. The feed sends `deleted: true` with a null payload, and the client keeps tombstone ids so placeholders can say "deleted" (`assetSync.ts`, `assetCache.ts`).
- **References.** These live only inside plan documents: `flightPlan.profileId` and `flightPlan.libraryRefs[].uuid`. The server stores no copy of them.
- **Deleting edits the open plan today.** `DeleteProfileButton` calls `switchPlanProfile(…, null)` and `TheatreLibraryPage` strips the ref from the open plan. Both edits are being removed.
- **Plan resolution on the client.** The client resolves plans against the space's plan list (`PlanSelectionContext`). An id that isn't in the list falls back to `/plans`.

## Goals / Non-Goals

**Goals:**
- One meaning of "trashed" on the server per entity, so both the Trash view and the sync feed derive from it.
- Restore is a server-side write that existing clients pick up through the feed or the plan list with no new sync channel.
- Reference counting stays behind a single function, so it can later move to an index without touching callers.

**Non-Goals:**
- A persistent reference index (proposal Non-goals).
- Offline plan deletion or offline restore, which would need queued operations.
- Keeping offline edits made to a plan after it was trashed.

## Decisions

### D1 — What "trashed" and "purged" mean in storage

| Entity | Live | Trashed | Purged |
|---|---|---|---|
| Plan | `deleted_at IS NULL` | `deleted_at` set, `purged_at IS NULL`, update log kept | `purged_at` set, update log deleted, row kept |
| Entry / profile | `deleted_at IS NULL` | `deleted_at` set, `data` kept | `deleted_at` set, `data IS NULL` |

- **Entries and profiles: no new column.** Delete stops nulling `data`, and purge nulls it. Tombstones that already exist (data NULL) correctly read as purged, since their content is already gone. "A delete for an unknown id records a tombstone" also lands as purged, which is right because there is nothing to restore.
- **Plans: add a `purged_at` column (migration 0005).** A purged plan keeps its row, so its client-generated id can never be registered again by a stale device. `POST /plans` already answers 409 for a known id.
- **Alternative considered:** deleting purged rows outright. Rejected because entry and profile tombstones are what make deletions win over stale edits, and plan rows guard against id reuse.

### D2 — Wire format

- **Feed rows for entries and profiles** gain `"trashed": bool`, which is true when `deleted` is set and `data` is not null. The payload stays `null` for every deleted row, so the feed never carries trashed content. Purge and restore both take a new `seq`, so the feed delivers each transition. Clients that ignore the field keep working. The client cache stores the flag next to the tombstone, and the placeholder and profile chooser read it.
- **New endpoints**, all scoped to the caller's space like today's routes:
  - `DELETE /plans/{id}` returns 204. It sets `deleted_at`, then closes the plan's sync room (D4). It returns 404 for an unknown, foreign or already-trashed plan.
  - `GET /trash` returns `{ plans: [{id, name, theatre, deletedAt}], entries: [{id, libraryId, theatre, entry, deletedAt}], profiles: [{id, profile, deletedAt}], retentionDays }`. Entries and profiles carry their data so the client can render names and labels with its existing helpers.
  - `POST /plans/{id}/restore`, `POST /libraries/{libraryId}/entries/{id}/restore` and `POST /profiles/{id}/restore` each return the restored item. They return 404 if the item isn't trashed (it is live, purged or unknown) and 403 if the caller isn't an admin (D6).
  - `GET /references/profiles/{id}` and `GET /references/entries/{id}` return `{ plans: n }`, counting live plans only.

### D3 — Reference counting by scanning plan documents

`plan_refs(space_id)` lives in `sync.py`, since that module already owns Yjs document access. It yields `(plan_id, profile_id, entry_ids)` for each live plan:
- if the plan's room is in memory, it reads the room's doc;
- otherwise it replays the plan's update log, which is usually a single squashed update.

The count endpoints filter that list. The cost grows with the number of plans in the space and the size of their logs, which is acceptable for a Personal space. When squadrons need more, the function's body can switch to an index (Option A from the proposal discussion) with no change to callers.

The client asks for the count when the confirmation dialog opens. If the request fails or the device is offline, the dialog uses the "could not be checked" wording.

### D4 — Ending sync for a trashed plan

- **Server.** `_authorize` refuses a trashed plan with close code **4410** ("gone"), keeping 4403 for "not allowed". On delete, the server closes every client socket in the plan's room with 4410 and drops the room, so no further update is persisted. `append_update` also refuses trashed plans, in case of a race.
- **Client** (`useYjsFlightPlan`). It listens for the provider's close event. On 4410 it destroys the provider, which stops y-websocket's automatic reconnect. It then clears the plan's IndexedDB store and asks `PlanSelectionContext` to reload the list. The plan no longer resolves, so the existing fallback shows `/plans`.
- **Plans the device never reopens.** On every list load, ids that were in the previously cached server list and are now missing have their local stores cleared. Local drafts are never in the server list, so this rule never touches them.
- **Alternative considered:** keeping the local copy until purge, so that offline edits merge after a restore. Rejected because it is obscure for the user, and the device can't know when the purge happens.

### D5 — Deleting no longer edits plans (client)

- `DeleteProfileButton` stops calling `switchPlanProfile`.
- `TheatreLibraryPage` stops removing the open plan's ref, in the signed-in tier only. The anonymous path is unchanged.
- The existing dangling-`profileId` → null-profile resolution, and the orphan-binding rule on switching, already give the "trashed" behaviour, so no new resolution logic is needed.
- The profile chooser adds a "deleted" state when the `profileId` is set, the profile is in the cache's tombstones and the device is caught up. It uses the same conditions as `entryStatus`.

### D6 — Who can restore

A `can_restore(role)` helper in `spaces.py` returns true for `owner` and `admin`. Deleting stays open to every member (AD-7). Every member can see the Trash list, and the client hides *Restore* when the role can't use it, so `GET /spaces/me` returns the caller's role. In a Personal space the caller is always the owner.

### D7 — Purge job

An asyncio task started in the FastAPI lifespan (`main.py`) runs the purge once at startup and then every 6 hours. It purges items with `deleted_at` older than `RETENTION_DAYS = 30`, which is a single constant also returned by `GET /trash`. Each run is one transaction per table:
- plans: delete the `plan_updates` rows and set `purged_at`;
- entries and profiles: set `data = NULL` with a new `seq`.

A missed run only delays a purge. This is not `task_queue.py`, which is a thread pool for kneeboard jobs.

### D8 — Trash view

- A `/trash` route outside the plan context, linked from `/plans`, with one list sorted by `deletedAt` descending.
- It needs a connection: offline, it shows a notice and no list.
- Each row offers *Restore* after `can_restore`. It has no confirmation, because restoring is harmless.
- A restored plan reappears on the next plan list load. A restored entry or profile arrives through the feed, and the page triggers a feed pull after a restore.

## Risks / Trade-offs

- **[Offline edits to a trashed plan are lost]** → Accepted and specified (`plan-sync`). Deletion is online-only, and the confirmation names the plan.
- **[Reference count is stale for offline devices]** A device that assigns a profile offline isn't counted. → The count is advisory (warn, don't block), and restoring repairs any plan it missed.
- **[Scan cost grows with the space]** → It sits behind `plan_refs`, so switching to an index is local (D3).
- **[y-websocket reconnect loop on refusal]** If the 4410 handling is missed, the provider retries forever. → A test asserts the provider is destroyed on 4410.
- **[A stale queued edit can win after a restore]** A device whose edit was ignored over the tombstone, and which retries after the restore, wins by LWW. → This is the same as any concurrent edit (`space-asset-sync`). Accepted.
- **[Import re-creates a trashed id]** The existing D3 rule revives the row with the file's data, and the Trash item disappears. → This is the specified behaviour ("Re-creating a deleted entry restores it"). Accepted.

## Migration Plan

1. Migration `0005.add-plan-purge`: `ALTER TABLE plans ADD COLUMN purged_at TEXT`. Rollback drops the column (SQLite ≥ 3.35). No data migration is needed: existing entry and profile tombstones read as purged (D1).
2. Deploy the backend, then the frontend. Old clients ignore `trashed`. Old clients also have no 4410 handling, so they keep retrying against a trashed plan until they reload. That is harmless because the server refuses each attempt.
3. Amend AD-7 in `docs/architecture/centralized-flightplans.md`:
   - profile deletion becomes warn and trash rather than block;
   - trashing never edits plans;
   - references are counted at delete time, not indexed.
