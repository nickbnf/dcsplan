import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

// --- mocks -----------------------------------------------------------------
let authStatus: 'loading' | 'anonymous' | 'authenticated' = 'authenticated';
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ status: authStatus }),
}));

vi.mock('../hooks/useYjsFlightPlan', () => ({
  ANON_PLAN_ID: 'local',
  clearPlanStore: vi.fn(async () => {}),
}));

vi.mock('../api/planApi', () => ({
  getMySpace: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
}));

import * as planApi from '../api/planApi';
import { clearPlanStore } from '../hooks/useYjsFlightPlan';
import { isPlanId } from '../utils/planId';
import { PlanSelectionProvider, usePlanSelection, planIdFromPath } from './PlanSelectionContext';

const P1 = 'AAAAAAAAAAA1';
const P2 = 'AAAAAAAAAAA2';
const plan = (id: string, name = id) => ({ id, name, theatre: 'caucasus', updatedAt: 't', lastEditor: null });

function renderAt(path: string) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <PlanSelectionProvider>{children}</PlanSelectionProvider>
    </MemoryRouter>
  );
  return renderHook(() => ({ sel: usePlanSelection(), navigate: useNavigate() }), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  authStatus = 'authenticated';
  (planApi.getMySpace as any).mockResolvedValue({ id: 'space-1', kind: 'personal' });
  // A tiny in-memory server: created plans show up in later list calls.
  const server = [plan(P1, 'Ingress Alpha')];
  (planApi.listPlans as any).mockImplementation(async () => [...server]);
  (planApi.createPlan as any).mockImplementation(async (p: any) => {
    const created = plan(p.id, p.name);
    server.unshift(created);
    return created;
  });
});

describe('planIdFromPath', () => {
  it('extracts the id from plan addresses only', () => {
    expect(planIdFromPath(`/p/${P1}/ingress-alpha`)).toBe(P1);
    expect(planIdFromPath(`/p/${P1}/ingress-alpha/perf`)).toBe(P1);
    expect(planIdFromPath(`/p/${P1}`)).toBe(P1);
    expect(planIdFromPath('/plans')).toBeNull();
    expect(planIdFromPath('/library')).toBeNull();
  });
});

describe('resolution — anonymous (D3)', () => {
  beforeEach(() => { authStatus = 'anonymous'; });

  it('/p/local/… is the local plan', () => {
    const { result } = renderAt('/p/local/my-plan');
    expect(result.current.sel.activePlanId).toBe('local');
    expect(result.current.sel.requestUnresolved).toBe(false);
    expect(result.current.sel.sync).toBe(false);
  });

  it('/p/<id>/… is unresolved (the app sends them to their local plan)', () => {
    const { result } = renderAt(`/p/${P1}/x`);
    expect(result.current.sel.requestUnresolved).toBe(true);
    expect(result.current.sel.activePlanId).toBe('local');
  });

  it('off a plan address the local plan is active', () => {
    const { result } = renderAt('/library');
    expect(result.current.sel.activePlanId).toBe('local');
    expect(result.current.sel.hasActivePlan).toBe(true);
    expect(result.current.sel.atHome).toBe(false);
  });
});

describe('resolution — signed in (D3)', () => {
  it('a plan in the space opens synced', async () => {
    const { result } = renderAt(`/p/${P1}/ingress-alpha`);
    await waitFor(() => expect(result.current.sel.activePlanId).toBe(P1));
    expect(result.current.sel.sync).toBe(true);
    expect(result.current.sel.isDraft).toBe(false);
  });

  it('/p/local/… is unresolved for a signed-in user', async () => {
    const { result } = renderAt('/p/local/x');
    await waitFor(() => expect(result.current.sel.isResolving).toBe(false));
    expect(result.current.sel.requestUnresolved).toBe(true);
    expect(result.current.sel.atHome).toBe(true);
  });

  it('an id not in the space is unresolved', async () => {
    const { result } = renderAt(`/p/${P2}/x`);
    await waitFor(() => expect(result.current.sel.isResolving).toBe(false));
    expect(result.current.sel.requestUnresolved).toBe(true);
  });

  it('resolution waits for the plan list', async () => {
    let release: (v: unknown) => void = () => {};
    (planApi.listPlans as any).mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = renderAt(`/p/${P1}/ingress-alpha`);
    expect(result.current.sel.isResolving).toBe(true);
    expect(result.current.sel.requestUnresolved).toBe(false);
    expect(result.current.sel.atHome).toBe(false);
    await act(async () => { release([plan(P1)]); });
    await waitFor(() => expect(result.current.sel.activePlanId).toBe(P1));
  });

  it('off a plan address, the last opened plan stays active', async () => {
    const { result } = renderAt(`/p/${P1}/ingress-alpha`);
    await waitFor(() => expect(result.current.sel.activePlanId).toBe(P1));
    act(() => result.current.navigate('/library'));
    expect(result.current.sel.activePlanId).toBe(P1);
    expect(result.current.sel.atHome).toBe(false);
  });

  it('the stored pointer backs a fresh load off a plan address', async () => {
    localStorage.setItem('dcsplan-active-selection', JSON.stringify({ spaceId: 'space-1', planId: P1 }));
    const { result } = renderAt('/library');
    await waitFor(() => expect(result.current.sel.activePlanId).toBe(P1));
  });

  it('with no plan to open, the user is at Home', async () => {
    const { result } = renderAt('/plans');
    await waitFor(() => expect(result.current.sel.isResolving).toBe(false));
    expect(result.current.sel.atHome).toBe(true);
    expect(result.current.sel.hasActivePlan).toBe(false);
  });
});

describe('drafts (defer-commit)', () => {
  it('a new draft gets a short id and opens unsynced at its address', async () => {
    const { result } = renderAt('/plans');
    await waitFor(() => expect(result.current.sel.isResolving).toBe(false));

    let id = '';
    act(() => {
      id = result.current.sel.newDraft('germany', 'Germany Hop');
      result.current.navigate(`/p/${id}/germany-hop`);
    });

    expect(isPlanId(id)).toBe(true);
    expect(result.current.sel.activePlanId).toBe(id);
    expect(result.current.sel.isDraft).toBe(true);
    expect(result.current.sel.sync).toBe(false);
    expect(result.current.sel.draftSeed?.theatre).toBe('germany');
    expect(planApi.createPlan).not.toHaveBeenCalled();
  });

  it('committing registers the plan and stays resolved while turning sync on', async () => {
    const { result } = renderAt('/plans');
    await waitFor(() => expect(result.current.sel.isResolving).toBe(false));
    let id = '';
    act(() => {
      id = result.current.sel.newDraft('caucasus', 'My Draft');
      result.current.navigate(`/p/${id}/my-draft`);
    });

    await act(async () => { await result.current.sel.commitDraft(); });

    expect(planApi.createPlan).toHaveBeenCalledWith({ id, name: 'My Draft', theatre: 'caucasus' });
    expect(result.current.sel.activePlanId).toBe(id);
    expect(result.current.sel.requestUnresolved).toBe(false);
    expect(result.current.sel.isDraft).toBe(false);
    expect(result.current.sel.sync).toBe(true);
  });

  it('leaving a visited draft for Home abandons it and clears its store', async () => {
    const { result } = renderAt('/plans');
    await waitFor(() => expect(result.current.sel.isResolving).toBe(false));
    let id = '';
    act(() => {
      id = result.current.sel.newDraft('caucasus');
      result.current.navigate(`/p/${id}/new-flight-plan`);
    });
    expect(result.current.sel.isDraft).toBe(true);

    act(() => result.current.navigate('/plans'));

    await waitFor(() => expect(clearPlanStore).toHaveBeenCalledWith(id));
    expect(planApi.createPlan).not.toHaveBeenCalled();
    expect(result.current.sel.atHome).toBe(true);
  });
});

describe('drafts with edits are kept; failed commits are retried (D8)', () => {
  async function openNewDraft(result: any) {
    await waitFor(() => expect(result.current.sel.isResolving).toBe(false));
    let id = '';
    act(() => {
      id = result.current.sel.newDraft('caucasus', 'My Draft');
      result.current.navigate(`/p/${id}/my-draft`);
    });
    return id;
  }

  it('commits with the draft’s current name when given', async () => {
    const { result } = renderAt('/plans');
    const id = await openNewDraft(result);
    await act(async () => { await result.current.sel.commitDraft('Renamed Draft'); });
    expect(planApi.createPlan).toHaveBeenCalledWith({ id, name: 'Renamed Draft', theatre: 'caucasus' });
  });

  it('a failed commit keeps the draft, reports it, and is not discarded on leaving', async () => {
    const { result } = renderAt('/plans');
    const id = await openNewDraft(result);
    (planApi.createPlan as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    (planApi.listPlans as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await act(async () => { await result.current.sel.commitDraft(); });
    expect(result.current.sel.commitError).toMatch(/not saved to your account yet/);
    expect(result.current.sel.isDraft).toBe(true);

    act(() => result.current.navigate('/plans'));
    await new Promise((r) => setTimeout(r, 20));
    expect(clearPlanStore).not.toHaveBeenCalledWith(id);
  });

  it('retries when connectivity returns, then lists the plan', async () => {
    const { result } = renderAt('/plans');
    const id = await openNewDraft(result);
    (planApi.createPlan as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    (planApi.listPlans as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => { await result.current.sel.commitDraft(); });
    act(() => result.current.navigate('/plans')); // left while unsaved

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(result.current.sel.plans.map((p: any) => p.id)).toContain(id));
    expect(result.current.sel.commitError).toBeNull();
    expect(planApi.createPlan).toHaveBeenCalledTimes(2);
  });

  it('a 409 for an id that already landed is reconciled as committed', async () => {
    const { result } = renderAt('/plans');
    const id = await openNewDraft(result);
    // The request reached the server (which stored the plan) but its response
    // was lost, so the client sees a failure; the server now has the plan.
    const real = (planApi.createPlan as any).getMockImplementation();
    (planApi.createPlan as any).mockImplementationOnce(async (p: any) => {
      await real(p);
      throw new Error('Failed to create plan (409)');
    });

    await act(async () => { await result.current.sel.commitDraft(); });

    expect(result.current.sel.commitError).toBeNull();
    expect(result.current.sel.activePlanId).toBe(id);
    expect(result.current.sel.isDraft).toBe(false);
    expect(result.current.sel.sync).toBe(true);
  });
});

describe('logout cache (L1)', () => {
  it('clears synced plan stores on logout but keeps the anonymous plan', async () => {
    (planApi.listPlans as any).mockResolvedValue([plan(P1), plan(P2)]);
    const { result, rerender } = renderAt('/plans');
    await waitFor(() => expect(result.current.sel.plans).toHaveLength(2));

    authStatus = 'anonymous';
    rerender();

    await waitFor(() => {
      expect(clearPlanStore).toHaveBeenCalledWith(P1);
      expect(clearPlanStore).toHaveBeenCalledWith(P2);
    });
    expect(clearPlanStore).not.toHaveBeenCalledWith('local');
    expect(result.current.sel.activePlanId).toBe('local');
  });
});
