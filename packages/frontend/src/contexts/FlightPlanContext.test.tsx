import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { FlightPlanProvider, useFlightPlan } from './FlightPlanContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FlightPlanProvider>{children}</FlightPlanProvider>
);

async function setup() {
  const hook = renderHook(() => useFlightPlan(), { wrapper });
  await waitFor(() => {
    expect(hook.result.current).toBeDefined();
    expect(hook.result.current.flightPlan).toBeDefined();
  });
  return hook;
}

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('dcsplan-flightplan-ydoc');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('FlightPlanContext — undo capture', () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteDb();
  });

  it('starts with nothing to undo or redo', async () => {
    const { result } = await setup();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('an edit makes undo available', async () => {
    const { result } = await setup();

    act(() => {
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' });
    });

    await waitFor(() => {
      expect(result.current.flightPlan.name).toBe('Edited');
      expect(result.current.canUndo).toBe(true);
    });
    expect(result.current.canRedo).toBe(false);
  });

  it('undo restores the previous plan and redo reapplies it', async () => {
    const { result } = await setup();
    const original = result.current.flightPlan.name;

    act(() => {
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' });
    });
    await waitFor(() => expect(result.current.flightPlan.name).toBe('Edited'));

    act(() => { result.current.undo(); });
    await waitFor(() => {
      expect(result.current.flightPlan.name).toBe(original);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    act(() => { result.current.redo(); });
    await waitFor(() => {
      expect(result.current.flightPlan.name).toBe('Edited');
      expect(result.current.canRedo).toBe(false);
    });
  });

  it('repeated undo walks back through successive edits', async () => {
    const { result } = await setup();
    const original = result.current.flightPlan.name;

    // Wait 600ms between edits to avoid captureTimeout coalescing
    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'One' }); });
    await waitFor(() => expect(result.current.flightPlan.name).toBe('One'));
    await new Promise(r => setTimeout(r, 600));

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Two' }); });
    await waitFor(() => expect(result.current.flightPlan.name).toBe('Two'));
    await new Promise(r => setTimeout(r, 600));

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Three' }); });
    await waitFor(() => expect(result.current.flightPlan.name).toBe('Three'));
    await new Promise(r => setTimeout(r, 600));

    act(() => { result.current.undo(); });
    await waitFor(() => expect(result.current.flightPlan.name).toBe('Two'));

    act(() => { result.current.undo(); });
    await waitFor(() => expect(result.current.flightPlan.name).toBe('One'));

    act(() => { result.current.undo(); });
    await waitFor(() => expect(result.current.flightPlan.name).toBe(original));
  }, 10000);

  it('a new edit after an undo discards the redo history', async () => {
    const { result } = await setup();

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'One' }); });
    await waitFor(() => expect(result.current.flightPlan.name).toBe('One'));
    await new Promise(r => setTimeout(r, 600));

    act(() => { result.current.undo(); });
    await waitFor(() => expect(result.current.canRedo).toBe(true));

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Branched' }); });
    await waitFor(() => expect(result.current.canRedo).toBe(false));
  }, 10000);

  it('undo with nothing recorded leaves the plan alone', async () => {
    const { result } = await setup();
    const before = result.current.flightPlan;

    act(() => { result.current.undo(); });

    expect(result.current.flightPlan).toEqual(before);
  });

  it('rapid edits within captureTimeout coalesce into one undo', async () => {
    const { result } = await setup();
    const original = result.current.flightPlan.declination;

    // Two rapid edits within 500ms captureTimeout
    act(() => {
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan, declination: 3 });
    });
    await waitFor(() => expect(result.current.flightPlan.declination).toBe(3));
    // Don't wait 600ms — stay within captureTimeout
    act(() => {
      result.current.onFlightPlanUpdate({ ...result.current.flightPlan, declination: 6 });
    });
    await waitFor(() => expect(result.current.flightPlan.declination).toBe(6));

    // Wait for captureTimeout to close
    await new Promise(r => setTimeout(r, 600));

    act(() => { result.current.undo(); });

    await waitFor(() => {
      expect(result.current.flightPlan.declination).toBe(original);
      expect(result.current.canUndo).toBe(false);
    });
  }, 10000);
});

describe('FlightPlanContext — replaceFlightPlan', () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteDb();
  });

  it('is not undoable and clears history from before it', async () => {
    const { result } = await setup();

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' }); });
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    act(() => { result.current.replaceFlightPlan({ ...result.current.flightPlan, name: 'Imported' }); });

    await waitFor(() => {
      expect(result.current.flightPlan.name).toBe('Imported');
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  it('discards redo history too', async () => {
    const { result } = await setup();

    act(() => { result.current.onFlightPlanUpdate({ ...result.current.flightPlan, name: 'Edited' }); });
    await waitFor(() => expect(result.current.flightPlan.name).toBe('Edited'));
    await new Promise(r => setTimeout(r, 600));

    act(() => { result.current.undo(); });
    await waitFor(() => expect(result.current.canRedo).toBe(true));

    act(() => { result.current.replaceFlightPlan({ ...result.current.flightPlan, name: 'Imported' }); });
    await waitFor(() => expect(result.current.canRedo).toBe(false));
  }, 10000);
});
