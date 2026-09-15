# Centralized Flight Plans — Pressure-Test Scenarios

Companion to `2026-07-27-centralized-flightplans-product-brief.md`. Purpose: run the product model through concrete use cases and edge cases to find gaps **before** committing to an architecture.

Legend:
- ✅ **Answered** — the brief already handles this cleanly.
- ⚠️ **Gap** — the model does not (yet) specify an answer; needs a product decision.
- 🔎 **Confirm** — brief implies an answer; worth an explicit sign-off.

The ⚠️ gaps are collected and prioritized at the end (§ "Gaps to resolve").

---

## A. Identity, sign-in & migration

1. ✅ Anonymous user with local work signs into a **brand-new/empty** account → whole set migrates silently, additively.
2. ✅ Anonymous user signs into an **existing** account with data → prompted; additive merge (new plan, extra profile, library merge by UUID). Nothing overwritten.
3. ⚠️ **Second device with its own local work.** User already has an account with migrated data, then opens the app on a *different* device where they'd also done anonymous local work. On sign-in that device also tries to migrate → does it create a **duplicate** plan/profile? Do we dedupe, prompt, or accept duplicates?
4. ⚠️ **Logout / sign-out.** After signing out, what happens to the synced data on that device? Does the app revert to a blank anonymous state, keep a read-only cached copy, or wipe local? What if there were un-synced local edits at logout?
5. ⚠️ **Anonymous recipient of a share link.** Someone without an account opens a share-by-link plan. Can they view? Can they "copy" it (into local-only storage) without signing up? Or does copy require an account?
6. 🔎 **Discord identity changes.** User renames their Discord handle → does the display name (used in `Rev N · … · editor`) update retroactively, or is it snapshotted at edit time? (Recommend snapshot at edit time so old revisions stay truthful.)
7. ⚠️ **Same human, two Discord accounts** (or lost access to the Discord account). No account-merge / recovery path defined. Acceptable for v1?

---

## B. Spaces, squadrons & membership

8. ✅ User belongs to Personal + N squadrons; active-space switcher scopes plans, profiles, and library together.
9. ⚠️ **Join flow: auto-join vs approval.** Brief says "creator = admin approves/removes members" AND "others join via invite link/code." These conflict: does clicking an invite link **auto-join**, or **request approval**? Pick one (or make it a per-link setting).
10. ⚠️ **Invite link lifecycle.** Can an invite link be **revoked** or **expire**? Can it be single-use vs reusable? Leaked links currently = anyone joins forever.
11. ⚠️ **Last admin leaves / deletes their account.** Who inherits admin? Auto-promote oldest member? Squadron becomes orphaned/read-only? Undefined.
12. ⚠️ **Admin deletes the whole squadron.** What happens to shared plans/library/profiles and to members' access? Hard-delete everything? Grace period? Export first?
13. ✅ Member leaves/removed → squadron-shared assets stay with squadron; the member's *private* assets are untouched (they live in Personal). (§5.1)
14. 🔎 **Removed vs voluntarily left** — same outcome (assets stay, access revoked)? Assume yes.
15. ⚠️ **Re-joining.** A member who left and rejoins — do they regain access to the same shared assets (yes, they're the squadron's) and to any history/attribution from before? Assume yes; confirm.

---

## C. Plan lifecycle & references

16. ✅ Copy a squadron plan into Personal, then leave the squadron → the copy is a snapshot, so it survives fully self-contained. *(This is the intended behaviour — confirm it's what you want.)* 🔎
17. ⚠️ **Move vs copy.** The brief only defines "copy + snapshot" between spaces. Is there also a **move** (copy to new space *and* delete from source)? For promoting a Personal draft into a squadron, "move" is the natural verb.
18. ⚠️ **Deleting a shared plan.** With shared ownership, can **any** member delete a squadron plan? Is delete **soft** (restorable, in a trash) or hard? A rogue/careless member could nuke shared work; version history covers edits but not whole-plan deletion.
19. ⚠️ **Restore across a broken reference.** Restore an old plan version that references a library object (or profile) which has since been **deleted** from the space. What does the pilot see — a missing threat? An error? Does restore also resurrect the referenced object?
20. 🔎 **Theatre change on a plan.** Library is per-theatre. If a plan's theatre is changed, its library refs (which point into the old theatre's library) are orphaned. Is changing theatre even allowed, or is theatre fixed at creation?

---

## D. Shared library & profiles (reference vs snapshot mechanics)

21. ⚠️ **Delete a referenced library object.** A member deletes a SAM site that 5 squadron plans reference live. Options: block deletion while referenced / soft-delete with "missing object" placeholder in plans / cascade a warning. This is the single biggest referential-integrity question.
22. ⚠️ **Delete a referenced profile.** Same problem for a performance profile a plan depends on (a plan *must* have exactly one profile — deleting it leaves the plan unflyable).
23. 🔎 **Editing a shared library object changes all referencing plans.** Move a SAM site 5 NM → every plan referencing it silently updates. This is the *point* of a shared library, but it means a briefed plan can change under a pilot without the plan itself being edited. Confirm this is desired (see also #26, the kneeboard-consistency consequence).
24. ✅ Copy-out embeds a snapshot; the recipient's edits don't flow back, and later source-library edits don't reach the copy.
25. ⚠️ **Snapshot leaks squadron data.** Sharing a squadron plan by link embeds a snapshot of the referenced (possibly sensitive) squadron threat objects to an outside recipient. Intended and acceptable? (Probably yes — it's only the objects the plan uses — but worth an explicit call.)

---

## E. Versioning, concurrency & the kneeboard guarantee

26. ⚠️ **"Same Rev = same kneeboard" can break.** A kneeboard is stamped with the *plan's* revision, but its content also depends on the referenced live library/profiles. If the library changes while the plan doesn't, two kneeboards stamped the same `Rev N` can differ. Do we (a) bump the plan's revision when a referenced entity changes, (b) stamp a composite version (plan rev + library rev + profile rev), or (c) accept the looseness?
27. ⚠️ **Multiple editors in one coalescing window.** If members A and B both edit a plan within the same 10-min session, whose name is on the finalized snapshot? Last editor? All contributors? "Multiple"?
28. 🔎 **Two devices, one user, near-simultaneous edits.** Last-write-wins on current state; each device's session still yields a recoverable snapshot, so no data is truly lost. Confirm this is acceptable (the "losing" edits live only in history, not in current state).
29. ⚠️ **Concurrent real-time editing thrash.** Two squadron members editing the *same* plan at the *same* time: debounced autosaves overwrite each other with no locking or merge (we deliberately chose no real-time collab). Do we at least warn ("X is also editing"), soft-lock, or leave it as a known rough edge relying on history?
30. 🔎 **Restore of a shared plan affects everyone.** A member restores `Rev 8`; all members now see reverted content (a new current version). Consistent with LWW — confirm no extra guard needed.

---

## F. Sharing by link

31. ⚠️ **Which version does a link resolve to?** If the owner keeps editing after sharing, does the link always show the **latest** version, or the version **as-of** share time? (Affects whether a shared brief is a moving target.)
32. ⚠️ **Link revocation.** Can the owner revoke a previously shared link? What happens to people who already copied (their copies are independent snapshots, so unaffected — confirm)?
33. ⚠️ **Link to a deleted plan.** Owner deletes a plan that was shared by link → link 404s gracefully? Copies already made are unaffected.
34. 🔎 **Link + anonymous** — see #5 (does an account-less recipient get view-only, or view + local copy?).

---

## G. Scale, abuse & housekeeping

35. 🔎 **Unbounded history growth.** "Keep all, no pruning" × free public users × three versioned entity types. Accepted for now; flag a monitoring trigger to revisit.
36. 🔎 **Free-tier abuse.** Someone scripts thousands of plans/squadrons. No limits yet (accepted); note it as a known risk.
37. ⚠️ **Orphaned per-theatre libraries.** A space accumulates a library for every theatre ever touched. Any cleanup, or keep forever? (Low priority.)

---

## Resolved — Tier 1 (2026-07-27)

- **#26 / #19 — Pin a snapshot into each finalized version.** Every finalized version embeds a snapshot of exactly the library objects + profile it referenced at that moment. Consequences: `Rev N` is permanently reproducible (kneeboard stamp = plan Rev only); restore can never hit a broken reference; history is immutable regardless of later live-library edits. **Live = reference (shared/current); frozen version = snapshot.** A plan reflects a library edit only from its *next* finalized version.
- **#21 — Deleting a referenced library object:** warn ("used by N plans") → **soft-delete** (admin-restorable) → live plans show a **"missing object" placeholder**. Past versions unaffected (pinned).
- **#22 — Deleting a referenced profile:** **blocked while any live plan references it**; must reassign those plans to another profile first (a plan must always have exactly one).
- **#18 — Deleting a shared plan:** **any member** may delete, but it's a **soft-delete to a space trash**, admin-restorable (~30 days).
- **#17 — Move vs copy between spaces:** support **both** — "Copy to…" (snapshot, original stays) and "Move to…" (copy + delete source).
- **Restore semantics (follow-up to #26).** Plans, library, and profiles have **independent histories**; restoring a plan reverts only the plan's authored content and **re-binds references to the current live library/profile** (chosen: "current position", not the frozen photo). A plan undo never rolls back shared intel. Deleted dependencies render as placeholders with a one-click "recover into library" sourced from the version's pinned snapshot. The pinned snapshot is **read-time only** (reproduce/recover), never used to mutate shared state on restore.

## Resolved — Tier 2 (2026-07-27)

- **#9 / #10 — Joining:** auto-join via a **revocable/rotatable** invite link per squadron; optional per-squadron approval toggle deferred.
- **#11 — Admin succession:** never adminless — **longest-standing member auto-promotes**; last member out → squadron archived then purged.
- **#12 — Squadron deletion:** **soft-delete + ~30-day grace + export**, then purge; members lose access immediately, admin can undo in-window.
- **#27 — Multi-editor attribution:** version records **all contributors**, displays **last editor** as primary (`Falcon +2`).
- **#29 — Concurrent editing:** no locking; **presence + soft non-blocking warning** ("Falcon is editing"), rely on LWW + history.
- **#14 / #15 — Removed vs left / re-joining:** same outcome (assets stay with squadron); re-joiners regain access to shared assets.

## Resolved — misc (2026-07-27)

- **#20 — Theatre is fixed at plan creation.** A plan's theatre cannot be changed afterwards (that would orphan its per-theatre library references); to fly another theatre, create a new plan.
- **#6 — Editor attribution is snapshotted at edit time** (a later Discord rename doesn't rewrite old revisions).
- **#16 / #23 / #25 — Confirmed:** copies made before leaving a squadron survive (snapshots); editing a shared object updates all live plans (desired); copy-out snapshots may embed referenced squadron objects for an outside recipient (acceptable — only the objects the plan uses).

## Refinement — anonymous tier scope (2026-07-27)

- The **reusable object library is login-gated** (its value is reuse across plans; the anonymous tier is single-plan). Anonymous users keep **plan-local markers** + a **single performance profile**.
- Migration therefore carries **plan (+embedded markers) + performance profile** only — no anonymous library to merge. Optional: offer to promote markers into the reusable library on first login.

## Gaps to resolve (prioritized)

**Tier 1 — RESOLVED (see above).**

**Tier 2 — RESOLVED (see above).**

**Tier 3 — RESOLVED:**
- **#31 — Link resolves to the latest version** for now; optional pin-to-Rev deferred.
- **#32 — Links are revocable**; already-made copies (snapshots) are unaffected.
- **#5 — Anonymous recipients:** view + copy to local-only, no account required.
- **#3 — Second device with local work:** prompt to import (additive), no content dedup.
- **#4 — Logout:** clear the device to blank anonymous, warn on un-synced edits.
- **#7 — No account merge/recovery in v1** (one Discord = one account). Known limitation.

**Tier 4 — housekeeping (defer, but track):**
- #35 history growth, #36 abuse limits, #37 orphaned theatre libraries.
