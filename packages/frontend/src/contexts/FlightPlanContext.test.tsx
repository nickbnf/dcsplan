import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FlightPlanProvider, useFlightPlan } from './FlightPlanContext';
import type { FlightPlan } from '../types/flightPlan';

const STORAGE_KEY = 'dcsplan-flightplan';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FlightPlanProvider>{children}</FlightPlanProvider>
);

function setup() {
  return renderHook(() => useFlightPlan(), { wrapper });
}

/** Reads the plan currently persisted to localStorage, if any. */
function persistedPlan(): FlightPlan | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed.flightPlan ?? parsed;
}

describe('FlightPlanContext — undo capture', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with nothing to undo or redo', () => {
    const { result } = setup();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('an edit makes undo available', () => {
    const { result } = setup();

    act(() => {
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' });
    });

    expect(result.current.flightPlan.name).toBe('Edited');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('an update that changes nothing creates no entry', () => {
    const { result } = setup();

    act(() => {
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan });
    });

    expect(result.current.canUndo).toBe(false);
  });

  it('a no-op update does not displace the previous real edit', () => {
    const { result } = setup();
    const original = result.current.flightPlan.name;

    act(() => {
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Real edit' });
    });
    act(() => {
      // Re-submitting identical content must not push a second entry.
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan });
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.flightPlan.name).toBe(original);
    expect(result.current.canUndo).toBe(false);
  });

  it('undo restores the previous plan and redo reapplies it', () => {
    const { result } = setup();
    const original = result.current.flightPlan.name;

    act(() => {
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' });
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.flightPlan.name).toBe(original);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });

    expect(result.current.flightPlan.name).toBe('Edited');
    expect(result.current.canRedo).toBe(false);
  });

  it('repeated undo walks back through successive edits', () => {
    const { result } = setup();
    const original = result.current.flightPlan.name;

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'One' }); });
    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Two' }); });
    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Three' }); });

    act(() => { result.current.undo(); });
    expect(result.current.flightPlan.name).toBe('Two');
    act(() => { result.current.undo(); });
    expect(result.current.flightPlan.name).toBe('One');
    act(() => { result.current.undo(); });
    expect(result.current.flightPlan.name).toBe(original);
  });

  it('two undos dispatched in one tick both take effect', () => {
    const { result } = setup();
    const original = result.current.flightPlan.name;

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'One' }); });
    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Two' }); });

    // Key autorepeat can fire both before React re-renders.
    act(() => {
      result.current.undo();
      result.current.undo();
    });

    expect(result.current.flightPlan.name).toBe(original);
  });

  it('a new edit after an undo discards the redo history', () => {
    const { result } = setup();

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'One' }); });
    act(() => { result.current.undo(); });
    expect(result.current.canRedo).toBe(true);

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Branched' }); });
    expect(result.current.canRedo).toBe(false);
  });

  it('undo with nothing recorded leaves the plan alone', () => {
    const { result } = setup();
    const before = result.current.flightPlan;

    act(() => { result.current.undo(); });

    expect(result.current.flightPlan).toEqual(before);
  });

  it('coalesces a sustained interaction with one control into a single entry', () => {
    const { result } = setup();
    const original = result.current.flightPlan.declination;

    act(() => {
      result.current.onFlightPlanUpdate(
        { ...result.current.flightPlan, declination: 3 },
        { coalesceKey: 'plan:declination' }
      );
    });
    act(() => {
      result.current.onFlightPlanUpdate(
        { ...result.current.flightPlan, declination: 6 },
        { coalesceKey: 'plan:declination' }
      );
    });

    act(() => { result.current.undo(); });

    expect(result.current.flightPlan.declination).toBe(original);
    expect(result.current.canUndo).toBe(false);
  });
});

describe('FlightPlanContext — replaceFlightPlan', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is not undoable and clears history from before it', () => {
    const { result } = setup();

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' }); });
    expect(result.current.canUndo).toBe(true);

    act(() => { result.current.replaceFlightPlan({ ...result.current.flightPlan, name: 'Imported' }); });

    expect(result.current.flightPlan.name).toBe('Imported');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('leaves no earlier state reachable after repeated undo', () => {
    const { result } = setup();

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'One' }); });
    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Two' }); });
    act(() => { result.current.replaceFlightPlan({ ...result.current.flightPlan, name: 'Imported' }); });

    act(() => { result.current.undo(); });
    act(() => { result.current.undo(); });
    act(() => { result.current.undo(); });

    expect(result.current.flightPlan.name).toBe('Imported');
  });

  it('discards redo history too', () => {
    const { result } = setup();

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' }); });
    act(() => { result.current.undo(); });
    expect(result.current.canRedo).toBe(true);

    act(() => { result.current.replaceFlightPlan({ ...result.current.flightPlan, name: 'Imported' }); });
    expect(result.current.canRedo).toBe(false);
  });
});

describe('FlightPlanContext — persistence of undone state', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('an undo is persisted like any other edit', () => {
    const { result } = setup();
    const original = result.current.flightPlan.name;

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' }); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(persistedPlan()?.name).toBe('Edited');

    act(() => { result.current.undo(); });
    act(() => { vi.advanceTimersByTime(500); });

    expect(persistedPlan()?.name).toBe(original);
  });
});
