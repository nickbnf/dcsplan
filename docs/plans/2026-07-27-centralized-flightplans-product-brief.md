# Centralized Flight Plans — Product Brief

**Status:** Product discovery complete — this is the product-side brief, not a technical design.
**Date:** 2026-07-27
**Author:** Nicolas Bonnefon (with PM discovery)

---

## 1. Vision & motivation

Move dcsplan from a **front-end-only, single-plan, local-storage** app to a **centralized, account-backed service** where a user's planning assets live on the server.

Primary motivations (in priority order):
1. **Versioning** — stop losing track of plan revisions (downloading JSONs is a mess). Every save is recoverable.
2. **Multi-device sync** — edit on the laptop, consume on the simulator PC, no manual file shuffling.
3. **Sharing** — easily share within a squadron (and by link to anyone).

Future extension (design-for-now, build-later): **plan families** — generate a set of related plans for one mission (e.g. per-flight variants, different TOTs).

---

## 2. Core model (the big decisions)

### 2.1 Spaces
Every planning asset lives in exactly **one space**:
- **Personal space** — one per user. Where auto-uploaded local data lands on signup. Synced across the user's devices.
- **Squadron space** — a bounded, collaborative group. A user can belong to **multiple squadrons**.

A plan belongs to one space and references *that space's* shared library + profiles. Moving a plan to another space = **copy + snapshot** (not a live move).

> Rejected: "squadrons are the only shared space" (couldn't maintain a personal library across devices) and "plans mix references from multiple spaces" (namespacing/broken-ref complexity too high).

### 2.2 The three shared entities
The squadron (and personal space) is the shared container for **all three** entity types, all collaboratively editable by members, all versioned:

| Entity | Today | Server model |
|---|---|---|
| **Flight plan** | Single, local (`dcsplan-flightplan`) | Many per space; belongs to one space |
| **Object/threat library** (SAM sites, AAA, radars, landmarks) | Per-theatre, local | **Shared per-space, per-theatre** library; collaboratively edited |
| **Performance profiles** (aircraft speed/fuel regimes) | One global profile, local | **Multiple named profiles**, space-owned, collaboratively edited |

**One consistent rule applied to all three:** space-owned, collaboratively editable, versioned.

**Tier note — the object library is login-gated.** Its only value is *reuse across plans*, and the anonymous tier is single-plan, so the reusable per-theatre library requires an account. Anonymous users can still drop **plan-local markers** (one-off threats/landmarks embedded in their single plan) and keep a single **performance profile**. See §3.1.

**New capability — profile selection.** A plan references **exactly one** performance profile (which itself holds multiple regimes — unchanged). But a space now holds **multiple** profiles, so we must add a **per-plan profile chooser** ("which aircraft profile does this plan use?"). This does not exist today (there is a single implicit global profile) and is net-new UI + a `profileId` reference on the plan.

### 2.3 Coupling (references vs snapshots)
There are **two axes** on which a plan couples to its library objects + profile:

- **Space axis (live editing):** inside a space, the *working copy* of a plan references the space's shared library objects (by UUID) and performance profile (by id) **live** — edits to the shared library flow into every plan's working copy.
- **Copy-out axis:** copying a plan out (share-by-link, or into another squadron) embeds a **self-contained snapshot** of referenced objects + profile — exactly like today's export mechanism.
- **Time axis (versioning):** each **finalized version pins a snapshot** of exactly the objects + profile it referenced at that moment (see §4.2). Frozen versions are immutable and reproducible; only the live working copy tracks the shared library.

**Rule of thumb:** *live = reference (shared, current); anything frozen or copied = snapshot (immutable, portable).* This preserves the shared-library benefit for active work while making history, shared plans, and copies unbreakable.

**Deletion behaviour in the live library** (past versions are always safe because they're pinned):
- Deleting a **library object** referenced by live plans → warn ("used by N plans") → **soft-delete** (admin-restorable); live plans render a **"missing object" placeholder**.
- Deleting a **performance profile** referenced by live plans is **blocked** until those plans are reassigned (a plan must always have exactly one profile).

---

## 3. Access, identity & tiers

### 3.1 Tiers
- **Anonymous / local-only** — no account, on-device only. The free community on-ramp. Includes a **single plan** (with embedded plan-local markers) and a **single performance profile**. **Not** included: the reusable object library, multiple plans, sync, versioning, or sharing.
- **Account** — unlocks the **reusable object library**, multiple plans, sync, versioning, multiple profiles + chooser, and squadron sharing.

### 3.2 Signing in — migrating local work
Local (anonymous) state is a single working set: **one plan (with its embedded plan-local markers) and one performance profile** (no object library in the anonymous tier — see §3.1). On sign-in, that set is **merged additively into the user's Personal space — it never overwrites anything**:
- **Plan** → added as a new plan in Personal space (plans are a list, so this can't collide). Its embedded markers travel with it.
- **Performance profile** → added as an additional named profile.
- **Optional convenience:** on first login we may offer to **promote the plan's markers into the new reusable library** so they can be reused across future plans. Not required; markers work as-is.

Two cases, because signing in with an **existing** account is different from a fresh one:
- **New / empty account:** the whole local set becomes the user's starting data, **migrated silently** (no prompt).
- **Existing account with data:** we **must not clobber** server data. Prompt — *"You have local work on this device. Import it into your account?"* — then perform the same additive merge (new plan, extra profile, library merge). If the user declines, local work stays local until they choose to import; nothing is lost either way.

Because every path is additive (append to lists + UUID merge), there is **no destructive conflict at sign-in**; the only product decision is whether to prompt or import silently, and for an existing account we prompt.

**Related identity edges:**
- **Second device with its own local work** (account already populated) → treated like an existing-account sign-in: **prompt** to import that device's local work (additive). No content-level dedup.
- **Logout** → the device is **cleared back to a blank anonymous state**; if un-synced local edits exist, warn first. Safer on shared/simulator PCs.
- **No account merge / recovery** in v1 — one Discord identity = one account. Known limitation.

### 3.3 Squadron management
- **Creator = admin.** Admin removes members, transfers ownership, and manages the invite link.
- **Joining: auto-join via a revocable link/code.** One reusable invite link per squadron; clicking it joins immediately. The admin can **rotate** the link (invalidating the old one) or revoke it. (An optional per-squadron "require approval" toggle can come later.)
- Members are otherwise **equal**: all can edit shared plans/libraries/profiles.
- **Admin succession:** a squadron is never left adminless — if the last admin leaves or deletes their account, the **longest-standing member auto-promotes** to admin. If the very last member leaves, the squadron is archived then purged.
- **Deleting a squadron:** soft-delete with a **grace period** (~30 days). Members lose access immediately, the admin can undo within the window, an export is offered, then it's permanently purged.
- **Re-joining:** a member who left and rejoins regains access to the squadron's shared assets (they belong to the squadron, not the member).

### 3.4 Visibility & sharing
Per-plan visibility:
- **Private** — user's Personal space, their devices only.
- **Squadron** — shared with a squadron (all members can edit, shared ownership).
- **Share-by-link** — anyone with the link/ID can **view + copy to their own space**. No public discovery/gallery, no search, no moderation. No editable links.
  - **Resolves to the latest version** for now (a brief moves as the owner edits); an option to pin a link to a specific Rev can be added later.
  - **Revocable** anytime by the owner. Copies already made are independent snapshots, so they're unaffected by revocation or by later edits/deletion of the source.
  - **Anonymous recipients** (no account) can **view**, and **copy into the local-only app** — no signup required; signing in later migrates that copy. Consistent with the free tier.

> Key simplification: "public" is **link/ID-based sharing**, not a browsable commons. Massive scope reduction (no gallery, search, featured content, moderation, or public-directory abuse surface).

### 3.5 Choosing and scoping a space
A user belongs to Personal + N squadrons, so the app needs one clear notion of the **active space**:
- A **space switcher** in the app header: `Personal | Squadron A | Squadron B …`.
- The active space **scopes all three entity types at once**, not just plans:
  - **Plans** — the flat list shows the active space's plans.
  - **Performance profiles** — the profiles view shows that space's profiles.
  - **Object library** — the (per-theatre) library shown/edited is that space's library.
- Opening a plan **implies its space**: selecting a plan that lives in another space switches the active space with it, so a plan is always viewed alongside the library/profiles it actually references.

This gives a single mental model — *"I'm working in this space; everything I see belongs to it"* — and avoids ambiguous cross-space references, consistent with the one-space-per-plan rule (§2.1). Profiles and objects are therefore **not** browsed globally; they are always seen through the lens of the active space.

---

## 4. Versioning

### 4.1 What a "save" is (persistence vs. version)
Today the app **autosaves continuously** (debounced ~300 ms to localStorage) — there is no explicit Save button, and we want to keep that frictionless feel. But treating each autosave as a version would produce thousands of near-identical history entries. So we split the two concepts:

- **Autosave (persistence + sync)** — the current working state is continuously and automatically persisted to the server (debounced), exactly like today but server-side. This is what guarantees no lost work and drives multi-device sync. It **updates "current state"; it does not create a version each time.**
- **Version snapshot** — a point-in-time, restorable copy. Snapshots are created **automatically** (no manual Save button, no named versions — consistent with earlier decisions) but **coalesced** so history stays scannable.

**Coalescing rule (confirmed):** finalize one snapshot per **editing session** — after **10 minutes of inactivity** on the asset, or when the user leaves/closes it, or on **kneeboard generation** (see §4.3). Net effect: roughly *one history entry per sitting* rather than per keystroke.

*Alternative considered:* a fixed time window (at most one snapshot per N minutes of continuous activity). Session-based is simpler to reason about; we can add windowing later if sessions prove too coarse.

### 4.2 History behaviour
- **Keep all history, one-click restore** (restore creates a new current version). No pruning for now.
- Applies to **all three entities** (plans, libraries, profiles) — the same undo net protects collaborative squadron assets from bad edits.
- **Conflict rule: last-write-wins + full history.** The latest autosave wins on current state; nothing is truly lost because every finalized version is recoverable. Matches the shared-ownership model.
- **Versions are immutable and self-contained.** Each finalized plan version pins a snapshot of the library objects + profile it referenced (§2.3), so `Rev N` is permanently reproducible and restoring an old version can never hit a broken/deleted reference. A live library edit is reflected in a plan only from its *next* finalized version onward.
- **Three independent histories.** Plans, the object library, and profiles are each versioned separately, with separate restore. **Restoring one entity never rolls back another** — e.g. a plan undo does not revert the squadron's shared library.

#### Restore semantics (plan undo)
Restoring an older plan version reverts **only the plan's authored content** — waypoints, params, comments, and *which* objects/profile it references — and **re-binds those references to the current live shared library/profile**. Consequences:
- If a referenced threat has since **moved** in the shared library, the restored plan shows its **current** position (shared intel is never rolled back by a plan undo; to recover old positions, restore the *library* separately).
- Restore creates a **new current version** that pins a fresh snapshot of today's library/profile.
- If a referenced object/regime has since been **deleted**, it renders as a **"missing object" placeholder**; because the chosen version's pinned snapshot still holds it, the user is offered a one-click **"recover into the library."**
- For a **shared** plan, restore updates the current plan for all members (last-write-wins); the shared library/profile remain untouched.

**Role of the pinned snapshot: read-time only** — reproducing a historical kneeboard and recovering a since-deleted dependency. It is never used to mutate shared state on restore.

### 4.3 Deletion & trash
- **Shared plans:** any squadron member may delete, but deletion is **soft** — plans go to a **space-level trash**, admin-restorable (~30 days) — then purged.
- **Library objects / profiles:** governed by the live-library deletion rules in §2.3 (soft-delete + placeholder for objects; blocked-while-referenced for profiles).
- **Move vs copy between spaces:** both supported — *Copy to…* (snapshot, original stays) and *Move to…* (copy + delete source).

### 4.4 Version identity & kneeboard stamping
Because there are no named versions, each version needs a **stable, human-readable identifier**. Confirmed: **monotonic revision number + timestamp + last-editor**, e.g. `Rev 14 · 2026-07-23 14:32 · Falcon`.

**The generated kneeboard must stamp this version + date** so a pilot can confirm two devices are flying the same revision. To keep the stamp meaningful, generating a kneeboard **finalizes a snapshot at export time** if there are live edits not yet coalesced into a version — so the stamped revision always corresponds to a real, restorable version rather than an ephemeral draft state.

### 4.5 Change awareness
- **Last-editor + timestamp** shown on shared assets; flag "changed since you last opened it".
- **Multi-editor attribution:** when several members edit within one coalescing window, the version records **all contributors** but displays the **last editor** as primary (e.g. `Falcon +2`).
- **Concurrent editing:** no hard locking (we deliberately skipped real-time collab). Show **presence + a soft, non-blocking warning** ("Falcon is editing this now"); rely on last-write-wins + history if two people edit at once.
- **No active notifications** (email/Discord) for now.

---

## 5. Organization & limits

- **Plan list:** simple flat list + sort (by recent/name), scoped per space. No folders/tags for MVP (revisit if plans scale to hundreds).
- **Theatre is fixed at plan creation** — it can't be changed later (that would orphan the plan's per-theatre library references). To fly another theatre, create a new plan.
- **Limits:** none for now. Plans are small JSON; monitor storage/cost and add quotas only if abused.

### 5.1 Ownership lifecycle (confirmed)
- If an owner **leaves a squadron or deletes their account**: squadron-shared assets **stay with the squadron** (ownership transfers to the squadron/admin); **private assets are deleted**. Avoids orphaned or vanishing plans.

---

## 6. Recommended phasing

You asked for a phasing recommendation. Rationale: deliver your **top two motivations (versioning + sync) fastest and at lowest risk**, then layer collaboration. Each phase is independently shippable and valuable.

### Phase 0 — Foundations (invisible, enabling)
- Identity/auth + accounts via **Discord OAuth** (confirmed as the first implementation) — natural fit for DCS squadron communities, no password handling. Other providers can be added later.
- Server persistence for the three entities + the **Personal space** concept.
- **Anonymous→account migration** (auto-upload plan + performance + libraries).
- *Outcome:* accounts exist; nothing user-visible changes yet for anonymous users.

### Phase 1 — Solo sync + versioning ← **first usable release**
- Multi-device sync of a single user's plans, library, profiles (Personal space).
- **Multiple saved plans** (replaces single-plan model).
- **Multiple performance profiles per space + per-plan profile chooser** (net-new; see §2.2).
- Auto-snapshot version history + one-click restore (10-min session coalescing).
- Kneeboard version/date stamping.
- *Delivers motivations #1 (versioning) and #2 (sync).*

### Phase 2 — Squadrons & sharing
- Squadron creation (creator=admin), invite by link/code, membership management.
- Shared squadron spaces: collaboratively editable plans, per-theatre libraries, profiles.
- Last-write-wins + change-awareness (last-editor/timestamp, "changed since").
- Share-by-link (view + copy-out with snapshot).
- *Delivers motivation #3 (sharing).*

### Phase 3 — Plan families (future)
- Parameterized variant generation (per-flight, per-TOT).
- Data model designed for this from Phase 0 (`variant-of` / parent relationships) but not built until here.

---

## 7. Confirmed decisions

1. **Auth provider** — **Discord OAuth** first; other providers may follow.
2. **Version identifier format** — `Rev N · date · editor` (e.g. `Rev 14 · 2026-07-23 14:32 · Falcon`).
3. **Snapshot coalescing** — session-based: finalize after **10 min idle**, on leave/close, or on kneeboard generation.
4. **Profiles per plan** — a plan references **exactly one** profile; a space holds **multiple** profiles with a per-plan chooser (net-new).
5. **Migration** — additive/never-overwrite; **empty accounts migrate silently**, existing accounts are prompted.
6. **Ownership lifecycle** — on leave/delete, squadron keeps shared assets (ownership transfers to squadron/admin); private assets are deleted (§5.1).

All product-side decisions are now resolved. Remaining questions are technical (see §8 and the architecture pass).

---

## 8. Current-state notes (from codebase, for the technical design that follows)

- App is **single-plan, localStorage-only**. No backend persistence today (FastAPI backend is stateless: kneeboard generation, tiles, import validation).
- Three local stores: `dcsplan-flightplan`, `dcsplan.performance`, `dcsplan.library.<theatreId>`.
- Plans reference performance **regimes by id** and library **objects by UUID**; plan-local markers are embedded.
- Export already **snapshots** referenced library objects + performance to make files self-contained; import **mutates** global stores. This snapshot mechanism is the seam to reuse for copy-out.
- A lingering v1.4 coupling: backend wire-format still expects `aircraft` nested in `flightPlan`; frontend marshals it in/out on import. Worth cleaning up during the server migration.
