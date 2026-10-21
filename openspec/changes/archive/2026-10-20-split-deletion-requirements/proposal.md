# Proposal

## Why

`add-trash-and-soft-delete` left two deletion requirements longer than the 500-character limit that `openspec validate --strict` enforces: *Library entry deletion with reference detection* (`theatre-library`) and *Profile deletion (signed-in only)* (`performance-profile`). Each one states several behaviours. This change splits them so that each requirement states one behaviour, with no change in meaning.

## What Changes

- **`theatre-library`:** *Library entry deletion with reference detection* keeps only the deletion control and its confirmation. What deletion does to plans becomes two requirements, one per tier: the anonymous tier removes the current plan's reference, and the signed-in tier moves the entry to the Trash and leaves references in place.
- **`performance-profile`:** *Profile deletion (signed-in only)* keeps who may delete, the confirmation and the move to the Trash. The rule that deleting a profile never modifies a plan becomes its own requirement.
- Every existing scenario is kept under its original requirement. Each new requirement gets scenarios of its own.

No behaviour changes, and no code or tests change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `theatre-library`: library entry deletion is split into the control, the anonymous rule and the signed-in rule.
- `performance-profile`: profile deletion is split into the control and the rule that deletion never modifies a plan.

## Impact

Specs only: `openspec/specs/theatre-library/spec.md` and `openspec/specs/performance-profile/spec.md`.

## Non-goals

- Other long requirements already flagged by `openspec validate --strict` in `map-objects`, `performance-profile`, `theatre-library` and other specs. Those predate `add-trash-and-soft-delete` and are left for a separate change.
- Any change in behaviour.
