import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Aircraft, Regime } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';
import { loadPerformance, savePerformance, clearPerformance } from '../utils/performanceStorage';

interface PerformanceContextValue {
  performance: Aircraft;
  setPerformance: (a: Aircraft) => void;
  updateAircraft: (patch: Partial<Aircraft>) => void;
  addRegime: (r: Regime) => void;
  updateRegime: (id: string, updates: Partial<Regime>) => void;
  deleteRegime: (id: string) => void;
  clearAll: () => void;
}

const PerformanceContext = createContext<PerformanceContextValue | null>(null);

export const PerformanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [performance, setPerformanceState] = useState<Aircraft>(() => loadPerformance());

  useEffect(() => {
    savePerformance(performance);
  }, [performance]);

  const setPerformance = useCallback((a: Aircraft) => {
    setPerformanceState(a);
  }, []);

  const updateAircraft = useCallback((patch: Partial<Aircraft>) => {
    setPerformanceState(prev => ({ ...prev, ...patch }));
  }, []);

  const addRegime = useCallback((r: Regime) => {
    setPerformanceState(prev => ({ ...prev, regimes: [...prev.regimes, r] }));
  }, []);

  const updateRegime = useCallback((id: string, updates: Partial<Regime>) => {
    setPerformanceState(prev => ({
      ...prev,
      regimes: prev.regimes.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  }, []);

  const deleteRegime = useCallback((id: string) => {
    setPerformanceState(prev => ({
      ...prev,
      regimes: prev.regimes.filter(r => r.id !== id),
    }));
  }, []);

  const clearAll = useCallback(() => {
    clearPerformance();
    setPerformanceState(defaultAircraft());
  }, []);

  return (
    <PerformanceContext.Provider value={{
      performance, setPerformance, updateAircraft, addRegime, updateRegime, deleteRegime, clearAll,
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
