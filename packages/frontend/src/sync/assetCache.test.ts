import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyFeed, emptyState, entriesFor, loadState, outboxKey, saveState, sweepUser, userPrefix,
} from './assetCache';
import type { LibraryObject } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

const E1: LibraryObject = { id: 'e1', type: 'sam_site', lat: 42, lon: 41 };
const E2: LibraryObject = { id: 'e2', type: 'aaa', lat: 43, lon: 40 };
const LIB = { id: 'l1', theatre: 'caucasus', name: null, parentId: null, seq: 1 };

beforeEach(() => localStorage.clear());

describe('assetCache', () => {
  it('applies a feed batch with upserts and tombstones', () => {
    const state = applyFeed(emptyState(), {
      cursor: 5,
      libraries: [LIB],
      entries: [
        { id: 'e1', libraryId: 'l1', seq: 2, deleted: false, entry: E1 },
        { id: 'e2', libraryId: 'l1', seq: 3, deleted: true, entry: null },
      ],
      profiles: [
        { id: 'p1', seq: 4, deleted: false, profile: { id: 'p1', aircraft: defaultAircraft() } },
        { id: 'p2', seq: 5, deleted: true, profile: null },
      ],
    });
    expect(state.cursor).toBe(5);
    expect(entriesFor(state, 'caucasus')).toEqual([E1]);
    expect(state.entries.e1).toMatchObject({ theatre: 'caucasus', libraryId: 'l1', seq: 2 });
    expect(state.tombstones.entry).toEqual({ e2: 3 });
    expect(Object.keys(state.profiles)).toEqual(['p1']);
    expect(state.tombstones.profile).toEqual({ p2: 5 });
  });

  it('a later live row clears a tombstone, and a later tombstone removes the row', () => {
    let state = applyFeed(emptyState(), {
      cursor: 2, libraries: [LIB], profiles: [],
      entries: [{ id: 'e1', libraryId: 'l1', seq: 2, deleted: true, entry: null }],
    });
    state = applyFeed(state, {
      cursor: 3, libraries: [], profiles: [],
      entries: [{ id: 'e1', libraryId: 'l1', seq: 3, deleted: false, entry: E1 }],
    });
    expect(state.tombstones.entry).toEqual({});
    state = applyFeed(state, {
      cursor: 4, libraries: [], profiles: [],
      entries: [{ id: 'e1', libraryId: 'l1', seq: 4, deleted: true, entry: null }],
    });
    expect(state.entries).toEqual({});
  });

  it('leaves rows with a pending local write alone', () => {
    const base = applyFeed(emptyState(), {
      cursor: 2, libraries: [LIB], profiles: [],
      entries: [{ id: 'e1', libraryId: 'l1', seq: 2, deleted: false, entry: E1 }],
    });
    const local = {
      ...base,
      entries: { e1: { ...base.entries.e1, entry: { ...E1, name: 'mine' } } },
      outbox: { [outboxKey('entry', 'e1')]: {
        kind: 'entry' as const, id: 'e1', op: 'put' as const, theatre: 'caucasus', libraryId: 'l1', readyAt: 0, rev: 1,
      } },
    };
    const next = applyFeed(local, {
      cursor: 3, libraries: [], profiles: [],
      entries: [{ id: 'e1', libraryId: 'l1', seq: 3, deleted: false, entry: { ...E1, name: 'theirs' } }],
    });
    expect(next.entries.e1.entry.name).toBe('mine');
    expect(next.cursor).toBe(3);
  });

  it('round-trips through the user namespace', () => {
    const state = applyFeed(emptyState(), {
      cursor: 2, libraries: [LIB], profiles: [],
      entries: [{ id: 'e2', libraryId: 'l1', seq: 2, deleted: false, entry: E2 }],
    });
    saveState('u1', state);
    expect(loadState('u1')).toEqual(state);
    expect(loadState('u2')).toEqual(emptyState());
  });

  it('the sweep removes only that user namespace, never the anonymous keys', () => {
    localStorage.setItem('dcsplan.library.caucasus', '[]');
    localStorage.setItem('dcsplan.performance', '{}');
    localStorage.setItem(userPrefix('u2') + 'cursor', '7');
    saveState('u1', emptyState());
    localStorage.setItem(userPrefix('u1') + 'session', '{}');

    sweepUser('u1');

    const keys = Object.keys(localStorage);
    expect(keys.filter(k => k.startsWith(userPrefix('u1')))).toEqual([]);
    expect(keys).toEqual(expect.arrayContaining([
      'dcsplan.library.caucasus', 'dcsplan.performance', userPrefix('u2') + 'cursor',
    ]));
  });
});
