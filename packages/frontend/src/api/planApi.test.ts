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

  it('createPlan surfaces 409 as DuplicatePlanNameError', async () => {
    mockFetch(409, {});
    await expect(api.createPlan({ id: 'p2', name: 'Alpha', theatre: 'caucasus' })).rejects.toBeInstanceOf(
      api.DuplicatePlanNameError,
    );
  });

  it('renamePlan PATCHes /api/plans/{id}', async () => {
    const f = mockFetch(200, { id: 'p1', name: 'Bravo', theatre: 'caucasus', updatedAt: 't', lastEditor: null });
    const updated = await api.renamePlan('p1', 'Bravo');
    expect(updated.name).toBe('Bravo');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/plans/p1');
    expect(init).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Bravo' });
  });

  it('renamePlan surfaces 409 as DuplicatePlanNameError', async () => {
    mockFetch(409, {});
    await expect(api.renamePlan('p1', 'Alpha')).rejects.toBeInstanceOf(api.DuplicatePlanNameError);
  });

  it('renamePlan surfaces 404 as PlanNotFoundError', async () => {
    mockFetch(404, {});
    await expect(api.renamePlan('nope', 'X')).rejects.toBeInstanceOf(api.PlanNotFoundError);
  });
});
