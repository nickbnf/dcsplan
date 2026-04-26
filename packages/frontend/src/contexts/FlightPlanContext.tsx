import React, { createContext, useContext, useState, useCallback } from 'react';
import type { FlightPlan } from '../types/flightPlan';
import { usePersistedFlightPlan } from '../hooks/usePersistedFlightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';

interface FlightPlanContextValue {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
  fitToFlightPlanTrigger: number;
  requestFitToFlightPlan: () => void;
}

const FlightPlanContext = createContext<FlightPlanContextValue | null>(null);

const omitAttackPlanning = ({ attackPlanning: _, ...rest }: FlightPlan) => rest;

export const FlightPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flightPlan, setFlightPlan] = usePersistedFlightPlan(() =>
    flightPlanUtils.newFlightPlan()
  );

  // Start at 1 if the persisted flight plan already has points (page reload with saved plan)
  const [fitTrigger, setFitTrigger] = useState<number>(
    () => flightPlan.points.length > 0 ? 1 : 0
  );

  const requestFitToFlightPlan = useCallback(() => {
    setFitTrigger(prev => prev + 1);
  }, []);

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
    <FlightPlanContext.Provider value={{
      flightPlan,
      onFlightPlanUpdate: handleFlightPlanUpdate,
      fitToFlightPlanTrigger: fitTrigger,
      requestFitToFlightPlan,
    }}>
      {children}
    </FlightPlanContext.Provider>
  );
};

export const useFlightPlan = (): FlightPlanContextValue => {
  const ctx = useContext(FlightPlanContext);
  if (!ctx) throw new Error('useFlightPlan must be used inside FlightPlanProvider');
  return ctx;
};
