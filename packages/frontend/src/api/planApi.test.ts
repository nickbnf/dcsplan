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

  describe('trash (add-trash-and-soft-delete 5.1)', () => {
    it('deletePlan DELETEs /api/plans/:id', async () => {
      const f = mockFetch(204, null);
      await api.deletePlan('p1');
      expect(f).toHaveBeenCalledWith('/api/plans/p1', expect.objectContaining({ method: 'DELETE' }));
    });

    it('deletePlan throws with the status on failure', async () => {
      mockFetch(404, {});
      await expect(api.deletePlan('p1')).rejects.toMatchObject({ status: 404 });
    });

    it('getTrash GETs /api/trash', async () => {
      const body = { plans: [], entries: [], profiles: [], retentionDays: 30 };
      const f = mockFetch(200, body);
      expect(await api.getTrash()).toEqual(body);
      expect(f.mock.calls[0][0]).toBe('/api/trash');
    });

    it('restorePlan POSTs /api/plans/:id/restore and returns the plan', async () => {
      const plan = { id: 'p1', name: 'Alpha', theatre: 'caucasus', updatedAt: 't', lastEditor: null };
      const f = mockFetch(200, plan);
      expect(await api.restorePlan('p1')).toEqual(plan);
      expect(f).toHaveBeenCalledWith('/api/plans/p1/restore', expect.objectContaining({ method: 'POST' }));
    });

    it('restorePlan surfaces 403 for a non-admin', async () => {
      mockFetch(403, {});
      await expect(api.restorePlan('p1')).rejects.toMatchObject({ status: 403 });
    });

    it('canRestore allows owner and admin only', () => {
      expect(api.canRestore('owner')).toBe(true);
      expect(api.canRestore('admin')).toBe(true);
      expect(api.canRestore('member')).toBe(false);
      expect(api.canRestore(undefined)).toBe(false);
    });
  });

  describe('versions (add-version-history)', () => {
    const version = {
      rev: 2, finalizedAt: '2026-07-23T14:32:00+00:00',
      editors: [{ id: 'u1', displayName: 'Falcon' }], restoredFrom: null,
    };

    it('listVersions GETs the plan\'s versions', async () => {
      const f = mockFetch(200, { versions: [version], pending: true });
      const result = await api.listVersions('p1');
      expect(result.pending).toBe(true);
      expect(result.versions[0].rev).toBe(2);
      expect(f.mock.calls[0][0]).toBe('/api/plans/p1/versions');
    });

    it('finalizeVersion POSTs the state as base64', async () => {
      const f = mockFetch(200, version);
      expect(await api.finalizeVersion('p1', new Uint8Array([0, 1, 255]))).toEqual(version);
      const [url, init] = f.mock.calls[0];
      expect(url).toBe('/api/plans/p1/versions');
      expect(init).toMatchObject({ method: 'POST' });
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ update: 'AAH/' });
    });

    it('finalizeVersion sends restoredFrom for a restore', async () => {
      const f = mockFetch(200, version);
      await api.finalizeVersion('p1', new Uint8Array([0]), 3);
      expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ update: 'AA==', restoredFrom: 3 });
    });

    it('finalizeVersion carries the HTTP status on failure', async () => {
      mockFetch(410, {});
      await expect(api.finalizeVersion('p1', new Uint8Array([0]))).rejects.toMatchObject({ status: 410 });
    });

    it('getVersionState decodes the base64 state', async () => {
      const f = mockFetch(200, { rev: 1, state: 'AAH/' });
      expect(await api.getVersionState('p1', 1)).toEqual(new Uint8Array([0, 1, 255]));
      expect(f.mock.calls[0][0]).toBe('/api/plans/p1/versions/1/state');
    });

    it('getPinnedEntries returns the entries by id', async () => {
      const pinned = { e1: { theatre: 'caucasus', entry: { id: 'e1', name: 'SA-10' } } };
      const f = mockFetch(200, { entries: pinned });
      expect(await api.getPinnedEntries('p1')).toEqual(pinned);
      expect(f.mock.calls[0][0]).toBe('/api/plans/p1/pinned-entries');
    });

    it('formatEditors shows the last editor and how many others', () => {
      expect(api.formatEditors([{ id: 'u1', displayName: 'Falcon' }])).toBe('Falcon');
      expect(api.formatEditors([
        { id: 'u1', displayName: 'Falcon' }, { id: 'u2', displayName: 'Viper' }, { id: 'u3', displayName: null },
      ])).toBe('Falcon +2');
      expect(api.formatEditors([])).toBe('Unknown');
    });
  });
});
