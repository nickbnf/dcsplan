import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { FlightPlan } from '../types/flightPlan';
import { usePersistedFlightPlan } from '../hooks/usePersistedFlightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import {
  createHistory,
  push as pushHistory,
  undo as undoHistory,
  redo as redoHistory,
  clearHistory,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  type UndoHistory,
  type UndoResult,
} from '../hooks/undoHistory';

type HistoryStep = (
  history: UndoHistory<FlightPlan>,
  current: FlightPlan
) => UndoResult<FlightPlan>;

export type FlightPlanUpdateOptions = {
  /** Groups a sustained interaction with one control into a single undo entry. */
  coalesceKey?: string;
  /** Short description surfaced when undoing a change made on another page. */
  label?: string;
};

interface FlightPlanContextValue {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan, options?: FlightPlanUpdateOptions) => void;
  /**
   * Replaces the working set outright — import, clear, new plan, change theatre.
   * Not undoable: it captures nothing and discards the undo history (AD-12).
   */
  replaceFlightPlan: (flightPlan: FlightPlan) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  fitToFlightPlanTrigger: number;
  requestFitToFlightPlan: () => void;
}

const FlightPlanContext = createContext<FlightPlanContextValue | null>(null);

const omitAttackPlanning = ({ attackPlanning: _, ...rest }: FlightPlan) => rest;

export const FlightPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flightPlan, setFlightPlan] = usePersistedFlightPlan(() =>
    flightPlanUtils.newFlightPlan()
  );

  const [history, setHistory] = useState<UndoHistory<FlightPlan>>(() => createHistory<FlightPlan>());

  // Current plan and history, readable from callbacks without stale-closure risk.
  const flightPlanRef = useRef(flightPlan);
  flightPlanRef.current = flightPlan;
  const historyRef = useRef(history);
  historyRef.current = history;

  // Start at 1 if the persisted flight plan already has points (page reload with saved plan)
  const [fitTrigger, setFitTrigger] = useState<number>(
    () => flightPlan.points.length > 0 ? 1 : 0
  );

  const requestFitToFlightPlan = useCallback(() => {
    setFitTrigger(prev => prev + 1);
  }, []);

  const handleFlightPlanUpdate = useCallback((newPlan: FlightPlan, options?: FlightPlanUpdateOptions) => {
    const previous = flightPlanRef.current;
    const baseChanged =
      JSON.stringify(omitAttackPlanning(newPlan)) !==
      JSON.stringify(omitAttackPlanning(previous));

    // Only substantive edits are undoable; re-emitting an identical plan is a no-op.
    if (baseChanged) {
      historyRef.current = pushHistory(historyRef.current, previous, {
        ...(options?.coalesceKey ? { coalesceKey: options.coalesceKey } : {}),
        ...(options?.label ? { label: options.label } : {}),
      });
      setHistory(historyRef.current);
    }

    const nextPlan = baseChanged && newPlan.attackPlanning?.results
      ? { ...newPlan, attackPlanning: { params: newPlan.attackPlanning.params } }
      : newPlan;

    flightPlanRef.current = nextPlan;
    setFlightPlan(nextPlan);
  }, [setFlightPlan]);

  const replaceFlightPlan = useCallback((newPlan: FlightPlan) => {
    historyRef.current = clearHistory(historyRef.current);
    setHistory(historyRef.current);
    setFlightPlan(newPlan);
  }, [setFlightPlan]);

  /**
   * Applies an undo/redo result. Refs are advanced synchronously so two
   * invocations inside one tick (key autorepeat) still see fresh state.
   */
  const applyStep = useCallback((step: HistoryStep) => {
    const result = step(historyRef.current, flightPlanRef.current);
    if (!result) return;
    historyRef.current = result.history;
    flightPlanRef.current = result.state;
    setHistory(result.history);
    setFlightPlan(result.state);
  }, [setFlightPlan]);

  const undo = useCallback(() => applyStep(undoHistory), [applyStep]);
  const redo = useCallback(() => applyStep(redoHistory), [applyStep]);

  return (
    <FlightPlanContext.Provider value={{
      flightPlan,
      onFlightPlanUpdate: handleFlightPlanUpdate,
      replaceFlightPlan,
      undo,
      redo,
      canUndo: historyCanUndo(history),
      canRedo: historyCanRedo(history),
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
