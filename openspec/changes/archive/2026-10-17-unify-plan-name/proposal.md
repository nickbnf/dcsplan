# Proposal

## Why

`add-cloud-sync` left a signed-in plan with **two names**: the index name in `plans.name` (shown and renamed on the Flight Plans screen) and the plan's own `name` inside its Y.Doc (edited in the plan parameters). They drift apart, and having two rename paths is confusing. A related problem: we want each plan to have a **stable, shareable address**. If that address were built from the name, it would break whenever the plan is renamed, and two plans with the same name would collide. This change keeps a single name, owned by the plan, and gives every plan an id-based address that a rename does not break.

## What Changes

- **One name, owned by the plan.** The Y.Doc's `name` is the only editable name, and it is renamed only in the editor's plan parameters. `plans.name` becomes a **server-maintained copy**: the sync room already holds the document server-side (AD-14), so it watches the `name` field and updates the index. This covers renames made offline that reach the server on reconnect.
- **No rename on the Flight Plans screen.** The list shows each plan's name read-only; selecting a plan opens it.
- **Plan names are no longer unique.** The A1 rule and its `409` are removed. A name inside a CRDT cannot be rejected after the fact (concurrent or offline edits), and the address no longer depends on the name. No duplicate-name hint is shown for now. **BREAKING (spec):** `space`'s unique-name requirement is removed.
- **Short plan ids.** A plan's id becomes a 12-character random id from a base58 alphabet (no look-alike characters such as `0/O/l/1`), still generated on the client so drafts and offline creation work unchanged. It is used everywhere: plan id, sync room key, local store key and URL. That is about 70 bits of randomness, so addresses are unguessable, but access is still enforced by space membership, not by obscurity. The anonymous plan keeps its fixed id `local`. **BREAKING (storage):** existing UUID-keyed plans are not carried over (see Impact).
- **Id-based plan addresses: `/p/:id/:slug`.** The id resolves the plan; the slug is a cosmetic rendering of its name. The plan-scoped tabs live under it: `/p/:id/:slug` (NAV), `/p/:id/:slug/perf`, `/p/:id/:slug/attack`. LIBRARY stays at `/library` (space-scoped, AD-15), and the Flight Plans home stays at `/plans`.
- **Rename keeps the editor mounted.** When the name changes, the address is replaced in place with the new slug (no history entry, no reload), so editing state such as the active map tool is preserved. A stale or missing slug still resolves by id and is corrected to the current one.
- **Both tiers use the same scheme.** The anonymous single plan is addressed as `/p/local/:slug`. The old flat routes (`/`, `/performance`, `/attack`) redirect to the active plan's address.
- **The URL is the active selection.** Opening `/p/:id/…` makes that plan active. An id that does not resolve in the space falls back to Home (signed in) or to the local plan (anonymous).
- **Breadcrumb name** comes from the plan's own name.

## Capabilities

### New Capabilities

- `plan-addressing`: How a flight plan is addressed in the app: short client-generated plan ids, the `/p/:id/:slug` scheme, plan-scoped tabs under it, id-only resolution, slug canonicalization, rename updating the address without remounting, legacy-route redirects, and unresolvable-id fallback. Stated for both tiers (anonymous uses id `local`).

### Modified Capabilities

- `space`: **Remove** "Plan names are unique within a space". Modify the plan-list requirement (names are shown read-only, with no rename from the list) and the active-selection requirement (the active plan is determined by the plan address; an unresolvable address falls back to Home).
- `plan-sync`: **Add** a requirement that the name shown in the plan list follows the plan's own name, including renames made offline and synced later.
- `plan-lifecycle`: A draft now joins the space on its **first edit of any kind** (not only its first waypoint). Leaving a draft that is still identical to a fresh plan discards it; a draft with edits is never discarded, and a failed save is retried. (Added during implementation, after local testing.)

## Impact

**Backend (`packages/backend`).**
- `sync.py`: the room observes the server-side doc's `name` and updates `plans.name` (and `updated_at`).
- New `yoyo` migration: **drops and recreates** `plans` and `plan_updates` without `UNIQUE(space_id, name)`. This is destructive by design: the server has never been deployed, so no plan data needs preserving.
- `plans.py`: remove `DuplicatePlanName`. A duplicate id on `POST /plans` is a plain error; at about 70 bits a collision is not worth retry or re-keying logic.
- `space_routes.py`: `PATCH /plans/{id}` (rename) is removed; `POST /plans` no longer returns `409`.

**Frontend (`packages/frontend`).**
- Routing in `App.tsx`: the `/p/:id/:slug`, `/perf`, and `/attack` routes, plus redirects from `/`, `/performance`, and `/attack`.
- `Layout`: tab links are built from the active plan's address; the breadcrumb reads the plan's name.
- `PlanSelectionContext`: the active plan is driven by the route param, not only the localStorage pointer; `renamePlan` is removed.
- `PlansHomePage`: inline rename and the A1 checks in New-plan are removed; selecting a plan navigates to its address.
- A canonicalization effect replaces the URL in place when the plan's name (and so its slug) changes.
- `planApi.ts`: `renamePlan` and `DuplicatePlanNameError` are removed.
- A short-id generator (base58, 12 characters, `crypto.getRandomValues`) replaces `crypto.randomUUID()` for new plans. Local IndexedDB stores for existing UUID-keyed signed-in plans are orphaned; the anonymous `local` store is untouched.

## Non-goals

- **Duplicate-name hints or warnings.** Deferred until duplicates prove to be a problem.
- **Sharing and permissions on addresses** (AD-10). An address is only reachable by members of the plan's space; share links are a later change.
- **Space-scoped addressing** (`/s/:space/…` for squadrons). LIBRARY stays at `/library` until squadrons arrive.
