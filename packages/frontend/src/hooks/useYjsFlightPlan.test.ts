import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Record constructed providers so we can assert attach/detach and drive 'sync'.
const providers: any[] = [];
vi.mock('y-websocket', () => {
  class WebsocketProvider {
    url: string;
    room: string;
    doc: any;
    destroyed = false;
    handlers: Record<string, Function[]> = {};
    constructor(url: string, room: string, doc: any) {
      this.url = url;
      this.room = room;
      this.doc = doc;
      providers.push(this);
    }
    on(ev: string, cb: Function) {
      (this.handlers[ev] ||= []).push(cb);
    }
    emit(ev: string, ...args: any[]) {
      (this.handlers[ev] || []).forEach((cb) => cb(...args));
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { WebsocketProvider };
});

import { useYjsFlightPlan, readAnonymousPlan, resetAnonymousPlan, clearPlanStore } from './useYjsFlightPlan';
import { isFreshPlan } from '../utils/flightPlanUtils';

beforeEach(() => {
  providers.length = 0;
  localStorage.clear();
});

describe('useYjsFlightPlan — keyed stores', () => {
  it('keeps each plan in its own IndexedDB store', async () => {
    const a = renderHook(() => useYjsFlightPlan('plan-A'));
    await waitFor(() => expect(a.result.current.isReady).toBe(true));
    act(() => {
      const doc = a.result.current.yDoc;
      doc.transact(() => doc.getMap('flightPlan').set('name', 'MARK-A'));
    });
    await waitFor(() => expect(a.result.current.flightPlan?.name).toBe('MARK-A'));
    await new Promise((r) => setTimeout(r, 100)); // let IndexedDB persist
    a.unmount();

    // A different plan id opens a fresh, independent store.
    const b = renderHook(() => useYjsFlightPlan('plan-B'));
    await waitFor(() => expect(b.result.current.isReady).toBe(true));
    expect(b.result.current.flightPlan?.name).not.toBe('MARK-A');
    b.unmount();

    // Reopening plan A restores its persisted content.
    const a2 = renderHook(() => useYjsFlightPlan('plan-A'));
    await waitFor(() => expect(a2.result.current.isReady).toBe(true));
    expect(a2.result.current.flightPlan?.name).toBe('MARK-A');
    a2.unmount();
  });
});

describe('useYjsFlightPlan — sync provider', () => {
  it('attaches a websocket provider when syncing and detaches on switch/unmount', async () => {
    const h = renderHook(
      ({ pid, sync }) => useYjsFlightPlan(pid, { sync, syncUrl: 'ws://test/api/sync' }),
      { initialProps: { pid: 'plan-X', sync: true } },
    );

    await waitFor(() => expect(providers.length).toBe(1));
    expect(providers[0].room).toBe('plan-X');
    expect(providers[0].url).toBe('ws://test/api/sync');

    // Not ready until the first server sync (empty cache).
    expect(h.result.current.isReady).toBe(false);
    expect(h.result.current.isSyncing).toBe(true);
    act(() => providers[0].emit('sync', true));
    await waitFor(() => expect(h.result.current.isReady).toBe(true));
    expect(h.result.current.isSyncing).toBe(false);

    // Switching plan tears down the old provider and opens a new one.
    h.rerender({ pid: 'plan-Y', sync: true });
    await waitFor(() => expect(providers.length).toBe(2));
    expect(providers[0].destroyed).toBe(true);
    expect(providers[1].room).toBe('plan-Y');

    h.unmount();
    expect(providers[1].destroyed).toBe(true);
  });

  it('seeds a new store with the provided seed plan (its chosen theatre)', async () => {
    const seedPlan: any = {
      theatre: 'germany', points: [], declination: 0, bankAngle: 45,
      initTimeSec: 0, initFob: 12000, name: 'Germany Hop',
    };
    const h = renderHook(() => useYjsFlightPlan('plan-germany', { seedPlan }));
    await waitFor(() => expect(h.result.current.isReady).toBe(true));
    expect(h.result.current.flightPlan?.theatre).toBe('germany');
    h.unmount();
  });

  it('does not recreate the doc when sync toggles on (draft commit preserves content)', async () => {
    const h = renderHook(
      ({ sync }) => useYjsFlightPlan('plan-commit', { sync, syncUrl: 'ws://test/api/sync' }),
      { initialProps: { sync: false } },
    );
    await waitFor(() => expect(h.result.current.isReady).toBe(true));
    const doc1 = h.result.current.yDoc;
    act(() => { doc1.transact(() => doc1.getMap('flightPlan').set('name', 'KEEP')); });
    await waitFor(() => expect(h.result.current.flightPlan?.name).toBe('KEEP'));

    // Commit flips sync on: provider attaches, but the doc is NOT recreated.
    h.rerender({ sync: true });
    await waitFor(() => expect(providers.length).toBe(1));
    expect(h.result.current.yDoc).toBe(doc1); // same doc — no remount
    expect(h.result.current.isReady).toBe(true); // never dropped to not-ready
    expect(h.result.current.flightPlan?.name).toBe('KEEP'); // content preserved
    h.unmount();
  });

  it('does not attach a provider when not syncing', async () => {
    const h = renderHook(() => useYjsFlightPlan('plan-Z', { sync: false }));
    await waitFor(() => expect(h.result.current.isReady).toBe(true));
    expect(providers.length).toBe(0);
    h.unmount();
  });
});

describe('anonymous plan outside the editor (add-local-data-import D6)', () => {
  async function editAnonymousPlan(name: string) {
    const h = renderHook(() => useYjsFlightPlan('local'));
    await waitFor(() => expect(h.result.current.isReady).toBe(true));
    act(() => {
      const doc = h.result.current.yDoc;
      doc.transact(() => doc.getMap('flightPlan').set('name', name), 'local');
    });
    await new Promise((r) => setTimeout(r, 100)); // let IndexedDB persist
    h.unmount();
  }

  it('reads the anonymous plan headlessly', async () => {
    await editAnonymousPlan('Strike North');
    expect((await readAnonymousPlan())?.name).toBe('Strike North');
  });

  it('resets it to a fresh plan that the editor then loads', async () => {
    await editAnonymousPlan('Strike North');
    await resetAnonymousPlan();
    const read = await readAnonymousPlan();
    expect(read && isFreshPlan(read)).toBe(true);

    const h = renderHook(() => useYjsFlightPlan('local'));
    await waitFor(() => expect(h.result.current.isReady).toBe(true));
    expect(isFreshPlan(h.result.current.flightPlan!)).toBe(true);
    h.unmount();
  });

  it('is still never deleted by clearPlanStore', async () => {
    await editAnonymousPlan('Keep me');
    await clearPlanStore('local');
    expect((await readAnonymousPlan())?.name).toBe('Keep me');
  });
});
