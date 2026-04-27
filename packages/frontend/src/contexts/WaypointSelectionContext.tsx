import React, { createContext, useContext, useState } from 'react';

export type CursorSlot = 'latDeg' | 'latMin' | 'lonDeg' | 'lonMin';

export interface CoordEntryState {
  latHem: 'N' | 'S';
  latDeg: string;   // 0-2 digits
  latMin: string;   // 0-4 digits (displayed as MM.mm)
  lonHem: 'E' | 'W';
  lonDeg: string;   // 0-3 digits
  lonMin: string;   // 0-4 digits
  cursor: CursorSlot;
  hasError: boolean;
}

interface WaypointSelectionContextValue {
  selectedIndex: number | null;
  setSelectedIndex: (index: number | null) => void;
  coordEntry: CoordEntryState | null;
  setCoordEntry: (state: CoordEntryState | null) => void;
}

const WaypointSelectionContext = createContext<WaypointSelectionContextValue | null>(null);

export const WaypointSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [coordEntry, setCoordEntry] = useState<CoordEntryState | null>(null);

  return (
    <WaypointSelectionContext.Provider value={{ selectedIndex, setSelectedIndex, coordEntry, setCoordEntry }}>
      {children}
    </WaypointSelectionContext.Provider>
  );
};

export const useWaypointSelection = (): WaypointSelectionContextValue => {
  const ctx = useContext(WaypointSelectionContext);
  if (!ctx) throw new Error('useWaypointSelection must be used inside WaypointSelectionProvider');
  return ctx;
};
