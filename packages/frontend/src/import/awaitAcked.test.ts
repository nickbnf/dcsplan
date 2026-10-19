/** Waiting for the server to acknowledge imported rows (add-local-data-import task 3.6). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AssetSync } from '../sync/assetSync';
import { FakeAssetServer } from '../test/fakeAssetServer';
import { defaultAircraft } from '../types/flightPlan';
import { AckTimeoutError, awaitAcked } from './awaitAcked';

const E1 = { id: 'e1', type: 'sam_site' as const, lat: 42, lon: 41 };
let server: FakeAssetServer;
let sync: AssetSync;

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  server = new FakeAssetServer();
  sync = new AssetSync('u1', { api: server.api, debounceMs: 400, pollMs: 60_000 });
  sync.start();
  await vi.advanceTimersByTimeAsync(100);
});

afterEach(() => {
  sync.stop();
  vi.useRealTimers();
});

describe('awaitAcked', () => {
  it('resolves once the queued writes have drained', async () => {
    sync.putEntry('caucasus', E1);
    sync.putProfile({ id: 'p1', aircraft: defaultAircraft() });
    let done = false;
    const wait = awaitAcked(sync, { entries: ['e1'], profiles: ['p1'] }, 30_000).then(() => { done = true; });
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await wait;
    expect(done).toBe(true);
    expect(server.entryOnServer('e1')).toBeTruthy();
  });

  it('resolves at once for rows already acknowledged', async () => {
    sync.putEntry('caucasus', E1);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(awaitAcked(sync, { entries: ['e1'], profiles: [] }, 30_000)).resolves.toBeUndefined();
  });

  it('rejects after the timeout when the server cannot be reached', async () => {
    server.offline = true;
    sync.putEntry('caucasus', E1);
    const wait = awaitAcked(sync, { entries: ['e1'], profiles: [] }, 5_000);
    const assertion = expect(wait).rejects.toBeInstanceOf(AckTimeoutError);
    await vi.advanceTimersByTimeAsync(6_000);
    await assertion;
  });
});
