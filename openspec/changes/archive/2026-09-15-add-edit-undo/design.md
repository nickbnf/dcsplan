## Context

See `proposal.md` — Why. What the code actually looks like, since two of the proposal's assumptions turned out to be wrong:

- **Every plan mutation already funnels through one function.** `FlightPlanContext.handleFlightPlanUpdate` is the sole writer, and it already performs a deep-equality check (`JSON.stringify` on the plan minus `attackPlanning`) to decide whether the change is substantive. There is a ready-made capture point that already knows a no-op from a real edit.
- **`onFlightPlanUpdate` is consumed by seven components across five pages** — `PlannerApp`, `Layout`, `TheatreLibraryPage`, `PerformancePage`, `AttackPlanningPage`, `PerformanceImportDialog`, plus `Sidebar` indirectly. The plan is not the property of one screen.
- **Drags are already a single mutation.** Waypoint drag uses OpenLayers `modifystart`/`modifyend` and writes once, on `modifyend` (`Map.tsx:888-905`); plan-marker drag does the same (`Map.tsx:582-593`). The proposal's "hundreds of move events" is wrong for drags.
- **The genuinely continuous inputs are the range sliders** — declination and bank angle in `ButtonZone` fire `onChange` per step, each one a full plan update.
- **Two global `keydown` listeners already exist** — `Map.tsx:741` (selection cycling, Escape, coord entry) and `LibraryMap.tsx:336`.
- Persistence is a 300 ms debounce in `usePersistedFlightPlan`, downstream of the context.

## Goals / Non-Goals

**Goals:**
- Make the existing Undo/Redo buttons work, with keyboard parity.
- Capture at a single choke point per entity, so no call site has to remember to participate.
- Leave a mechanism the library and profile stacks can adopt unchanged.

**Non-Goals:**
- Persisting the stack, or any interaction with the server (AD-12).
- Undo for library and profile edits *in this change* — see D2.
- Any change to what an edit does.

## Decisions

### D1 — Three per-entity stacks, not per-surface — amends AD-12

AD-12 says "one stack per editing surface." The code says that cannot work: the plan is mutated from five pages, so a planner-scoped stack would silently miss edits made on the library or attack-planning pages, and a library-page stack would capture plan edits that happen to originate there.

**Stacks are per entity — plan, library, profile — captured at each entity's context.** This mirrors AD-4 exactly: three entities, three independent histories, and restoring one never touches another. Action undo becomes the ephemeral counterpart of version restore, with the same shape, which is a good sign rather than a coincidence.

A single action that touches two entities pushes an entry onto each. Undoing one does not undo the other — again the AD-4 rule.

*AD-12 should be amended to say "per entity."* The rationale it gives (a cross-surface undo would yank the user to another page) is still real, and reappears here as a risk rather than a structural principle.

### D2 — This change implements the plan stack only

The library and profile stacks are deferred, not designed away: D3–D8 are entity-agnostic and apply unchanged when they land.

*Why:* the dead buttons are in the planner sidebar, plan edits are the overwhelming majority of what users do, and shipping one working stack beats three half-wired ones. The remaining two are then a mechanical repeat against `LibraryContext` and `PerformanceContext`.

### D3 — Snapshot entries, with an optional coalesce key

An entry is `{ before: FlightPlan, coalesceKey?: string, at: number }`. Consecutive captures sharing a non-empty `coalesceKey` within a short idle window (~500 ms) merge into the existing entry instead of pushing a new one.

Continuous controls pass a key — `plan:declination`, `plan:bankAngle`. Everything else passes nothing and gets one entry per mutation, which is already correct for drags (they write once on `modifyend`) and for the comment editor (which saves on blur or Enter).

*Why a key rather than a pure time window:* time alone merges genuinely distinct rapid actions — delete a waypoint, immediately delete another, get one entry. Keying on the control being manipulated means only a sustained interaction with *the same control* collapses.

*Why it degrades safely:* a control that forgets its key produces finer-grained undo, never broken undo. The failure mode is verbose history, not lost state.

*Alternative rejected:* explicit `beginTransaction()`/`endTransaction()` around each continuous control. More precise, but every call site must remember both halves, and a missed `end` wedges the stack.

### D4 — Capture inside `FlightPlanContext`, reusing its existing change check

`handleFlightPlanUpdate` already computes whether the plan changed substantively before writing. Capture hangs off that same condition, so no-op updates — of which there are many, since several components re-emit the plan on render — never reach the stack.

*Consequence:* because capture is at the choke point rather than the call sites, participation is automatic and non-negotiable. Anything that must **not** be undoable has to opt out explicitly — see D5.

### D5 — Wholesale-replacement operations opt out explicitly and clear both stacks

Import, Clear flight plan, and New flight plan write through the same context function, so under D4 they would otherwise become ordinary undoable entries. The context gains a distinct entry point — a replace path that skips capture and **discards** the undo and redo stacks.

*Why discarding matters:* leaving pre-import entries in place would let Undo resurrect the replaced plan (AD-12). Skipping capture without clearing is the dangerous half-measure.

### D6 — Redo is cleared by any new action

Standard linear undo. No redo tree.

### D7 — Bounded depth, oldest dropped

50 entries. A plan is a few KB of JSON, so the worst case is a few hundred KB held in memory — irrelevant next to the map tiles. Dropping the oldest is silent; there is no user-visible notion of "you have used up your undo."

### D8 — One keyboard handler, at the app root, that yields to focused inputs and to coord entry

Registered once above the pages rather than added to either existing map listener, so it does not depend on which map is mounted.

It ignores the event when:
- the target is an `input`, `textarea`, or `contenteditable` — native field undo must keep working, the same guard `waypoint-selection` already specifies for `+`/`-`;
- **coord entry mode is active** — that mode owns the keyboard, including Backspace and Escape, and undoing a half-typed coordinate is incoherent. Escape already cancels it.

Bindings: `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` and `Ctrl+Y` redo.

### D9 — Undo is an ordinary state update

An undo writes the restored plan through the normal path, so it debounces to localStorage via `usePersistedFlightPlan` like any edit. Per AD-5 it creates no version, and per AD-12 it never reaches the server.

### D10 — Tier-independent

The stack is in memory and touches nothing server-side, so behaviour is identical with and without an account. Stated explicitly per the spec-authoring rule in `openspec/config.yaml`; there is no second tier path to specify.

## Risks / Trade-offs

- **Undo can revert an edit made on a different page.** The plan is one entity edited from five screens, so editing attack-planning params, navigating to the planner, and pressing Ctrl+Z reverts something not on screen. → Mitigated by entries carrying a short optional label, surfaced when an undo reverts a change whose originating route differs from the current one. Labels are best-effort: supplied by the common call sites, absent elsewhere.
- **A missed coalesce key makes a slider produce dozens of entries** and pushes real history off the end of a 50-deep stack → the two known sliders are keyed as part of this change; any future continuous control needs the same, and the spec states the rule so it is discoverable.
- **Capture at the choke point means anything new is undoable by default.** A future wholesale operation that forgets to use the D5 replace path becomes silently undoable → acceptable and the safer default, since the failure is "too much is undoable" rather than "Undo resurrects deleted data."
- **Stale closures.** Several call sites close over `flightPlan` (`Map.tsx` uses a ref for markers but the captured value for waypoints) → capture reads the context's current state rather than whatever the caller closed over, so the stack cannot inherit that bug.
- **No cross-session recovery.** Deliberate (AD-12); `add-version-history` owns it.

## Migration Plan

None. No persisted state, no schema, no server. Deploy is a normal frontend release; rollback is reverting it, which returns the buttons to their current no-op state.

## Open Questions

- Stack depth of 50 is a guess. It can be tuned without touching the specs or the task breakdown.
- Whether the label in the cross-page mitigation is worth wiring to every call site, or only to destructive ones (delete waypoint, delete marker). Affects polish, not structure.
