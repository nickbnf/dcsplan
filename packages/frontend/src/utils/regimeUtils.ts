import type { FlightPlan, FlightPlanTurnPoint, Regime } from '../types/flightPlan';

/** Sets regimeId on a waypoint and mirrors the regime's cruise TAS/FF onto it. */
export function applyRegimeToWaypoint(
  waypoint: FlightPlanTurnPoint,
  regime: Regime
): FlightPlanTurnPoint {
  return { ...waypoint, regimeId: regime.id, tas: regime.cruise.tas, fuelFlow: regime.cruise.ff };
}

/** Clears the regimeId from a waypoint, leaving tas/fuelFlow at their current values. */
export function clearRegimeBinding(waypoint: FlightPlanTurnPoint): FlightPlanTurnPoint {
  const updated = { ...waypoint };
  delete updated.regimeId;
  return updated;
}

/** Walks every waypoint bound to the given regime and updates cruise TAS/FF to match. */
export function propagateRegimeCruiseChange(plan: FlightPlan, regime: Regime): FlightPlan {
  const newPoints = plan.points.map(p =>
    p.regimeId === regime.id
      ? { ...p, tas: regime.cruise.tas, fuelFlow: regime.cruise.ff }
      : p
  );
  return { ...plan, points: newPoints };
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
