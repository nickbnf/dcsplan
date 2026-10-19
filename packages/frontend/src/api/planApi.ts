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

export interface SpaceSummary {
  id: string;
  kind: string;
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

