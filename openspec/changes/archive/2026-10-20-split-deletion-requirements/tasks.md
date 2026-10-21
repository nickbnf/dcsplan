# Tasks

> Specs only: no code or tests change. Do not `git commit`: the maintainer commits by hand.

## 1. Split the requirements

- [x] 1.1 Split *Library entry deletion with reference detection* (`theatre-library`) into the control plus one rule per tier, keeping every scenario. Verify that `openspec validate split-deletion-requirements --strict` passes.
- [x] 1.2 Split *Profile deletion (signed-in only)* (`performance-profile`) into the control plus *Deleting a profile never modifies a plan*, keeping every scenario. Verify with the same command.

## Workflow follow-up

- Archive the change, then check that strict validation of the main specs no longer flags these requirements.
