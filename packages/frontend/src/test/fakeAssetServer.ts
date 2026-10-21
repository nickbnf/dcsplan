/**
 * In-memory stand-in for the library/profile routes, following the server's
 * write rules (design D3), so several AssetSync instances can act as devices of
 * one user. `offline` makes every call fail like a network error; `hold()`
 * pauses the next call until released, to test writes that are in flight.
 * A delete keeps the row's data (it is in the Trash) until `purge()`;
 * `restore()` brings it back as the Trash would (add-trash-and-soft-delete D1).
 */
import type {
  ChangeFeed, DeleteResult, EntryRow, EntryWriteResult, ProfileRow, ProfileWriteResult, ServerLibrary,
} from '../api/assetApi';
import type { AssetApi } from '../sync/assetSync';
import type { LibraryObject, PerformanceProfile } from '../types/flightPlan';

interface Row<T> { data: T | null; seq: number; libraryId?: string; deleted?: boolean }

export class FakeAssetServer {
  offline = false;
  calls: string[] = [];
  private seq = 0;
  private libraries = new Map<string, ServerLibrary>();
  private entries = new Map<string, Row<LibraryObject>>();
  private profiles = new Map<string, Row<PerformanceProfile>>();
  private gate: { promise: Promise<void>; release: () => void } | null = null;

  /** Pause the next call until the returned function is called. */
  hold(): () => void {
    let release!: () => void;
    const promise = new Promise<void>(r => { release = r; });
    this.gate = { promise, release };
    return release;
  }

  private async enter(name: string): Promise<void> {
    this.calls.push(name);
    if (this.gate) {
      const g = this.gate;
      this.gate = null;
      await g.promise;
    }
    if (this.offline) throw new TypeError('Failed to fetch');
  }

  private applies(row: Row<unknown> | undefined, baseSeq: number | null): boolean {
    if (!row) return true;
    if (!row.deleted) return baseSeq !== null;
    return baseSeq === null;
  }

  private rows(kind: 'entry' | 'profile'): Map<string, Row<unknown>> {
    return kind === 'entry' ? this.entries : this.profiles;
  }

  /** Restore a trashed row from the Trash, as the space admin would. */
  restore(kind: 'entry' | 'profile', id: string): void {
    const row = this.rows(kind).get(id);
    if (!row?.deleted || row.data === null) throw new Error(`${kind} ${id} is not in the Trash`);
    this.rows(kind).set(id, { ...row, deleted: false, seq: ++this.seq });
  }

  /** Purge a trashed row: its data is dropped, the tombstone stays. */
  purge(kind: 'entry' | 'profile', id: string): void {
    const row = this.rows(kind).get(id);
    if (!row?.deleted) throw new Error(`${kind} ${id} is not deleted`);
    this.rows(kind).set(id, { ...row, data: null, seq: ++this.seq });
  }

  /** Write directly on the server, as another device would. */
  seedEntry(theatre: string, entry: LibraryObject): number {
    const lib = this.library(theatre);
    this.entries.set(entry.id, { data: entry, seq: ++this.seq, libraryId: lib.id });
    return this.seq;
  }

  /** The live row's data, null for a deleted row, undefined for none. */
  entryOnServer(id: string): LibraryObject | null | undefined {
    const row = this.entries.get(id);
    return row && (row.deleted ? null : row.data);
  }

  profileOnServer(id: string): PerformanceProfile | null | undefined {
    const row = this.profiles.get(id);
    return row && (row.deleted ? null : row.data);
  }

  private library(theatre: string): ServerLibrary {
    const found = [...this.libraries.values()].find(l => l.theatre === theatre);
    if (found) return found;
    const lib = { id: `lib-${theatre}`, theatre, name: null, parentId: null, seq: ++this.seq };
    this.libraries.set(lib.id, lib);
    return lib;
  }

  api: AssetApi = {
    getLibraries: async (theatre: string) => {
      await this.enter(`getLibraries ${theatre}`);
      return [this.library(theatre)];
    },
    putEntry: async (libraryId: string, entry: LibraryObject, baseSeq: number | null): Promise<EntryWriteResult> => {
      await this.enter(`putEntry ${entry.id} base=${baseSeq}`);
      const row = this.entries.get(entry.id);
      if (this.applies(row, baseSeq)) {
        this.entries.set(entry.id, { data: entry, seq: ++this.seq, libraryId });
        return { applied: true, seq: this.seq, entry };
      }
      return { applied: false, seq: row!.seq, entry: row!.deleted ? null : row!.data };
    },
    deleteEntry: async (libraryId: string, entryId: string): Promise<DeleteResult> => {
      await this.enter(`deleteEntry ${entryId}`);
      const row = this.entries.get(entryId);
      if (row?.deleted) return { applied: false, seq: row.seq };
      this.entries.set(entryId, { data: row?.data ?? null, seq: ++this.seq, libraryId, deleted: true });
      return { applied: true, seq: this.seq };
    },
    putProfile: async (profile: PerformanceProfile, baseSeq: number | null): Promise<ProfileWriteResult> => {
      await this.enter(`putProfile ${profile.id} base=${baseSeq}`);
      const row = this.profiles.get(profile.id);
      if (this.applies(row, baseSeq)) {
        this.profiles.set(profile.id, { data: profile, seq: ++this.seq });
        return { applied: true, seq: this.seq, profile };
      }
      return { applied: false, seq: row!.seq, profile: row!.deleted ? null : row!.data };
    },
    deleteProfile: async (profileId: string): Promise<DeleteResult> => {
      await this.enter(`deleteProfile ${profileId}`);
      const row = this.profiles.get(profileId);
      if (row?.deleted) return { applied: false, seq: row.seq };
      this.profiles.set(profileId, { data: row?.data ?? null, seq: ++this.seq, deleted: true });
      return { applied: true, seq: this.seq };
    },
    getChanges: async (since: number): Promise<ChangeFeed> => {
      await this.enter(`getChanges ${since}`);
      const libraries = [...this.libraries.values()].filter(l => l.seq > since);
      const entries: EntryRow[] = [...this.entries.entries()]
        .filter(([, r]) => r.seq > since)
        .map(([id, r]) => ({
          id, libraryId: r.libraryId!, seq: r.seq, deleted: !!r.deleted,
          trashed: !!r.deleted && r.data !== null, entry: r.deleted ? null : r.data,
        }));
      const profiles: ProfileRow[] = [...this.profiles.entries()]
        .filter(([, r]) => r.seq > since)
        .map(([id, r]) => ({
          id, seq: r.seq, deleted: !!r.deleted,
          trashed: !!r.deleted && r.data !== null, profile: r.deleted ? null : r.data,
        }));
      const seqs = [...libraries, ...entries, ...profiles].map(r => r.seq);
      return { cursor: Math.max(since, ...seqs), libraries, entries, profiles };
    },
  };
}
