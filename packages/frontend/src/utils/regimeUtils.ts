import type { FlightPlan, FlightPlanTurnPoint, Regime } from '../types/flightPlan';

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
