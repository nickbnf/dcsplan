import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { LibraryProvider, useLibrary, createLibraryEntry } from './LibraryContext';
import { loadLibrary, saveLibrary } from '../utils/libraryStorage';
import type { FlightPlan } from '../types/flightPlan';

const basePlan: FlightPlan = {
  theatre: 'caucasus',
  points: [],
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test',
};

let theatreOverride = 'caucasus';

vi.mock('./FlightPlanContext', () => ({
  useFlightPlan: () => ({
    flightPlan: { ...basePlan, theatre: theatreOverride },
    requestFitToFlightPlan: vi.fn(),
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <LibraryProvider>{children}</LibraryProvider>;
}

describe('LibraryContext theatre safety', () => {
  beforeEach(() => {
    localStorage.clear();
    theatreOverride = 'caucasus';
  });
  afterEach(() => localStorage.clear());

  it('entries are not written under the wrong theatre', () => {
    const caucasusEntry = createLibraryEntry('sam_site', 42, 44);
    saveLibrary('caucasus', [caucasusEntry]);

    const { result, rerender } = renderHook(() => useLibrary(), { wrapper });
    expect(result.current.library).toHaveLength(1);
    expect(result.current.library[0].id).toBe(caucasusEntry.id);

    theatreOverride = 'syria';
    rerender();

    const syriaStored = loadLibrary('syria');
    const caucasusStored = loadLibrary('caucasus');

    expect(caucasusStored).toHaveLength(1);
    expect(caucasusStored[0].id).toBe(caucasusEntry.id);
    expect(syriaStored.every(e => e.id !== caucasusEntry.id)).toBe(true);
  });

  it('the outgoing theatre library survives creating a plan on another theatre', () => {
    const entry = createLibraryEntry('sam_site', 42, 44);
    saveLibrary('caucasus', [entry]);

    const { result, rerender } = renderHook(() => useLibrary(), { wrapper });
    expect(result.current.library).toHaveLength(1);

    theatreOverride = 'syria';
    rerender();

    expect(loadLibrary('caucasus')).toHaveLength(1);
    expect(loadLibrary('caucasus')[0].id).toBe(entry.id);
  });

  it('returning to a theatre finds its library intact', () => {
    const entry = createLibraryEntry('sam_site', 42, 44);
    saveLibrary('caucasus', [entry]);

    const { result, rerender } = renderHook(() => useLibrary(), { wrapper });

    theatreOverride = 'syria';
    rerender();

    theatreOverride = 'caucasus';
    rerender();

    expect(result.current.library).toHaveLength(1);
    expect(result.current.library[0].id).toBe(entry.id);
  });

  it('a new plan on a theatre with existing entries presents them; empty theatre starts empty', () => {
    const entry = createLibraryEntry('bridge', 35, 36);
    saveLibrary('syria', [entry]);

    theatreOverride = 'syria';
    const { result, rerender } = renderHook(() => useLibrary(), { wrapper });
    expect(result.current.library).toHaveLength(1);
    expect(result.current.library[0].id).toBe(entry.id);

    theatreOverride = 'persian_gulf';
    rerender();
    expect(result.current.library).toHaveLength(0);
  });

  it('a reload during a theatre change preserves both libraries', () => {
    const caucasusEntry = createLibraryEntry('sam_site', 42, 44);
    const syriaEntry = createLibraryEntry('bridge', 35, 36);
    saveLibrary('caucasus', [caucasusEntry]);
    saveLibrary('syria', [syriaEntry]);

    const { result, unmount, rerender } = renderHook(() => useLibrary(), { wrapper });
    expect(result.current.library[0].id).toBe(caucasusEntry.id);

    theatreOverride = 'syria';
    rerender();

    unmount();

    const { result: afterReload } = renderHook(() => useLibrary(), { wrapper });
    expect(afterReload.current.library).toHaveLength(1);
    expect(afterReload.current.library[0].id).toBe(syriaEntry.id);

    expect(loadLibrary('caucasus')).toHaveLength(1);
    expect(loadLibrary('caucasus')[0].id).toBe(caucasusEntry.id);
    expect(loadLibrary('syria')).toHaveLength(1);
    expect(loadLibrary('syria')[0].id).toBe(syriaEntry.id);
  });
});
