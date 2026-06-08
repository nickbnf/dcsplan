import { useSelection } from './SelectionContext';

export const useObjectSelection = () => {
  const { selection, setSelection, coordEntry, setCoordEntry } = useSelection();
  return {
    selectedId: selection?.kind === 'object' ? selection.id : null,
    setSelectedId: (id: string | null) =>
      setSelection(id !== null ? { kind: 'object', id } : null),
    coordEntry,
    setCoordEntry,
  };
};
