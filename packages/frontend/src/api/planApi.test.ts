import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './planApi';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('planApi', () => {
  it('getMySpace GETs /api/spaces/me same-origin', async () => {
    const f = mockFetch(200, { id: 's1', kind: 'personal' });
    const space = await api.getMySpace();
    expect(space).toEqual({ id: 's1', kind: 'personal' });
    expect(f).toHaveBeenCalledWith(
      '/api/spaces/me',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('listPlans GETs /api/plans and returns the array', async () => {
    mockFetch(200, [{ id: 'p1', name: 'Alpha', theatre: 'caucasus', updatedAt: 't', lastEditor: null }]);
    const plans = await api.listPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe('p1');
  });

  it('createPlan POSTs the plan body', async () => {
    const f = mockFetch(201, { id: 'p1', name: 'Alpha', theatre: 'caucasus', updatedAt: 't', lastEditor: null });
    await api.createPlan({ id: 'p1', name: 'Alpha', theatre: 'caucasus' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/plans');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      id: 'p1',
      name: 'Alpha',
      theatre: 'caucasus',
    });
  });

  it('createPlan sends initialState as base64 when given', async () => {
    const f = mockFetch(201, { id: 'p1', name: 'Alpha', theatre: 'caucasus', updatedAt: 't', lastEditor: null });
    await api.createPlan({ id: 'p1', name: 'Alpha', theatre: 'caucasus', initialState: new Uint8Array([0, 1, 255]) });
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ id: 'p1', name: 'Alpha', theatre: 'caucasus', initialState: 'AAH/' });
  });

  it('createPlan carries the HTTP status on failure', async () => {
    mockFetch(409, {});
    await expect(api.createPlan({ id: 'p2', name: 'Alpha', theatre: 'caucasus' })).rejects.toMatchObject({ status: 409 });
  });

  it('createPlan surfaces a failed registration as an error', async () => {
    mockFetch(409, {});
    await expect(api.createPlan({ id: 'p2', name: 'Alpha', theatre: 'caucasus' })).rejects.toThrow(
      /Failed to create plan \(409\)/,
    );
  });

  it('offers no rename call (renames happen in the plan document)', () => {
    expect((api as Record<string, unknown>).renamePlan).toBeUndefined();
  });
});
