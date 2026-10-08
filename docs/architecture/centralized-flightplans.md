# Architecture Decisions — Centralized Flight Plans

**Status:** Accepted (product discovery complete, implementation not started)
**Date:** 2026-08-13
**Sources:** `docs/plans/2026-07-27-centralized-flightplans-product-brief.md` (the *what*), `docs/plans/2026-07-27-centralized-flightplans-pressure-test.md` (the edge cases that produced these decisions)

---

## How to use this document

The move from a local-storage, single-plan app to a centralized, account-backed one spans roughly a dozen OpenSpec changes and ten capabilities. Decisions that hold **across** those boundaries live here, so that no single change owns them and no archived `design.md` buries them.

The split we follow:

| Where | What goes there |
|---|---|
| `openspec/specs/<capability>/spec.md` | Anything expressible as `SHALL` + a scenario. Validated, maintained, never archived. |
| **This document** | Cross-capability decisions and the *rationale* behind them, including rejected alternatives. |
| `openspec/changes/<id>/design.md` | Decisions local to one change — wire format, table layout, token storage. Cites `AD-n` rather than restating it. |
| `openspec/config.yaml` → `context:` | Shared vocabulary + a pointer here. Kept short, because it is injected into every artifact prompt. |

**Rule:** if a change proposal has to explain the model before it can explain itself, it should cite an `AD-n` instead. If the decision it needs isn't here yet, add it here first.

---

## Vocabulary

- **Space** — the unit of ownership. Either a user's **Personal space** (exactly one per account) or a **squadron space**. A user belongs to Personal + N squadrons.
- **The three entities** — flight plans, per-theatre object/threat libraries, performance profiles. Everything below applies uniformly to all three unless stated otherwise.
- **Live reference** — a pointer (UUID / id) from a plan's working copy into the current shared state of its space.
- **Pinned snapshot** — an immutable copy of referenced objects + profile, embedded in a finalized version or in a copied-out plan.
- **Finalized version** — a coalesced, restorable point-in-time snapshot, identified as `Rev N · date · editor` (e.g. `Rev 14 · 2026-07-23 14:32 · Falcon`).
- **Working copy** — the continuously autosaved current state of an asset, between finalized versions.

---

## AD-1 — The space is the unit of ownership

**Context.** Users need private work *and* squadron work, across multiple squadrons, without a plan's threat library becoming ambiguous.

**Decision.** Every asset — plan, theatre library, performance profile — belongs to **exactly one space**. A plan references only *its own space's* library and profiles. Personal is a real space, not a special case. Moving an asset between spaces is **copy + snapshot**, never a live re-parent.

**Why.** The alternative — plans mixing references from several spaces — requires namespacing every reference and produces broken references whenever membership changes. One space per plan means a reference either resolves, or the plan isn't visible to you at all.

**Consequences.**
- The active space scopes **all three entity types at once**, not just the plan list. Opening a plan implies switching to its space.
- Profiles and libraries are never browsed globally; they are always seen through the lens of the active space.
- On leaving a squadron or deleting an account, squadron-shared assets stay with the squadron; private (Personal) assets are deleted. No orphans.
- Because copy-out is a snapshot, a copy made before leaving a squadron survives intact.
- **Ownership is modelled as membership, for every space kind** (decided in `add-cloud-sync`, where Personal is materialized). A space is a bare `spaces(id, kind)` row; who owns or belongs to it lives in a `space_members(space_id, user_id, role)` table — a Personal space is one `owner` member, a squadron space is many members with roles. This is chosen over an `owner_user_id` column on `spaces` precisely so squadrons are *additive*: they add rows and a kind, never a rebuild of `spaces`. It also gives AD-7 its substrate directly — "belongs to Personal + N squadrons" is a set of membership rows, and longest-standing-member auto-promotion is `ORDER BY joined_at`. The cost: "exactly one Personal space per user" spans two tables, so it is an application invariant enforced at the single get-or-create path, not a DB constraint. A polymorphic `owner_type`/`owner_id` pair was rejected for losing foreign-key integrity against AD-13's SQL-first datastore.

**Spans:** `space`, `plan-sync`, `theatre-library`, `aircraft-performance`, `plan-sharing`

**Rejected.** *"Squadrons are the only shared space"* — leaves no way to keep a personal library synced across devices. *"Plans mix references from multiple spaces"* — namespacing and broken-reference complexity outweigh the flexibility.

---

## AD-2 — The performance profile is a first-class, space-owned entity

**Context.** The `aircraft` block (model, take-off configuration, taxi fuel, take-off block, and the regime collection) already lives *outside* `FlightPlan` — the 1.5 migration moved it to its own `dcsplan.performance` store. But it is stored as a **single, unnamed, unidentified blob** that applies implicitly to whatever plan is open. A space needs to hold several named profiles that many plans share.

**Decision.** Make the performance profile a **first-class entity**: a keyed collection of profiles, each with a stable id and a user-editable name, owned by a space and versioned independently. A plan carries a `profileId` and references **exactly one** profile; the profile continues to hold multiple regimes. Add a per-plan **profile chooser** (net-new UI).

**Why.** Sharing, versioning and reuse all operate on the profile, not on the plan that happens to embed it. Leaving it embedded would mean every plan carries a divergent copy of the squadron's aircraft data — exactly the problem the shared library solves for threats.

**Consequences.**
- This is the largest data-model change in the programme, and it is **entirely client-side** — it can and should ship before any server exists.
- The lingering v1.4 backend coupling (wire format expects `aircraft` nested in `flightPlan`, marshalled in/out on import) is *not* cleaned up here — it needs the FastAPI side, so it rides with C2 `add-cloud-sync`, where the wire format is being reshaped anyway. That keeps C0 front-end only.
- Waypoints continue to reference `regimeId`; regimes now resolve through the plan's profile. Switching a plan's profile can therefore orphan leg regime references — resolution is C0's problem to specify.
- The `aircraft-performance` and `performance-regime` specs still describe the pre-1.5 world (aircraft block and regime collection "on the flight plan"). C0 corrects that drift.
- A plan must **always** have exactly one profile — this is what makes AD-7's block-while-referenced rule necessary rather than merely tidy.

**Spans:** `aircraft-performance`, `performance-regime`, `plan-sync`, `version-history`

---

## AD-3 — Live work uses references; anything frozen or copied uses a pinned snapshot

**Context.** A shared threat library is only useful if edits propagate to the plans that use it. But propagation makes history unreproducible and shared briefs unstable — a pilot's kneeboard could change without the plan ever being edited.

**Decision.** Three axes, one rule — ***live = reference, frozen or copied = snapshot***:

| Axis | Coupling |
|---|---|
| **Space (live editing)** | The working copy references the space's library objects (by UUID) and profile (by id). Shared edits flow through immediately. |
| **Copy-out** (share-by-link, copy to another space) | Embeds a self-contained snapshot of the referenced objects + profile. |
| **Time** (each finalized version) | Pins a snapshot of exactly the objects + profile it referenced at that moment. |

**Why.** This is the keystone decision: it dissolves referential integrity for history entirely. `Rev N` is permanently reproducible, so the kneeboard stamp needs only the plan's revision — no composite `plan rev + library rev + profile rev` identifier. Restoring an old version can never hit a broken reference. And a live library edit reaches a plan only from its *next* finalized version onward, so a briefed revision never mutates under a pilot.

**Consequences.**
- **The pinned snapshot is read-time only.** It exists to reproduce a historical kneeboard and to recover a since-deleted dependency. It is *never* used to mutate shared state.
- Copy-out may therefore embed squadron threat objects into a plan handed to an outsider. Accepted: only the objects that plan actually uses travel with it.
- Storage cost is real — every finalized version carries a snapshot of its dependencies. See *Deferred* below.

**Spans:** `version-history`, `theatre-library`, `aircraft-performance`, `plan-sharing`, `soft-delete`

---

## AD-4 — Plans, libraries and profiles have three independent histories

**Context.** With all three entities versioned, "restore" is ambiguous: does reverting a plan revert the squadron's shared intel too?

**Decision.** Each entity type is versioned and restored **separately**. Restoring one never rolls back another. Restoring a plan reverts only its authored content — waypoints, params, comments, and *which* objects/profile it references — and **re-binds those references to the current live library/profile**.

**Why.** A plan-level undo is a personal correction; the shared library is squadron intel. One member undoing yesterday's route must not silently roll back a threat position another member updated this morning. To recover old threat positions you restore the *library*, deliberately.

**Consequences.**
- If a referenced threat has **moved** since, the restored plan shows its **current** position.
- Restore creates a **new current version**, which pins a fresh snapshot of today's dependencies.
- If a dependency was **deleted** since, it renders as a *missing object* placeholder, with a one-click **"recover into the library"** sourced from the chosen version's pinned snapshot (read-time use, per AD-3).
- Restoring a shared plan updates the current plan for all members, consistent with AD-6.

**Spans:** `version-history`, `theatre-library`, `aircraft-performance`

**Rejected.** *"Restore the frozen photo"* — restoring the pinned snapshot's object positions too. Rejected because it lets a plan-level action silently overwrite shared intel.

---

## AD-5 — Autosave is persistence, not a version

**Context.** The app autosaves continuously (debounced ~300 ms) with no Save button, and that frictionless feel is worth keeping. Treating each autosave as a version would produce thousands of near-identical history entries.

**Decision.** Two distinct concepts:
- **Autosave** — the working copy is continuously persisted to the server. Drives sync and no-lost-work. Updates current state; **creates no version**.
- **Version snapshot** — created automatically but **coalesced to roughly one per editing session**: after **10 minutes of inactivity**, on leave/close, or **on kneeboard generation**.

There is no manual Save button and there are **no named versions** — hence the `Rev N · date · editor` identifier.

**Why.** History has to stay scannable to be usable as an undo net. Session coalescing yields about one entry per sitting.

**Consequences.**
- Generating a kneeboard **finalizes a version at export time** if uncoalesced live edits exist, so the stamped revision always names a real, restorable version rather than an ephemeral draft.
- **Destructive structural operations finalize first, for the same reason.** Coalescing means a destructive action and the work it destroys usually sit inside one un-finalized session, leaving no version boundary between them — so restore would revert the whole sitting rather than the action. Any operation that discards authored content wholesale must therefore force finalization *before* applying. Without this rule, history is not an undo net for exactly the operations that most need one.

  The set, as of now — see AD-12 for why the first is undoable and the rest are not:
  - **Switch performance profile** — clears every leg's regime binding (`extract-performance-profiles`, D5).
  - **Import a flight plan** — replaces the plan, the library, and the performance store together.
  - **New flight plan** — in the anonymous tier this replaces the single plan (AD-9); with an account it appends to the list and is not destructive at all.

  Others will appear as the app grows; the rule is the durable part, not the list.
- When several members edit within one coalescing window, the version records **all contributors** and displays the last editor as primary (`Falcon +2`).

**Spans:** `plan-sync`, `version-history`

**Rejected.** A fixed time window (at most one snapshot per N minutes of continuous activity) — session-based is easier to reason about. Windowing can be added later if sessions prove too coarse.

---

## AD-6 — Yjs CRDT for flight plans; LWW for library and profiles

**Context.** Squadron assets are collaboratively editable by all members, and two members may edit the same plan at once. The flight plan is the primary collaborative surface — multiple pilots editing waypoints, timing, and objects on the same route.

**Decision (revised 2026-09-22).** The flight plan is a **Yjs CRDT document**. Mutations are fine-grained Yjs operations (set a field on a waypoint, insert/delete a waypoint in the array). The Y.Doc is the source of truth; React state is a derived snapshot. Sync to the server uses a Yjs WebSocket provider; local persistence uses `y-indexeddb`. Concurrent edits merge automatically at the field/array-operation level.

The theatre library and performance profiles remain **plain React state + localStorage**, synced via last-write-wins when server persistence arrives. Their mutation patterns are simpler (fewer concurrent editors, less frequent edits) and do not justify the CRDT overhead.

**Why the revision.** The original AD-6 chose LWW + full history as a deliberate simplification, arguing that real-time collaboration wasn't worth the complexity for squadron-scale planning. That assessment was correct for the *collaboration* payoff alone, but underweighted two things: (1) Yjs gives offline-first sync and conflict resolution as a package — the same machinery that enables real-time collab also solves the multi-device sync problem cleanly, and (2) wiring the flight plan through Yjs *after* building a full LWW-based server would force a large refactor of both client and server. Preparing the client data model now, before the server exists, is strictly cheaper than retrofitting it later.

**Why only the flight plan.** The library and profiles are edited less frequently, by fewer people at once, and their data shapes are simpler. The LWW rough edge (a lost edit survives only in version history) is acceptable there. If experience proves otherwise, moving them to Yjs later is possible without re-architecting the plan layer.

**Consequences.**
- **Undo moves to Y.UndoManager** for the flight plan (see AD-12 revision). Library and profile undo remain snapshot-based.
- **Concurrent editing on the same plan works** — two members editing different waypoints see each other's changes merge cleanly. Two members editing the *same field* on the *same waypoint* get last-writer-wins at that field, which is the finest grain possible and strictly better than whole-plan LWW.
- **Presence and cursors** are a natural later addition (Yjs awareness protocol), not a separate design effort.
- **The server persists Y.Doc state**, not serialized JSON flight plans. The kneeboard endpoint continues to receive a JSON flight plan (derived from the Y.Doc snapshot at generation time).
- **Anonymous tier** uses the same Yjs data model locally (Y.Doc persisted to IndexedDB), without a sync provider. Signing in adds the WebSocket provider to the existing document — no data migration, just a new transport.
- **Library and profile sync** (when it arrives) is a separate, simpler system — likely REST-based autosave with LWW, matching the original AD-6 for those entities.

**Rejected.** *"Yjs for all three entities"* — the library and profile gain little from CRDTs and would triple the migration scope. *"LWW for everything, retrofit Yjs later"* — building a full LWW server for the plan and then replacing it is wasted work; the Yjs client prep costs less than one server rewrite.

**Spans:** `plan-sync`, `space`, `version-history`, `edit-undo`

---

## AD-7 — Deletion is soft; referential integrity is enforced at delete time

**Context.** With shared ownership, any member can delete shared work. Past versions are always safe (AD-3), but the *live* state needs protecting.

**Decision.** Nothing is hard-deleted immediately, and the live reference graph is checked at the point of deletion:

| Deleting | Behaviour |
|---|---|
| **Plan** (incl. shared) | Any member may delete → **soft-delete to a space-level trash**, admin-restorable (~30 days), then purged. |
| **Library object** referenced by live plans | Warn (*"used by N plans"*) → **soft-delete** → live plans render a **missing object placeholder**. |
| **Performance profile** referenced by live plans | **Blocked** until those plans are reassigned — a plan must always have exactly one profile (AD-2). |
| **Squadron** | Soft-delete + ~30-day grace + export offered. Members lose access immediately; admin can undo in-window. |
| **Account** | Squadron-shared assets stay with the squadron; private assets are deleted (AD-1). |

**Why.** The asymmetry is deliberate: a missing threat object *degrades* a plan (placeholder, still usable), while a missing profile *breaks* it (unflyable). Degradation gets a placeholder; breakage gets a block.

**Consequences.**
- A squadron is never left adminless — the **longest-standing member auto-promotes**. Last member out archives, then purges, the squadron.
- A member who left and rejoins regains access to the squadron's shared assets, which never belonged to them individually.

**Spans:** `soft-delete`, `space`, `theatre-library`, `aircraft-performance`

---

## AD-8 — Migration of local work is additive and never overwrites

**Context.** Anonymous users accumulate real work on-device. Signing in must never destroy it — or destroy what's already in the account.

**Decision.** Local state is one working set: **one plan (with embedded plan-local markers) + one performance profile**. On sign-in it is merged **additively** into the Personal space — plan appended to the list, profile added as an additional named profile. Never overwritten, in either direction.

- **New / empty account** → migrated **silently**.
- **Existing account with data** → **prompt** first ("You have local work on this device. Import it into your account?"). Declining leaves local work local; nothing is lost either way.
- **A second device with its own local work** → same as an existing-account sign-in: prompt, additive, **no content-level dedup**.

**Why.** Every path is an append or a UUID merge, so there is no destructive conflict at sign-in *by construction*. The only real product decision left is prompt vs. silent, and only an empty account can be safely silent.

**Consequences.**
- Duplicates are possible (the same plan imported from two devices) and are accepted — visible and deletable beats a wrong automatic merge.
- **Logout clears the device** back to blank anonymous, warning first if un-synced edits exist. Safer on shared simulator PCs.
- Optional convenience on first login: offer to promote the plan's markers into the new reusable library.

**Spans:** `user-identity`, `plan-sync`, `theatre-library`

---

## AD-9 — The anonymous tier is a permanent, first-class tier

**Context.** dcsplan should stay free and instantly usable for the community; an account wall at the front door would kill adoption.

**Decision.** Anonymous / local-only is a supported tier, not a trial: **one plan** (with embedded plan-local markers) + **one performance profile**, on-device. An account unlocks the reusable object library, multiple plans, sync, versioning, multiple profiles, and sharing.

**Why the library is login-gated.** The reusable per-theatre library's entire value is *reuse across plans*, and the anonymous tier is single-plan — so it would be a feature with no payoff. Plan-local markers cover the one-off threat/landmark need without an account.

**Consequences.**
- Anonymous recipients of a share link can **view and copy into the local-only app** without signing up. Signing in later migrates that copy via AD-8.
- The `map-objects` capability splits along this line: plan-local markers stay anonymous-accessible, library refs require an account.
- Every server-backed feature must degrade cleanly to a local-only path, permanently — this is not a temporary state to be removed later.
- **Every spec states both tiers.** Because the anonymous path is permanent rather than transitional, a spec that describes only the signed-in behaviour is incomplete, not merely terse. Each capability spec must say what happens with an account *and* without one, or state explicitly that it is tier-independent. Enforced as a spec-authoring rule in `openspec/config.yaml`.
- **The tier axis is not the connectivity axis.** Anonymous (no account) and *signed-in but disconnected* are different states: the second has a space, plans, and history that simply cannot reach the server right now (AD-5, AD-6). Conflating them produces specs that quietly treat a network blip as a downgrade to the free tier. Only capabilities that touch sync need the connectivity axis at all.

**Spans:** `user-identity`, `theatre-library`, `map-objects`, `plan-sharing`

---

## AD-10 — Sharing is link/ID-based, not a public commons

**Context.** "Make it public" could mean a browsable gallery of community flight plans, or simply an unlisted URL.

**Decision.** Anyone with the link/ID can **view + copy into their own space**. No discovery, no gallery, no search, no featured content, no moderation, no editable links.

**Why.** This is the single largest scope reduction available. A browsable commons drags in search, ranking, moderation, abuse handling and a public-directory attack surface — none of which serve the actual need, which is handing a brief to a squadron mate.

**Consequences.**
- A link **resolves to the latest version** — a shared brief moves as the owner edits it. Pinning a link to a specific `Rev` is a later option.
- Links are **revocable**. Copies already made are independent snapshots (AD-3), so revocation, later edits, and deletion of the source don't touch them.
- A link to a deleted plan 404s gracefully.

**Spans:** `plan-sharing`, `space`

---

## AD-11 — Discord OAuth is the only identity provider in v1

**Context.** The audience is DCS squadrons, which organize on Discord.

**Decision.** Discord OAuth only, at least initially. No passwords. One Discord identity = one account.

**Why.** Natural fit for the community, no credential handling, and it supplies the display name used in `Rev N · date · editor`.

**Consequences.**
- **Editor attribution is snapshotted at edit time** — a later Discord rename doesn't rewrite old revisions, which stay truthful.
- **No account merge or recovery in v1.** A user with two Discord accounts, or who loses access to one, has no path to consolidate. Known, accepted limitation.
- Additional providers can be added later, which is why identity is its own capability rather than folded into `space`.

**Spans:** `user-identity`, `version-history`

---

## AD-12 — Action undo and version restore are separate mechanisms

**Context.** The app renders **Undo and Redo buttons today, wired to no-ops** (`ButtonZone.tsx:97-98`, `PlannerApp.tsx:65-66`). Meanwhile AD-5 coalesces history to roughly one version per editing session. It is tempting to treat version restore as the app's undo — it isn't, and can't be.

**Decision.** Two distinct mechanisms, neither substituting for the other:

| | **Action undo** | **Version restore** (AD-4, AD-5) |
|---|---|---|
| Unit | one user action | one editing session |
| Lifetime | in-memory, discarded on reload | durable, server-side |
| Depth | bounded stack (tens of steps) | every finalized revision |
| Answers | *"put that waypoint back"* | *"yesterday's version was better"* |

**Why.** Coalescing puts the nearest version boundary a whole sitting away, so restore always overshoots a single mis-drag — and an in-memory stack evaporates on reload, so it can never answer the cross-session question. Users also simply expect `Ctrl+Z` from every other editor, and we currently show them a button that does nothing, which is worse than showing none.

**Consequences.**
- **One action = one stack entry.** Sustained interaction with a single control — dragging a slider — must collapse to one entry rather than one per step. The same coalescing instinct as AD-5, three orders of magnitude down.
- **One stack per entity** — plan, library, profile — mirroring AD-4's three independent histories, captured at each entity's single mutation choke point. An action touching two entities pushes onto both, and undoing one does not undo the other, exactly as AD-4 specifies for restore. *(First written as one stack per editing **surface**; the code disproved it — the plan is mutated from five different pages, so a surface-scoped stack would miss edits made elsewhere. The residual worry, that undo can revert a change made on a page you are no longer looking at, is real, and is handled as a risk in `add-edit-undo`'s design rather than by scoping.)*
- **Undo is snapshot-based, and a remote edit discards the local stack.** Snapshotting the working copy per action is trivial at this data size; the hazard is only concurrent editing (AD-6), where re-applying a stale snapshot would silently revert another member's landed edit. Discarding the stack on any remote change removes that hazard without a command-pattern implementation. Chosen deliberately over inverse-operation undo, which composes correctly under concurrency but costs far more to build for a risk that does not exist until sync lands.
- **Destructive structural operations become undoable for free** — switching a plan's performance profile clears every leg's regime binding (AD-2), and with a stack in place undo restores both `profileId` and the bindings. AD-5's forced-finalization rule still stands for the same operations: it covers the across-session case that an in-memory stack cannot.
- **Wholesale-replacement operations are excluded from the stack, and clear it.** Importing a plan and starting a new one are **not** undoable. Import is the clearest case: it writes the plan, the library, *and* the performance store together, so no single entity stack can reverse it correctly — it is unrepresentable, not merely unwanted. Both carry explicit confirmation dialogs, and both earn a forced version boundary instead (AD-5). Critically they must **discard** the stacks rather than simply not append to them: leaving pre-import entries in place would let Undo resurrect the replaced plan, which is worse than a button that does nothing.

This yields two tiers of destructive operation:

| Tier | Example | Undoable | Confirmation | Forces a version |
|---|---|---|---|---|
| Within-surface | switch performance profile | yes | yes | yes |
| Wholesale replacement | import a plan, new plan | no — clears the stack | yes | yes |
- Because it is entirely client-side and depends on nothing, this ships **before** the profile work rather than after the server.

**Open — cross-entity actions.** Some actions touch two entities at once: importing a performance package replaces the profile *and* strips now-orphaned regime bindings from the plan (`PerformanceImportDialog`); deleting a library entry removes it *and* drops the plan's reference to it (`TheatreLibraryPage`). With independent per-entity stacks, undoing one half restores a reference whose target is gone.

The per-entity split inherited from AD-4 is right for **version restore** — deliberate, user-initiated, with history UI in front of it, where a plan undo must not roll back squadron intel. Whether it is right for **action undo**, where the user's model is "undo the thing I just did," is genuinely unsettled. The candidate fix is transactional undo: entries tagged with a shared action id and popped together across stacks.

Not decided, deliberately. For now such operations are simply excluded from undo and clear the history. **Revisit once the library and profile stacks exist** — reverting to an older state may prove recovery enough, in which case the extra mechanism is unwarranted.

**Evidence, found in live testing (2026-09-09).** This is not confined to rare wholesale operations. Editing a regime's cruise TAS/FF on the Performance page mirrors the new values onto every bound waypoint (`propagateRegimeCruiseChange`) while also writing the profile — so *routine* performance editing is a cross-entity action. Undoing it rewinds the mirrored values but not the regime, leaving a leg still bound to a regime whose numbers it no longer matches, which is precisely the state the "direct edits revert the leg to Manual" rule exists to prevent. Not cosmetic: `computeLegSegments` uses the waypoint's mirrored `tas`/`ff` for a level leg, so the stale value reaches leg fuel and the kneeboard. Deleting a regime has the same shape and is worse — undo restores `regimeId`s pointing at a regime that no longer exists.

Reproduced and documented as `it.fails` tests in `packages/frontend/src/contexts/undoCrossEntity.test.tsx`.

**Decided (2026-09-17): de-mirror.** Resolve a bound leg's TAS/FF from its regime at read time; keep the waypoint fields for Manual legs only. There is then no denormalized copy to go stale, the "direct edits revert the leg to Manual" rule becomes structural rather than something each edit handler must remember to enforce, and the cross-entity undo question dissolves for the regime-editing case — editing a regime no longer writes the plan at all. The decision ships with `extract-performance-profiles`, which is already reworking how regimes resolve through a profile. `propagateRegimeCruiseChange` and the mirrored waypoint fields it writes are removed.

**Revised (2026-09-22): flight plan undo moves to Y.UndoManager.** With AD-6 revised to use Yjs for the flight plan, the plan's undo mechanism changes from a snapshot-based stack to `Y.UndoManager`, which tracks Yjs operations. The conceptual decision — action undo ≠ version restore, two tiers of destructive operation — is unchanged. What changes:

- **"Undo is snapshot-based, and a remote edit discards the local stack"** → Y.UndoManager tracks inverse operations, not snapshots. It composes correctly under concurrency — a remote edit does not discard the local stack, because undoing a local operation no longer risks reverting a remote one. This was the original reason for choosing snapshots over inverse operations; with Yjs handling the composition, the reason dissolves.
- **One action = one transaction.** Each `onFlightPlanUpdate` call wraps its Yjs mutations in a single `yDoc.transact(...)`, which becomes one Y.UndoManager entry. Coalescing (sustained slider drag → one undo step) maps to Y.UndoManager's `captureTimeout` or to holding the transaction open across coalesced updates — same semantics, different mechanism.
- **Wholesale-replacement operations still clear the undo stack** — `Y.UndoManager.clear()` on import or new-plan, same rule as before.
- **Library and profile undo remain snapshot-based.** Only the flight plan moves to Y.UndoManager; the per-entity split (AD-4) still holds, and the cross-entity concern remains open for the same cases.

**Spans:** `edit-undo`, `aircraft-performance`, `map-objects`, `theatre-library`

---

## AD-13 — Server state is SQLite, accessed with hand-written SQL

**Context.** The move to an account-backed service needs a server datastore, and the FastAPI backend is stateless today (kneeboard generation, tiles, import validation). `add-user-accounts` is the first change to persist anything server-side — a single user record — but every later stateful change (squadrons, then server storage of the three entities under AD-1) inherits whatever it picks. That makes the datastore and its access pattern a cross-capability decision, recorded here rather than buried in one change's `design.md`.

**Decision.** Server state lives in **SQLite**, accessed with **hand-written SQL — no ORM**. Schema evolves through **`yoyo-migrations`** (ordered plain-`.sql` files, applied synchronously at startup). Async runtime access uses **`aiosqlite`**.

**Why.** The schema and query surface are small and will stay comprehensible; an ORM's mapping layer adds indirection for little gain at this scale, and the maintainer prefers explicit SQL. SQLite is zero-infra — a file, no separate service to run in dev or prod. `yoyo` gives ordering, a tracking table, transactions, and rollbacks while keeping migrations as plain SQL. `aiosqlite` keeps DB calls non-blocking on FastAPI's event loop, which matters because the OAuth handlers are already `async` (they `await` Discord).

**Consequences.**
- **Precedent for every later stateful change.** Squadron storage and the three entities' server persistence use the same datastore, SQL-first access, and migration tool unless a later `AD-n` supersedes this. Change-local `design.md`s cite `AD-13` rather than re-deciding.
- **Postgres is deferred, not rejected.** SQLite serializes writes (one writer at a time), which is fine for current and near-term load; collaborative squadron writes plus cloud sync may eventually justify Postgres. Because access is hand-written SQL over a thin layer rather than ORM-abstracted, an engine switch is a real but bounded cost — revisit when write concurrency or the hosting model demands it.
- **Deployment gains a persistent-storage requirement** (the SQLite file / volume) that the stateless service did not have. Early blast radius is small: until the three entities move server-side, a lost database loses only user rows, not user *data*.

**Spans:** `user-identity` (later `space`, `plan-sync`, `soft-delete`)

---

## AD-14 — The Yjs sync socket is served by FastAPI via `pycrdt`

**Context.** AD-6 puts the flight plan in a Y.Doc and says the server persists Y.Doc state, not JSON. `add-cloud-sync` is the first change to give that document a network transport. The client is Yjs; the backend is a single (stateless-until-`add-user-accounts`) FastAPI service with SQLite (AD-13), fronted single-origin by Caddy (`docs/auth-and-single-origin.md`), authenticating with an `itsdangerous` session cookie (AD-11). The open question is who serves the sync WebSocket and persists the document.

**Decision.** FastAPI serves it, using **`pycrdt`** (Python y-crdt bindings) to hold and merge the Y.Doc server-side. One Y.Doc per plan; the WebSocket room key is the `planId`. Updates are persisted into the SQLite database (AD-13) as an append-only log of Yjs updates, periodically squashed to a single state update. Room access is authorized by the existing session cookie against the plan's owning space — no separate token. The client connects with the standard `y-websocket` `WebsocketProvider`, which speaks the same `y-protocols` sync/awareness format as `pycrdt`'s server side.

**Why.** It keeps the whole backend one Python service: no second (Node) process to run, deploy, and monitor; the single-origin Caddy rule is unchanged (the WebSocket upgrade rides the existing `/api/*` route); and the session cookie authorizes rooms directly instead of minting a cross-service token. Because `pycrdt` materializes the document server-side rather than treating it as an opaque blob, the server can derive a JSON snapshot (for the kneeboard endpoint) and, later, coalesce version snapshots (AD-5, `add-version-history`) without a client round-trip.

**Consequences.**
- **New backend dependency** — `pycrdt` (and possibly `pycrdt-websocket` for the ASGI glue; `add-cloud-sync/design.md` decides whether to adopt it or write a thin handler). Its maturity is verified in that change.
- **The proxy must pass the WebSocket upgrade.** The dev Vite proxy needs `ws: true`; the prod Caddy `reverse_proxy` already upgrades, confirmed as part of the change.
- **SQLite holds Yjs update blobs**, a new table alongside the AD-13 user/space/plan tables. Append-plus-squash keeps the log bounded; squashing is persistence housekeeping, not versioning (AD-5).
- **Postgres pressure (AD-13) applies here too** — collaborative plan writes are the most write-concurrent path in the programme; still within SQLite's single-writer envelope at squadron scale, revisited with AD-13.
- **Awareness/presence** (cursors) is available later over the same socket (AD-6) with no new transport.

**Rejected.** *Node `y-websocket` reference server* — battle-tested, but adds a second service, a cross-language auth bridge, and an awkward path to persist into the Python-owned SQLite; it cuts against AD-13's one-datastore-one-service shape. *FastAPI as a dumb relay over an opaque update log* — stays in Python and is light, but the server never comprehends the document, so server-side snapshotting (`add-version-history`) and kneeboard derivation would have to be retrofitted; `pycrdt` buys comprehension for a modest dependency.

**Spans:** `plan-sync`, `space` (later `version-history`)

---

## AD-15 — Selection is a space→plan hierarchy chosen on a Home screen

**Context.** The anonymous tier has one plan and no space, so "the plan" is implicit everywhere. The signed-in tier has many plans in a space, and — once squadrons exist — many spaces. Some surfaces are plan-scoped (route/nav, attack, a plan's profile assignment and leg regime bindings); others are space-scoped (the theatre library, the performance profiles themselves per AD-2). A selection model is needed that makes that split legible and stays out of the way while editing. First established in `add-cloud-sync` (Personal space only); it must extend to squadrons without rework.

**Decision.** Selection is a two-level hierarchy — **active space → active plan** — chosen on a dedicated **Home screen**, never on the editing surface. The active space is the spine (it scopes the plan list and every space-scoped surface); the active plan is a child of it, and opening a plan implies its space (AD-1). The editing surface carries only a **read-only breadcrumb** (`Space › Plan`, each segment linking back to its Home level) and groups its tabs into a **plan-scoped cluster** and a **space-scoped cluster** so the dependency is visible. There is **no standalone "space, no plan" state**: space-scoped surfaces are reached through a plan — or an uncommitted draft — context. Selection state is `(activeSpaceId, activePlanId)`.

**Why.** Keeping selection on a separate screen leaves the editing surface almost chrome-free, which is the maintainer's explicit priority. Modelling space as the outer scope — rather than a second peer selector beside the plan — avoids two near-identical switchers competing in the top bar when squadrons land, which is the shape that would actually confuse. Grouping the tabs turns the plan-vs-space split from a surprise into a stated fact.

**Consequences.**
- **`add-cloud-sync` encodes `(activeSpaceId, activePlanId)` with `activeSpaceId` pinned to Personal and the space switcher unrendered.** Adding squadrons is "render the switcher and let the id vary," not a re-architecture. The breadcrumb ships as just the plan name now and grows a space root later.
- **A created plan is a local draft until its first waypoint** (defer-commit): it provides the plan context from which space-scoped surfaces are reachable, behaves like the anonymous local plan, and joins the space (and starts syncing) only on first content — so empty drafts never enter the list, which matters because deletion is deferred (AD-7, `add-trash-and-soft-delete`). Change-local specifics in `add-cloud-sync/design.md`.
- **The active plan is a per-device pointer**, restored on load; if it no longer resolves (deleted elsewhere, not in the space) the app falls back to Home.
- **Library/profile scoping follows the active space**, so when those sync (a later change) the model already routes them correctly.

**Spans:** `space`, `plan-sync`, `plan-lifecycle` (later squadrons, `plan-sharing`)

**Rejected.** *Active-plan dropdown in the top bar* — one-click switching, but selection lives on the editing surface and, with squadrons, needs a second space dropdown beside it. *Plans drawer overlay* — keeps selection off a separate screen but still on the editing surface; its two-level tree is a reasonable future affordance, not the primary model.

---

## Decision → capability → change map

> Changes are referenced by name, not by number — the sequence has already shifted once and names match the `openspec/changes/` directories.

| AD | Decision | Primary capabilities | First change that needs it |
|---|---|---|---|
| AD-1 | Space is the unit of ownership | `space` | `add-user-accounts` |
| AD-2 | Profile as a first-class entity | `aircraft-performance`, `performance-regime` | `extract-performance-profiles` |
| AD-3 | Reference vs pinned snapshot | `version-history`, `theatre-library` | `add-version-history` |
| AD-4 | Three independent histories | `version-history` | `add-version-history` |
| AD-5 | Autosave ≠ version | `plan-sync`, `version-history` | `add-yjs-flightplan` (plan persistence), then `add-cloud-sync` |
| AD-6 | Yjs CRDT for flight plans; LWW for library/profiles | `plan-sync`, `edit-undo` | `add-yjs-flightplan` (client prep), then `add-cloud-sync` |
| AD-7 | Soft delete + integrity at delete time | `soft-delete`, `space` | `add-trash-and-soft-delete` |
| AD-8 | Additive migration | `user-identity`, `plan-sync` | `add-local-data-import` |
| AD-9 | Anonymous tier is permanent | `user-identity`, `map-objects` | `add-user-accounts` |
| AD-10 | Link-based sharing only | `plan-sharing` | `add-plan-sharing` |
| AD-11 | Discord OAuth only | `user-identity` | `add-user-accounts` |
| AD-12 | Action undo ≠ version restore | `edit-undo` | `add-edit-undo` (ships first) |
| AD-13 | Server state is SQLite + hand-written SQL | `user-identity` | `add-user-accounts` |
| AD-14 | Yjs sync served by FastAPI via `pycrdt` | `plan-sync`, `space` | `add-cloud-sync` |
| AD-15 | Space→plan selection on a Home screen | `space`, `plan-sync`, `plan-lifecycle` | `add-cloud-sync` |

---

## Deferred — decided *not* to decide yet

Tracked risks, not oversights. Revisit when the trigger fires.

| Item | Position | Revisit when |
|---|---|---|
| **Unbounded history growth** | Keep all versions, no pruning — amplified by AD-3 (each version pins a snapshot) × three entity types × free users | Storage cost becomes measurable |
| **Free-tier abuse** | No quotas or rate limits | Scripted mass-creation is observed |
| **Orphaned per-theatre libraries** | A space accumulates a library for every theatre ever touched; keep forever | Low priority; only if clutter is reported |
| **Plan families** | Design the data model for it now (`variant-of` / parent relationships), build in Phase 3 | Phases 1 + 2 shipped |
| **Account merge / recovery** | Not in v1 (AD-11) | Users actually hit it |
| **Approval-based squadron joining** | Auto-join via revocable link; a per-squadron approval toggle is a later option | A squadron reports link leakage |
| **Pinning a share link to a specific Rev** | Links track latest (AD-10) | Someone needs a stable briefing URL |
| **Folders / tags for plans** | Flat list + sort, scoped per space | Plans reach the hundreds |
| **Transactional (cross-entity) undo** | Cross-entity operations are excluded from undo and clear the history instead (AD-12) | The library and profile undo stacks exist, and reverting to an older state proves insufficient |
