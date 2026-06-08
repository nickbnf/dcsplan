import React, { createContext, useContext, useState } from 'react';

export type CursorSlot = 'latDeg' | 'latMin' | 'lonDeg' | 'lonMin';

export interface CoordEntryState {
  latHem: 'N' | 'S';
  latDeg: string;
  latMin: string;
  lonHem: 'E' | 'W';
  lonDeg: string;
  lonMin: string;
  cursor: CursorSlot;
  hasError: boolean;
}

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

const SelectionContext = createContext<SelectionContextValue | null>(null);

export const SelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selection, setSelection] = useState<Selection>(null);
  const [coordEntry, setCoordEntry] = useState<CoordEntryState | null>(null);

  return (
    <SelectionContext.Provider value={{ selection, setSelection, coordEntry, setCoordEntry }}>
      {children}
    </SelectionContext.Provider>
  );
};

export const useSelection = (): SelectionContextValue => {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used inside SelectionProvider');
  return ctx;
};
