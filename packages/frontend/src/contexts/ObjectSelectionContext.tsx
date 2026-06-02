import React, { createContext, useContext, useState } from 'react';
import type { CoordEntryState } from './WaypointSelectionContext';

// Selection context for in-plan objects (library refs and markers) in the Objects tab
interface ObjectSelectionContextValue {
  selectedId: string | null;  // UUID of selected LibraryRef or Marker (null when none selected)
  setSelectedId: (id: string | null) => void;
  coordEntry: CoordEntryState | null;
  setCoordEntry: (state: CoordEntryState | null) => void;
}

const ObjectSelectionContext = createContext<ObjectSelectionContextValue | null>(null);

export const ObjectSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coordEntry, setCoordEntry] = useState<CoordEntryState | null>(null);

  return (
    <ObjectSelectionContext.Provider value={{ selectedId, setSelectedId, coordEntry, setCoordEntry }}>
      {children}
    </ObjectSelectionContext.Provider>
  );
};

export const useObjectSelection = (): ObjectSelectionContextValue => {
  const ctx = useContext(ObjectSelectionContext);
  if (!ctx) throw new Error('useObjectSelection must be used inside ObjectSelectionProvider');
  return ctx;
};
