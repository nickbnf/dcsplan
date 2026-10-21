/**
 * The signed-in user's local copy of their space's libraries and profiles
 * (capability: space-asset-sync; design D7).
 *
 * Kept in localStorage under a per-user prefix, `dcsplan.u.<userId>.`, apart
 * from the anonymous keys (`dcsplan.library.*`, `dcsplan.performance`), which
 * this module never touches. Each kind is one key holding a map by id:
 *
 *   libraries   ServerLibrary by library id
 *   entries     CachedEntry by entry id (with its theatre, so writes made before
 *               the theatre's library id is known can still be routed)
 *   profiles    CachedProfile by profile id
 *   tombstones  deleted entry/profile ids, so a placeholder can say "deleted"
 *   trashed     those deleted ids still in the space's Trash, so a placeholder
 *               can say they can be restored (add-trash-and-soft-delete D2)
 *   cursor      the change-feed cursor
 *   outbox      pending writes (see assetSync.ts)
 *
 * `seq` is the server's position for a row; `null` means the server has not
 * acknowledged it yet (created on this device).
 */
import type { LibraryObject, PerformanceProfile } from '../types/flightPlan';
import type { ChangeFeed, ServerLibrary } from '../api/assetApi';

export interface CachedEntry {
  theatre: string;
  libraryId: string | null;
  entry: LibraryObject;
  seq: number | null;
}

export interface CachedProfile {
  profile: PerformanceProfile;
  seq: number | null;
}

export type RowKind = 'entry' | 'profile';

/** A pending write. `readyAt` implements the per-row debounce; `rev` orders
 * writes and tells an op apart from a newer one that replaced it. */
export type OutboxOp =
  | { kind: 'entry'; id: string; op: 'put' | 'delete'; theatre: string; libraryId: string | null; readyAt: number; rev: number }
  | { kind: 'profile'; id: string; op: 'put' | 'delete'; readyAt: number; rev: number };

export interface AssetCacheState {
  libraries: Record<string, ServerLibrary>;
  entries: Record<string, CachedEntry>;
  profiles: Record<string, CachedProfile>;
  tombstones: { entry: Record<string, number | null>; profile: Record<string, number | null> };
  trashed: { entry: Record<string, true>; profile: Record<string, true> };
  cursor: number;
  outbox: Record<string, OutboxOp>;
}

export const userPrefix = (userId: string): string => `dcsplan.u.${userId}.`;

const KEYS = ['libraries', 'entries', 'profiles', 'tombstones', 'trashed', 'cursor', 'outbox'] as const;

export function emptyState(): AssetCacheState {
  return {
    libraries: {},
    entries: {},
    profiles: {},
    tombstones: { entry: {}, profile: {} },
    trashed: { entry: {}, profile: {} },
    cursor: 0,
    outbox: {},
  };
}

export const outboxKey = (kind: RowKind, id: string): string => `${kind}:${id}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function loadState(userId: string): AssetCacheState {
  const p = userPrefix(userId);
  const empty = emptyState();
  return {
    libraries: read(p + 'libraries', empty.libraries),
    entries: read(p + 'entries', empty.entries),
    profiles: read(p + 'profiles', empty.profiles),
    tombstones: read(p + 'tombstones', empty.tombstones),
    trashed: read(p + 'trashed', empty.trashed),
    cursor: read(p + 'cursor', empty.cursor),
    outbox: read(p + 'outbox', empty.outbox),
  };
}

/** Persist the whole state. Throws on a quota error so the caller can surface
 * it as a sync error rather than silently losing writes. */
export function saveState(userId: string, state: AssetCacheState): void {
  const p = userPrefix(userId);
  for (const key of KEYS) {
    localStorage.setItem(p + key, JSON.stringify(state[key]));
  }
}

/** Remove every key of the user's namespace (logout, D11). Anonymous keys and
 * other users' namespaces are untouched. */
export function sweepUser(userId: string): void {
  const p = userPrefix(userId);
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(p)) doomed.push(key);
  }
  doomed.forEach(k => localStorage.removeItem(k));
}

/**
 * Apply a change-feed batch. Rows that have a pending local write are left
 * alone: the write's acknowledgement settles them (a pending edit will win by
 * arrival order, or come back as a tombstone).
 */
export function applyFeed(state: AssetCacheState, feed: ChangeFeed): AssetCacheState {
  const next: AssetCacheState = {
    ...state,
    libraries: { ...state.libraries },
    entries: { ...state.entries },
    profiles: { ...state.profiles },
    tombstones: { entry: { ...state.tombstones.entry }, profile: { ...state.tombstones.profile } },
    trashed: { entry: { ...state.trashed.entry }, profile: { ...state.trashed.profile } },
    cursor: Math.max(state.cursor, feed.cursor),
  };
  for (const lib of feed.libraries) next.libraries[lib.id] = lib;

  for (const row of feed.entries) {
    if (state.outbox[outboxKey('entry', row.id)]) continue;
    if (row.deleted || row.entry === null) {
      delete next.entries[row.id];
      next.tombstones.entry[row.id] = row.seq;
      setTrashed(next.trashed.entry, row.id, row.deleted && row.trashed === true);
    } else {
      const theatre = next.libraries[row.libraryId]?.theatre ?? next.entries[row.id]?.theatre ?? '';
      next.entries[row.id] = { theatre, libraryId: row.libraryId, entry: row.entry, seq: row.seq };
      delete next.tombstones.entry[row.id];
      delete next.trashed.entry[row.id];
    }
  }

  for (const row of feed.profiles) {
    if (state.outbox[outboxKey('profile', row.id)]) continue;
    if (row.deleted || row.profile === null) {
      delete next.profiles[row.id];
      next.tombstones.profile[row.id] = row.seq;
      setTrashed(next.trashed.profile, row.id, row.deleted && row.trashed === true);
    } else {
      next.profiles[row.id] = { profile: row.profile, seq: row.seq };
      delete next.tombstones.profile[row.id];
      delete next.trashed.profile[row.id];
    }
  }
  return next;
}

function setTrashed(map: Record<string, true>, id: string, trashed: boolean): void {
  if (trashed) map[id] = true;
  else delete map[id];
}

/** The library id for a theatre, if known (exactly one per theatre today). */
export function libraryIdFor(state: AssetCacheState, theatre: string): string | null {
  const lib = Object.values(state.libraries).find(l => l.theatre === theatre);
  return lib?.id ?? null;
}

/** The entries of a theatre's library, in insertion order (new entries last). */
export function entriesFor(state: AssetCacheState, theatre: string): LibraryObject[] {
  return Object.values(state.entries)
    .filter(e => e.theatre === theatre)
    .map(e => e.entry);
}

export function profileList(state: AssetCacheState): PerformanceProfile[] {
  return Object.values(state.profiles).map(p => p.profile);
}
