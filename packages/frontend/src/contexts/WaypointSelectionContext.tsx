export type { CursorSlot, CoordEntryState } from './SelectionContext';
import { useSelection } from './SelectionContext';

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
