## Why

Pilots planning complex missions need to annotate specific waypoints with brief operational notes (frequencies, procedures, threats) that are too contextual for a waypoint name. These notes should appear on the printed kneeboard for in-cockpit reference without cluttering the planning UI when not in use.

## What Changes

- Add an optional `comment` field to each waypoint in the flight plan data model.
- Add a comment icon to the waypoint card in the sidebar that is hidden until hover (when no comment exists) or always visible and highlighted (when a comment exists).
- Clicking the icon — or the preview line — expands an inline textarea within the card for editing.
- When a comment is saved, a truncated single-line preview is shown at the bottom of the waypoint card.
- On the kneeboard, the comment appears at the bottom of the page for which that waypoint is the destination.

## Capabilities

### New Capabilities

- `waypoint-comment`: Ability to attach a short free-text note to a waypoint, edit it inline in the sidebar, and have it rendered on the kneeboard.

### Modified Capabilities

## Impact

- `packages/frontend/src/types/flightPlan.ts` — add `comment?: string` to `FlightPlanTurnPoint` and `FlightPlanPointChange`
- `packages/frontend/src/components/sidebar/FlightPlanZone.tsx` — update `WaypointCard` to render the comment icon and inline editor
- `packages/backend/` — kneeboard generation must render the comment at the bottom of the relevant leg page
