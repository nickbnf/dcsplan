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
  /** The id of the plan `flightPlan` belongs to. */
  flightPlanId: string;
}

const FlightPlanContext = createContext<FlightPlanContextValue | null>(null);

const omitAttackPlanning = ({ attackPlanning: _, ...rest }: FlightPlan) => rest;

export const FlightPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const selection = usePlanSelection();
  const { yDoc, flightPlan, loadedPlanId, isReady, isSyncing } = useYjsFlightPlan(
    selection.activePlanId,
    {
      sync: selection.sync,
      seedPlan: selection.isDraft ? selection.draftSeed ?? undefined : undefined,
      onGone: selection.notePlanGone,
    },
  );

  const flightPlanRef = useRef<FlightPlan | null>(null);
  flightPlanRef.current = flightPlan;

  // Defer-commit (AD-15, unify-plan-name D8): a draft joins the space on its
  // first user edit of any kind, and each later edit retries a commit that has
  // not landed. Only the draft's own document counts — for a render after
  // switching, `flightPlan` still holds the previously loaded plan — and only
  // user transactions count, not the seed (`migration`) or the IndexedDB load.
  const draftLoaded = selection.isDraft && loadedPlanId === selection.activePlanId;
  const [draftEdits, setDraftEdits] = useState<{ planId: string | null; count: number }>({ planId: null, count: 0 });
  useEffect(() => {
    if (!draftLoaded || !yDoc) return;
    const planId = selection.activePlanId;
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      const userEdit = origin === 'local' || origin === 'replace' || origin instanceof Y.UndoManager;
      if (!userEdit) return;
      setDraftEdits((e) => ({ planId, count: e.planId === planId ? e.count + 1 : 1 }));
    };
    yDoc.on('update', onUpdate);
    return () => yDoc.off('update', onUpdate);
  }, [draftLoaded, yDoc, selection.activePlanId]);
  const editCount = draftEdits.planId === selection.activePlanId ? draftEdits.count : 0;
  useEffect(() => {
    if (draftLoaded && editCount > 0) {
      void selection.commitDraft(flightPlanRef.current?.name);
    }
  }, [draftLoaded, editCount, selection.commitDraft]);

  // A committed plan's name lives in its document; keep its row in the plan
  // list in step as it changes here, so the list is right the moment the user
  // goes back to it (plan-sync). Only once this plan's document is the one loaded.
  const committedLoaded = selection.sync && loadedPlanId === selection.activePlanId;
  const loadedName = committedLoaded ? flightPlan?.name : undefined;
  useEffect(() => {
    if (loadedName !== undefined) selection.notePlanName(selection.activePlanId, loadedName);
  }, [loadedName, selection.activePlanId, selection.notePlanName]);

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

  if (!isReady || !flightPlan || !loadedPlanId) return null;

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
      flightPlanId: loadedPlanId,
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

/** The flight-plan context if one is mounted, else null (for providers that
 * only need the plan in some tiers, such as PerformanceProvider). */
export const useOptionalFlightPlan = (): FlightPlanContextValue | null => useContext(FlightPlanContext);
