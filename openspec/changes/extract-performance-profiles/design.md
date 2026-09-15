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

### D1 — A new `dcsplan.profiles` key holding the whole collection

One key holds `{ version, profiles: [...] }`, written atomically. The old `dcsplan.performance` key is **left in place, untouched**, for one release.

*Why a single key:* profile data is a few KB, writes must be atomic (a half-written collection is unrecoverable), and one key mirrors the single server row this becomes in C2. The per-theatre library uses `dcsplan.library.<theatreId>` because theatre is a natural partition; profiles have no equivalent.

*Why a new key rather than reusing `dcsplan.performance` with a new shape:* migration doesn't have to sniff the shape to know whether it has run, and the old key remains a working rollback target. The 1.5 migration deleted `fp.aircraft` as it went, which burned the bridge; this one doesn't have to.

*Alternative rejected:* one key per profile plus an index — more writes, non-atomic, and no benefit at this data size.

### D2 — Identity is a UUID; the name is user-facing and unique

`id` is a `crypto.randomUUID()` generated at creation and immutable, matching `LibraryObject.id`. `name` is user-editable, non-empty, and **unique within the collection** (trimmed, case-insensitive).

*Why enforce uniqueness:* the name is the only thing distinguishing entries in the chooser, and regime names are already unique within a profile — same convention, same reason. Identity never depends on the name, so renaming is always safe.

### D3 — `profileId` is optional at rest, resolved at load

`FlightPlan.profileId?: string`. At runtime a plan **always** has exactly one profile (the AD-2 invariant); in the serialized form the field may be absent, exactly like `libraryRefs` and `markers`.

On load, an absent or dangling `profileId` resolves deterministically to the first profile in the collection, and the resolved value is written back on the next save.

*Why not make it required:* every legacy plan and every previously-exported file lacks it, so a required field would mean either a rejected import or a migration for each entry point. Resolve-at-load handles all of them in one place and keeps old files loadable forever.

### D4 — Deleting the profile the plan flies is blocked

Blocked while referenced, with the message pointing at the fix ("switch the plan to another profile first"). Deleting the last profile is also blocked.

*Why:* this is AD-7's rule, and implementing it now costs almost nothing with one plan. The alternative — allowing the delete and letting D3's fallback catch the dangling reference — would silently move the plan onto a different aircraft's numbers, and would have to be unbuilt when C2 arrives.

### D5 — Switching a plan's profile resets every leg to Manual, after confirmation

Confirmed product decision. On switch, walk every waypoint and clear `regimeId`, retaining TAS/FF — `clearRegimeFromAllWaypoints()` already does this per regime; the switch does it for all of them.

The confirmation names the count and the consequence: *"12 legs are bound to regimes in this profile. Switching will set them to Manual. Their TAS and fuel flow are kept."* When **no** leg is bound, the switch is a no-op and there is **no confirmation** — don't nag for nothing.

**The reset is one-way.** Clearing `regimeId` discards it; nothing records the previous binding. Switching *back* to the original profile does **not** restore anything — the legs stay Manual and must be re-bound one at a time through the leg-row regime picker. What survives is only that TAS/FF are retained, so the plan stays numerically correct and flyable throughout.

*Why reset rather than remap:* remapping by regime name is the trap. Two profiles routinely use the same names ("Cruise", "Ingress") for different numbers, so a name-match remap silently re-flies the plan on someone else's performance data with no visible change. Resetting is loud and leaves the computed plan numerically identical at the moment of the switch.

*Alternatives rejected:* **block the switch** (makes an early mistake permanent); **keep dangling `regimeId`s** (leaves legs in a state nothing can resolve).

### D5a — Recovery comes from the undo stack; no bespoke mechanism here

The switch gets **no undo machinery of its own**. It is a single user action, so it becomes one entry on the planner's undo stack (`add-edit-undo`, AD-12), and undoing it restores both `profileId` and every cleared `regimeId`. This change depends on `add-edit-undo` having shipped.

*Why not build something specific:* a session-lived undo scoped to this one operation would duplicate the general stack and be dead code the moment it lands. The general mechanism covers this case exactly.

*Across sessions,* the undo stack is gone (it dies on reload), so `add-version-history` covers the rest: AD-5 forces finalization before destructive structural operations, putting a version boundary immediately before the reset. Between this change and that one, a confirmed switch is unrecoverable after a reload — accepted, because the operation is rare and the confirmation states the leg count.

### D6 — Selection is split: what the plan flies vs. what the page edits

Two distinct notions, deliberately:

| | Meaning | Changing it |
|---|---|---|
| `plan.profileId` | the profile the plan flies | via the chooser → D5 confirmation + Manual reset |
| Performance page `editingProfileId` | UI-local, which profile is on screen | free, no plan impact |

*Why:* collapsing them into one selection means *looking at* another profile forces a switch, which triggers the Manual reset — you'd destroy your bindings just to compare two aircraft. Keeping them separate makes browsing free and switching deliberate, which matches the expectation that switching is rare.

Editing the flown profile still propagates to the plan through the existing `propagateRegimeCruiseChange()`.

### D7 — Migration: extend the pre-mount bootstrap, additively

A second bootstrap step runs synchronously before React mounts, **after** `bootstrapPerformanceFromLegacyPlan()` so a pre-1.5 user gets both migrations in a single boot:

1. `dcsplan.profiles` exists → nothing to do.
2. Else if `dcsplan.performance` exists → parse it, wrap it as one profile with a fresh UUID and a name derived from `model` (falling back to `"Default profile"`), write `dcsplan.profiles`.
3. Else → write a collection containing one default profile, so the D3 invariant holds from first boot.
4. If the stored plan has no `profileId`, point it at that profile.
5. Leave `dcsplan.performance` in place.

Wrapped in try/catch like its predecessor: a failed migration starts the app on defaults rather than blocking boot.

### D8 — Import adds a profile; it never replaces one

`.perf.json` goes to version `1.1`, gaining `id` and `name`. Importing a v1.0 file (no identity) assigns a fresh UUID and derives a name from `model`, then from the filename. Importing a file whose `id` already exists imports it as a copy with a fresh id rather than overwriting.

Plan export already embeds `performanceSnapshot`; it now also carries the profile's id and name. Importing a plan adds the snapshot as a profile if no profile with that id exists, otherwise references the existing one.

*Why additive:* today's import replaces the single profile, which is only safe because there is exactly one. With a collection, replacement silently destroys a named profile other plans may use. Additive is also the shape AD-8 mandates once the server arrives, and this snapshot-on-copy-out behaviour is AD-3's pattern showing up early — worth getting right here so C2 inherits it.

### D11 — Pending decision: mirrored vs. derived regime values

**Must be settled before this change's specs are written** — it changes what they say. Not an open question in the deferrable sense.

Today a leg bound to a regime carries a *copy* of that regime's cruise TAS/FF on the waypoint, refreshed by `propagateRegimeCruiseChange` whenever the regime is edited. `computeLegSegments` then uses the waypoint's copy for a level leg, treating the regime as a fallback for climb/descent only.

That denormalization is the root of a defect found in live testing and pinned by `it.fails` tests in `packages/frontend/src/contexts/undoCrossEntity.test.tsx`: undoing a regime edit rewinds the mirrored copy but not the regime, leaving a leg bound to a regime whose numbers it no longer matches — and the stale copy reaches leg fuel and the kneeboard. AD-12 carries the full account.

**Current lean: de-mirror.** Resolve a bound leg's TAS/FF from its regime at read time; keep the waypoint fields for Manual legs only. There is then no copy that can go stale, the "direct edits revert the leg to Manual" rule becomes structural rather than something each edit handler must remember to enforce, and the cross-entity undo question largely dissolves.

It lands here because this change is already reworking how regimes resolve — through a profile chosen per plan (D2, D3) rather than a single global list. Deciding it anywhere else means touching the same resolution path twice.

*Consequence if adopted:* D5's profile switch gets simpler — clearing `regimeId` is then the whole of it, with no mirrored values left behind to reason about.

## Risks / Trade-offs

- **A user switches profiles without reading the dialog and loses their bindings** — and the loss is permanent, since re-selecting the original profile restores nothing (D5) → in C0 the confirmation is the only guard; TAS/FF are retained so the numbers never silently change, but re-binding is manual, one leg at a time. Recovery arrives with C4 (D5a), not before.
- **Migration ordering regression** — if the new bootstrap runs before the 1.5 one, a pre-1.5 user's aircraft block is missed and they get an empty default profile → the two steps are ordered explicitly in `main.tsx`, with a test covering a pre-1.5 plan migrating fully in one boot.
- **Rollback loses post-upgrade edits** — the retained `dcsplan.performance` key is a snapshot from before the migration → accepted; it is a rollback, and the alternative (dual-writing both shapes) is not worth the complexity for one release.
- **Blocked deletion is a dead end for a user who wants a clean slate** → the block message names the fix; switching first is two clicks.
- **Storage quota** — the collection grows with profile count, each a few KB → same handling as today (`savePerformance` warns on `QuotaExceededError` rather than crashing).
- **Name uniqueness adds friction on rename** → inline validation with the conflicting name shown, rather than a modal error.

## Migration Plan

Deploy is a normal frontend release; the migration is client-side and runs on each user's next load (D7). No coordinated backend change — the kneeboard endpoint still receives `aircraft` marshalled into the plan body, unchanged (deferred to C2 per `proposal.md` — Non-goals).

**Rollback:** redeploy the previous frontend. `dcsplan.performance` is still present and still the shape the old code expects, so users return to their pre-upgrade profile, losing only profile edits made after the upgrade. `dcsplan.profiles` is ignored by the old code and is picked up again if the new version is redeployed.

Remove the `dcsplan.performance` fallback in a later change, once telemetry or elapsed time makes it safe.

## Open Questions

- Whether the chooser shows `model` alongside the profile name, or the name alone. Cosmetic; does not affect the data model or the specs.
- Whether "duplicate profile" ships in C0 or waits. It is a convenience built entirely on D2 (`crypto.randomUUID()` + a name suffix) and can be added later without disturbing anything here.
