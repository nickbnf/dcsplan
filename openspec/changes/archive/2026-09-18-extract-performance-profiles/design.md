## Context

See `proposal.md` — Why. The constraints that shape this design:

- **One store, one blob.** `dcsplan.performance` holds a single unnamed `Aircraft`. `performanceStorage.ts` is singular throughout (`loadPerformance`, `savePerformance`, `hasStoredPerformance`), and `PerformanceContext` exposes exactly one `performance: Aircraft`, autosaved on every change.
- **A migration precedent already exists.** `bootstrapPerformanceFromLegacyPlan()` runs synchronously before React mounts, rewrites localStorage, and swallows its own errors so the app always starts. This change extends that pattern rather than inventing one.
- **Regime binding is already unbindable.** `regimeUtils.ts` has `clearRegimeBinding()` and `clearRegimeFromAllWaypoints()`, which drop `regimeId` from a waypoint while **leaving its TAS/FF in place**. "Manual" is the absence of `regimeId`, not a separate mode — which is what makes the profile-switch reset (D5) cheap and non-destructive.
- **Front-end only** (AD-2). No server exists yet, so every decision here has to work in localStorage and survive being replaced by a server row later.

## Goals / Non-Goals

**Goals:**
- A profile is nameable, identifiable, and selectable; a plan says which one it flies.
- Existing users' data survives untouched, with a viable rollback.
- Shapes chosen here map cleanly onto a server row later, so C2 is a transport change and not a second data-model change.

**Non-Goals:**
- Any behaviour change to leg computation, climb/descent, take-off segment, or taxi fuel.
- Profile versioning, sharing, or space ownership (AD-1, AD-5) — those need the server.
- Reworking the Performance page's regime editing UI beyond adding profile selection around it.

## Decisions

### D1 — Storage is tier-dependent

**Anonymous tier:** the existing `dcsplan.performance` key continues to hold a single profile blob. The migration adds a `name` field; no collection envelope, no id. The shape is `{ version, name, aircraft }` (the `aircraft` block is unchanged). The old key is left in place for one release as a rollback target.

**Signed-in tier:** the server holds the profile collection. `dcsplan.profiles` is not needed — profiles are fetched/saved via the API. Offline cache shape is a server concern (C2).

*Why not a collection key for anonymous:* there is exactly one profile, one plan, and no CRUD. A collection envelope and client-generated ids add complexity that is immediately thrown away when the user signs in and the server takes over. The single-blob shape is simpler to migrate, simpler to roll back, and maps cleanly onto a single server row at adoption.

*Alternative rejected:* client-side `dcsplan.profiles` collection with `crypto.randomUUID()` — creates synthetic ids that conflict with server-assigned ids at sign-in, requires reconciliation logic that serves no user.

### D2 — Identity is server-assigned; name is user-facing

**`id`** is assigned by the server when the profile is created in a space (signed-in tier) or when an anonymous profile is adopted at sign-in. The anonymous tier has no profile id — the single profile is referenced implicitly. No client-side id generation (`crypto.randomUUID()` is not used for profiles).

**`name`** is user-editable and non-empty in both tiers. In the signed-in tier, names are **unique within the collection** (trimmed, case-insensitive) because the name is the only thing distinguishing entries in the chooser. In the anonymous tier, name uniqueness is trivially satisfied (one profile). Identity never depends on the name, so renaming is always safe.

*Why server-assigned ids:* client-generated ids create a reconciliation problem at sign-in — the server would need to either accept arbitrary client ids (security/collision risk) or remap them (breaking any local references). Server-assigned ids avoid this entirely.

### D3 — `profileId` is signed-in only; anonymous resolves implicitly

**Signed-in tier:** `FlightPlan.profileId?: string` references a server-assigned profile id. At runtime, if `profileId` is present and matches a profile in the collection, the plan uses that profile. If `profileId` is absent, dangling, or the collection is empty, the plan resolves to the **null profile** — an implicit profile with empty/zero aircraft defaults and no regimes. The null profile is never stored; it is a runtime construct representing "no performance data configured."

**Anonymous tier:** no `profileId` on the plan. The plan implicitly uses the single profile stored in `dcsplan.performance`. There is no collection to index into and no id to reference.

*Why a null profile rather than "first in collection":* the collection can be empty (new user, or all profiles deleted per D4). Falling back to the first profile would silently assign someone else's aircraft to a plan; the null profile makes the absence explicit — the plan computes with manual TAS/FF only, which is safe and matches the pre-profile experience.

*Why not add profileId for anonymous:* there is exactly one profile, so a reference adds no information. Omitting it keeps the anonymous plan shape simpler and avoids storing a synthetic id that would be discarded at sign-in.

### D4 — Deleting a profile is always allowed, with confirmation when the plan uses it (signed-in only)

**Signed-in tier only.** Any profile can be deleted. When the plan's `profileId` references the profile being deleted AND at least one leg is bound to a regime, a confirmation dialog names the count and the consequence — the same wording as D5's switch confirmation. On confirm, the profile is deleted and the plan falls back to the **null profile** (implicit, empty aircraft, no regimes; see D3). All bound legs are cleared to Manual, retaining stored TAS/FF. When no leg is bound, deletion proceeds without confirmation.

The collection MAY be empty after deletion. An empty collection means the plan resolves to the null profile — the user sees no regimes and no performance data, matching the experience of a new user who hasn't set up performance.

**Anonymous tier:** deletion is not offered — there is exactly one profile.

*Why allow rather than block:* blocking creates a dead end ("switch to another profile first") that doesn't help when the user genuinely wants to remove the profile. The confirmation dialog already communicates the consequence; the null profile fallback provides a safe, predictable landing state. This is simpler than maintaining a "last profile" invariant.

### D5 — Switching a plan's profile resets every leg to Manual, after confirmation (signed-in only)

**Signed-in tier only.** Anonymous users have one profile; there is nothing to switch.

Confirmed product decision. On switch, walk every waypoint and clear `regimeId`, retaining TAS/FF — `clearRegimeFromAllWaypoints()` already does this per regime; the switch does it for all of them.

The confirmation names the count and the consequence: *"12 legs are bound to regimes in this profile. Switching will set them to Manual. Their TAS and fuel flow are kept."* When **no** leg is bound, the switch is a no-op and there is **no confirmation** — don't nag for nothing.

**The reset is one-way.** Clearing `regimeId` discards it; nothing records the previous binding. Switching *back* to the original profile does **not** restore anything — the legs stay Manual and must be re-bound one at a time through the leg-row regime picker. What survives is only that TAS/FF are retained, so the plan stays numerically correct and flyable throughout.

*Why reset rather than remap:* remapping by regime name is the trap. Two profiles routinely use the same names ("Cruise", "Ingress") for different numbers, so a name-match remap silently re-flies the plan on someone else's performance data with no visible change. Resetting is loud and leaves the computed plan numerically identical at the moment of the switch.

*Alternatives rejected:* **block the switch** (makes an early mistake permanent); **keep dangling `regimeId`s** (leaves legs in a state nothing can resolve).

### D5a — Recovery comes from the undo stack; no bespoke mechanism here (signed-in only)

**Signed-in tier only** (follows D5).

The switch gets **no undo machinery of its own**. It is a single user action, so it becomes one entry on the planner's undo stack (`add-edit-undo`, AD-12), and undoing it restores both `profileId` and every cleared `regimeId`. This change depends on `add-edit-undo` having shipped.

*Why not build something specific:* a session-lived undo scoped to this one operation would duplicate the general stack and be dead code the moment it lands. The general mechanism covers this case exactly.

*Across sessions,* the undo stack is gone (it dies on reload), so `add-version-history` covers the rest: AD-5 forces finalization before destructive structural operations, putting a version boundary immediately before the reset. Between this change and that one, a confirmed switch is unrecoverable after a reload — accepted, because the operation is rare and the confirmation states the leg count.

### D6 — Selection is split: what the plan flies vs. what the page edits (signed-in only)

**Signed-in tier only.** Anonymous users have one profile, so editing *is* flying — no split needed.

Two distinct notions, deliberately:

| | Meaning | Changing it |
|---|---|---|
| `plan.profileId` | the profile the plan flies | via the chooser → D5 confirmation + Manual reset |
| Performance page `editingProfileId` | UI-local, which profile is on screen | free, no plan impact |

*Why:* collapsing them into one selection means *looking at* another profile forces a switch, which triggers the Manual reset — you'd destroy your bindings just to compare two aircraft. Keeping them separate makes browsing free and switching deliberate, which matches the expectation that switching is rare.

Editing the flown profile is reflected in computed leg values immediately through read-time resolution (D11 de-mirroring).

### D7 — Migration: extend the pre-mount bootstrap, additively

A second bootstrap step runs synchronously before React mounts, **after** `bootstrapPerformanceFromLegacyPlan()` so a pre-1.5 user gets both migrations in a single boot:

1. `dcsplan.performance` already has a `name` field → nothing to do.
2. Else if `dcsplan.performance` exists → parse it, add a `name` derived from `aircraft.model` (falling back to `"Default profile"`), write back to `dcsplan.performance`.
3. Else → write a default profile (empty aircraft, no regimes, name `"Default profile"`) to `dcsplan.performance`.

No id is assigned — the anonymous profile has no id (D2). No `profileId` is set on the plan — it resolves implicitly (D3). No collection key is created — the single-blob shape is sufficient for the anonymous tier (D1).

Wrapped in try/catch like its predecessor: a failed migration starts the app on defaults rather than blocking boot.

### D8 — Export is tier-independent; import is tier-branched

**Export (both tiers):** `.perf.json` stays at version `1.0`, gaining only a `name` field. The envelope is `{ version: "1.0", name, aircraft }` — no `id`. The file is a portable performance package for sharing between users and squadrons; identity is not portable (the recipient's server assigns a new id on import).

*Why no id in the file:* the use case is cross-squadron exchange. An id from one user's space is meaningless in another's. Putting it in the file would create false matches on import and require reconciliation logic that serves no user.

**Import — anonymous tier:** replaces the single profile's aircraft data — the current behaviour. If the file carries a `name`, the profile's name is updated; otherwise a name is derived from `aircraft.model`.

**Import — signed-in tier:** additive — creates a new profile in the collection with a fresh server-assigned id. The imported `name` is used (auto-suffixed if it collides with an existing name). No existing profile is replaced.

*Why the import split:* anonymous has exactly one profile and one plan — replacement is the only sensible operation. Signed-in has a collection where replacement would silently destroy a named profile other plans may use.

### D11 — De-mirror: resolve bound-leg TAS/FF from regime at read time

**Decided (2026-09-17).** Recorded in AD-12.

Today a leg bound to a regime carries a *copy* of that regime's cruise TAS/FF on the waypoint, refreshed by `propagateRegimeCruiseChange` whenever the regime is edited. `computeLegSegments` then uses the waypoint's copy for a level leg, treating the regime as a fallback for climb/descent only.

That denormalization is the root of a defect found in live testing and pinned by `it.fails` tests in `packages/frontend/src/contexts/undoCrossEntity.test.tsx`: undoing a regime edit rewinds the mirrored copy but not the regime, leaving a leg bound to a regime whose numbers it no longer matches — and the stale copy reaches leg fuel and the kneeboard. AD-12 carries the full account.

**Decision: de-mirror.** Resolve a bound leg's TAS/FF from its regime at read time; keep the waypoint fields for Manual legs only. There is then no copy that can go stale, the "direct edits revert the leg to Manual" rule becomes structural rather than something each edit handler must remember to enforce, and the cross-entity undo question dissolves for the regime-editing case — editing a regime no longer writes the plan at all.

It lands here because this change is already reworking how regimes resolve — through a profile chosen per plan (D2, D3) rather than a single global list. Deciding it anywhere else means touching the same resolution path twice.

`propagateRegimeCruiseChange` and the mirrored waypoint fields it writes are removed. D5's profile switch gets simpler — clearing `regimeId` is the whole of it, with no mirrored values left behind to reason about.

## Risks / Trade-offs

- **A signed-in user switches profiles without reading the dialog and loses their bindings** — and the loss is permanent, since re-selecting the original profile restores nothing (D5) → the confirmation is the only guard; TAS/FF are retained so the numbers never silently change, but re-binding is manual, one leg at a time. Recovery arrives with the undo stack (D5a). Anonymous users cannot switch, so this risk doesn't apply.
- **Migration ordering regression** — if the new bootstrap runs before the 1.5 one, a pre-1.5 user's aircraft block is missed and they get an empty default profile → the two steps are ordered explicitly in `main.tsx`, with a test covering a pre-1.5 plan migrating fully in one boot.
- **Rollback loses post-upgrade edits** — the anonymous tier's `dcsplan.performance` key is modified in place (name added) rather than moved, so rollback to old code works (old code ignores the `name` field).
- **A signed-in user deletes the profile their plan flies and loses their bindings** → the confirmation dialog names the count and consequence, same as a profile switch. The plan falls back to the null profile (empty aircraft, no regimes), which is a safe landing state matching a new user's experience. Anonymous users have no deletion.
- **Storage quota (signed-in)** — the collection grows with profile count, each a few KB → same handling as today (`savePerformance` warns on `QuotaExceededError` rather than crashing). Anonymous tier has one profile, so no growth.
- **Name uniqueness adds friction on rename (signed-in)** → inline validation with the conflicting name shown, rather than a modal error. Anonymous has one profile, so no conflict possible.

## Migration Plan

Deploy is a normal frontend release; the migration is client-side and runs on each user's next load (D7). No coordinated backend change — the kneeboard endpoint still receives `aircraft` marshalled into the plan body, unchanged (deferred to C2 per `proposal.md` — Non-goals).

**Rollback:** redeploy the previous frontend. `dcsplan.performance` is still present and the old code ignores the added `name` field, so users return to their pre-upgrade behaviour, losing only the profile name. No `dcsplan.profiles` key is created (D1), so there is nothing for old code to trip over.

## Open Questions

- Whether the chooser shows `model` alongside the profile name, or the name alone. Cosmetic; does not affect the data model or the specs.
- Whether "duplicate profile" ships in C0 or waits. It is a convenience built entirely on D2 (`crypto.randomUUID()` + a name suffix) and can be added later without disturbing anything here.
