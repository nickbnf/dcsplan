import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import * as Y from 'yjs';
import type { FlightPlan } from '../types/flightPlan';
import { useYjsFlightPlan } from '../hooks/useYjsFlightPlan';
import { usePlanSelection } from './PlanSelectionContext';
import { applyFlightPlanToYDoc, seedYDoc } from '../utils/yjsFlightPlanBinding';

interface FlightPlanContextValue {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
  replaceFlightPlan: (flightPlan: FlightPlan) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  fitToFlightPlanTrigger: number;
  requestFitToFlightPlan: () => void;
  /** True while a synced plan is catching up with the server (plan-sync). */
  isSyncing: boolean;
}

const FlightPlanContext = createContext<FlightPlanContextValue | null>(null);

const omitAttackPlanning = ({ attackPlanning: _, ...rest }: FlightPlan) => rest;

export const FlightPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const selection = usePlanSelection();
  const { yDoc, flightPlan, isReady, isSyncing } = useYjsFlightPlan(
    selection.activePlanId,
    { sync: selection.sync, seedPlan: selection.isDraft ? selection.draftSeed ?? undefined : undefined },
  );

  const flightPlanRef = useRef<FlightPlan | null>(null);
  flightPlanRef.current = flightPlan;

  // Defer-commit (AD-15): a draft joins the space on its first waypoint.
  const pointsCount = flightPlan?.points.length ?? 0;
  useEffect(() => {
    if (selection.isDraft && pointsCount > 0) {
      void selection.commitDraft();
    }
  }, [selection.isDraft, pointsCount, selection.commitDraft]);

  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Start at 1 if the persisted flight plan already has points (page reload with saved plan)
  const [fitTrigger, setFitTrigger] = useState(0);
  const initialFitDone = useRef(false);

  useEffect(() => {
    if (isReady && flightPlan && flightPlan.points.length > 0 && !initialFitDone.current) {
      initialFitDone.current = true;
      setFitTrigger(1);
    }
  }, [isReady, flightPlan]);

  // Set up UndoManager once Y.Doc is ready
  useEffect(() => {
    if (!isReady || !yDoc) return;

    const yPlan = yDoc.getMap('flightPlan');
    const um = new Y.UndoManager(yPlan, {
      captureTimeout: 500,
      trackedOrigins: new Set(['local']),
    });

    const updateUndoState = () => {
      setCanUndo(um.undoStack.length > 0);
      setCanRedo(um.redoStack.length > 0);
    };

    um.on('stack-item-added', () => {
      // Trim undo stack to 50 entries
      while (um.undoStack.length > 50) {
        um.undoStack.shift();
      }
      updateUndoState();
    });
    um.on('stack-item-popped', updateUndoState);
    um.on('stack-cleared', updateUndoState);

    undoManagerRef.current = um;

    return () => {
      um.destroy();
      undoManagerRef.current = null;
    };
  }, [isReady, yDoc]);

  const requestFitToFlightPlan = useCallback(() => {
    setFitTrigger(prev => prev + 1);
  }, []);

  const handleFlightPlanUpdate = useCallback((newPlan: FlightPlan) => {
    if (!yDoc || !flightPlanRef.current) return;
    const previous = flightPlanRef.current;
    const baseChanged =
      JSON.stringify(omitAttackPlanning(newPlan)) !==
      JSON.stringify(omitAttackPlanning(previous));

    const nextPlan = baseChanged && newPlan.attackPlanning?.results
      ? { ...newPlan, attackPlanning: { params: newPlan.attackPlanning.params } }
      : newPlan;

    yDoc.transact(() => {
      applyFlightPlanToYDoc(yDoc, previous, nextPlan);
    }, 'local');
  }, [yDoc]);

  const replaceFlightPlan = useCallback((newPlan: FlightPlan) => {
    if (!yDoc) return;
    undoManagerRef.current?.clear();

    yDoc.transact(() => {
      // Clear the Y.Map and apply the new plan
      const yPlan = yDoc.getMap('flightPlan');
      for (const key of Array.from(yPlan.keys())) {
        yPlan.delete(key);
      }
      seedYDoc(yDoc, newPlan);
    }, 'replace');
  }, [yDoc]);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  if (!isReady || !flightPlan) return null;

  return (
    <FlightPlanContext.Provider value={{
      flightPlan,
      onFlightPlanUpdate: handleFlightPlanUpdate,
      replaceFlightPlan,
      undo,
      redo,
      canUndo,
      canRedo,
      fitToFlightPlanTrigger: fitTrigger,
      requestFitToFlightPlan,
      isSyncing,
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
