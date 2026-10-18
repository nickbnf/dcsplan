import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Aircraft, PerformanceProfile, Regime } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';
import { loadPerformance, savePerformance, clearPerformance } from '../utils/performanceStorage';
import { useSpaceAssets } from './SpaceAssetsContext';
import { useOptionalFlightPlan } from './FlightPlanContext';
import { profileList } from '../sync/assetCache';

/**
 * Performance profiles (capability: performance-profile; AD-2).
 *
 * Anonymous: one implicit profile in `dcsplan.performance`, unchanged. Editing
 * it *is* what the plan flies.
 *
 * Signed in: the space's flat collection of profiles, synced (space-asset-sync).
 * Two selections exist (Profile selection split): the plan's `profileId`, which
 * profile the plan flies, and `editingProfileId`, which profile the Performance
 * page shows. `performance` is always the flown profile's aircraft (the null
 * profile when none resolves); the editing setters act on the edited profile.
 */
interface PerformanceContextValue {
  /** 'signed-in' when profiles are a synced collection. */
  tier: 'anonymous' | 'signed-in';

  /** The flown profile's aircraft: what leg computation and the kneeboard use. */
  performance: Aircraft;
  /** The flown profile's id, or null for the null profile (signed-in only). */
  flownProfileId: string | null;

  /** The profile shown for editing on the Performance page. */
  editingAircraft: Aircraft;
  setPerformance: (a: Aircraft) => void;
  updateAircraft: (patch: Partial<Aircraft>) => void;
  addRegime: (r: Regime) => void;
  updateRegime: (id: string, updates: Partial<Regime>) => void;
  deleteRegime: (id: string) => void;
  clearAll: () => void;

  // --- Signed-in collection --------------------------------------------------
  profiles: PerformanceProfile[];
  editingProfileId: string | null;
  setEditingProfileId: (id: string) => void;
  /** Create an empty ("Untitled") profile; it becomes the edited one. */
  createProfile: () => string;
  deleteProfile: (id: string) => void;
  /** Add a profile (import). Reuses an existing profile with the same id. */
  addProfile: (profile: { id?: string; aircraft: Aircraft }) => string;
}

const PerformanceContext = createContext<PerformanceContextValue | null>(null);

export const PerformanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { sync, state: synced } = useSpaceAssets();
  const plan = useOptionalFlightPlan();

  // --- Anonymous: the single device-local profile ---------------------------
  const [local, setLocal] = useState<Aircraft>(() => loadPerformance());

  useEffect(() => {
    if (!sync) savePerformance(local);
  }, [sync, local]);

  // --- Signed-in: the space's collection --------------------------------------
  const profiles = useMemo(() => (synced ? profileList(synced) : []), [synced]);
  const planProfileId = plan?.flightPlan.profileId ?? null;
  const flown = sync ? profiles.find(p => p.id === planProfileId) ?? null : null;

  const [editingChoice, setEditingChoice] = useState<string | null>(null);
  const editingProfileId = sync
    ? (profiles.some(p => p.id === editingChoice) ? editingChoice : flown?.id ?? profiles[0]?.id ?? null)
    : null;
  const editing = sync ? profiles.find(p => p.id === editingProfileId) ?? null : null;

  const nullProfile = useMemo(() => defaultAircraft(), []);

  /** Apply a change to the edited profile (signed-in) or the single one. */
  const editAircraft = useCallback((change: (a: Aircraft) => Aircraft) => {
    if (!sync) {
      setLocal(prev => change(prev));
      return;
    }
    if (!editingProfileId) return;
    const current = sync.getState().profiles[editingProfileId]?.profile;
    if (current) sync.putProfile({ ...current, aircraft: change(current.aircraft) });
  }, [sync, editingProfileId]);

  const setPerformance = useCallback((a: Aircraft) => editAircraft(() => a), [editAircraft]);
  const updateAircraft = useCallback((patch: Partial<Aircraft>) => editAircraft(a => ({ ...a, ...patch })), [editAircraft]);
  const addRegime = useCallback((r: Regime) => editAircraft(a => ({ ...a, regimes: [...a.regimes, r] })), [editAircraft]);
  const updateRegime = useCallback((id: string, updates: Partial<Regime>) =>
    editAircraft(a => ({ ...a, regimes: a.regimes.map(r => r.id === id ? { ...r, ...updates } : r) })), [editAircraft]);
  const deleteRegime = useCallback((id: string) =>
    editAircraft(a => ({ ...a, regimes: a.regimes.filter(r => r.id !== id) })), [editAircraft]);

  const clearAll = useCallback(() => {
    if (sync) return; // the anonymous reset only; signed-in profiles are deleted one by one
    clearPerformance();
    setLocal(defaultAircraft());
  }, [sync]);

  const createProfile = useCallback((): string => {
    if (!sync) throw new Error('Profiles can only be created when signed in');
    const id = crypto.randomUUID();
    sync.putProfile({ id, aircraft: defaultAircraft() });
    setEditingChoice(id);
    return id;
  }, [sync]);

  const deleteProfile = useCallback((id: string) => {
    sync?.deleteProfile(id);
  }, [sync]);

  const addProfile = useCallback((profile: { id?: string; aircraft: Aircraft }): string => {
    if (!sync) throw new Error('Profiles can only be added when signed in');
    if (profile.id && sync.getState().profiles[profile.id]) return profile.id;
    const id = profile.id ?? crypto.randomUUID();
    sync.putProfile({ id, aircraft: profile.aircraft });
    return id;
  }, [sync]);

  const value: PerformanceContextValue = sync
    ? {
        tier: 'signed-in',
        performance: flown?.aircraft ?? nullProfile,
        flownProfileId: flown?.id ?? null,
        editingAircraft: editing?.aircraft ?? nullProfile,
        profiles,
        editingProfileId,
        setEditingProfileId: setEditingChoice,
        setPerformance, updateAircraft, addRegime, updateRegime, deleteRegime, clearAll,
        createProfile, deleteProfile, addProfile,
      }
    : {
        tier: 'anonymous',
        performance: local,
        flownProfileId: null,
        editingAircraft: local,
        profiles: [],
        editingProfileId: null,
        setEditingProfileId: () => {},
        setPerformance, updateAircraft, addRegime, updateRegime, deleteRegime, clearAll,
        createProfile, deleteProfile, addProfile,
      };

  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
};

export const usePerformance = (): PerformanceContextValue => {
  const ctx = useContext(PerformanceContext);
  if (!ctx) throw new Error('usePerformance must be used inside PerformanceProvider');
  return ctx;
};
