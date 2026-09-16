import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { LibraryObject, PictogramType } from '../types/flightPlan';
import { loadLibrary, saveLibrary } from '../utils/libraryStorage';
import { useFlightPlan } from './FlightPlanContext';

interface LibraryContextValue {
  library: LibraryObject[];
  addEntry: (entry: LibraryObject) => void;
  updateEntry: (id: string, updates: Partial<LibraryObject>) => void;
  deleteEntry: (id: string) => void;
  setLibrary: (entries: LibraryObject[]) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

interface LibraryState {
  theatre: string;
  entries: LibraryObject[];
}

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { flightPlan } = useFlightPlan();
  const theatre = flightPlan.theatre;

  const [state, setState] = useState<LibraryState>(() => ({
    theatre,
    entries: loadLibrary(theatre),
  }));

  useEffect(() => {
    setState({ theatre, entries: loadLibrary(theatre) });
  }, [theatre]);

  useEffect(() => {
    if (state.theatre === theatre) {
      saveLibrary(state.theatre, state.entries);
    }
  }, [state.theatre, state.entries, theatre]);

  const addEntry = useCallback((entry: LibraryObject) => {
    setState(prev => ({ ...prev, entries: [...prev.entries, entry] }));
  }, []);

  const updateEntry = useCallback((id: string, updates: Partial<LibraryObject>) => {
    setState(prev => ({
      ...prev,
      entries: prev.entries.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      entries: prev.entries.filter(e => e.id !== id),
    }));
  }, []);

  const setLibrary = useCallback((entries: LibraryObject[]) => {
    setState(prev => ({ ...prev, entries }));
  }, []);

  return (
    <LibraryContext.Provider value={{ library: state.entries, addEntry, updateEntry, deleteEntry, setLibrary }}>
      {children}
    </LibraryContext.Provider>
  );
};

export const useLibrary = (): LibraryContextValue => {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider');
  return ctx;
};

// Helper: create a new library entry with a fresh UUID
export const createLibraryEntry = (
  type: PictogramType,
  lat: number,
  lon: number
): LibraryObject => ({
  id: crypto.randomUUID(),
  type,
  lat,
  lon,
});
