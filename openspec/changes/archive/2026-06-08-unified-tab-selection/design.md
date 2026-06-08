## Context

The planner currently has two independent selection contexts:
- `WaypointSelectionContext` — holds `selectedIndex: number | null` and `coordEntry` for the Flight Plan tab.
- `ObjectSelectionContext` — holds `selectedId: string | null` (UUID) and `coordEntry` for the Objects tab.

Both providers are mounted in `PlannerApp.tsx`. Tab state lives in `PlannerApp` as `useState<'flightplan' | 'objects'>`. The two contexts share the same `CoordEntryState` type (already imported from `WaypointSelectionContext`).

Because the contexts are independent, a waypoint and an object can be simultaneously "selected", violating the intended one-selection-at-a-time invariant.

## Goals / Non-Goals

**Goals:**
- Exactly one item (waypoint or object) selected globally at any time, enforced by the type system.
- Switching tabs clears selection automatically.
- Minimal disruption to existing consumers.

**Non-Goals:**
- Persisting selection across tab switches.
- Any change to within-tab selection behaviour (keyboard cycling, Escape, map click).
- Data model, kneeboard, or API changes.

## Decisions

### Unified `SelectionContext` with a discriminated union

Replace the two context files with a single `SelectionContext.tsx` holding:

```ts
export type Selection =
  | { kind: 'waypoint'; index: number }
  | { kind: 'object'; id: string }
  | null;

interface SelectionContextValue {
  selection: Selection;
  setSelection: (s: Selection) => void;
  coordEntry: CoordEntryState | null;
  setCoordEntry: (state: CoordEntryState | null) => void;
}
```

`coordEntry` is kept at the top level — it is always associated with whichever item is selected, regardless of kind, and shares the same `CoordEntryState` type already used by both contexts.

`PlannerApp` mounts a single `SelectionProvider` in place of the two existing providers.

### Adapter hooks preserve the existing consumer API

Rather than touching every consumer, `useWaypointSelection` and `useObjectSelection` are re-implemented as thin adapters over `useSelection`:

```ts
export const useWaypointSelection = () => {
  const { selection, setSelection, coordEntry, setCoordEntry } = useSelection();
  return {
    selectedIndex: selection?.kind === 'waypoint' ? selection.index : null,
    setSelectedIndex: (index: number | null) =>
      setSelection(index !== null ? { kind: 'waypoint', index } : null),
    coordEntry,
    setCoordEntry,
  };
};
```

`useObjectSelection` follows the same pattern for `selectedId`. Existing consumers are unchanged.

**Rationale:** The invariant is now structural — the `Selection` type cannot hold both a waypoint and an object. The adapter hooks mean no consumer rewrites are needed; the only files that change are the two context files, `PlannerApp`, and the tab-switch handler.

### Tab switch clears selection via `setSelection(null)`

`PlannerApp.handleTabChange` calls `setSelection(null)` before updating the active tab. Because there is a single selection slot, one call is sufficient regardless of what was selected:

```ts
const handleTabChange = (next: 'flightplan' | 'objects') => {
  setSelection(null);
  setActiveTab(next);
};
```

This also clears `coordEntry` implicitly only if we reset it alongside — see risk below.

## Risks / Trade-offs

- **`coordEntry` must be explicitly cleared on tab switch**: `setSelection(null)` does not touch `coordEntry`. `handleTabChange` must also call `setCoordEntry(null)` to avoid orphaned coord-entry state surviving a tab switch.
- **Consumers of the old provider components**: `WaypointSelectionProvider` and `ObjectSelectionProvider` are removed. Any future code that imports them directly (rather than via the hooks) will fail to compile — a deliberate, desirable breaking signal.
- **Blast radius**: Three files change structurally (`WaypointSelectionContext.tsx`, `ObjectSelectionContext.tsx` become adapters; `PlannerApp.tsx` updated). All other consumers are untouched.

## Open Questions

None.
