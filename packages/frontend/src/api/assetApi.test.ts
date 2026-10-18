import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './assetApi';
import type { LibraryObject, PerformanceProfile } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const ENTRY: LibraryObject = { id: 'e/1', type: 'sam_site', lat: 42, lon: 41, name: 'SA-10' };
const PROFILE: PerformanceProfile = { id: 'p1', aircraft: defaultAircraft() };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('assetApi', () => {
  it('getLibraries GETs /api/libraries with the theatre, same-origin', async () => {
    const f = mockFetch(200, [{ id: 'l1', theatre: 'caucasus', name: null, parentId: null, seq: 1 }]);
    const libs = await api.getLibraries('caucasus');
    expect(libs[0].id).toBe('l1');
    expect(f).toHaveBeenCalledWith(
      '/api/libraries?theatre=caucasus',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('putEntry PUTs the entry with its baseSeq, url-encoding ids', async () => {
    const f = mockFetch(200, { applied: true, seq: 3, entry: ENTRY });
    const res = await api.putEntry('l1', ENTRY, null);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/libraries/l1/entries/e%2F1');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual({ baseSeq: null, entry: ENTRY });
    expect(res.applied).toBe(true);
  });

  it('surfaces applied:false with the server row', async () => {
    mockFetch(200, { applied: false, seq: 2, entry: { ...ENTRY, lat: 10 } });
    const res = await api.putEntry('l1', ENTRY, null);
    expect(res).toEqual({ applied: false, seq: 2, entry: { ...ENTRY, lat: 10 } });
  });

  it('putProfile sends the aircraft only (the id is in the path)', async () => {
    const f = mockFetch(200, { applied: true, seq: 4, profile: PROFILE });
    await api.putProfile(PROFILE, 7);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/profiles/p1');
    expect(JSON.parse(init?.body as string)).toEqual({
      baseSeq: 7, profile: { aircraft: defaultAircraft() },
    });
  });

  it('deleteEntry and deleteProfile use DELETE', async () => {
    const f = mockFetch(200, { applied: true, seq: 5 });
    await api.deleteEntry('l1', 'e1');
    await api.deleteProfile('p1');
    expect(f.mock.calls.map(c => [c[0], c[1]?.method])).toEqual([
      ['/api/libraries/l1/entries/e1', 'DELETE'],
      ['/api/profiles/p1', 'DELETE'],
    ]);
  });

  it('getChanges GETs the feed since a cursor', async () => {
    const f = mockFetch(200, { cursor: 9, libraries: [], entries: [], profiles: [] });
    const feed = await api.getChanges(4);
    expect(f.mock.calls[0][0]).toBe('/api/changes?since=4');
    expect(feed.cursor).toBe(9);
  });

  it('maps a non-2xx answer to AssetApiError with its status', async () => {
    mockFetch(409, { detail: 'x' });
    await expect(api.putEntry('l1', ENTRY, null)).rejects.toMatchObject({
      name: 'AssetApiError', status: 409,
    });
  });

  it('lets a network failure reject as-is', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.getChanges(0)).rejects.toBeInstanceOf(TypeError);
  });
});
