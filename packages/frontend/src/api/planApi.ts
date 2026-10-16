/**
 * Plan-index REST client (capability: space; AD-1, AD-15).
 *
 * The signed-in tier's Personal space and the plans it holds. Plan *content*
 * syncs over the WebSocket (useYjsFlightPlan); this client manages the index —
 * materialize the space, list, register (defer-commit), rename. All requests are
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

/** A plan name already used by another plan in the same space (A1). */
export class DuplicatePlanNameError extends Error {
  constructor(name?: string) {
    super(name ? `A plan named "${name}" already exists` : 'A plan with that name already exists');
    this.name = 'DuplicatePlanNameError';
  }
}

/** The plan does not exist in the caller's space. */
export class PlanNotFoundError extends Error {
  constructor() {
    super('Plan not found');
    this.name = 'PlanNotFoundError';
  }
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

/** Register a plan in the caller's space (the defer-commit step). */
export async function createPlan(plan: {
  id: string;
  name: string;
  theatre: string;
}): Promise<PlanSummary> {
  const resp = await request('plans', { method: 'POST', body: JSON.stringify(plan) });
  if (resp.status === 409) throw new DuplicatePlanNameError(plan.name);
  if (!resp.ok) throw new Error(`Failed to create plan (${resp.status})`);
  return resp.json();
}

/** Rename a plan the caller owns. */
export async function renamePlan(id: string, name: string): Promise<PlanSummary> {
  const resp = await request(`plans/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  if (resp.status === 409) throw new DuplicatePlanNameError(name);
  if (resp.status === 404) throw new PlanNotFoundError();
  if (!resp.ok) throw new Error(`Failed to rename plan (${resp.status})`);
  return resp.json();
}
