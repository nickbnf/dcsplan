/**
 * Plan-index REST client (capability: space; AD-1, AD-15).
 *
 * The signed-in tier's Personal space and the plans it holds. Plan *content*
 * syncs over the WebSocket (useYjsFlightPlan); this client manages the index —
 * materialize the space, list, register (defer-commit). Plans are renamed only in
 * their document; the server keeps the listed name in step. All requests are
 * same-origin so the session cookie is sent automatically.
 */
import { getApiUrl } from '../config/api';
import type { LibraryObject, PerformanceProfile } from '../types/flightPlan';

export interface SpaceSummary {
  id: string;
  kind: string;
  /** The caller's role in the space: 'owner' for a Personal space. Absent from
   *  copies cached before roles were reported. */
  role?: string | null;
}

/** Roles that may restore from the space's Trash (add-trash-and-soft-delete D6);
 * mirrors the server's `can_restore`. */
export function canRestore(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export interface PlanSummary {
  id: string;
  name: string;
  theatre: string;
  updatedAt: string;
  lastEditor: string | null;
}

async function request(endpoint: string, init?: RequestInit): Promise<Response> {
  return fetch(getApiUrl(endpoint), {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/** The caller's Personal space, materialized on first access. */
export async function getMySpace(): Promise<SpaceSummary> {
  const resp = await request('spaces/me');
  if (!resp.ok) throw new Error(`Failed to load space (${resp.status})`);
  return resp.json();
}

/** The plans in the caller's Personal space. */
export async function listPlans(): Promise<PlanSummary[]> {
  const resp = await request('plans');
  if (!resp.ok) throw new Error(`Failed to list plans (${resp.status})`);
  return resp.json();
}

/** A failed plan-index request, carrying the HTTP status (e.g. 409 for a
 *  duplicate id, which an import retry treats as landed). */
export class PlanRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Register a plan in the caller's space: the defer-commit step, or an import
 *  that sends the plan's content along as its first Yjs update
 *  (`initialState`, add-local-data-import D1). */
export async function createPlan(plan: {
  id: string;
  name: string;
  theatre: string;
  initialState?: Uint8Array;
}): Promise<PlanSummary> {
  const { initialState, ...index } = plan;
  const body = initialState ? { ...index, initialState: toBase64(initialState) } : index;
  const resp = await request('plans', { method: 'POST', body: JSON.stringify(body) });
  if (!resp.ok) throw new PlanRequestError(`Failed to create plan (${resp.status})`, resp.status);
  return resp.json();
}


// --- Trash (capability: soft-delete; AD-7) -----------------------------------

export interface TrashedPlan {
  id: string;
  name: string;
  theatre: string;
  deletedAt: string;
}

export interface TrashedEntry {
  id: string;
  libraryId: string;
  theatre: string;
  entry: LibraryObject;
  deletedAt: string;
}

export interface TrashedProfile {
  id: string;
  profile: PerformanceProfile;
  deletedAt: string;
}

export interface TrashContents {
  plans: TrashedPlan[];
  entries: TrashedEntry[];
  profiles: TrashedProfile[];
  retentionDays: number;
}

/** Move a plan to the space's Trash. Requires a connection. */
export async function deletePlan(planId: string): Promise<void> {
  const resp = await request(`plans/${encodeURIComponent(planId)}`, { method: 'DELETE' });
  if (!resp.ok) throw new PlanRequestError(`Failed to delete plan (${resp.status})`, resp.status);
}

/** Everything trashed in the caller's space and not yet purged. */
export async function getTrash(): Promise<TrashContents> {
  const resp = await request('trash');
  if (!resp.ok) throw new PlanRequestError(`Failed to load the Trash (${resp.status})`, resp.status);
  return resp.json();
}

/** Bring a trashed plan back to the list (space admin only). */
export async function restorePlan(planId: string): Promise<PlanSummary> {
  const resp = await request(`plans/${encodeURIComponent(planId)}/restore`, { method: 'POST' });
  if (!resp.ok) throw new PlanRequestError(`Failed to restore plan (${resp.status})`, resp.status);
  return resp.json();
}


// --- Versions (capability: version-history; add-version-history D5) ----------

export interface VersionEditor {
  id: string;
  displayName: string | null;
}

/** A finalized version of a plan: `Rev N · date · editor`. */
export interface PlanVersion {
  rev: number;
  /** UTC ISO timestamp. */
  finalizedAt: string;
  /** Every user whose edits the version holds, last editor first. */
  editors: VersionEditor[];
  restoredFrom: number | null;
}

export interface PlanVersions {
  /** Newest first. */
  versions: PlanVersion[];
  /** Whether the plan has edits not yet in a version. */
  pending: boolean;
}

/** A library entry pinned by a version of the plan, for recovery (D7). */
export interface PinnedEntry {
  theatre: string;
  entry: LibraryObject;
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The editors of a version as shown: the last editor, then how many others
 *  (`Falcon +2`). */
export function formatEditors(editors: VersionEditor[]): string {
  if (editors.length === 0) return 'Unknown';
  const last = editors[0].displayName ?? 'Unknown';
  return editors.length > 1 ? `${last} +${editors.length - 1}` : last;
}

/** The plan's versions, newest first, and whether it has unfinalized edits. */
export async function listVersions(planId: string): Promise<PlanVersions> {
  const resp = await request(`plans/${encodeURIComponent(planId)}/versions`);
  if (!resp.ok) throw new PlanRequestError(`Failed to load versions (${resp.status})`, resp.status);
  return resp.json();
}

/** Hand the device's whole document state (`Y.encodeStateAsUpdate`) to the
 *  server and finalize any unfinalized edits. `restoredFrom` marks the state as
 *  a restore of that rev. Returns the plan's latest version, or null when the
 *  plan has no content yet. */
export async function finalizeVersion(
  planId: string,
  state: Uint8Array,
  restoredFrom?: number,
): Promise<PlanVersion | null> {
  const body = restoredFrom === undefined
    ? { update: toBase64(state) }
    : { update: toBase64(state), restoredFrom };
  const resp = await request(`plans/${encodeURIComponent(planId)}/versions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new PlanRequestError(`Failed to save a version (${resp.status})`, resp.status);
  return resp.json();
}

/** One version's full document state, to apply to a scratch `Y.Doc` (D6). */
export async function getVersionState(planId: string, rev: number): Promise<Uint8Array> {
  const resp = await request(`plans/${encodeURIComponent(planId)}/versions/${rev}/state`);
  if (!resp.ok) throw new PlanRequestError(`Failed to load Rev ${rev} (${resp.status})`, resp.status);
  const body: { state: string } = await resp.json();
  return fromBase64(body.state);
}

/** Every library entry a version of the plan pinned, keyed by id (D7). */
export async function getPinnedEntries(planId: string): Promise<Record<string, PinnedEntry>> {
  const resp = await request(`plans/${encodeURIComponent(planId)}/pinned-entries`);
  if (!resp.ok) throw new PlanRequestError(`Failed to load pinned entries (${resp.status})`, resp.status);
  const body: { entries: Record<string, PinnedEntry> } = await resp.json();
  return body.entries;
}
