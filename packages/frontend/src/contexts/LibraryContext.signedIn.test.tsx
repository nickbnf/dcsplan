/**
 * LibraryContext in the signed-in tier (add-library-profile-sync, tasks 5.1/5.2;
 * spec: theatre-library, space-asset-sync, map-objects). The context runs over a
 * real AssetSync engine talking to an in-memory server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { AssetSync } from '../sync/assetSync';
import { FakeAssetServer } from '../test/fakeAssetServer';
import { loadLibrary, mergeLibraryEntries, replaceLibraryEntries } from '../utils/libraryStorage';
import type { FlightPlan, LibraryObject } from '../types/flightPlan';

let theatre = 'caucasus';
let engine: AssetSync;
let server: FakeAssetServer;

vi.mock('./FlightPlanContext', () => ({
  useFlightPlan: () => ({ flightPlan: { theatre } as FlightPlan }),
}));
vi.mock('./SpaceAssetsContext', () => ({
  useSpaceAssets: () => ({
    sync: engine,
    state: useSyncExternalStore(engine.subscribe, engine.getState),
    status: useSyncExternalStore(engine.subscribe, engine.getStatus),
  }),
}));

import { LibraryProvider, useLibrary } from './LibraryContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <LibraryProvider>{children}</LibraryProvider>;
const E = (id: string, extra: Partial<LibraryObject> = {}): LibraryObject =>
  ({ id, type: 'sam_site', lat: 42, lon: 41, ...extra });
const settle = () => act(() => vi.advanceTimersByTimeAsync(2_000));
const putCalls = () => server.calls.filter(c => c.startsWith('putEntry'));
const deleteCalls = () => server.calls.filter(c => c.startsWith('deleteEntry'));

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  theatre = 'caucasus';
  server = new FakeAssetServer();
  engine = new AssetSync('u1', { api: server.api });
  engine.start();
  await vi.advanceTimersByTimeAsync(10);
});

afterEach(() => {
  engine.stop();
  vi.useRealTimers();
});

describe('LibraryContext — signed in (5.1)', () => {
  it('an edit goes to the outbox and the server, not to the anonymous keys', async () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => result.current.addEntry(E('e1')));
    expect(result.current.library.map(e => e.id)).toEqual(['e1']);
    expect(engine.getStatus().pending).toBe(1);
    await settle();
    expect(server.entryOnServer('e1')).toEqual(E('e1'));
    expect(loadLibrary('caucasus')).toEqual([]);
    expect(localStorage.getItem('dcsplan.library.caucasus')).toBeNull();
  });

  it('shows only the active theatre, and never writes entries under another theatre', async () => {
    const { result, rerender } = renderHook(() => useLibrary(), { wrapper });
    act(() => result.current.addEntry(E('c1')));
    theatre = 'syria';
    rerender();
    expect(result.current.library).toEqual([]);
    act(() => result.current.addEntry(E('s1')));
    await settle();
    expect(engine.getState().entries.c1.theatre).toBe('caucasus');
    expect(engine.getState().entries.s1.theatre).toBe('syria');
    theatre = 'caucasus';
    rerender();
    expect(result.current.library.map(e => e.id)).toEqual(['c1']);
  });

  it('entryStatus: present, then pending while behind, then deleted once caught up', async () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => result.current.addEntry(E('e1')));
    expect(result.current.entryStatus('e1')).toBe('present');
    expect(result.current.entryStatus('unknown')).toBe('pending');   // a write is queued
    await settle();

    server.offline = true;
    await act(() => engine.pull());
    expect(result.current.entryStatus('unknown')).toBe('pending');

    server.offline = false;
    await act(() => engine.pull());
    expect(result.current.entryStatus('unknown')).toBe('deleted');

    act(() => result.current.deleteEntry('e1'));
    expect(result.current.entryStatus('e1')).toBe('deleted');
  });
});

describe('LibraryContext — recovering a deleted entry (add-version-history 8.2)', () => {
  it('merging a pinned copy of a deleted entry brings it back under its id', async () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => result.current.addEntry(E('e1')));
    await settle();
    act(() => result.current.deleteEntry('e1'));
    await settle();
    expect(result.current.entryStatus('e1')).toBe('deleted');

    act(() => result.current.mergeEntries('caucasus', [E('e1')]));
    await settle();
    expect(result.current.entryStatus('e1')).toBe('present');
    expect(server.entryOnServer('e1')).toEqual(E('e1'));
  });
});

describe('LibraryContext — imports and deletion, signed in (5.2)', () => {
  it('a merge import sends creates only for new UUIDs', async () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => result.current.setLibrary([E('e1'), E('e2')]));
    await settle();
    server.calls.length = 0;

    const incoming = [E('e2', { lat: 1 }), E('e3')];
    act(() => result.current.setLibrary(mergeLibraryEntries(result.current.library, incoming).merged));
    await settle();
    expect(putCalls()).toEqual(['putEntry e3 base=null']);
    expect(server.entryOnServer('e2')?.lat).toBe(42);   // kept
  });

  it('Replace deletes what is gone and creates what is new', async () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => result.current.setLibrary([E('e1'), E('e2')]));
    await settle();
    server.calls.length = 0;

    act(() => result.current.setLibrary(replaceLibraryEntries([E('e3')]).merged));
    await settle();
    expect(deleteCalls().sort()).toEqual(['deleteEntry e1', 'deleteEntry e2']);
    expect(putCalls()).toEqual(['putEntry e3 base=null']);
    expect(result.current.library.map(e => e.id)).toEqual(['e3']);
  });

  it('a merge import while behind keeps the server copy of an existing entry', async () => {
    server.seedEntry('caucasus', E('e1', { lat: 10 }));
    server.offline = true;
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => result.current.setLibrary(mergeLibraryEntries(result.current.library, [E('e1')]).merged));
    server.offline = false;
    act(() => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(server.entryOnServer('e1')?.lat).toBe(10);
    expect(result.current.library).toEqual([E('e1', { lat: 10 })]);
  });
});
