/**
 * In-memory stand-in for the library/profile routes, following the server's
 * write rules (design D3), so several AssetSync instances can act as devices of
 * one user. `offline` makes every call fail like a network error; `hold()`
 * pauses the next call until released, to test writes that are in flight.
 */
import type {
  ChangeFeed, DeleteResult, EntryRow, EntryWriteResult, ProfileRow, ProfileWriteResult, ServerLibrary,
} from '../api/assetApi';
import type { AssetApi } from '../sync/assetSync';
import type { LibraryObject, PerformanceProfile } from '../types/flightPlan';

interface Row<T> { data: T | null; seq: number; libraryId?: string }

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
    if (row.data !== null) return baseSeq !== null;
    return baseSeq === null;
  }

  /** Write directly on the server, as another device would. */
  seedEntry(theatre: string, entry: LibraryObject): number {
    const lib = this.library(theatre);
    this.entries.set(entry.id, { data: entry, seq: ++this.seq, libraryId: lib.id });
    return this.seq;
  }

  entryOnServer(id: string): LibraryObject | null | undefined {
    return this.entries.get(id)?.data;
  }

  profileOnServer(id: string): PerformanceProfile | null | undefined {
    return this.profiles.get(id)?.data;
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
      return { applied: false, seq: row!.seq, entry: row!.data };
    },
    deleteEntry: async (libraryId: string, entryId: string): Promise<DeleteResult> => {
      await this.enter(`deleteEntry ${entryId}`);
      const row = this.entries.get(entryId);
      if (row && row.data === null) return { applied: false, seq: row.seq };
      this.entries.set(entryId, { data: null, seq: ++this.seq, libraryId });
      return { applied: true, seq: this.seq };
    },
    putProfile: async (profile: PerformanceProfile, baseSeq: number | null): Promise<ProfileWriteResult> => {
      await this.enter(`putProfile ${profile.id} base=${baseSeq}`);
      const row = this.profiles.get(profile.id);
      if (this.applies(row, baseSeq)) {
        this.profiles.set(profile.id, { data: profile, seq: ++this.seq });
        return { applied: true, seq: this.seq, profile };
      }
      return { applied: false, seq: row!.seq, profile: row!.data };
    },
    deleteProfile: async (profileId: string): Promise<DeleteResult> => {
      await this.enter(`deleteProfile ${profileId}`);
      const row = this.profiles.get(profileId);
      if (row && row.data === null) return { applied: false, seq: row.seq };
      this.profiles.set(profileId, { data: null, seq: ++this.seq });
      return { applied: true, seq: this.seq };
    },
    getChanges: async (since: number): Promise<ChangeFeed> => {
      await this.enter(`getChanges ${since}`);
      const libraries = [...this.libraries.values()].filter(l => l.seq > since);
      const entries: EntryRow[] = [...this.entries.entries()]
        .filter(([, r]) => r.seq > since)
        .map(([id, r]) => ({ id, libraryId: r.libraryId!, seq: r.seq, deleted: r.data === null, entry: r.data }));
      const profiles: ProfileRow[] = [...this.profiles.entries()]
        .filter(([, r]) => r.seq > since)
        .map(([id, r]) => ({ id, seq: r.seq, deleted: r.data === null, profile: r.data }));
      const seqs = [...libraries, ...entries, ...profiles].map(r => r.seq);
      return { cursor: Math.max(since, ...seqs), libraries, entries, profiles };
    },
  };
}
