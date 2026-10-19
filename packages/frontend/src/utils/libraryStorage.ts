import type { LibraryObject, LibraryFile } from '../types/flightPlan';
import { LIBRARY_FILE_VERSION } from '../types/flightPlan';

const libraryKey = (theatreId: string): string => `dcsplan.library.${theatreId}`;

// ── Storage layer ────────────────────────────────────────────────────────────

export function loadLibrary(theatreId: string): LibraryObject[] {
  try {
    const raw = localStorage.getItem(libraryKey(theatreId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidLibraryObject) : [];
  } catch {
    return [];
  }
}

export function saveLibrary(theatreId: string, library: LibraryObject[]): void {
  try {
    localStorage.setItem(libraryKey(theatreId), JSON.stringify(library));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded, library not persisted');
    }
  }
}

export function clearLibrary(theatreId: string): void {
  try {
    localStorage.removeItem(libraryKey(theatreId));
  } catch {
    // ignore
  }
}

const LIBRARY_KEY_PREFIX = 'dcsplan.library.';

/** Every non-empty device-local library, by theatre (local-data-migration). */
export function listLocalLibraries(): Record<string, LibraryObject[]> {
  const result: Record<string, LibraryObject[]> = {};
  try {
    const theatres: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LIBRARY_KEY_PREFIX)) theatres.push(key.slice(LIBRARY_KEY_PREFIX.length));
    }
    for (const theatre of theatres) {
      const entries = loadLibrary(theatre);
      if (entries.length > 0) result[theatre] = entries;
    }
  } catch {
    // storage unavailable: no local libraries
  }
  return result;
}

/** Remove the given entries from a theatre's device-local library, and the
 *  library itself once it is empty (an import moved them to the account). */
export function removeLocalEntries(theatreId: string, uuids: Iterable<string>): void {
  const gone = new Set(uuids);
  const remaining = loadLibrary(theatreId).filter(e => !gone.has(e.id));
  if (remaining.length === 0) clearLibrary(theatreId);
  else saveLibrary(theatreId, remaining);
}

// ── File format ──────────────────────────────────────────────────────────────

function isValidLibraryObject(obj: unknown): obj is LibraryObject {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.type === 'string' &&
    typeof o.lat === 'number' &&
    typeof o.lon === 'number'
  );
}

export interface LibraryParseResult {
  ok: true;
  library: LibraryObject[];
}

export interface LibraryParseError {
  ok: false;
  error: string;
}

export type LibraryParseOutcome = LibraryParseResult | LibraryParseError;

export function parseLibraryFile(data: unknown): LibraryParseOutcome {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Invalid format: expected a JSON object' };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== 'string') {
    return { ok: false, error: 'Invalid format: missing version field' };
  }

  if (!Array.isArray(obj.library)) {
    return { ok: false, error: 'Invalid format: missing library array' };
  }

  const valid = obj.library.filter(isValidLibraryObject) as LibraryObject[];
  const skipped = obj.library.length - valid.length;
  if (skipped > 0) {
    console.warn(`Skipped ${skipped} invalid library entries during import`);
  }

  return { ok: true, library: valid };
}

export function serializeLibraryFile(library: LibraryObject[]): LibraryFile {
  return { version: LIBRARY_FILE_VERSION, library };
}

// ── Merge helpers ────────────────────────────────────────────────────────────

export interface MergeResult {
  merged: LibraryObject[];
  added: number;
  kept: number;
}

/** Merge incoming entries into current library. Existing UUIDs are left unchanged. */
export function mergeLibraryEntries(
  current: LibraryObject[],
  incoming: LibraryObject[]
): MergeResult {
  const existingIds = new Set(current.map(e => e.id));
  const toAdd = incoming.filter(e => !existingIds.has(e.id));
  return {
    merged: [...current, ...toAdd],
    added: toAdd.length,
    kept: incoming.length - toAdd.length,
  };
}

/** Replace current library entirely with incoming entries. */
export function replaceLibraryEntries(incoming: LibraryObject[]): MergeResult {
  return { merged: incoming, added: incoming.length, kept: 0 };
}

// The fields a library entry owns (as opposed to a plan's per-ref comment).
const LIBRARY_OWNED_FIELDS = ['type', 'lat', 'lon', 'name', 'defaultComment', 'range'] as const;

/** Whether two entries with the same id differ in any library-owned field. */
export function libraryEntryDiffers(a: LibraryObject, b: LibraryObject): boolean {
  return LIBRARY_OWNED_FIELDS.some(f => (a[f] ?? null) !== (b[f] ?? null));
}

export interface SnapshotMergeSummary {
  /** Entries not in the library: they will be added. */
  added: number;
  /** Entries already in the library: the library's copy is kept. */
  kept: number;
  /** Of the kept entries, those whose library copy differs from the file. */
  differs: number;
}

/** Preview of merging a plan file's library snapshot (map-objects: library
 * snapshot merge on plan import). Existing entries are never changed. */
export function summarizeSnapshotMerge(
  current: LibraryObject[],
  incoming: LibraryObject[],
): SnapshotMergeSummary {
  const byId = new Map(current.map(e => [e.id, e]));
  let added = 0;
  let differs = 0;
  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    if (!existing) added++;
    else if (libraryEntryDiffers(existing, entry)) differs++;
  }
  return { added, kept: incoming.length - added, differs };
}

