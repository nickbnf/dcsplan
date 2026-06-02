import React, { createContext, useContext, useState } from 'react';
import type { CoordEntryState } from './WaypointSelectionContext';

// Selection context for the Theatre Library page (mirrors WaypointSelectionContext shape)
interface LibrarySelectionContextValue {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  coordEntry: CoordEntryState | null;
  setCoordEntry: (state: CoordEntryState | null) => void;
}

const LibrarySelectionContext = createContext<LibrarySelectionContextValue | null>(null);

export const LibrarySelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coordEntry, setCoordEntry] = useState<CoordEntryState | null>(null);

  return (
    <LibrarySelectionContext.Provider value={{ selectedId, setSelectedId, coordEntry, setCoordEntry }}>
      {children}
    </LibrarySelectionContext.Provider>
  );
};

export const useLibrarySelection = (): LibrarySelectionContextValue => {
  const ctx = useContext(LibrarySelectionContext);
  if (!ctx) throw new Error('useLibrarySelection must be used inside LibrarySelectionProvider');
  return ctx;
};
