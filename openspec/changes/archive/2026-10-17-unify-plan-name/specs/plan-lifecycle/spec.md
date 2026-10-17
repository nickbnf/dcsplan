# Spec Delta

## MODIFIED Requirements

### Requirement: Creating a plan replaces or appends according to tier

In the **anonymous** tier, which holds a single plan, creating a plan SHALL replace the current one. In the **signed-in** tier, creating a plan SHALL open it as the active plan WITHOUT discarding any existing plan. It is a **draft** until its first edit of any kind, when it SHALL be added to the space's plans. Leaving a draft that is still identical to a fresh plan SHALL discard it; a draft with edits SHALL never be discarded.

#### Scenario: Anonymous tier replaces the single plan
- **WHEN** an anonymous user creates a new flight plan
- **THEN** the new plan becomes the current plan and the previous one is no longer present

#### Scenario: Signed-in tier adds without discarding
- **WHEN** a signed-in user creates a new flight plan
- **THEN** it opens as the active plan, every existing plan remains, and it is not yet listed among the space's plans (it is a draft until its first edit)

#### Scenario: A draft joins the space on its first waypoint
- **WHEN** a signed-in user adds the first waypoint to a newly created plan
- **THEN** the plan is added to the space's plans

#### Scenario: A draft joins the space on its first edit of any kind
- **WHEN** a signed-in user renames a newly created plan or changes one of its parameters, without adding a waypoint
- **THEN** the plan is added to the space's plans

#### Scenario: Abandoning an empty draft adds nothing
- **WHEN** a signed-in user creates a plan and leaves it without changing anything
- **THEN** the space's plans are unchanged and no plan is listed for it

#### Scenario: An edited draft that could not be saved is kept and retried
- **WHEN** a signed-in user edits a newly created plan while it cannot reach the server, and then leaves it
- **THEN** the plan is not discarded, the user is told it is not saved to their account yet, and it is added to the space's plans once the server can be reached again
