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
