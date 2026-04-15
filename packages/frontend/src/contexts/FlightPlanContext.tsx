import React, { createContext, useContext } from 'react';
import type { FlightPlan } from '../types/flightPlan';
import { usePersistedFlightPlan } from '../hooks/usePersistedFlightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';

interface FlightPlanContextValue {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
}

const FlightPlanContext = createContext<FlightPlanContextValue | null>(null);

export const FlightPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flightPlan, setFlightPlan] = usePersistedFlightPlan(() =>
    flightPlanUtils.newFlightPlan()
  );

  return (
    <FlightPlanContext.Provider value={{ flightPlan, onFlightPlanUpdate: setFlightPlan }}>
      {children}
    </FlightPlanContext.Provider>
  );
};

export const useFlightPlan = (): FlightPlanContextValue => {
  const ctx = useContext(FlightPlanContext);
  if (!ctx) throw new Error('useFlightPlan must be used inside FlightPlanProvider');
  return ctx;
};
