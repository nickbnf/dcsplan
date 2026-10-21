/**
 * Sync engine for the signed-in user's libraries and profiles
 * (capability: space-asset-sync; design D3, D6, D7).
 *
 * Local edits update the cached copy immediately and queue a write in the
 * outbox. The outbox is a map keyed by row, so a newer edit replaces a pending
 * one (last-write-wins is per whole row); each row waits a short debounce
 * before it is sent. Writes go out one at a time, which also guarantees at most
 * one write per row in flight: the next write for a row reads its `baseSeq`
 * from the cache, which the previous write's acknowledgement has updated.
 *
 * Remote changes are pulled from the change feed on start, on reconnect, when
 * the page becomes visible, periodically while visible, and after the outbox
 * drains. "Caught up" means the last pull succeeded and nothing is pending.
 */
import * as assetApi from '../api/assetApi';
import { AssetApiError } from '../api/assetApi';
import type { LibraryObject, PerformanceProfile } from '../types/flightPlan';
import {
  applyFeed,
  emptyState,
  libraryIdFor,
  loadState,
  outboxKey,
  saveState,
  type AssetCacheState,
  type OutboxOp,
} from './assetCache';

export type AssetApi = Pick<
  typeof assetApi,
  'getLibraries' | 'putEntry' | 'deleteEntry' | 'putProfile' | 'deleteProfile' | 'getChanges'
>;

export type Connectivity = 'online' | 'offline';

export interface SyncStatus {
  connectivity: Connectivity;
  /** The last pull succeeded and no write is pending. */
  caughtUp: boolean;
  /** Writes waiting to be sent, including one in flight. */
  pending: number;
  /** The last write the server refused, or a local storage failure. */
  error: string | null;
}

export type EntryStatus = 'present' | 'deleted' | 'pending';

export interface AssetSyncOptions {
  api?: AssetApi;
  debounceMs?: number;
  pollMs?: number;
  /** Called when the server answers 401: the session is gone (user-identity). */
  onUnauthorized?: () => void;
}

const MAX_BACKOFF_MS = 60_000;

/** Whether an error means "could not reach the server" rather than a refusal. */
function isUnreachable(err: unknown): boolean {
  return !(err instanceof AssetApiError) || err.status >= 500;
}

export class AssetSync {
  private state: AssetCacheState;
  private status: SyncStatus;
  private listeners = new Set<() => void>();
  private readonly api: AssetApi;
  private readonly debounceMs: number;
  private readonly pollMs: number;
  private readonly onUnauthorized?: () => void;

  private running = false;
  /** Stopped for good (logout): late replies must not re-create the swept copy. */
  private stopped = false;
  private draining = false;
  private inFlight = 0;
  private lastPullOk = false;
  private rev = 0;
  private backoffMs = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pulling: Promise<void> | null = null;

  readonly userId: string;

  constructor(userId: string, opts: AssetSyncOptions = {}) {
    this.userId = userId;
    this.api = opts.api ?? assetApi;
    this.debounceMs = opts.debounceMs ?? 400;
    this.pollMs = opts.pollMs ?? 60_000;
    this.onUnauthorized = opts.onUnauthorized;
    this.state = loadState(userId);
    this.status = this.computeStatus('online', null);
  }

  // --- Subscription (useSyncExternalStore) ------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): AssetCacheState => this.state;
  getStatus = (): SyncStatus => this.status;

  private computeStatus(connectivity: Connectivity, error: string | null): SyncStatus {
    const pending = Object.keys(this.state.outbox).length;
    return {
      connectivity,
      caughtUp: this.lastPullOk && pending === 0 && this.inFlight === 0,
      pending,
      error,
    };
  }

  private commit(next: AssetCacheState, patch: Partial<Pick<SyncStatus, 'connectivity' | 'error'>> = {}): void {
    this.state = next;
    let error = patch.error !== undefined ? patch.error : this.status.error;
    try {
      if (!this.stopped) saveState(this.userId, next);
    } catch {
      error = 'Local storage is full: changes on this device may not be kept.';
    }
    this.status = this.computeStatus(patch.connectivity ?? this.status.connectivity, error);
    this.listeners.forEach(fn => fn());
  }

  // --- Lifecycle --------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.pull();
    }, this.pollMs);
    void this.pull();
    this.scheduleDrain(0);
  }

  stop(): void {
    this.running = false;
    this.stopped = true;
    window.removeEventListener('online', this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.pollTimer = null;
    this.drainTimer = null;
  }

  /** Retry now: called when the session is confirmed or connectivity returns. */
  nudge(): void {
    this.onOnline();
  }

  private onOnline = (): void => {
    this.backoffMs = 0;
    void this.pull();
    this.scheduleDrain(0);
  };

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') void this.pull();
  };

  // --- Local mutations ----------------------------------------------------------

  private enqueue(state: AssetCacheState, op: OutboxOp): AssetCacheState {
    const key = outboxKey(op.kind, op.id);
    return { ...state, outbox: { ...state.outbox, [key]: { ...op, rev: ++this.rev } } };
  }

  /** Create or edit a library entry. An id the cache does not hold is a create
   * (`baseSeq` null): it never overwrites a live server row, and revives a
   * deleted one (design D3). */
  putEntry(theatre: string, entry: LibraryObject): void {
    const prev = this.state.entries[entry.id];
    const libraryId = prev?.libraryId ?? libraryIdFor(this.state, theatre);
    const tombstones = { ...this.state.tombstones, entry: { ...this.state.tombstones.entry } };
    delete tombstones.entry[entry.id];
    let next: AssetCacheState = {
      ...this.state,
      entries: {
        ...this.state.entries,
        [entry.id]: { theatre, libraryId, entry, seq: prev?.seq ?? null },
      },
      tombstones,
    };
    next = this.enqueue(next, {
      kind: 'entry', id: entry.id, op: 'put', theatre, libraryId,
      readyAt: Date.now() + this.debounceMs, rev: 0,
    });
    this.commit(next);
    this.scheduleDrain(this.debounceMs);
  }

  deleteEntry(id: string): void {
    const prev = this.state.entries[id];
    if (!prev) return;
    const entries = { ...this.state.entries };
    delete entries[id];
    const outbox = { ...this.state.outbox };
    let next: AssetCacheState = {
      ...this.state,
      entries,
      outbox,
      tombstones: { ...this.state.tombstones, entry: { ...this.state.tombstones.entry, [id]: null } },
      // A synced entry goes to the server's Trash (soft-delete).
      trashed: { ...this.state.trashed, entry: { ...this.state.trashed.entry, [id]: true } },
    };
    if (prev.seq === null) {
      // Never reached the server: forget it locally, nothing to send.
      delete outbox[outboxKey('entry', id)];
      delete next.tombstones.entry[id];
      delete next.trashed.entry[id];
    } else {
      next = this.enqueue(next, {
        kind: 'entry', id, op: 'delete', theatre: prev.theatre, libraryId: prev.libraryId,
        readyAt: Date.now(), rev: 0,
      });
    }
    this.commit(next);
    this.scheduleDrain(0);
  }

  putProfile(profile: PerformanceProfile): void {
    const prev = this.state.profiles[profile.id];
    const tombstones = { ...this.state.tombstones, profile: { ...this.state.tombstones.profile } };
    delete tombstones.profile[profile.id];
    let next: AssetCacheState = {
      ...this.state,
      profiles: { ...this.state.profiles, [profile.id]: { profile, seq: prev?.seq ?? null } },
      tombstones,
    };
    next = this.enqueue(next, {
      kind: 'profile', id: profile.id, op: 'put', readyAt: Date.now() + this.debounceMs, rev: 0,
    });
    this.commit(next);
    this.scheduleDrain(this.debounceMs);
  }

  deleteProfile(id: string): void {
    const prev = this.state.profiles[id];
    if (!prev) return;
    const profiles = { ...this.state.profiles };
    delete profiles[id];
    const outbox = { ...this.state.outbox };
    let next: AssetCacheState = {
      ...this.state,
      profiles,
      outbox,
      tombstones: { ...this.state.tombstones, profile: { ...this.state.tombstones.profile, [id]: null } },
      trashed: { ...this.state.trashed, profile: { ...this.state.trashed.profile, [id]: true } },
    };
    if (prev.seq === null) {
      delete outbox[outboxKey('profile', id)];
      delete next.tombstones.profile[id];
      delete next.trashed.profile[id];
    } else {
      next = this.enqueue(next, { kind: 'profile', id, op: 'delete', readyAt: Date.now(), rev: 0 });
    }
    this.commit(next);
    this.scheduleDrain(0);
  }

  /** Placeholder state for a library ref (map-objects): known-deleted or absent
   * while caught up and online reads as deleted; otherwise it may still arrive. */
  entryStatus(id: string): EntryStatus {
    if (this.state.entries[id]) return 'present';
    return this.absentStatus(id in this.state.tombstones.entry);
  }

  /** The same three states for a plan's `profileId` (performance-profile). */
  profileStatus(id: string): EntryStatus {
    if (this.state.profiles[id]) return 'present';
    return this.absentStatus(id in this.state.tombstones.profile);
  }

  private absentStatus(knownDeleted: boolean): EntryStatus {
    if (knownDeleted) return 'deleted';
    const { connectivity, caughtUp } = this.status;
    return connectivity === 'online' && caughtUp ? 'deleted' : 'pending';
  }

  /** Whether a deleted entry or profile is still in the Trash, so restorable
   * (soft-delete). False once it is purged, and for ids never seen deleted. */
  isTrashed(kind: 'entry' | 'profile', id: string): boolean {
    return this.state.trashed[kind][id] === true;
  }

  // --- Draining the outbox ------------------------------------------------------

  private scheduleDrain(delayMs: number): void {
    if (!this.running) return;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      void this.drain();
    }, Math.max(0, delayMs));
  }

  private nextReadyOp(): { op: OutboxOp | null; wait: number | null } {
    const ops = Object.values(this.state.outbox);
    if (ops.length === 0) return { op: null, wait: null };
    const now = Date.now();
    const ready = ops.filter(o => o.readyAt <= now).sort((a, b) => a.rev - b.rev);
    if (ready.length > 0) return { op: ready[0], wait: null };
    return { op: null, wait: Math.min(...ops.map(o => o.readyAt)) - now };
  }

  /** Send ready writes one at a time; pull once the outbox is empty. */
  async drain(): Promise<void> {
    if (this.draining || !this.running) return;
    this.draining = true;
    let sent = false;
    try {
      for (;;) {
        const { op, wait } = this.nextReadyOp();
        if (!op) {
          if (wait !== null) this.scheduleDrain(wait);
          else if (sent) void this.pull();
          return;
        }
        sent = true;
        this.inFlight++;
        try {
          await this.send(op);
          this.backoffMs = 0;
          this.settle(op, this.state);
        } catch (err) {
          if (err instanceof AssetApiError && err.status === 401) {
            this.inFlight--;
            this.commit(this.state);
            this.onUnauthorized?.();
            return;
          }
          if (isUnreachable(err)) {
            this.inFlight--;
            this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs ? this.backoffMs * 2 : 1000);
            this.commit(this.state, { connectivity: 'offline' });
            this.scheduleDrain(this.backoffMs);
            return;
          }
          // Refused (4xx): the write can never succeed as is. Drop it.
          this.settle(op, this.state, `${(err as Error).message}`);
        }
        this.inFlight--;
        this.commit(this.state);
      }
    } finally {
      this.draining = false;
    }
  }

  /** Remove the op from the outbox unless a newer write for the row replaced it. */
  private settle(op: OutboxOp, state: AssetCacheState, error?: string): void {
    const key = outboxKey(op.kind, op.id);
    const outbox = { ...state.outbox };
    if (outbox[key]?.rev === op.rev) delete outbox[key];
    this.commit({ ...state, outbox }, error !== undefined ? { error } : { connectivity: 'online' });
  }

  private async resolveLibrary(theatre: string, known: string | null): Promise<string> {
    const cached = known ?? libraryIdFor(this.state, theatre);
    if (cached) return cached;
    const libs = await this.api.getLibraries(theatre);
    const libraries = { ...this.state.libraries };
    libs.forEach(l => { libraries[l.id] = l; });
    this.commit({ ...this.state, libraries });
    return libs[0].id;
  }

  private newerPending(op: OutboxOp): boolean {
    const current = this.state.outbox[outboxKey(op.kind, op.id)];
    return current !== undefined && current.rev !== op.rev;
  }

  private async send(op: OutboxOp): Promise<void> {
    if (op.kind === 'entry') {
      const libraryId = await this.resolveLibrary(op.theatre, op.libraryId);
      if (op.op === 'delete') {
        const res = await this.api.deleteEntry(libraryId, op.id);
        const tomb = { ...this.state.tombstones.entry, [op.id]: res.seq };
        this.state = { ...this.state, tombstones: { ...this.state.tombstones, entry: tomb } };
        return;
      }
      const cached = this.state.entries[op.id];
      if (!cached) return; // deleted locally since
      const res = await this.api.putEntry(libraryId, cached.entry, cached.seq);
      const entries = { ...this.state.entries };
      const current = entries[op.id];
      if (!current && res.entry !== null) {
        // Deleted locally while this write was in flight: the server now holds
        // the row, so the delete has to be sent after all.
        this.state = this.enqueue(this.state, {
          kind: 'entry', id: op.id, op: 'delete', theatre: op.theatre, libraryId,
          readyAt: Date.now(), rev: 0,
        });
        return;
      }
      if (res.applied || res.entry) {
        // Applied: record the seq. Ignored create over a live row: adopt the
        // server's copy, unless a newer local edit is queued (it will win).
        const adopt = !res.applied && res.entry !== null && !this.newerPending(op);
        entries[op.id] = {
          theatre: op.theatre,
          libraryId,
          entry: adopt ? res.entry! : current?.entry ?? cached.entry,
          seq: res.seq,
        };
        this.state = { ...this.state, entries };
      } else {
        // Ignored edit over a tombstone: the row is deleted; drop newer writes too.
        delete entries[op.id];
        const outbox = { ...this.state.outbox };
        delete outbox[outboxKey('entry', op.id)];
        const tomb = { ...this.state.tombstones.entry, [op.id]: res.seq };
        this.state = { ...this.state, entries, outbox, tombstones: { ...this.state.tombstones, entry: tomb } };
      }
      return;
    }

    if (op.op === 'delete') {
      const res = await this.api.deleteProfile(op.id);
      const tomb = { ...this.state.tombstones.profile, [op.id]: res.seq };
      this.state = { ...this.state, tombstones: { ...this.state.tombstones, profile: tomb } };
      return;
    }
    const cached = this.state.profiles[op.id];
    if (!cached) return;
    const res = await this.api.putProfile(cached.profile, cached.seq);
    const profiles = { ...this.state.profiles };
    if (!profiles[op.id] && res.profile !== null) {
      this.state = this.enqueue(this.state, {
        kind: 'profile', id: op.id, op: 'delete', readyAt: Date.now(), rev: 0,
      });
      return;
    }
    if (res.applied || res.profile) {
      const adopt = !res.applied && res.profile !== null && !this.newerPending(op);
      profiles[op.id] = {
        profile: adopt ? res.profile! : profiles[op.id]?.profile ?? cached.profile,
        seq: res.seq,
      };
      this.state = { ...this.state, profiles };
    } else {
      delete profiles[op.id];
      const outbox = { ...this.state.outbox };
      delete outbox[outboxKey('profile', op.id)];
      const tomb = { ...this.state.tombstones.profile, [op.id]: res.seq };
      this.state = { ...this.state, profiles, outbox, tombstones: { ...this.state.tombstones, profile: tomb } };
    }
  }

  // --- Pulling ------------------------------------------------------------------

  /** Pull the change feed since the cursor. Concurrent calls share one request. */
  pull(): Promise<void> {
    if (!this.running) return Promise.resolve();
    if (this.pulling) return this.pulling;
    this.pulling = (async () => {
      try {
        const feed = await this.api.getChanges(this.state.cursor);
        this.lastPullOk = true;
        this.commit(applyFeed(this.state, feed), { connectivity: 'online' });
      } catch (err) {
        this.lastPullOk = false;
        if (err instanceof AssetApiError && err.status === 401) {
          this.commit(this.state);
          this.onUnauthorized?.();
        } else {
          this.commit(this.state, isUnreachable(err) ? { connectivity: 'offline' } : {});
        }
      } finally {
        this.pulling = null;
      }
    })();
    return this.pulling;
  }

  /** Reset to an empty copy (used after the user's namespace is swept). */
  reset(): void {
    this.lastPullOk = false;
    this.state = emptyState();
    this.status = this.computeStatus(this.status.connectivity, null);
    this.listeners.forEach(fn => fn());
  }
}
