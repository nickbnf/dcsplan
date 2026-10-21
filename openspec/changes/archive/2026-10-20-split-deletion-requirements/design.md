# Design

## Context

This is a specs-only edit; see proposal.md. `openspec validate --strict` limits a requirement's description to 500 characters. Two requirements that `add-trash-and-soft-delete` rewrote go over it.

## Goals / Non-Goals

**Goals:** each split requirement states one behaviour, and the meaning is unchanged.

**Non-Goals:** the other long requirements in these specs, which predate `add-trash-and-soft-delete` (proposal Non-goals).

## Decisions

- **Split by tier for library entries.** The anonymous and signed-in rules differ completely (remove the reference vs. trash and keep it), so each becomes its own requirement. The original requirement keeps only the control, the confirmation and cancelling.
- **Keep every original scenario in place.** A MODIFIED requirement replaces the whole block, and archiving refuses to drop scenarios. The new requirements get scenarios of their own rather than copies.
- **No REMOVED or RENAMED operations.** The original requirement names stay, so links to them from other specs still resolve.

## Risks / Trade-offs

- [Some scenarios sit under the short requirement but exercise a split-off rule] → The short requirement's description points to the two rules by name.
