import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { LibraryObject, PictogramType } from '../types/flightPlan';
import { loadLibrary, saveLibrary } from '../utils/libraryStorage';
import { useFlightPlan } from './FlightPlanContext';
import { useSpaceAssets } from './SpaceAssetsContext';
import { entriesFor } from '../sync/assetCache';
import type { EntryStatus } from '../sync/assetSync';

interface LibraryContextValue {
  library: LibraryObject[];
  addEntry: (entry: LibraryObject) => void;
  updateEntry: (id: string, updates: Partial<LibraryObject>) => void;
  deleteEntry: (id: string) => void;
  setLibrary: (entries: LibraryObject[]) => void;
  /** Whether a library ref's entry is here, known deleted, or may still arrive
   * (map-objects placeholder). Anonymous: present or deleted only. */
  entryStatus: (id: string) => EntryStatus;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

interface LibraryState {
  theatre: string;
  entries: LibraryObject[];
}

function sameEntry(a: LibraryObject, b: LibraryObject): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The theatre library of the active plan's theatre (capability: theatre-library).
 * Anonymous: one device-local list per theatre in localStorage, unchanged.
 * Signed-in: the space's library for that theatre, synced (space-asset-sync).
 */
export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { flightPlan } = useFlightPlan();
  const theatre = flightPlan.theatre;
  const { sync, state: synced, status: syncStatus } = useSpaceAssets();

  // --- Anonymous: device-local library ---------------------------------------
  const [state, setState] = useState<LibraryState>(() => ({
    theatre,
    entries: loadLibrary(theatre),
  }));

  useEffect(() => {
    setState({ theatre, entries: loadLibrary(theatre) });
  }, [theatre]);

  useEffect(() => {
    if (!sync && state.theatre === theatre) {
      saveLibrary(state.theatre, state.entries);
    }
  }, [sync, state.theatre, state.entries, theatre]);

  // --- Signed-in: the space's library ------------------------------------------
  const syncedLibrary = useMemo(
    () => (synced ? entriesFor(synced, theatre) : []),
    [synced, theatre],
  );
  const library = sync ? syncedLibrary : state.entries;

  const addEntry = useCallback((entry: LibraryObject) => {
    if (sync) sync.putEntry(theatre, entry);
    else setState(prev => ({ ...prev, entries: [...prev.entries, entry] }));
  }, [sync, theatre]);

  const updateEntry = useCallback((id: string, updates: Partial<LibraryObject>) => {
    if (sync) {
      const current = sync.getState().entries[id];
      if (current) sync.putEntry(current.theatre, { ...current.entry, ...updates });
      return;
    }
    setState(prev => ({
      ...prev,
      entries: prev.entries.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  }, [sync]);

  const deleteEntry = useCallback((id: string) => {
    if (sync) sync.deleteEntry(id);
    else setState(prev => ({ ...prev, entries: prev.entries.filter(e => e.id !== id) }));
  }, [sync]);

  /** Replace the theatre's library with `entries`. Signed in, this becomes one
   * write per changed row: removed ids are deleted, new ids are created (never
   * overwriting a server row, design D3), and changed ids are edited. */
  const setLibrary = useCallback((entries: LibraryObject[]) => {
    if (!sync) {
      setState(prev => ({ ...prev, entries }));
      return;
    }
    const current = new Map(entriesFor(sync.getState(), theatre).map(e => [e.id, e]));
    const incoming = new Set(entries.map(e => e.id));
    current.forEach((_, id) => { if (!incoming.has(id)) sync.deleteEntry(id); });
    entries.forEach(e => {
      const before = current.get(e.id);
      if (!before || !sameEntry(before, e)) sync.putEntry(theatre, e);
    });
  }, [sync, theatre]);

  const entryStatus = useCallback((id: string): EntryStatus => {
    if (sync) return sync.entryStatus(id);
    return state.entries.some(e => e.id === id) ? 'present' : 'deleted';
    // `synced` and `syncStatus` are not read here, but a new value means the
    // answer may have changed (an entry arrived, or the device caught up).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, synced, syncStatus, state.entries]);

  return (
    <LibraryContext.Provider value={{ library, addEntry, updateEntry, deleteEntry, setLibrary, entryStatus }}>
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
