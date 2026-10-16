import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

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
  renamePlan: vi.fn(),
}));

import * as planApi from '../api/planApi';
import { clearPlanStore } from '../hooks/useYjsFlightPlan';
import { PlanSelectionProvider, usePlanSelection } from './PlanSelectionContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PlanSelectionProvider>{children}</PlanSelectionProvider>
);

const plan = (id: string, name = id) => ({
  id, name, theatre: 'caucasus', updatedAt: 't', lastEditor: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  authStatus = 'authenticated';
  (planApi.getMySpace as any).mockResolvedValue({ id: 'space-1', kind: 'personal' });
  (planApi.listPlans as any).mockResolvedValue([]);
  (planApi.createPlan as any).mockResolvedValue(plan('draft'));
  (planApi.renamePlan as any).mockResolvedValue(plan('p1'));
});

describe('PlanSelection — draft lifecycle (7.1/7.2)', () => {
  it('newDraft is active, uncommitted, not synced, and does not touch the server', async () => {
    (planApi.listPlans as any).mockResolvedValue([plan('p1', 'Existing')]);
    const { result } = renderHook(() => usePlanSelection(), { wrapper });
    await waitFor(() => expect(result.current.plans).toHaveLength(1));

    act(() => result.current.newDraft('caucasus', 'My Draft'));

    expect(result.current.isDraft).toBe(true);
    expect(result.current.activePlanId).not.toBe('local');
    expect(result.current.sync).toBe(false);
    expect(planApi.createPlan).not.toHaveBeenCalled();
    expect(result.current.plans.map((p) => p.id)).toEqual(['p1']); // existing intact
  });

  it('commitDraft registers the plan and turns sync on', async () => {
    const { result } = renderHook(() => usePlanSelection(), { wrapper });
    await waitFor(() => expect(result.current.spaceId).toBe('space-1'));

    act(() => result.current.newDraft('caucasus', 'My Draft'));
    const draftId = result.current.activePlanId;

    await act(async () => { await result.current.commitDraft(); });

    expect(planApi.createPlan).toHaveBeenCalledWith({
      id: draftId, name: 'My Draft', theatre: 'caucasus',
    });
    expect(result.current.isDraft).toBe(false);
    expect(result.current.sync).toBe(true);
  });

  it('abandonDraft clears the local store and returns Home without a server row', async () => {
    const { result } = renderHook(() => usePlanSelection(), { wrapper });
    await waitFor(() => expect(result.current.spaceId).toBe('space-1'));

    act(() => result.current.newDraft('caucasus'));
    const draftId = result.current.activePlanId;

    await act(async () => { await result.current.abandonDraft(); });

    expect(clearPlanStore).toHaveBeenCalledWith(draftId);
    expect(result.current.isDraft).toBe(false);
    expect(result.current.activePlanId).toBe('local');
    expect(planApi.createPlan).not.toHaveBeenCalled();
  });
});

describe('PlanSelection — active selection (8.1)', () => {
  it('restores a stored selection that still resolves', async () => {
    localStorage.setItem(
      'dcsplan-active-selection',
      JSON.stringify({ spaceId: 'space-1', planId: 'p1' }),
    );
    (planApi.listPlans as any).mockResolvedValue([plan('p1')]);
    const { result } = renderHook(() => usePlanSelection(), { wrapper });

    await waitFor(() => expect(result.current.activePlanId).toBe('p1'));
    expect(result.current.sync).toBe(true);
    expect(result.current.atHome).toBe(false);
  });

  it('falls back to Home when the stored selection no longer resolves', async () => {
    localStorage.setItem(
      'dcsplan-active-selection',
      JSON.stringify({ spaceId: 'space-1', planId: 'ghost' }),
    );
    (planApi.listPlans as any).mockResolvedValue([plan('p1')]);
    const { result } = renderHook(() => usePlanSelection(), { wrapper });

    await waitFor(() => expect(result.current.spaceId).toBe('space-1'));
    expect(result.current.activePlanId).toBe('local');
    expect(result.current.atHome).toBe(true);
  });
});

describe('PlanSelection — logout cache (8.2)', () => {
  it('clears synced plan stores on logout but keeps the anonymous plan', async () => {
    (planApi.listPlans as any).mockResolvedValue([plan('p1'), plan('p2')]);
    const { result, rerender } = renderHook(() => usePlanSelection(), { wrapper });
    await waitFor(() => expect(result.current.plans).toHaveLength(2));

    authStatus = 'anonymous';
    rerender();

    await waitFor(() => {
      expect(clearPlanStore).toHaveBeenCalledWith('p1');
      expect(clearPlanStore).toHaveBeenCalledWith('p2');
    });
    expect(clearPlanStore).not.toHaveBeenCalledWith('local');
    expect(result.current.activePlanId).toBe('local');
  });
});
