/**
 * Logout after importing local data, in the same page session
 * (add-local-data-import verification; spec: user-identity, *Imported local
 * data stays in the account*; theatre-library, *Imported entries leave the
 * device*). The providers must not write back the anonymous data they read
 * when the page loaded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { defaultAircraft } from '../types/flightPlan';
import { loadPerformance, savePerformance } from '../utils/performanceStorage';
import { loadLibrary, saveLibrary } from '../utils/libraryStorage';

const signedIn = () => ({
  sync: { getState: () => ({ entries: {}, profiles: {} }), entryStatus: () => 'present' },
  state: { entries: {}, profiles: {} },
  status: null,
});
let assets: any;
vi.mock('./SpaceAssetsContext', () => ({ useSpaceAssets: () => assets }));
vi.mock('./FlightPlanContext', () => ({
  useOptionalFlightPlan: () => ({ flightPlan: { theatre: 'caucasus' } }),
  useFlightPlan: () => ({ flightPlan: { theatre: 'caucasus' } }),
}));

import { PerformanceProvider, usePerformance } from './PerformanceContext';
import { LibraryProvider, useLibrary } from './LibraryContext';

let perf: ReturnType<typeof usePerformance>;
let lib: ReturnType<typeof useLibrary>;
const Probe = () => {
  perf = usePerformance();
  lib = useLibrary();
  return null;
};
const ui = () => <PerformanceProvider><LibraryProvider><Probe /></LibraryProvider></PerformanceProvider>;

const E1 = { id: 'e1', type: 'sam_site' as const, lat: 1, lon: 2 };

beforeEach(() => {
  localStorage.clear();
  savePerformance({ ...defaultAircraft(), model: 'F-16C' });
  saveLibrary('caucasus', [E1]);
  assets = signedIn();
});

function signInImportAndLogOut(moved: { profile: boolean; library: boolean }) {
  const { rerender } = render(ui());               // page load while signed in
  if (moved.profile) savePerformance(defaultAircraft());   // the import moved them
  if (moved.library) saveLibrary('caucasus', []);
  assets = { sync: null, state: null, status: null };     // logout
  rerender(ui());
}

describe('logout after an import in the same session', () => {
  it('does not restore an imported profile', () => {
    signInImportAndLogOut({ profile: true, library: true });
    expect(loadPerformance()).toEqual(defaultAircraft());
    expect(perf.performance).toEqual(defaultAircraft());
  });

  it('does not restore imported library entries', () => {
    signInImportAndLogOut({ profile: true, library: true });
    expect(loadLibrary('caucasus')).toEqual([]);
    expect(lib.library).toEqual([]);
  });

  it('keeps what was not imported', () => {
    signInImportAndLogOut({ profile: false, library: false });
    expect(loadPerformance().model).toBe('F-16C');
    expect(loadLibrary('caucasus')).toEqual([E1]);
    expect(lib.library).toEqual([E1]);
  });

  it('saves anonymous edits made after logout as before', () => {
    signInImportAndLogOut({ profile: true, library: true });
    act(() => lib.addEntry({ id: 'e2', type: 'aaa', lat: 3, lon: 4 }));
    act(() => perf.updateAircraft({ model: 'A-10C' }));
    expect(loadLibrary('caucasus').map(e => e.id)).toEqual(['e2']);
    expect(loadPerformance().model).toBe('A-10C');
  });
});
