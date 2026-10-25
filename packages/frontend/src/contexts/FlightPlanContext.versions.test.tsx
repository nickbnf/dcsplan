/**
 * Versions through the flight plan context (add-version-history tasks 7.1,
 * 7.2; design D5, D6; spec: version-history — restoring a version, edit-undo —
 * restoring a version discards history).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import * as Y from 'yjs';
import type { FlightPlan } from '../types/flightPlan';
import { seedYDoc, snapshotFromYDoc } from '../utils/yjsFlightPlanBinding';

let hookResult: any;
let sel: any;
vi.mock('../hooks/useYjsFlightPlan', () => ({ useYjsFlightPlan: () => hookResult }));
vi.mock('./PlanSelectionContext', () => ({ usePlanSelection: () => sel }));
const planApi = vi.hoisted(() => ({
  finalizeVersion: vi.fn(),
  getVersionState: vi.fn(),
}));
vi.mock('../api/planApi', () => planApi);

import { FlightPlanProvider, useFlightPlan } from './FlightPlanContext';

const PLAN = 'PLANAAAAAAA1';
const plan = (name: string, ids: string[]): FlightPlan => ({
  theatre: 'syria', name, declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0,
  points: ids.map(id => ({ id, lat: 0, lon: 0, tas: 400, alt: 0, fuelFlow: 0, windSpeed: 0, windDir: 0 })),
});

let ctx: ReturnType<typeof useFlightPlan>;
const Consumer = () => { ctx = useFlightPlan(); return null; };
const tree = () => <FlightPlanProvider><Consumer /></FlightPlanProvider>;

function openPlan(current: FlightPlan, { sync = true, isDraft = false } = {}) {
  const yDoc = new Y.Doc();
  yDoc.transact(() => seedYDoc(yDoc, current), 'migration');
  hookResult = { yDoc, flightPlan: current, loadedPlanId: PLAN, isReady: true, isSyncing: false };
  sel = { activePlanId: PLAN, sync, isDraft, draftSeed: null, commitDraft: vi.fn(), notePlanName: vi.fn() };
  return yDoc;
}

const version = (rev: number, restoredFrom: number | null = null) => ({
  rev, finalizedAt: '2026-07-23T14:32:00+00:00', editors: [], restoredFrom,
});

beforeEach(() => {
  planApi.finalizeVersion.mockReset();
  planApi.getVersionState.mockReset();
});

describe('finalizeVersion', () => {
  it('is offered for a synced plan only', () => {
    openPlan(plan('A', []), { sync: false });
    render(tree());
    expect(ctx.finalizeVersion).toBeUndefined();
    expect(ctx.restoreVersion).toBeUndefined();
  });

  it('sends the device state of the plan', async () => {
    const yDoc = openPlan(plan('A', ['w1']));
    planApi.finalizeVersion.mockResolvedValue(version(4));
    render(tree());
    expect(await ctx.finalizeVersion!()).toEqual(version(4));
    const [planId, state] = planApi.finalizeVersion.mock.calls[0];
    expect(planId).toBe(PLAN);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, state);
    expect(snapshotFromYDoc(copy)).toEqual(snapshotFromYDoc(yDoc));
  });
});

describe('restoreVersion', () => {
  it('finalizes, applies the version, then finalizes the restore', async () => {
    const yDoc = openPlan(plan('Rev 7', ['w1', 'w9']));
    const rev3 = new Y.Doc();
    rev3.transact(() => seedYDoc(rev3, plan('Rev 3', ['w1', 'w2'])));
    planApi.finalizeVersion.mockResolvedValueOnce(version(8)).mockResolvedValueOnce(version(9, 3));
    planApi.getVersionState.mockResolvedValue(Y.encodeStateAsUpdate(rev3));
    render(tree());

    let result: unknown;
    await act(async () => { result = await ctx.restoreVersion!(3); });

    expect(result).toEqual(version(9, 3));
    expect(planApi.getVersionState).toHaveBeenCalledWith(PLAN, 3);
    expect(planApi.finalizeVersion.mock.calls[0]).toHaveLength(2);       // the open session
    expect(planApi.finalizeVersion.mock.calls[1][2]).toBe(3);            // the restore
    expect(snapshotFromYDoc(yDoc)).toEqual(plan('Rev 3', ['w1', 'w2']));
  });

  it('leaves nothing to undo', async () => {
    const yDoc = openPlan(plan('Rev 7', ['w1']));
    const rev3 = new Y.Doc();
    rev3.transact(() => seedYDoc(rev3, plan('Rev 3', [])));
    planApi.finalizeVersion.mockResolvedValue(version(8));
    planApi.getVersionState.mockResolvedValue(Y.encodeStateAsUpdate(rev3));
    const { rerender } = render(tree());
    act(() => { ctx.onFlightPlanUpdate({ ...ctx.flightPlan, name: 'Edited' }); });
    hookResult = { ...hookResult, flightPlan: snapshotFromYDoc(yDoc) };
    rerender(tree());
    expect(ctx.canUndo).toBe(true);

    await act(async () => { await ctx.restoreVersion!(3); });
    expect(ctx.canUndo).toBe(false);
    expect(ctx.canRedo).toBe(false);
  });

  it('a restore arriving from another device clears the undo history', () => {
    const yDoc = openPlan(plan('Rev 7', ['w1']));
    const { rerender } = render(tree());
    act(() => { ctx.onFlightPlanUpdate({ ...ctx.flightPlan, name: 'Edited' }); });
    hookResult = { ...hookResult, flightPlan: snapshotFromYDoc(yDoc) };
    rerender(tree());
    expect(ctx.canUndo).toBe(true);

    // Another device restored: its restore marker arrives as a remote update.
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(yDoc));
    other.getMap('history').set('restoreSeq', 1);
    act(() => { Y.applyUpdate(yDoc, Y.encodeStateAsUpdate(other, Y.encodeStateVector(yDoc)), 'provider'); });
    expect(ctx.canUndo).toBe(false);
  });
});
