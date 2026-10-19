/** Whether the account is empty (add-local-data-import task 6.2; spec:
 *  local-data-migration, *An empty account imports local data silently*). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AssetSync } from '../sync/assetSync';
import { FakeAssetServer } from '../test/fakeAssetServer';
import { isSpaceEmpty } from './localImport';

let server: FakeAssetServer;
let sync: AssetSync;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  server = new FakeAssetServer();
  sync = new AssetSync('u1', { api: server.api, debounceMs: 400, pollMs: 60_000 });
});

afterEach(() => {
  sync.stop();
  vi.useRealTimers();
});

async function judge(listPlans: () => Promise<{ id: string }[]>) {
  const result = isSpaceEmpty(listPlans, sync, 5_000);
  sync.start();
  await vi.advanceTimersByTimeAsync(6_000);
  return result;
}

describe('isSpaceEmpty', () => {
  it('is empty with no plans, entries or profiles on the server', async () => {
    expect(await judge(async () => [])).toBe(true);
  });

  it('is not empty with a plan', async () => {
    expect(await judge(async () => [{ id: 'AAAAAAAAAAA1' }])).toBe(false);
  });

  it('is not empty with a library entry', async () => {
    server.seedEntry('caucasus', { id: 'e1', type: 'sam_site', lat: 42, lon: 41 });
    expect(await judge(async () => [])).toBe(false);
  });

  it('counts as not empty when the plan list cannot be read', async () => {
    expect(await judge(async () => { throw new Error('offline'); })).toBe(false);
  });

  it('counts as not empty when the assets cannot be pulled', async () => {
    server.offline = true;
    expect(await judge(async () => [])).toBe(false);
  });
});
