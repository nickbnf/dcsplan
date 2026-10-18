import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AssetSync } from './assetSync';
import { AssetApiError } from '../api/assetApi';
import { entriesFor } from './assetCache';
import { FakeAssetServer } from '../test/fakeAssetServer';
import type { LibraryObject } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

const E1: LibraryObject = { id: 'e1', type: 'sam_site', lat: 42, lon: 41, name: 'SA-10' };

let server: FakeAssetServer;
const devices: AssetSync[] = [];

function device(userId = 'u1'): AssetSync {
  const d = new AssetSync(userId, { api: server.api, debounceMs: 400, pollMs: 60_000 });
  devices.push(d);
  return d;
}

/** Let debounces, retries and the promises they start run. */
const settle = (ms = 2_000) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  server = new FakeAssetServer();
});

afterEach(() => {
  devices.splice(0).forEach(d => d.stop());
  vi.useRealTimers();
});

describe('AssetSync — outbox (task 3.3)', () => {
  it('coalesces rapid edits of one row into a single write', async () => {
    const d = device();
    d.start();
    await settle();
    d.putEntry('caucasus', E1);
    d.putEntry('caucasus', { ...E1, name: 'SA-11' });
    d.putEntry('caucasus', { ...E1, name: 'SA-15' });
    await settle();
    expect(server.calls.filter(c => c.startsWith('putEntry'))).toEqual(['putEntry e1 base=null']);
    expect(server.entryOnServer('e1')?.name).toBe('SA-15');
    expect(d.getStatus()).toMatchObject({ pending: 0, caughtUp: true });
  });

  it('does not lose an edit made while the create is in flight', async () => {
    const d = device();
    d.start();
    await settle();
    d.putEntry('caucasus', E1);
    const release = server.hold();
    await settle(500);                         // create sent, held by the server
    d.putEntry('caucasus', { ...E1, name: 'edited' });
    release();
    await settle();
    const puts = server.calls.filter(c => c.startsWith('putEntry'));
    expect(puts[0]).toBe('putEntry e1 base=null');
    expect(puts[1]).toMatch(/^putEntry e1 base=\d+$/);   // an edit, not a second create
    expect(server.entryOnServer('e1')?.name).toBe('edited');
  });

  it('adopts the server copy when a create meets a live row (import while behind)', async () => {
    server.seedEntry('caucasus', { ...E1, lat: 10 });
    server.offline = true;
    const d = device();
    d.start();
    await settle();
    d.putEntry('caucasus', E1);                 // looks absent locally: a create
    server.offline = false;
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(server.entryOnServer('e1')?.lat).toBe(10);
    expect(d.getState().entries.e1.entry.lat).toBe(10);
  });

  it('routes an offline write for a never-visited theatre to its library on reconnect', async () => {
    server.offline = true;
    const d = device();
    d.start();
    await settle();
    d.putEntry('syria', E1);
    expect(d.getState().entries.e1.libraryId).toBeNull();
    server.offline = false;
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(server.calls).toContain('getLibraries syria');
    expect(d.getState().entries.e1.libraryId).toBe('lib-syria');
    expect(server.entryOnServer('e1')).toEqual(E1);
  });

  it('sends the delete of an entry deleted while its create was in flight', async () => {
    server.seedEntry('caucasus', { ...E1, id: 'other' });   // library known after the first pull
    const d = device();
    d.start();
    await settle();
    d.putEntry('caucasus', E1);
    const release = server.hold();
    await settle(500);
    d.deleteEntry('e1');
    release();
    await settle();
    expect(server.entryOnServer('e1')).toBeNull();
    expect(d.getState().entries.e1).toBeUndefined();
  });

  it('a deleted row stays deleted when a stale device edits it (deletions win)', async () => {
    const a = device('u1');
    a.start();
    a.putEntry('caucasus', E1);
    await settle();

    // Device B: its own storage, synced, then offline.
    const b = new AssetSync('u1-b', { api: server.api });
    devices.push(b);
    b.start();
    await settle();
    server.offline = true;
    b.putEntry('caucasus', { ...E1, name: 'stale' });
    server.offline = false;

    a.deleteEntry('e1');
    await settle();
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(server.entryOnServer('e1')).toBeNull();
    expect(b.getState().entries.e1).toBeUndefined();
    expect(b.entryStatus('e1')).toBe('deleted');
  });

  it('drops a write the server refuses and reports it', async () => {
    const d = device();
    d.start();
    await settle();
    vi.spyOn(server.api, 'putProfile').mockRejectedValueOnce(
      new AssetApiError(422, 'Failed to save profile (422)'),
    );
    d.putProfile({ id: 'p1', aircraft: defaultAircraft() });
    await settle();
    expect(d.getStatus()).toMatchObject({ pending: 0, error: 'Failed to save profile (422)' });
  });
});

describe('AssetSync — pulling and status (task 3.4)', () => {
  const pulls = () => server.calls.filter(c => c.startsWith('getChanges')).length;

  it('pulls on start, online, visibility, the poll interval, and after draining', async () => {
    const d = device();
    d.start();
    await settle(10);
    expect(pulls()).toBe(1);                                   // start

    window.dispatchEvent(new Event('online'));
    await settle(10);
    expect(pulls()).toBe(2);                                   // online

    document.dispatchEvent(new Event('visibilitychange'));     // jsdom reports "visible"
    await settle(10);
    expect(pulls()).toBe(3);

    await settle(60_000);
    expect(pulls()).toBe(4);                                   // poll

    d.putEntry('caucasus', E1);
    await settle(1_000);
    expect(pulls()).toBe(5);                                   // after the outbox drains
  });

  it('is not caught up while a write is pending or after a failed pull', async () => {
    const d = device();
    d.start();
    await settle();
    expect(d.getStatus().caughtUp).toBe(true);

    d.putEntry('caucasus', E1);
    expect(d.getStatus()).toMatchObject({ caughtUp: false, pending: 1 });
    await settle();
    expect(d.getStatus().caughtUp).toBe(true);

    server.offline = true;
    await d.pull();
    expect(d.getStatus()).toMatchObject({ caughtUp: false, connectivity: 'offline' });
  });

  it('reports entry status for placeholders', async () => {
    server.seedEntry('caucasus', E1);
    server.offline = true;
    const d = device();
    d.start();
    await settle();
    expect(d.entryStatus('e1')).toBe('pending');               // behind: may still arrive
    server.offline = false;
    await d.pull();
    expect(d.entryStatus('e1')).toBe('present');
    expect(d.entryStatus('never-existed')).toBe('deleted');    // caught up and absent
  });

  it('propagates a change from one device to another', async () => {
    const a = device('u1');
    const b = new AssetSync('u1-b', { api: server.api });
    devices.push(b);
    a.start();
    b.start();
    a.putProfile({ id: 'p1', aircraft: { ...defaultAircraft(), model: 'F-15E' } });
    a.putEntry('caucasus', E1);
    await settle();
    await b.pull();
    expect(entriesFor(b.getState(), 'caucasus')).toEqual([E1]);
    expect(b.getState().profiles.p1.profile.aircraft.model).toBe('F-15E');
  });
});

describe('AssetSync — after stop (logout)', () => {
  it('a reply arriving after stop does not write the swept copy back', async () => {
    const d = device();
    d.start();
    await settle();
    const release = server.hold();
    void d.pull();
    d.stop();
    localStorage.clear();                 // the logout sweep
    release();
    await settle();
    expect(Object.keys(localStorage)).toEqual([]);
  });
});
