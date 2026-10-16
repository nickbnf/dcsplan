# Spec Delta

## MODIFIED Requirements

### Requirement: Creating a plan replaces or appends according to tier

In the **anonymous** tier, which holds a single plan, creating a plan SHALL replace the current one. In the **signed-in** tier, which holds many plans, creating a plan SHALL open it as the active plan WITHOUT discarding any existing plan. A newly created signed-in plan is a **draft**: it SHALL be added to the space's plans only once it has its first waypoint, and abandoning a draft before it gains a waypoint SHALL leave the space's plans unchanged.

#### Scenario: Anonymous tier replaces the single plan
- **WHEN** an anonymous user creates a new flight plan
- **THEN** the new plan becomes the current plan and the previous one is no longer present

#### Scenario: Signed-in tier adds without discarding
- **WHEN** a signed-in user creates a new flight plan
- **THEN** it opens as the active plan, every existing plan remains, and it is not yet listed among the space's plans (it is a draft until its first waypoint)

#### Scenario: A draft joins the space on its first waypoint
- **WHEN** a signed-in user adds the first waypoint to a newly created plan
- **THEN** the plan is added to the space's plans

#### Scenario: Abandoning an empty draft adds nothing
- **WHEN** a signed-in user creates a plan and leaves it without adding a waypoint
- **THEN** the space's plans are unchanged and no empty plan is listed
