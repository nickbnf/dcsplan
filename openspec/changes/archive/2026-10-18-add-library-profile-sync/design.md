# Design

## Context

See `proposal.md` for the motivation. The starting state:

- **Backend.** SQLite through hand-written SQL modules (`db.py`, `spaces.py`, `plans.py`; AD-13), with yoyo migrations up to `0003`. Space routes in `space_routes.py` use `require_user` and resolve the caller's Personal space with `spaces.get_or_create_personal_space`. Pydantic `LibraryObject` and `Aircraft` models already exist in `flight_plan.py` for import and kneeboard.
- **Frontend.**
  - `LibraryContext` loads and saves one localStorage key per theatre (`dcsplan.library.<theatre>`), reloading when the active plan's theatre changes.
  - `PerformanceContext` holds a single `{ name, aircraft }` blob under `dcsplan.performance`.
  - Nothing in the client knows about `profileId` yet.
  - `RegimeConsistencyGuard` (`Layout.tsx`) clears orphan `regimeId`s from the active plan whenever the regime list changes.
- **Auth.** `AuthContext` calls `/auth/me` and treats any failure, including a network error, as anonymous. `PlanSelectionContext` fetches the space and plan list on sign-in and falls back to Home if that fails. An offline start is therefore anonymous today.
- **Plans** sync over Yjs (AD-6, AD-14). This change does not touch that transport.

## Goals / Non-Goals

**Goals:**
- One sync mechanism for library entries and profiles, sharing a single change feed and a single client outbox.
- A library API that is addressed by container, so that several or nested libraries can be added later without breaking routes or plan references (AD-17).
- No change at all to the anonymous code path. Its storage keys and behaviour stay exactly as they are.

**Non-Goals:**
- No push channel (WebSocket or server-sent events) for libraries and profiles. Devices pull.
- No field-level merge inside a library entry or a profile. The whole row is the unit (spec: `space-asset-sync`).
- No IndexedDB for library and profile data (see D7).

## Decisions

### D1 — Library as a container; ids unique per space (AD-17)

A library is a row with its own random id, owned by a space and tagged with a theatre. The rule "exactly one library per (space, theatre)" is a **UNIQUE constraint**, not part of the key, so it can be dropped when multiple libraries arrive. A hierarchy would add a nullable `parent_id`. Library entries keep their client-generated UUIDs. Profile ids are client-generated too, using `crypto.randomUUID()`, the same as library entries.

Entry and profile ids are **unique per space, not globally**. The same exported plan, with the same snapshot UUIDs, can be imported into two spaces, so a global primary key would collide. An entry's id is unique across *all libraries* of its space, not just its own library, so that moving an entry between libraries later is a column update and its plan references (`libraryRefs.uuid`) stay valid.

*Alternatives:* (a) The library as an attribute of `(space, theatre)` with no id: simplest today, but every route and row would have to change to support several libraries. (b) Entry ids unique per library: blocks moving entries without rewriting refs.

### D2 — Schema (migration `0004`)

```sql
CREATE TABLE asset_seq (n INTEGER NOT NULL);          -- one row; the space-wide change cursor source
INSERT INTO asset_seq VALUES (0);

CREATE TABLE libraries (
    id         TEXT PRIMARY KEY,                       -- random, server-generated
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    theatre    TEXT NOT NULL,
    name       TEXT,                                   -- NULL = the theatre's default library
    parent_id  TEXT REFERENCES libraries(id),          -- reserved for a hierarchy; unused
    seq        INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (space_id, theatre)                         -- "one per theatre, for now" (AD-17)
);

CREATE TABLE library_entries (
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    id         TEXT NOT NULL,                          -- client UUID
    library_id TEXT NOT NULL REFERENCES libraries(id),
    data       TEXT,                                   -- JSON entry without id; NULL when deleted
    seq        INTEGER NOT NULL,                       -- last write's position in the feed
    updated_at TEXT NOT NULL,
    deleted_at TEXT,                                   -- tombstone (sync only, not a trash)
    PRIMARY KEY (space_id, id)
);
CREATE INDEX idx_library_entries_seq ON library_entries(space_id, seq);

CREATE TABLE profiles (
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    id         TEXT NOT NULL,
    data       TEXT,                                   -- JSON { name, aircraft }; NULL when deleted
    seq        INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (space_id, id)
);
CREATE INDEX idx_profiles_seq ON profiles(space_id, seq);
```

The payload is stored as JSON text and validated on write against the existing Pydantic models (D5). New entry or profile fields then need no migration.

One global `asset_seq` counter is shared by all spaces. Each write takes the next value inside the same transaction. Cursors stay monotonic per space, which is all a client needs.

*Alternative:* columns per entry field. Rejected because every new field would need a migration, and the server never queries inside the payload.

### D3 — Last-write-wins by server arrival; tombstones guard deletes

The "last write" is the **last write accepted by the server**, recorded as a new `seq`. Client clocks are never compared.

Every write carries `baseSeq`: the `seq` the client last saw for that row, or `null` when the client believes it is creating the row.

| Row on the server | `baseSeq` not null (an edit) | `baseSeq` null (a create) |
|---|---|---|
| does not exist | applied, new `seq` | applied, new `seq` |
| live | applied, new `seq` (last write wins) | **ignored**: the response returns the current row, and the client adopts it |
| tombstone | **ignored**: the response returns the tombstone, and the client drops its copy | **revived** with the written data, new `seq` |

- **Edit of a tombstone ignored** is "deletions win over stale edits" (spec).
- **A create is create-only.** A client whose local copy is behind (offline, or before its first pull) can believe an entry is absent when the server holds it. The typical case is an import merging a snapshot. Applying that write would overwrite the server's copy with the file's, and break the import rule that existing entries are kept. Ignoring it and returning the current row keeps the server's copy. The client then reports the entry as *kept* (`space-asset-sync`, `map-objects`).
- **Reviving a tombstone on create** is deliberate. An import whose snapshot holds a previously deleted entry needs that object back.

**Writes for one row are serialized on the client.** At most one write per `(kind, id)` is in flight. A newer pending write for that row takes its `baseSeq` from the in-flight write's response before it is sent. Without this, an edit made while an entry's create is still in flight would go out as a second create and be ignored.

*Alternatives:*
- **Client timestamps or hybrid logical clocks:** order offline edits by when they were made, but bring clock skew and more machinery. A user can't see the difference at single-user scale.
- **Conditional writes that reject on a stale `baseSeq`:** the start of conflict detection, which is not what last-write-wins promises. `baseSeq` is kept on the wire so change awareness (Phase 2) can use it later without a protocol change.

### D4 — Routes (all behind `require_user`, scoped to the caller's Personal space)

| Method and path | Purpose |
|---|---|
| `GET /libraries?theatre=<id>` | Library summaries for a theatre, as `[{ id, theatre, name, parentId }]`. Get-or-create: always exactly one element today. |
| `PUT /libraries/{libraryId}/entries/{entryId}` | Upsert one entry under D3's rules. Body `{ baseSeq, entry }`. Returns `{ applied, seq, entry \| null }`. `applied: false` means the write was ignored, and `entry` is the server's current row (`null` for a tombstone). |
| `DELETE /libraries/{libraryId}/entries/{entryId}` | Tombstone one entry. Returns `{ applied, seq }`. A delete is a write: it always applies to a live row, is a no-op on a tombstone, and records a tombstone for an unknown id. |
| `PUT /profiles/{profileId}` | Upsert one profile under D3's rules. Body `{ baseSeq, profile: { name, aircraft } }`. Same response shape as entries. |
| `DELETE /profiles/{profileId}` | Tombstone one profile, under the same rules as entries. |
| `GET /changes?since=<seq>` | Everything in the space with `seq > since`: libraries, entries (including tombstones) and profiles (including tombstones), plus the new cursor. `since=0` is the initial load. |

Error and edge rules:
- A `libraryId` outside the caller's space returns **404**.
- A `PUT` whose path `libraryId` differs from the entry's stored library returns **409** today. It becomes the "move" operation later.
- Replacing a whole library (the import's Replace mode) is done by the client as individual deletes and upserts. There is no bulk endpoint until import performance requires one.

**Extension paths (recorded in AD-17):**
- *Several libraries per theatre:* drop the UNIQUE constraint, add `POST /libraries`, and `GET /libraries?theatre=` returns several elements. Clients already treat the response as a list.
- *A hierarchy:* populate `parent_id`. The change feed already carries library rows, so clients learn the tree from it.

Neither path changes entry routes, entry ids or plan references.

With several libraries per theatre, "is this UUID already present?" (import merge, and ref resolution) must look across **all of the space's libraries for the theatre**, not only the target library. Entry ids are unique per space (D1), so this is a lookup by id with no ambiguity.

### D5 — Validation

- **Entries** are validated with `flight_plan.LibraryObject`. The path `entryId` must equal `entry.id`, and the stored `data` omits the id.
- **Profiles** are validated as `{ name: non-empty trimmed str, aircraft: flight_plan.Aircraft }`.
- **Unknown extra fields** are rejected (`extra="forbid"`). The frontend and backend ship together (same origin), so this catches drift early rather than storing data the server doesn't understand.
- **Payload size** is capped at 256 KiB per request.

### D6 — Change feed and pull triggers

The client keeps one cursor per user. It pulls `GET /changes?since=cursor`:
- on start;
- after the session is confirmed;
- on `online` and `visibilitychange → visible`;
- every 60 s while visible;
- straight after its outbox drains.

"Caught up" means the last pull succeeded and the outbox is empty. It drives both the syncing indicator (`space-asset-sync`) and the deleted vs not-synced-yet placeholder state (`map-objects`).

### D7 — Client store: per-user localStorage namespace + coalescing outbox

The signed-in data lives under `dcsplan.u.<userId>.*`, separate from the anonymous keys:

| Key | Holds |
|---|---|
| `…session` | The remembered user and space summary (D9). |
| `…cursor` | The change cursor. |
| `…libraries` | `{ [libraryId]: { id, theatre, … } }` |
| `…entries` | `{ [entryId]: { theatre, libraryId, entry, seq } }`. One key for all libraries; each entry carries its theatre, so a write made before its library id is known can still be routed. |
| `…profiles` | `{ [profileId]: { profile, seq } }` |
| `…tombstones` | Deleted entry and profile ids with their `seq`. |
| `…outbox` | Pending writes. |

- **The outbox is a map keyed by `(kind, id)`, not a log.** A later edit to the same row replaces the pending one, which is safe because last-write-wins is per whole row. Rapid typing therefore produces one write.
- **Draining:** the outbox drains when online, with a 400 ms debounce per row and back-off on failure.
- **A theatre whose library id isn't known yet** (first visit while offline): its writes are queued against the theatre. They are resolved through `GET /libraries?theatre=` before they are sent.

*Why localStorage and not IndexedDB:*
- The current contexts load synchronously before the first render, and keeping that avoids a loading state on the Library and Performance pages.
- The data is small: about 200 B per entry, so even 10,000 entries are about 2 MB.
- Clearing on logout is a prefix sweep.

The risk is recorded below.

### D7a — Import merge reports differing entries

The plan-import merge (`map-objects`) compares each snapshot entry with the importer's copy, and counts it as **kept, differs** when any library-owned field is not equal. Those fields are type, position, name, default comment and range; position is compared exactly, as stored. The comparison runs on the client against the local copy, when the import is confirmed. On a device that is behind, an entry counted as *added* may turn out to be live on the server already. The create-only rule (D3) then keeps the server's copy, and the shown summary is not revised. The data is always right; only the counts in a summary shown while behind can be off.

*Alternative:* a server-side merge endpoint returning the summary. Rejected because it duplicates the anonymous merge path, which must run on the client anyway.

### D8 — Contexts choose a store by tier

- **`LibraryContext`** keeps its public API (`library`, `addEntry`, `updateEntry`, `deleteEntry`, `setLibrary`). Internally it delegates to either the existing localStorage functions (anonymous, unchanged) or the synced store (signed-in), and it re-renders on remote changes. It also exposes `entryStatus(id) → 'present' | 'deleted' | 'pending'` for the placeholder.
- **`PerformanceContext`** grows into a collection: `profiles`, `editingProfileId`, CRUD, and `resolvedProfile` for the active plan.
  - The anonymous tier presents its single blob as a collection of one with no id, matching `performance-profile`'s tier split.
  - Kneeboard generation (`GenerateDialog`) and leg computation read `resolvedProfile`, so the wire format is unchanged.

### D9 — Offline start: remember the user, tell network errors from refusals

- **On every confirmed session**, `AuthContext` writes `dcsplan.u.<id>.session` (the user summary and space summary) and a pointer, `dcsplan.lastUser`.
- **On start**, `/auth/me` has three outcomes:
  - It succeeds: proceed as today.
  - It returns a 401 or `authenticated: false`: anonymous, as today.
  - A **network error or 5xx** with a remembered user: start `authenticated` with `connectivity: 'offline'` and keep retrying with back-off and on `online`. A later 401 runs the logout path, warning first about a non-empty outbox (spec: `user-identity`).
- **`PlanSelectionContext`** caches the space summary and plan list in the same namespace, and resolves from the cache when the network is unavailable. This is what makes `plan-sync`'s existing "opened plans stay available offline" true for an offline start.

### D10 — `profileId` in the plan document; orphan regimes kept for signed-in plans

- `profileId` becomes a scalar key on the plan's Y.Map: added to the binding in `yjsFlightPlanBinding.ts`, and present only in the signed-in tier.
- The per-plan profile chooser writes it. Switching profiles clears bound legs inside the same Y transaction, as `performance-profile` requires.
- `RegimeConsistencyGuard` runs **only in the anonymous tier**. Signed-in leg computation treats an unresolved `regimeId` as Manual at read time, without writing (spec: `performance-regime`).
- Deliberate actions still clear bindings explicitly: deleting a regime on the Performance page, and deleting or switching the plan's own profile.

### D10a — The per-plan chooser sits in the Performance page header

The Performance view is addressed under the plan (`/p/:id/:slug/perf`, `plan-addressing`). It is a child of the plan, not a space-level page like `/library`. That placement was chosen because the page answers a plan-scoped question, "how does *this plan* fly?". The leg regime bindings it feeds live in the plan, and AD-15 already requires space-scoped surfaces to be reached through a plan context. The page therefore always has exactly one active plan, which makes its header the natural home for the plan's own setting, `profileId`.

**Layout (revised after first use).** The first version had two dropdowns ("This plan flies" and "Edit profile") plus a bar of buttons, which made the two selections hard to tell apart and the page top-heavy. The page is now:
1. **Header band, plan-scoped:** "This plan flies: ⟨profile⟩", the page's only dropdown. Changing it goes through the switch confirmation.
2. **Profile sidebar, space-scoped:** the space's profiles by label. The edited profile is bold with an accent bar; the flown one carries a FLOWN tag. "+ New" and "⬆ Import" sit at the bottom.
3. **Profile area, top to bottom:** aircraft identity (model, take-off configuration) with Export and Delete; a **General performance** line (taxi fuel, take-off block), kept on its own line because it is expected to grow; the regimes as wrapping **chips** with "+ Add regime"; the selected regime's editor at full width.

The regime list is chips rather than a second column so that the page never shows two side-by-side lists (profiles and regimes). Chips suit the expected handful of regimes per profile; they wrap if there are more.

**No profile names.** A profile is shown by its label, "model · take-off configuration" (either one alone, or "Untitled profile"). The name is removed from the data model rather than hidden, so it can never drift from what the profile actually describes: the server stores `{ aircraft }`, `dcsplan.performance` is `{ version, aircraft }`, `.perf.json` exports omit it, and the plan export's `performanceProfile` keeps only the id. A `name` written by earlier versions is ignored on read. The server never shipped profiles, so nothing is migrated.

The anonymous tier shows the same profile area for its single profile, with no band and no sidebar.

*Alternatives:*
- **The chooser in the Flight Plan sidebar, next to initial fuel and time.** It would sit with the other plan parameters, but away from the profiles it chooses between. The difference between "flies" and "editing" would then span two screens.
- **One combined selector** that both edits and assigns. Rejected by `performance-profile` (*Profile selection split*): viewing a profile must never reset legs.

### D11 — Logout

- **If the outbox is not empty**, logout asks for confirmation first, naming the count of unsent changes.
- **On confirm**, the `dcsplan.u.<id>.*` keys are removed and `dcsplan.lastUser` is cleared. The synced plan stores are cleared as today.
- The anonymous keys (`dcsplan.library.*`, `dcsplan.performance`) are never touched.

## Risks / Trade-offs

- **A stale offline edit overwrites a newer online edit of the same row**, because ordering is by server arrival. Single user at this stage, and the row is small. Version history (`add-version-history`) is the recovery path.
- **localStorage quota (around 5 MB) is shared with the anonymous data.** A write fails loudly (caught and surfaced as a sync error) rather than corrupting data. If libraries grow large, the store can move to IndexedDB behind the same store interface without an API change.
- **Tombstones grow forever.** They are tiny, and pruning is deferred with the other history-growth items.
- **A remembered session on a shared PC lets the next person see cached data while offline.** This is the same exposure as cached plans today. Logout clears everything, and an expired session is ended on the next successful contact.
- **A reference to an entry from another theatre's library shows as *deleted*** once caught up, because lookup is per theatre. Plans are bound to one theatre (`plan-lifecycle`), so this only arises from hand-edited files.
- **The two-step library resolution for offline first visits** (D7) adds a queue state that needs tests: queue offline, reconnect, and check that the entries land in the right library.

## Migration Plan

1. **Deploy `0004`.** It is additive: no existing table changes. Rollback drops the four new tables.
2. **Ship the frontend and backend together** (same origin).
   - Existing signed-in users' localStorage library and profile stay on the device unshown, as stated in the proposal. They become importable by hand (JSON) and later via `add-local-data-import`.
   - Existing synced plans have no `profileId`, so they resolve to the null profile and their legs compute as Manual. Their `regimeId`s are kept as orphans (D10), not cleared. A user who imports their old `.perf.json` into the space gets a new profile that keeps the same regime ids. Picking it in the plan's chooser then restores every binding.

     This relies on orphans not counting as bound legs when switching profiles (`performance-profile`, *Profile switching resets legs to Manual*).
3. **Docs:** add AD-17 to `docs/architecture/centralized-flightplans.md` and its row in the decision map.

## Open Questions

- The exact poll interval (60 s) and outbox debounce (400 ms) are starting values. Tune them after use.
- Whether `GET /changes` needs pagination. Not for Personal spaces at the expected sizes; revisit with squadrons.
