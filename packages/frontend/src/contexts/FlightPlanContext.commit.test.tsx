import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import * as Y from 'yjs';

// Drive the provider with a controlled Yjs hook and selection.
let hookResult: any;
let sel: any;
vi.mock('../hooks/useYjsFlightPlan', () => ({ useYjsFlightPlan: () => hookResult }));
vi.mock('./PlanSelectionContext', () => ({ usePlanSelection: () => sel }));

import { FlightPlanProvider, useFlightPlan } from './FlightPlanContext';

const DRAFT = 'DRAFTAAAAAA1';
const planWith = (n: number) => ({
  theatre: 'syria', name: 'X', declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0,
  points: Array.from({ length: n }, (_, i) => ({
    id: `w${i}`, lat: 0, lon: 0, tas: 400, alt: 0, fuelFlow: 0, windSpeed: 0, windDir: 0,
  })),
});

let api: ReturnType<typeof useFlightPlan>;
const Consumer = () => { api = useFlightPlan(); return null; };
const tree = () => <FlightPlanProvider><Consumer /></FlightPlanProvider>;

let commitDraft: any;
beforeEach(() => {
  commitDraft = vi.fn(async () => {});
  // Signed in, on Home: the previously loaded plan has waypoints.
  hookResult = { yDoc: new Y.Doc(), flightPlan: planWith(2), loadedPlanId: 'local', isReady: true, isSyncing: false };
  sel = { activePlanId: 'local', sync: false, isDraft: false, draftSeed: null, commitDraft, notePlanName: vi.fn() };
});

/** Switch to a loaded, empty draft whose document is `doc`. */
function openDraft(rerender: (ui: React.ReactElement) => void, doc = new Y.Doc()) {
  sel = { ...sel, activePlanId: DRAFT, isDraft: true };
  hookResult = { ...hookResult, yDoc: doc, flightPlan: planWith(0), loadedPlanId: DRAFT };
  rerender(tree());
  return doc;
}

describe('defer-commit: a draft commits on its first user edit (D8)', () => {
  it('does not commit an empty draft from the previous plan’s stale snapshot', () => {
    const { rerender } = render(tree());
    sel = { ...sel, activePlanId: DRAFT, isDraft: true }; // hook still returns the old plan
    rerender(tree());
    expect(commitDraft).not.toHaveBeenCalled();
  });

  it('does not commit a loaded, unchanged draft', () => {
    const { rerender } = render(tree());
    openDraft(rerender);
    expect(commitDraft).not.toHaveBeenCalled();
  });

  it('ignores the seed and the local-store load', () => {
    const { rerender } = render(tree());
    const doc = openDraft(rerender);
    act(() => {
      doc.transact(() => doc.getMap('flightPlan').set('name', 'Seeded'), 'migration');
      doc.transact(() => doc.getMap('flightPlan').set('theatre', 'syria'), { indexeddb: true });
    });
    expect(commitDraft).not.toHaveBeenCalled();
  });

  it('a rename alone commits the draft', () => {
    const { rerender } = render(tree());
    openDraft(rerender);
    act(() => api.onFlightPlanUpdate({ ...api.flightPlan, name: 'Renamed' }));
    expect(commitDraft).toHaveBeenCalledTimes(1);
  });

  it('a parameter change alone commits the draft', () => {
    const { rerender } = render(tree());
    openDraft(rerender);
    act(() => api.onFlightPlanUpdate({ ...api.flightPlan, bankAngle: 30 }));
    expect(commitDraft).toHaveBeenCalledTimes(1);
  });

  it('each later edit retries a commit that has not landed', () => {
    const { rerender } = render(tree());
    openDraft(rerender);
    act(() => api.onFlightPlanUpdate({ ...api.flightPlan, bankAngle: 30 }));
    act(() => api.onFlightPlanUpdate({ ...api.flightPlan, bankAngle: 35 }));
    expect(commitDraft).toHaveBeenCalledTimes(2);
  });
});

describe('the plan list follows the open plan\'s name (plan-sync)', () => {
  const P = 'PLANAAAAAAA1';
  const open = (name: string, loadedPlanId = P) => {
    sel = { ...sel, activePlanId: P, sync: true, isDraft: false };
    hookResult = { ...hookResult, flightPlan: { ...planWith(1), name }, loadedPlanId };
  };

  it('reports the committed plan\'s name, and again when it changes', () => {
    open('Alpha');
    const { rerender } = render(tree());
    expect(sel.notePlanName).toHaveBeenLastCalledWith(P, 'Alpha');
    open('Bravo');
    rerender(tree());
    expect(sel.notePlanName).toHaveBeenLastCalledWith(P, 'Bravo');
  });

  it('does not report a stale document still loaded from another plan', () => {
    open('Old plan', 'OTHERAAAAAA1');
    render(tree());
    expect(sel.notePlanName).not.toHaveBeenCalled();
  });

  it('does not report for the anonymous plan or a draft', () => {
    render(tree());                                    // anonymous: sync false
    sel = { ...sel, activePlanId: P, isDraft: true, sync: false };
    hookResult = { ...hookResult, loadedPlanId: P };
    render(tree());
    expect(sel.notePlanName).not.toHaveBeenCalled();
  });
});
