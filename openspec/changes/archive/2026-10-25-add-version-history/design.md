# Design

## Context

See `proposal.md` (Why) and `specs/version-history/spec.md` for the behaviour. The state of the code this design builds on:

- **The plan document is held in a server-side room.** `sync.py` serves each plan's Y.Doc through `pycrdt-websocket`, one in-process room per plan (AD-14). Every update is appended to `plan_updates`, and the log is squashed into one row when the last client leaves. The room's doc outlives its clients (`auto_clean_rooms=False`). A closed plan's doc is rebuilt by replaying its log, as `plan_refs` already does.
- **The server doesn't know who sent an update.** `PlanYStore.write(data)` receives the bytes after the room applied them. The user id is known only in `serve_plan_socket`, from the session cookie.
- **The client already diffs a plan onto the document.** `applyFlightPlanToYDoc(yDoc, old, new)` changes only what differs. It matches waypoints, library refs and markers by id, so an unchanged item keeps its Yjs identity. `snapshotFromYDoc` turns a Y.Doc back into a `FlightPlan`. Undo is a `Y.UndoManager` on the `flightPlan` root map that tracks the `local` origin.
- **The library and profiles live in SQL rows** (`library_entries`, `profiles`, keyed by `(space_id, id)`, JSON `data`). Creating an entry whose id was deleted restores it (`space-asset-sync`).
- **The kneeboard endpoint is stateless.** The client posts the plan JSON and the aircraft (`KneeboardRequest`), and the backend renders the waypoint list, overview and leg pages as PNGs.
- **The backend runs as one process.** The sync rooms already live in memory, so per-plan locks in memory are sound.

## Goals / Non-Goals

**Goals:**
- One server-side operation, *finalize*, that every trigger calls: inactivity, last device leaving, kneeboard, profile switch, restore, trash.
- Restore reuses the client's existing diff logic rather than porting it to Python.
- Versions do not depend on the update log, so squashing and purging the log need no special care.

**Non-Goals:**
- Storing versions as deltas. Each version stores the full document state. Plans are tens of KB, and pruning is deferred (proposal, Non-goals).
- Running several backend processes. That would need a shared lock and shared rooms, which the sync server lacks too.

## Decisions

### D1. Storage: a `plan_versions` table plus a pending-editors table

Migration `0006.create-plan-versions.sql`:

```sql
CREATE TABLE plan_versions (
    plan_id       TEXT NOT NULL REFERENCES plans(id),
    rev           INTEGER NOT NULL,          -- 1, 2, 3 … per plan, never reused
    finalized_at  TEXT NOT NULL,             -- UTC ISO
    editors       TEXT NOT NULL,             -- JSON [user_id, …], last editor first
    state         BLOB NOT NULL,             -- full Yjs update of the document
    content_hash  TEXT NOT NULL,             -- sha256 of the canonical flightPlan JSON
    pinned        TEXT NOT NULL,             -- JSON { entries: {id: {theatre, data}}, profile: {id, data}|null, missing: {entries: [...], profile: id|null} }
    restored_from INTEGER,                   -- rev restored, NULL otherwise
    PRIMARY KEY (plan_id, rev)
);

CREATE TABLE plan_pending_editors (
    plan_id      TEXT NOT NULL REFERENCES plans(id),
    user_id      TEXT NOT NULL REFERENCES users(id),
    last_edit_at TEXT NOT NULL,
    PRIMARY KEY (plan_id, user_id)
);
```

Editors are stored as user ids and get their display names when read, so a version shows a user's current name. `restored_from` lets the panel show "restored from Rev 3" without changing the spec's identity rules. Purging a plan deletes its rows from both tables in the same transaction as the plan (`plans.purge_plans`).

*Alternative:* store the editor on each `plan_updates` row. Rejected, because squashing collapses the rows that carry the attribution.

### D2. Detecting unfinalized edits: compare content, not state vectors

A plan has unfinalized edits when the SHA-256 of its `flightPlan` map, serialized as canonical JSON (`to_py()`, sorted keys), differs from the latest version's `content_hash`. A plan with no version has edits once its map is non-empty.

*Why not state vectors:* a Yjs deletion creates no new struct, so deleting a waypoint leaves the state vector unchanged. *Why not the encoded update bytes:* their byte-for-byte determinism across replay and squash isn't something we want to depend on. Comparing content also means an edit that is undone before the session ends creates no version, which is what the spec's "a session with no edits" intends.

### D3. One `finalize_plan(plan_id, ...)` under a per-plan lock

`sync.finalize_plan` lives beside `plan_refs` and `squash_plan`, which already read documents from rooms or the log; `versions.py` holds only the SQL, as `plans.py` does. It takes an `asyncio.Lock` per plan, so finalizations of one plan never run concurrently, and then:

1. Takes the document from the open room if there is one, otherwise rebuilds it from the log.
2. If an `update` was supplied (D5), applies it to the room's doc first. The room persists and broadcasts it as if it had arrived over the socket.
3. Computes the content hash. If it equals the latest version's hash and this is not a restore, it returns the latest version without writing anything.
4. Reads the plan's refs with `doc_plan_refs` and loads the referenced entries and profile from SQL. Rows that are live and have data are pinned; the rest are recorded as missing.
5. In one SQL transaction, inserts the version as `MAX(rev)+1`, sets its editors from `plan_pending_editors` (latest `last_edit_at` first), and deletes the pending rows it consumed.

The triggers are:

| Trigger | Where |
|---|---|
| 10 minutes without an edit | A sweep task every 60 s, started with the purge loop, finalizes live plans that have pending editors, none of whom has edited in the last 10 minutes. A finalization that finds the content unchanged clears the pending editors up to its cutoff, so a reverted edit is not swept again. |
| Last device leaves | `serve_plan_socket`, before the existing `squash_plan`. |
| Kneeboard, profile switch, restore | `POST /api/plans/{id}/versions` (D5). |
| Trash | The trash route, before `close_plan_room`. |

*Alternative:* one asyncio timer per room, reset on each update. Rejected, because timers die with the process and a session interrupted by a restart would never be finalized. The sweep recovers it on the next run; the cost is up to 11 minutes of latency instead of 10.

### D4. Attribution: watch the socket messages

`serve_plan_socket` wraps its `HttpxWebsocket` channel in `EditorTrackingChannel`. For each incoming sync step 2 or update message (`msg[0] == 0`, `msg[1] in (1, 2)`), it hashes the plan's content (D2) before the room applies the message, and again in a callback scheduled for just after; the room applies sync messages synchronously once `recv` returns. When the hash changed, it upserts `(plan_id, user_id, now)` into `plan_pending_editors`. A non-empty payload is not enough: a step 2 always carries the sender's whole delete set. Step 2 matters because it carries a reconnecting device's offline edits. `create_plan` with an `initial_update` (local data import, file import) records its caller too.

Accepted imprecision: an update that arrives while a finalization is running may have its editor row consumed by that version although its content lands in the next one. The next version still holds the content, but may credit the wrong editor at that boundary. If a version ends up with no recorded editor, it shows the user who caused the finalization (restore, kneeboard) or, for the sweep, the editors of the previous version.

### D5. `POST /api/plans/{id}/versions`: the client hands over its state

The client-triggered finalizations (kneeboard, profile switch, restore) must include *every edit shown on the generating device* (spec). y-websocket gives no acknowledgement that an update has reached the server. The request therefore carries the device's whole document state as `update` (`Y.encodeStateAsUpdate`, base64), and the server merges it before finalizing (D3, step 2). Merging is idempotent, so this costs only the request's size.

Request: `{ update: string, restoredFrom?: number }`. Response: the resulting latest version, `{ rev, finalizedAt, editors: [{id, displayName}], restoredFrom }`. Access follows the plan routes: a plan outside the caller's space is 404, a trashed one 410. A malformed update is 422, as for `initialState`. A plan with no content yet returns `null`. When `restoredFrom` is set, the version is written even if the content matches, and its editor is the caller alone.

Read routes:
- `GET /api/plans/{id}/versions`: the versions newest first, without `state` or `pinned`, plus `pending: bool` (D2).
- `GET /api/plans/{id}/versions/{rev}/state`: `state`, base64.
- `GET /api/plans/{id}/pinned-entries`: for each entry id pinned by any version, its data from the newest version holding it, and the theatre.

### D6. Restore runs on the client

1. Unless D5 has just run, the client calls `POST …/versions` with its state, which finalizes any open session (Rev N).
2. It fetches `…/versions/{rev}/state`, applies it to a scratch `Y.Doc`, and reads it with `snapshotFromYDoc`.
3. In one transaction with origin `restore`, it calls `applyFlightPlanToYDoc(yDoc, current, restored)` and bumps `history.restoreSeq` in a separate `history` root map. It then clears its `Y.UndoManager`.
4. It calls `POST …/versions` with `{ update, restoredFrom: rev }`, which writes Rev N+1.

Because the diff keeps the identity of items present in both versions, a disconnected device's later edit to such an item merges on top (spec, *Offline edits are not lost to a restore*). An item the restore deletes takes that device's edits with it, as for any concurrent delete.

**Other devices clear their undo history** when they see a remote change to `history.restoreSeq`. The `history` map is outside the `flightPlan` map the UndoManager tracks, and outside what `snapshotFromYDoc` reads. A `restore` origin is not a user edit for defer-commit, which is moot because restore needs a committed plan.

*Alternative:* restore on the server by porting `applyFlightPlanToYDoc` to Python. That would make restore one request and atomic, but it would keep two diff implementations that must agree on every field the plan grows. Rejected for now. If restore ever needs to work without an open client (an API or admin tool), port it then.

### D7. Recovering a pinned entry reuses entry creation

The missing-object placeholder fetches `GET …/pinned-entries` once per plan open, and only when the plan has unresolved refs. When a placeholder's id is listed, it offers recovery. Recovering creates the entry through the existing library path (`assetApi`) with the pinned data and the same id, which `space-asset-sync` already treats as restoring a deleted id, trashed or purged. Other devices pick it up as any remote change. No new server write path is needed.

### D8. Kneeboard stamp

`KneeboardRequest` gains `revision: { rev: int, finalizedAt: str, editor: str } | None`, where `editor` is already formatted (`Falcon +2`). In the signed-in tier, `GenerateDialog` first calls `POST …/versions` (D5) and passes the response along. If that call fails, generation stops with the error rather than producing an unstamped kneeboard. The backend formats `Rev 5 · 2026-07-23 14:32Z · Falcon +2`. Without a revision (anonymous), it uses the generation time, `2026-07-23 14:32Z`. Only the waypoint list page (`waypoint_list_page.py`) draws it, centred in the bottom margin in the page's fixed font at 16 px. Leg and overview pages are unchanged, so a single-leg PNG carries no stamp.

*Why the client passes the revision:* the endpoint already trusts the client for the plan's content, so verifying the stamp server-side would buy nothing. It would also couple the stateless kneeboard path to the plan store.

### D9. Profile switch

After the user confirms a switch, and only when connected, the Performance page calls `POST …/versions` and then applies the switch as today. When disconnected it switches at once (spec, *Profile switch while disconnected*). A failed request while connected does not block the switch: the user keeps undo, and the edits join the session.

### D10. The history panel opens from a History button beside Undo/Redo

`ButtonZone`'s action row already groups history, file and destructive actions; the history group gains a **History** button after Redo, shown in the signed-in tier only. It opens a dialog that lists the versions newest first (`Rev 14 · 23 Jul 14:32 · Falcon`). Each row has a restore control that asks for confirmation (spec, *Restoring a version*). A line above the list shows unfinalized changes. While disconnected, the dialog shows the offline message instead of the list.

*Alternatives considered:* a revision chip in the title area that opens a popover (it shows the current Rev, but reads less clearly as a control); an entry in the ⋯ menu (hard to find); a dedicated `/p/:id/:slug/history` view (room for later preview and comparison, but heavy for a list with a restore control). A chip showing the current Rev can be added later without moving the panel.

## Risks / Trade-offs

- **[Attribution at a session boundary can be off by one version]** (D4) → Content is never misplaced, only credit, and the fallback keeps every version credited. Acceptable for one-person Personal spaces; revisit with squadrons.
- **[Restore is three requests, not one transaction]** (D6) → A failure between steps 3 and 4 leaves the restored content in the document without a restore version. The next finalization captures it as an ordinary version credited to the restorer. Nothing is lost, and the history only lacks the "restored from" note.
- **[The finalize request carries the whole document]** (D5) → Plans are tens of KB, and the request is made only on kneeboard, profile switch and restore. If plans grow large, send `encodeStateAsUpdate(yDoc, serverStateVector)` instead; the server's state vector is already known to the provider.
- **[Every incoming update upserts a row]** (D4) → A single-row upsert in SQLite per update is small next to the `plan_updates` insert already made. If it shows up in profiles, batch it in memory and flush on finalize, accepting attribution loss on a crash.
- **[The sweep rebuilds documents of closed plans]** → It rebuilds only plans with idle pending editors, which is usually none: a plan closed by its last device has already been finalized on leave, which consumes or clears its editors.
- **[Storage grows with every version]** → Accepted under *Deferred — unbounded history growth*.

## Migration Plan

1. Apply `0006.create-plan-versions.sql`. It is additive, with a rollback that drops both tables.
2. Existing plans start with no version. The first finalization of each creates Rev 1 from its current content, credited to whoever edits it next.
3. Deploy the backend before the frontend. The new `revision` field on the kneeboard request is optional, so an older client keeps working, though it produces unstamped kneeboards.
4. To roll back, run the frontend and backend from before the change and the rollback migration. Plans are untouched, since versions sit beside the update log, not in it.
