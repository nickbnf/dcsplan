import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import {
  applyFlightPlanToYDoc, snapshotFromYDoc, seedYDoc,
  observeRemoteRestores, planFromVersionState, restoreIntoYDoc, RESTORE_ORIGIN,
} from './yjsFlightPlanBinding';
import type { FlightPlan, FlightPlanTurnPoint, PlanLibraryRef, PlanMarker, AttackPlanningParams, AttackPlanningResults } from '../types/flightPlan';

function emptyPlan(overrides: Partial<FlightPlan> = {}): FlightPlan {
  return {
    theatre: 'syria',
    name: 'Test Plan',
    declination: 0,
    bankAngle: 45,
    initTimeSec: 43200,
    initFob: 12000,
    points: [],
    ...overrides,
  };
}

function wp(id: string, overrides: Partial<FlightPlanTurnPoint> = {}): FlightPlanTurnPoint {
  return {
    id,
    lat: 35 + Math.random(),
    lon: 36 + Math.random(),
    tas: 400,
    alt: 3000,
    fuelFlow: 6000,
    windSpeed: 0,
    windDir: 0,
    ...overrides,
  };
}

// ────── 2.1 Scalar diff & snapshot ──────

describe('scalar fields', () => {
  it('round-trips a plan with scalars only', () => {
    const plan = emptyPlan();
    const doc = new Y.Doc();
    seedYDoc(doc, plan);
    expect(snapshotFromYDoc(doc)).toEqual(plan);
  });

  it('diffs a single changed scalar', () => {
    const plan = emptyPlan();
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const updated = { ...plan, declination: 5 };
    applyFlightPlanToYDoc(doc, plan, updated);
    const snap = snapshotFromYDoc(doc);
    expect(snap.declination).toBe(5);
    expect(snap.theatre).toBe('syria');
    expect(snap.name).toBe('Test Plan');
  });

  it('diffs multiple changed scalars', () => {
    const plan = emptyPlan();
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const updated = { ...plan, theatre: 'caucasus', bankAngle: 60, initFob: 15000 };
    applyFlightPlanToYDoc(doc, plan, updated);
    const snap = snapshotFromYDoc(doc);
    expect(snap.theatre).toBe('caucasus');
    expect(snap.bankAngle).toBe(60);
    expect(snap.initFob).toBe(15000);
    expect(snap.declination).toBe(0);
  });
});

// ────── 2.2 Points array diff ──────

describe('points array', () => {
  it('adds a waypoint', () => {
    const plan = emptyPlan({ points: [wp('a')] });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);
    expect(snapshotFromYDoc(doc).points).toHaveLength(1);

    const updated = { ...plan, points: [plan.points[0], wp('b')] };
    applyFlightPlanToYDoc(doc, plan, updated);
    const snap = snapshotFromYDoc(doc);
    expect(snap.points).toHaveLength(2);
    expect(snap.points[1].id).toBe('b');
  });

  it('removes a waypoint', () => {
    const a = wp('a');
    const b = wp('b');
    const plan = emptyPlan({ points: [a, b] });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const updated = { ...plan, points: [b] };
    applyFlightPlanToYDoc(doc, plan, updated);
    const snap = snapshotFromYDoc(doc);
    expect(snap.points).toHaveLength(1);
    expect(snap.points[0].id).toBe('b');
  });

  it('edits a field on an existing waypoint', () => {
    const a = wp('a', { tas: 400 });
    const plan = emptyPlan({ points: [a] });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const updated = { ...plan, points: [{ ...a, tas: 500 }] };
    applyFlightPlanToYDoc(doc, plan, updated);
    const snap = snapshotFromYDoc(doc);
    expect(snap.points[0].tas).toBe(500);
    expect(snap.points[0].lat).toBe(a.lat);
  });

  it('reorders two waypoints', () => {
    const a = wp('a', { lat: 10, lon: 20 });
    const b = wp('b', { lat: 30, lon: 40 });
    const plan = emptyPlan({ points: [a, b] });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const updated = { ...plan, points: [b, a] };
    applyFlightPlanToYDoc(doc, plan, updated);
    const snap = snapshotFromYDoc(doc);
    expect(snap.points[0].id).toBe('b');
    expect(snap.points[1].id).toBe('a');
  });

  it('sets and clears an optional field', () => {
    const a = wp('a');
    const plan = emptyPlan({ points: [a] });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    // Set regimeId
    const withRegime = { ...plan, points: [{ ...a, regimeId: 'r1' }] };
    applyFlightPlanToYDoc(doc, plan, withRegime);
    expect(snapshotFromYDoc(doc).points[0].regimeId).toBe('r1');

    // Clear regimeId
    const { regimeId: _, ...aNoRegime } = withRegime.points[0];
    const withoutRegime = { ...plan, points: [aNoRegime as FlightPlanTurnPoint] };
    applyFlightPlanToYDoc(doc, withRegime, withoutRegime);
    expect(snapshotFromYDoc(doc).points[0].regimeId).toBeUndefined();
  });
});

// ────── 2.3 Library refs & markers ──────

describe('libraryRefs', () => {
  it('adds and removes a libraryRef', () => {
    const plan = emptyPlan();
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const ref: PlanLibraryRef = { uuid: 'lib1', comment: 'threat' };
    const withRef = { ...plan, libraryRefs: [ref] };
    applyFlightPlanToYDoc(doc, plan, withRef);
    const snap1 = snapshotFromYDoc(doc);
    expect(snap1.libraryRefs).toHaveLength(1);
    expect(snap1.libraryRefs![0].uuid).toBe('lib1');

    const noRef = { ...withRef, libraryRefs: undefined };
    applyFlightPlanToYDoc(doc, withRef, noRef);
    const snap2 = snapshotFromYDoc(doc);
    expect(snap2.libraryRefs).toBeUndefined();
  });

  it('edits a libraryRef comment', () => {
    const ref: PlanLibraryRef = { uuid: 'lib1', comment: 'old' };
    const plan = emptyPlan({ libraryRefs: [ref] });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const updated = { ...plan, libraryRefs: [{ ...ref, comment: 'new' }] };
    applyFlightPlanToYDoc(doc, plan, updated);
    expect(snapshotFromYDoc(doc).libraryRefs![0].comment).toBe('new');
  });
});

describe('markers', () => {
  it('adds and removes a marker', () => {
    const plan = emptyPlan();
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const marker: PlanMarker = { id: 'm1', type: 'sam_site', lat: 35, lon: 36 };
    const withMarker = { ...plan, markers: [marker] };
    applyFlightPlanToYDoc(doc, plan, withMarker);
    expect(snapshotFromYDoc(doc).markers).toHaveLength(1);

    const noMarker = { ...withMarker, markers: undefined };
    applyFlightPlanToYDoc(doc, withMarker, noMarker);
    expect(snapshotFromYDoc(doc).markers).toBeUndefined();
  });

  it('edits a marker field', () => {
    const marker: PlanMarker = { id: 'm1', type: 'sam_site', lat: 35, lon: 36, name: 'SA-6' };
    const plan = emptyPlan({ markers: [marker] });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const updated = { ...plan, markers: [{ ...marker, name: 'SA-11' }] };
    applyFlightPlanToYDoc(doc, plan, updated);
    expect(snapshotFromYDoc(doc).markers![0].name).toBe('SA-11');
  });

  it('round-trips undefined libraryRefs and markers', () => {
    const plan = emptyPlan();
    const doc = new Y.Doc();
    seedYDoc(doc, plan);
    const snap = snapshotFromYDoc(doc);
    expect(snap.libraryRefs).toBeUndefined();
    expect(snap.markers).toBeUndefined();
  });
});

// ────── 2.4 Attack planning ──────

describe('attackPlanning', () => {
  const baseParams: AttackPlanningParams = {
    attackType: 'oblique_popup',
    angleOff: 30,
    climbTas: 350,
    climbAngle: 20,
    diveAngle: 30,
    apexAltitude: 5000,
    dropAltitude: 2000,
    targetAltitude: 0,
    windDir: 0,
    windSpeed: 0,
    rollInG: 3,
    diveTas: 450,
  };

  const baseResults: AttackPlanningResults = {
    ingressHeading: 90,
    ingressTas: 400,
    climbHeading: 120,
    runInHeading: 270,
    runInDistance: 2,
    climbDistance: 3,
    ingressAlt: 3000,
    apexAlt: 5000,
    ipToPupTime: 60,
    climbTime: 30,
    runInTime: 20,
    dropLat: 35.1,
    dropLon: 36.1,
    endOfRollInLat: 35.2,
    endOfRollInLon: 36.2,
    rollInLat: 35.3,
    rollInLon: 36.3,
    ectLat: 35.4,
    ectLon: 36.4,
    pupLat: 35.5,
    pupLon: 36.5,
    pupToTgtDistance: 5,
    pupToTgtTime: 40,
  };

  it('round-trips a plan without attackPlanning', () => {
    const plan = emptyPlan();
    const doc = new Y.Doc();
    seedYDoc(doc, plan);
    expect(snapshotFromYDoc(doc).attackPlanning).toBeUndefined();
  });

  it('adds attackPlanning with params only', () => {
    const plan = emptyPlan();
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const withAP = { ...plan, attackPlanning: { params: baseParams } };
    applyFlightPlanToYDoc(doc, plan, withAP);
    const snap = snapshotFromYDoc(doc);
    expect(snap.attackPlanning).toBeDefined();
    expect(snap.attackPlanning!.params.attackType).toBe('oblique_popup');
    expect(snap.attackPlanning!.results).toBeUndefined();
  });

  it('adds results', () => {
    const plan = emptyPlan({ attackPlanning: { params: baseParams } });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const withResults = { ...plan, attackPlanning: { params: baseParams, results: baseResults } };
    applyFlightPlanToYDoc(doc, plan, withResults);
    const snap = snapshotFromYDoc(doc);
    expect(snap.attackPlanning!.results!.ingressHeading).toBe(90);
  });

  it('updates one param field', () => {
    const plan = emptyPlan({ attackPlanning: { params: baseParams } });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const newParams = { ...baseParams, angleOff: 45 as const };
    const updated = { ...plan, attackPlanning: { params: newParams } };
    applyFlightPlanToYDoc(doc, plan, updated);
    const snap = snapshotFromYDoc(doc);
    expect(snap.attackPlanning!.params.angleOff).toBe(45);
    expect(snap.attackPlanning!.params.climbTas).toBe(350);
  });

  it('clears results', () => {
    const plan = emptyPlan({ attackPlanning: { params: baseParams, results: baseResults } });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const noResults = { ...plan, attackPlanning: { params: baseParams } };
    applyFlightPlanToYDoc(doc, plan, noResults);
    const snap = snapshotFromYDoc(doc);
    expect(snap.attackPlanning!.results).toBeUndefined();
  });

  it('removes attackPlanning entirely', () => {
    const plan = emptyPlan({ attackPlanning: { params: baseParams, results: baseResults } });
    const doc = new Y.Doc();
    seedYDoc(doc, plan);

    const { attackPlanning: _, ...noAP } = plan;
    applyFlightPlanToYDoc(doc, plan, noAP as FlightPlan);
    const snap = snapshotFromYDoc(doc);
    expect(snap.attackPlanning).toBeUndefined();
  });
});

// ────── 2.5 Comprehensive round-trip ──────

describe('comprehensive round-trip', () => {
  it('round-trips a fully populated plan', () => {
    const plan = emptyPlan({
      theatre: 'caucasus',
      name: 'Full Plan',
      declination: -3,
      bankAngle: 60,
      initTimeSec: 36000,
      initFob: 15000,
      points: [
        wp('w1', { name: 'Departure', groundAlt: 100, comment: 'Start here' }),
        wp('w2', { regimeId: 'r1', waypointType: 'push', exitTimeSec: 40000, hack: true }),
        wp('w3', { name: 'Target', waypointType: 'tgt' }),
      ],
      libraryRefs: [
        { uuid: 'lib1', comment: 'SA-6' },
        { uuid: 'lib2' },
      ],
      markers: [
        { id: 'm1', type: 'sam_site', lat: 35, lon: 36, name: 'Threat', range: 20, comment: 'avoid' },
        { id: 'm2', type: 'city', lat: 34, lon: 37 },
      ],
      attackPlanning: {
        params: {
          attackType: 'oblique_popup',
          angleOff: 30,
          climbTas: 350,
          climbAngle: 20,
          diveAngle: 30,
          apexAltitude: 5000,
          dropAltitude: 2000,
          targetAltitude: 0,
          windDir: 0,
          windSpeed: 0,
          rollInG: 3,
          diveTas: 450,
        },
        results: {
          ingressHeading: 90,
          ingressTas: 400,
          climbHeading: 120,
          runInHeading: 270,
          runInDistance: 2,
          climbDistance: 3,
          ingressAlt: 3000,
          apexAlt: 5000,
          ipToPupTime: 60,
          climbTime: 30,
          runInTime: 20,
          dropLat: 35.1,
          dropLon: 36.1,
          endOfRollInLat: 35.2,
          endOfRollInLon: 36.2,
          rollInLat: 35.3,
          rollInLon: 36.3,
          ectLat: 35.4,
          ectLon: 36.4,
          pupLat: 35.5,
          pupLon: 36.5,
          pupToTgtDistance: 5,
          pupToTgtTime: 40,
        },
      },
    });

    const doc = new Y.Doc();
    seedYDoc(doc, plan);
    expect(snapshotFromYDoc(doc)).toEqual(plan);
  });

  it('applies a second plan with modifications across all arrays', () => {
    const plan1 = emptyPlan({
      points: [wp('w1', { lat: 10, lon: 20 }), wp('w2', { lat: 30, lon: 40 }), wp('w3', { lat: 50, lon: 60 })],
      libraryRefs: [{ uuid: 'r1', comment: 'old' }],
      markers: [{ id: 'm1', type: 'sam_site', lat: 35, lon: 36 }],
    });

    const doc = new Y.Doc();
    seedYDoc(doc, plan1);

    const plan2 = emptyPlan({
      theatre: 'nevada',
      points: [
        wp('w2', { lat: 31, lon: 41, tas: 500 }),  // edited + moved to first
        wp('w4', { lat: 70, lon: 80 }),              // new
        // w1 and w3 removed
      ],
      libraryRefs: [
        { uuid: 'r1', comment: 'updated' },
        { uuid: 'r2' },
      ],
      // markers removed entirely
    });

    applyFlightPlanToYDoc(doc, plan1, plan2);
    const snap = snapshotFromYDoc(doc);
    expect(snap).toEqual(plan2);
  });
});

describe('profileId (add-library-profile-sync, task 8.1)', () => {
  it('round-trips the plan profile and is absent when unset', () => {
    const doc = new Y.Doc();
    seedYDoc(doc, emptyPlan());
    expect('profileId' in snapshotFromYDoc(doc)).toBe(false);

    applyFlightPlanToYDoc(doc, emptyPlan(), emptyPlan({ profileId: 'p-1' }));
    expect(snapshotFromYDoc(doc).profileId).toBe('p-1');
  });

  it('switching and clearing the profile are single-key changes', () => {
    const doc = new Y.Doc();
    seedYDoc(doc, emptyPlan({ profileId: 'p-1' }));
    applyFlightPlanToYDoc(doc, emptyPlan({ profileId: 'p-1' }), emptyPlan({ profileId: 'p-2' }));
    expect(snapshotFromYDoc(doc).profileId).toBe('p-2');
    applyFlightPlanToYDoc(doc, emptyPlan({ profileId: 'p-2' }), emptyPlan());
    expect('profileId' in snapshotFromYDoc(doc)).toBe(false);
  });

  it('a profile switch and leg resets land in one update', () => {
    const doc = new Y.Doc();
    const before = emptyPlan({ profileId: 'p-1', points: [wp('a', { regimeId: 'r1' })] });
    seedYDoc(doc, before);
    let updates = 0;
    doc.on('update', () => { updates++; });
    doc.transact(() => {
      applyFlightPlanToYDoc(doc, before, { ...before, profileId: 'p-2', points: [wp('a')] });
    });
    expect(updates).toBe(1);
    const snap = snapshotFromYDoc(doc);
    expect(snap.profileId).toBe('p-2');
    expect(snap.points[0].regimeId).toBeUndefined();
  });
});

// --- Version restore (add-version-history tasks 7.1, 7.2; design D6) --------

/** Two devices' docs, kept in sync both ways while `connected` is true. */
function syncedPair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const link = { connected: true, queuedForA: [] as Uint8Array[], queuedForB: [] as Uint8Array[] };
  a.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return;
    if (link.connected) Y.applyUpdate(b, u, 'remote'); else link.queuedForB.push(u);
  });
  b.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return;
    if (link.connected) Y.applyUpdate(a, u, 'remote'); else link.queuedForA.push(u);
  });
  const reconnect = () => {
    link.connected = true;
    link.queuedForB.splice(0).forEach(u => Y.applyUpdate(b, u, 'remote'));
    link.queuedForA.splice(0).forEach(u => Y.applyUpdate(a, u, 'remote'));
  };
  return { a, b, link, reconnect };
}

describe('version restore', () => {
  const rev3 = emptyPlan({ name: 'Rev 3', points: [wp('w1', { name: 'ALPHA' }), wp('w2', { name: 'BRAVO' })] });

  function docAt(plan: FlightPlan): Y.Doc {
    const doc = new Y.Doc();
    doc.transact(() => seedYDoc(doc, plan), 'local');
    return doc;
  }

  it('planFromVersionState reads the plan held by a state', () => {
    const state = Y.encodeStateAsUpdate(docAt(rev3));
    expect(planFromVersionState(state)).toEqual(rev3);
  });

  it('restoreIntoYDoc sets the plan to the restored content in one restore transaction', () => {
    const doc = docAt(emptyPlan({ name: 'Rev 7', points: [wp('w1'), wp('w9')] }));
    const origins: unknown[] = [];
    doc.on('afterTransaction', (tx: Y.Transaction) => origins.push(tx.origin));
    restoreIntoYDoc(doc, rev3);
    expect(snapshotFromYDoc(doc)).toEqual(rev3);
    expect(origins).toEqual([RESTORE_ORIGIN]);
  });

  it('keeps the theatre', () => {
    const doc = docAt(emptyPlan({ theatre: 'caucasus' }));
    restoreIntoYDoc(doc, { ...rev3, theatre: 'syria' });
    expect(snapshotFromYDoc(doc).theatre).toBe('caucasus');
  });

  it('merges an offline edit to a waypoint present in both versions', () => {
    const { a, b, link, reconnect } = syncedPair();
    a.transact(() => seedYDoc(a, emptyPlan({ name: 'Rev 7', points: [rev3.points[0], wp('w9')] })), 'local');
    link.connected = false;
    // B, disconnected, renames w1; meanwhile A restores Rev 3.
    const bPlan = snapshotFromYDoc(b);
    b.transact(() => applyFlightPlanToYDoc(b, bPlan, {
      ...bPlan, points: bPlan.points.map(p => (p.id === 'w1' ? { ...p, name: 'RENAMED' } : p)),
    }), 'local');
    restoreIntoYDoc(a, rev3);
    reconnect();
    const merged = snapshotFromYDoc(a);
    expect(merged.name).toBe('Rev 3');
    expect(merged.points.map(p => [p.id, p.name])).toEqual([['w1', 'RENAMED'], ['w2', 'BRAVO']]);
    expect(snapshotFromYDoc(b)).toEqual(merged);
  });

  it('observeRemoteRestores fires on another device only', () => {
    const { a, b } = syncedPair();
    a.transact(() => seedYDoc(a, emptyPlan()), 'local');
    const onA = vi.fn();
    const onB = vi.fn();
    observeRemoteRestores(a, onA);
    const stop = observeRemoteRestores(b, onB);
    restoreIntoYDoc(a, rev3);
    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledTimes(1);
    stop();
    restoreIntoYDoc(a, emptyPlan());
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it('a remote restore clears the undo history on the other device', () => {
    const { a, b } = syncedPair();
    a.transact(() => seedYDoc(a, emptyPlan()), 'local');
    const um = new Y.UndoManager(b.getMap('flightPlan'), { trackedOrigins: new Set(['local']) });
    const plan = snapshotFromYDoc(b);
    b.transact(() => applyFlightPlanToYDoc(b, plan, { ...plan, name: 'Edited on B' }), 'local');
    expect(um.undoStack.length).toBe(1);
    observeRemoteRestores(b, () => um.clear());
    restoreIntoYDoc(a, rev3);
    expect(um.undoStack.length).toBe(0);
    expect(um.redoStack.length).toBe(0);
  });
});
