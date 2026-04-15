import React, { createContext, useContext } from 'react';
import type { FlightPlan } from '../types/flightPlan';
import { usePersistedFlightPlan } from '../hooks/usePersistedFlightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';

interface FlightPlanContextValue {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
}

const FlightPlanContext = createContext<FlightPlanContextValue | null>(null);

const omitAttackPlanning = ({ attackPlanning: _, ...rest }: FlightPlan) => rest;

export const FlightPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flightPlan, setFlightPlan] = usePersistedFlightPlan(() =>
    flightPlanUtils.newFlightPlan()
  );

  const handleFlightPlanUpdate = (newPlan: FlightPlan) => {
    const baseChanged =
      JSON.stringify(omitAttackPlanning(newPlan)) !==
      JSON.stringify(omitAttackPlanning(flightPlan));

    if (baseChanged && newPlan.attackPlanning?.results) {
      setFlightPlan({
        ...newPlan,
        attackPlanning: { params: newPlan.attackPlanning.params },
      });
    } else {
      setFlightPlan(newPlan);
    }
  };

  return (
    <FlightPlanContext.Provider value={{ flightPlan, onFlightPlanUpdate: handleFlightPlanUpdate }}>
      {children}
    </FlightPlanContext.Provider>
  );
};

export const useFlightPlan = (): FlightPlanContextValue => {
  const ctx = useContext(FlightPlanContext);
  if (!ctx) throw new Error('useFlightPlan must be used inside FlightPlanProvider');
  return ctx;
};
