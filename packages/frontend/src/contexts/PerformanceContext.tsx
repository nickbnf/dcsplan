import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Aircraft, Regime } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';
import { loadPerformance, savePerformance, clearPerformance, DEFAULT_PROFILE_NAME } from '../utils/performanceStorage';

interface PerformanceContextValue {
  performance: Aircraft;
  profileName: string;
  setPerformance: (a: Aircraft) => void;
  setProfileName: (name: string) => void;
  updateAircraft: (patch: Partial<Aircraft>) => void;
  addRegime: (r: Regime) => void;
  updateRegime: (id: string, updates: Partial<Regime>) => void;
  deleteRegime: (id: string) => void;
  clearAll: () => void;
}

const PerformanceContext = createContext<PerformanceContextValue | null>(null);

export const PerformanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState(() => {
    const profile = loadPerformance();
    return { name: profile.name, aircraft: profile.aircraft };
  });

  useEffect(() => {
    savePerformance({ name: state.name, aircraft: state.aircraft });
  }, [state]);

  const setPerformance = useCallback((a: Aircraft) => {
    setState(prev => ({ ...prev, aircraft: a }));
  }, []);

  const setProfileName = useCallback((name: string) => {
    setState(prev => ({ ...prev, name }));
  }, []);

  const updateAircraft = useCallback((patch: Partial<Aircraft>) => {
    setState(prev => ({ ...prev, aircraft: { ...prev.aircraft, ...patch } }));
  }, []);

  const addRegime = useCallback((r: Regime) => {
    setState(prev => ({ ...prev, aircraft: { ...prev.aircraft, regimes: [...prev.aircraft.regimes, r] } }));
  }, []);

  const updateRegime = useCallback((id: string, updates: Partial<Regime>) => {
    setState(prev => ({
      ...prev,
      aircraft: {
        ...prev.aircraft,
        regimes: prev.aircraft.regimes.map(r => r.id === id ? { ...r, ...updates } : r),
      },
    }));
  }, []);

  const deleteRegime = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      aircraft: {
        ...prev.aircraft,
        regimes: prev.aircraft.regimes.filter(r => r.id !== id),
      },
    }));
  }, []);

  const clearAll = useCallback(() => {
    clearPerformance();
    setState({ name: DEFAULT_PROFILE_NAME, aircraft: defaultAircraft() });
  }, []);

  return (
    <PerformanceContext.Provider value={{
      performance: state.aircraft,
      profileName: state.name,
      setPerformance, setProfileName, updateAircraft, addRegime, updateRegime, deleteRegime, clearAll,
    }}>
      {children}
    </PerformanceContext.Provider>
  );
};

export const usePerformance = (): PerformanceContextValue => {
  const ctx = useContext(PerformanceContext);
  if (!ctx) throw new Error('usePerformance must be used inside PerformanceProvider');
  return ctx;
};
