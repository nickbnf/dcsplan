/** Signed-in import destination (add-local-data-import task 3.7; spec:
 *  plan-import, signed-in requirements; performance-profile, *Performance
 *  import is tier-branched*). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { AssetSync } from '../sync/assetSync';
import { entriesFor } from '../sync/assetCache';
import { FakeAssetServer } from '../test/fakeAssetServer';
import { defaultAircraft, type FlightPlan } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { snapshotFromYDoc } from '../utils/yjsFlightPlanBinding';
import { PlanRequestError } from '../api/planApi';
import { importIntoSpace, type SpaceDeps } from './spaceDestination';
import type { ImportSource } from './types';

const E1 = { id: 'e1', type: 'sam_site' as const, lat: 42, lon: 41, name: 'SA-10' };
const E2 = { id: 'e2', type: 'aaa' as const, lat: 35, lon: 36, range: 2 };
const AIRCRAFT = { ...defaultAircraft(), model: 'F-16C' };

let server: FakeAssetServer;
let sync: AssetSync;
let created: Map<string, FlightPlan>;
let createPlan: ReturnType<typeof vi.fn<any[], any>>;

function deps(over: Partial<SpaceDeps> = {}): SpaceDeps {
  return { sync, createPlan: createPlan as never, listPlanIds: async () => [...created.keys()], ackTimeoutMs: 5_000, ...over };
}

function source(over: Partial<ImportSource> = {}): ImportSource {
  return {
    kind: 'file',
    plan: {
      ...flightPlanUtils.newFlightPlan('syria'),
      name: 'Imported',
      libraryRefs: [{ uuid: 'e1' }],
      markers: [{ id: 'm1', type: 'sam_site', lat: 35.1, lon: 36.2, name: 'Pop-up SAM', range: 12 }],
    },
    entries: { syria: [E1] },
    profile: { id: 'p1', aircraft: AIRCRAFT },
    ...over,
  };
}

/** Run an import while letting the outbox drain. */
async function run(src: ImportSource, sel = { plan: true, entries: true, profile: true }, d = deps()) {
  const p = importIntoSpace(src, sel, d);
  await vi.advanceTimersByTimeAsync(6_000);
  return p;
}

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  server = new FakeAssetServer();
  sync = new AssetSync('u1', { api: server.api, debounceMs: 400, pollMs: 60_000 });
  sync.start();
  await vi.advanceTimersByTimeAsync(100);
  created = new Map();
  createPlan = vi.fn(async ({ id, name, theatre, initialState }) => {
    if (created.has(id)) throw new PlanRequestError('Failed to create plan (409)', 409);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, initialState);
    created.set(id, snapshotFromYDoc(doc));
    return { id, name, theatre, updatedAt: 't', lastEditor: null };
  });
});

afterEach(() => {
  sync.stop();
  vi.useRealTimers();
});

describe('importIntoSpace', () => {
  it('adds a new plan with its content, entries in its theatre, flying its profile', async () => {
    const outcome = await run(source());
    expect(outcome).toMatchObject({ plan: 'done', entries: 'done', profile: 'done' });
    const plan = created.get(outcome.created!.id)!;
    expect(plan.name).toBe('Imported');
    expect(plan.profileId).toBe('p1');
    expect(plan.libraryRefs).toEqual([{ uuid: 'e1' }]);
    // Plan-local markers travel with the plan (local-data-migration).
    expect(plan.markers).toEqual([{ id: 'm1', type: 'sam_site', lat: 35.1, lon: 36.2, name: 'Pop-up SAM', range: 12 }]);
    expect(server.entryOnServer('e1')).toEqual(E1);
    expect(entriesFor(sync.getState(), 'syria').map(e => e.id)).toEqual(['e1']);
    expect(entriesFor(sync.getState(), 'caucasus')).toEqual([]);
    expect(server.profileOnServer('p1')?.aircraft).toEqual(AIRCRAFT);
  });

  it('creates the plan only after the entries and profile are acknowledged', async () => {
    let entryOnServerAtCreate: unknown;
    createPlan.mockImplementationOnce(async ({ id, name, theatre }) => {
      entryOnServerAtCreate = server.entryOnServer('e1');
      return { id, name, theatre, updatedAt: 't', lastEditor: null };
    });
    await run(source());
    expect(entryOnServerAtCreate).toEqual(E1);
  });

  it('keeps an entry the space already holds unchanged', async () => {
    server.seedEntry('syria', { ...E1, name: 'Space copy' });
    await sync.pull();
    const outcome = await run(source());
    expect(server.entryOnServer('e1')?.name).toBe('Space copy');
    // Counted as imported, so a local duplicate leaves the device.
    expect(outcome.entries).toBe('done');
  });

  it('reuses a profile the space holds, even when it is deselected', async () => {
    sync.putProfile({ id: 'p1', aircraft: { ...AIRCRAFT, model: 'Space F-16C' } });
    await vi.advanceTimersByTimeAsync(2_000);
    const outcome = await run(source(), { plan: true, entries: true, profile: false });
    expect(created.get(outcome.created!.id)!.profileId).toBe('p1');
    expect(server.profileOnServer('p1')?.aircraft.model).toBe('Space F-16C');
  });

  it('leaves the plan on the null profile when a new profile is deselected', async () => {
    const outcome = await run(source(), { plan: true, entries: true, profile: false });
    expect(created.get(outcome.created!.id)!.profileId).toBeUndefined();
    expect(server.profileOnServer('p1')).toBeUndefined();
    expect(outcome.profile).toBe('skipped');
  });

  it('adds no entry when library entries are deselected', async () => {
    await run(source(), { plan: true, entries: false, profile: true });
    expect(server.entryOnServer('e1')).toBeUndefined();
  });

  it('never replaces an existing plan: importing twice yields two plans', async () => {
    const a = await run(source());
    const b = await run(source());
    expect(a.created!.id).not.toBe(b.created!.id);
    expect(created.size).toBe(2);
  });

  it('creates no plan when the server cannot confirm the entries', async () => {
    server.offline = true;
    const outcome = await run(source());
    expect(outcome).toMatchObject({ plan: 'failed', entries: 'failed', profile: 'failed' });
    expect(createPlan).not.toHaveBeenCalled();
  });

  it('a retry after a failed plan creation adds one plan and no duplicates', async () => {
    createPlan.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const first = await run(source({ planId: 'AAAAAAAAAAA1' }));
    expect(first).toMatchObject({ plan: 'failed', entries: 'done', profile: 'done' });
    expect(created.size).toBe(0);

    const second = await run(source({ planId: 'AAAAAAAAAAA1', entries: { syria: [E1, E2] } }));
    expect(second.plan).toBe('done');
    expect(created.size).toBe(1);
    expect(server.calls.filter(c => c.startsWith('putEntry e1'))).toHaveLength(1);
    expect(server.calls.filter(c => c.startsWith('putProfile'))).toHaveLength(1);
  });

  it('treats a 409 for a plan already listed as landed', async () => {
    created.set('AAAAAAAAAAA1', flightPlanUtils.newFlightPlan('syria'));
    const outcome = await run(source({ planId: 'AAAAAAAAAAA1' }));
    expect(outcome.plan).toBe('done');
    expect(outcome.created?.id).toBe('AAAAAAAAAAA1');
  });
});
