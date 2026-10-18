import type { Aircraft, FlightPlan, FlightPlanTurnPoint, Regime } from '../types/flightPlan';

/** Sets regimeId on a waypoint; TAS/FF are resolved from the regime at computation time. */
export function applyRegimeToWaypoint(
  waypoint: FlightPlanTurnPoint,
  regime: Regime
): FlightPlanTurnPoint {
  return { ...waypoint, regimeId: regime.id };
}

/** Clears the regimeId from a waypoint, leaving tas/fuelFlow at their current values. */
export function clearRegimeBinding(waypoint: FlightPlanTurnPoint): FlightPlanTurnPoint {
  const updated = { ...waypoint };
  delete updated.regimeId;
  return updated;
}

/** Clears regimeId from all waypoints that reference the given regimeId, retaining their TAS/FF. */
export function clearRegimeFromAllWaypoints(plan: FlightPlan, regimeId: string): FlightPlan {
  const newPoints = plan.points.map(p => {
    if (p.regimeId !== regimeId) return p;
    const updated = { ...p };
    delete updated.regimeId;
    return updated;
  });
  return { ...plan, points: newPoints };
}

/** The number of legs bound to a regime of `aircraft`. A `regimeId` that does
 * not resolve in it (an orphan) is not bound (performance-regime). */
export function countBoundLegs(plan: FlightPlan, aircraft: Aircraft): number {
  const ids = new Set(aircraft.regimes.map(r => r.id));
  return plan.points.filter(p => p.regimeId && ids.has(p.regimeId)).length;
}

/** Point the plan at another profile (or none), clearing only the legs bound
 * to the current profile's regimes; orphans are kept and may resolve in the
 * new profile (performance-profile, profile switching). */
export function switchPlanProfile(plan: FlightPlan, current: Aircraft, profileId: string | null): FlightPlan {
  const ids = new Set(current.regimes.map(r => r.id));
  const points = plan.points.map(p => (p.regimeId && ids.has(p.regimeId) ? clearRegimeBinding(p) : p));
  const next: FlightPlan = { ...plan, points };
  if (profileId === null) delete next.profileId;
  else next.profileId = profileId;
  return next;
}
