import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { LibraryObject, PictogramType } from '../types/flightPlan';
import { loadLibrary, saveLibrary, clearLibrary } from '../utils/libraryStorage';
import { useFlightPlan } from './FlightPlanContext';

interface LibraryContextValue {
  library: LibraryObject[];
  addEntry: (entry: LibraryObject) => void;
  updateEntry: (id: string, updates: Partial<LibraryObject>) => void;
  deleteEntry: (id: string) => void;
  setLibrary: (entries: LibraryObject[]) => void;
  clearAll: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { flightPlan } = useFlightPlan();
  const theatre = flightPlan.theatre;

  const [library, setLibraryState] = useState<LibraryObject[]>(() => loadLibrary(theatre));

  // Reload when theatre changes
  useEffect(() => {
    setLibraryState(loadLibrary(theatre));
  }, [theatre]);

  // Persist whenever library changes
  useEffect(() => {
    saveLibrary(theatre, library);
  }, [theatre, library]);

  const addEntry = useCallback((entry: LibraryObject) => {
    setLibraryState(prev => [...prev, entry]);
  }, []);

  const updateEntry = useCallback((id: string, updates: Partial<LibraryObject>) => {
    setLibraryState(prev =>
      prev.map(e => e.id === id ? { ...e, ...updates } : e)
    );
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setLibraryState(prev => prev.filter(e => e.id !== id));
  }, []);

  const setLibrary = useCallback((entries: LibraryObject[]) => {
    setLibraryState(entries);
  }, []);

  const clearAll = useCallback(() => {
    clearLibrary(theatre);
    setLibraryState([]);
  }, [theatre]);

  return (
    <LibraryContext.Provider value={{ library, addEntry, updateEntry, deleteEntry, setLibrary, clearAll }}>
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
