/**
 * Library + profile REST client (capability: space-asset-sync; AD-6, AD-17).
 *
 * Signed-in only: the caller's Personal space holds one library per theatre and
 * a flat list of performance profiles. Rows are written one at a time and are
 * last-write-wins as a whole; the server reports whether each write applied
 * (design D3). Changes come back through a single cursor-based feed. Requests
 * are same-origin so the session cookie is sent automatically.
 */
import { getApiUrl } from '../config/api';
import type { Aircraft, LibraryObject, PerformanceProfile } from '../types/flightPlan';

export interface ServerLibrary {
  id: string;
  theatre: string;
  name: string | null;
  parentId: string | null;
  seq: number;
}

export interface EntryRow {
  id: string;
  libraryId: string;
  seq: number;
  deleted: boolean;
  entry: LibraryObject | null;
}

export interface ProfileRow {
  id: string;
  seq: number;
  deleted: boolean;
  profile: PerformanceProfile | null;
}

export interface ChangeFeed {
  cursor: number;
  libraries: ServerLibrary[];
  entries: EntryRow[];
  profiles: ProfileRow[];
}

/** The outcome of a write: `applied: false` means the server kept its own row,
 * returned here (`null` when that row is a tombstone). */
export interface EntryWriteResult {
  applied: boolean;
  seq: number;
  entry: LibraryObject | null;
}

export interface ProfileWriteResult {
  applied: boolean;
  seq: number;
  profile: PerformanceProfile | null;
}

export interface DeleteResult {
  applied: boolean;
  seq: number;
}

/** A non-2xx answer from the server (as opposed to a network failure, which
 * rejects with the fetch error). */
export class AssetApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AssetApiError';
    this.status = status;
  }
}

async function request<T>(endpoint: string, what: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(getApiUrl(endpoint), {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!resp.ok) throw new AssetApiError(resp.status, `Failed to ${what} (${resp.status})`);
  return resp.json();
}

const enc = encodeURIComponent;

/** The space's libraries for a theatre: a list (AD-17), exactly one today. */
export function getLibraries(theatre: string): Promise<ServerLibrary[]> {
  return request(`libraries?theatre=${enc(theatre)}`, 'load libraries');
}

export function putEntry(
  libraryId: string, entry: LibraryObject, baseSeq: number | null,
): Promise<EntryWriteResult> {
  return request(`libraries/${enc(libraryId)}/entries/${enc(entry.id)}`, 'save library entry', {
    method: 'PUT',
    body: JSON.stringify({ baseSeq, entry }),
  });
}

export function deleteEntry(libraryId: string, entryId: string): Promise<DeleteResult> {
  return request(`libraries/${enc(libraryId)}/entries/${enc(entryId)}`, 'delete library entry', {
    method: 'DELETE',
  });
}

export function putProfile(
  profile: PerformanceProfile, baseSeq: number | null,
): Promise<ProfileWriteResult> {
  const body: { aircraft: Aircraft } = { aircraft: profile.aircraft };
  return request(`profiles/${enc(profile.id)}`, 'save profile', {
    method: 'PUT',
    body: JSON.stringify({ baseSeq, profile: body }),
  });
}

export function deleteProfile(profileId: string): Promise<DeleteResult> {
  return request(`profiles/${enc(profileId)}`, 'delete profile', { method: 'DELETE' });
}

/** Rows written after `since` (tombstones included) and the next cursor. */
export function getChanges(since: number): Promise<ChangeFeed> {
  return request(`changes?since=${since}`, 'load changes');
}
