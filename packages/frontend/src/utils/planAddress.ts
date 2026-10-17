import { slugifyPlanName } from './flightPlanUtils';

/** A plan-scoped tab under a plan's address (AD-16). NAV is the address itself. */
export type PlanTab = 'nav' | 'perf' | 'attack';

/** The cosmetic slug for a plan name (`plan` when the name yields nothing). */
export function planSlug(name: string): string {
  return slugifyPlanName(name) || 'plan';
}

/** The canonical address of a plan's tab: `/p/:id/:slug[/perf|/attack]`. */
export function planPath(id: string, name: string, tab: PlanTab = 'nav'): string {
  const base = `/p/${id}/${planSlug(name)}`;
  return tab === 'nav' ? base : `${base}/${tab}`;
}
