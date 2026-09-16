## 1. Harden per-theatre library persistence

Independent of the UI work, and first because it makes everything after it safe.

- [x] 1.1 In `LibraryContext`, hold the active theatre and its entries as a single state value so they can never disagree, and persist only when they match; verify `pnpm --filter frontend exec vitest run` still passes `src/utils/libraryStorage.test.ts` unchanged
- [x] 1.2 Add a test that changes the active theatre and asserts the incoming theatre's stored library is never overwritten with the outgoing theatre's entries, at any point during the change (spec: *Entries are not written under the wrong theatre*)
- [x] 1.3 Add a test that simulates a reload immediately after a theatre change — re-mounting the provider against the same storage — and asserts both theatres' stored libraries hold their own entries (spec: *A reload during a theatre change preserves both libraries*)

## 2. The New flight plan dialog

- [x] 2.1 Add a `NewFlightPlanDialog` component in `components/sidebar/` presenting a theatre picker sourced from `useTheatres`, defaulting to the current plan's theatre; verify with a test asserting the current theatre is pre-selected on open (spec: *Theatre picker defaults to the current theatre*)
- [x] 2.2 Create the plan via `flightPlanUtils.newFlightPlan(theatreId)` routed through the context's `replaceFlightPlan`; verify with a test that confirming yields an empty plan on the chosen theatre (spec: *Creating a plan on a chosen theatre*)
- [x] 2.3 Show the confirmation step only when the current plan has at least one waypoint, and word it to name only the flight plan; verify with tests for the non-empty case prompting and the empty case creating without a prompt (spec: *Confirmation when the current plan would be lost*, *No confirmation when the current plan is empty*)
- [x] 2.4 Add a test asserting the confirmation text makes no mention of the library while the current theatre's library is non-empty (spec: *The confirmation does not mention the library*)
- [x] 2.5 Add a test asserting cancelling leaves the plan, its theatre, and its waypoints unchanged (spec: *Abandoning the action changes nothing*)
- [x] 2.6 Place the tier decision — replace versus append — at a single explicit branch, with only the anonymous (replace) side implemented and the signed-in side raising a clear "not yet available" path rather than silently replacing; verify by locating that one branch in review (spec: *Creating a plan replaces or appends according to tier*)

## 3. Wire the action into the sidebar

- [x] 3.1 Replace the Clear button in `ButtonZone`'s action row with New flight plan, wired to the dialog; verify by rendering `ButtonZone` and asserting the Clear control is gone and New is present
- [x] 3.2 Update `ButtonZone.test.tsx`, which currently renders `ClearFlightPlanDialog` through the component; verify the existing undo/redo assertions still pass unchanged
- [x] 3.3 Verify creating a plan discards undo history: make edits, create a plan, then assert undo is unavailable and no earlier state is reachable (spec: *Undo does not restore the replaced plan*, *No earlier state survives the creation*)

## 4. Make the plan's theatre read-only

- [x] 4.1 Change `TitleZone` to display the current plan's theatre as plan metadata rather than a dropdown, presented so it does not read as a disabled control; verify with a test asserting no theatre-selection control is rendered (spec: *The plan's theatre is shown but not editable*)
- [x] 4.2 Remove `handleTheatreSelect`, `handleConfirmTheatreChange`, `pendingTheatreId`, and `isConfirmDialogOpen` from `Sidebar`, along with the `onTheatreChange` prop threading; verify `pnpm --filter frontend exec tsc --noEmit` is clean with no unused-symbol fallout

## 5. Remove what is now unreachable

- [x] 5.1 Delete `components/sidebar/ChangeTheatreDialog.tsx`; verify no references remain by grepping the source tree
- [x] 5.2 Delete `components/sidebar/ClearFlightPlanDialog.tsx`; verify no references remain by grepping the source tree
- [x] 5.3 Remove `clearAll` from `LibraryContext` and its `clearLibrary` import, rather than leaving a destructive method with no callers; verify by grepping for `clearAll` and confirming only `PerformanceContext`'s unrelated method remains
- [x] 5.4 Confirm `libraryStorage.clearLibrary` is either still used or removed with its test, and verify the decision by grepping for its callers

## 6. Library survival — the headline behaviour

- [x] 6.1 Add a test building a library on one theatre, creating a plan on a second, and asserting the first theatre's entries are untouched (spec: *The outgoing theatre's library survives*)
- [x] 6.2 Extend it to return to the first theatre and assert every entry is present and unchanged (spec: *Returning to a theatre finds its library intact*, *A theatre's library survives moving to another theatre and back*)
- [x] 6.3 Add a test asserting a new plan on a theatre with existing local entries presents those entries, and on a theatre with none presents an empty library with no error and no import prompt (spec: *Anonymous user's existing local library for that theatre is used*, *Anonymous user with no local library starts empty*)

## 7. Full verification

- [x] 7.1 Run `pnpm --filter frontend exec vitest run` and confirm the suite passes with no pre-existing test broken
- [x] 7.2 Run `pnpm --filter frontend exec tsc --noEmit` and confirm a clean type-check
- [x] 7.3 Run `openspec validate add-new-plan-flow --type change --strict` and confirm it passes
- [x] 7.4 Exercise the app: build a library on theatre A, create a plan on theatre B, create a plan back on A, and confirm A's library is intact — the data loss this change exists to stop
- [x] 7.5 Record explicitly that the two signed-in scenarios (*Signed-in tier adds without discarding*, *Signed-in user gets the space's library for the theatre*) are specified but not verifiable until `add-user-accounts` lands, so the gap is visible rather than silently unticked — the signed-in branch in `NewFlightPlanDialog.tsx` throws explicitly
