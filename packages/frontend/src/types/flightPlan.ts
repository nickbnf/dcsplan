
export type FlightPlanTurnPoint = {
  lat: number;
  lon: number;
}

export type FlightPlanLine = {
  start: FlightPlanTurnPoint;
  end: FlightPlanTurnPoint;
}

// Main type containing the full flight plan
export type FlightPlan = {
  points: FlightPlanTurnPoint[];
  lines: FlightPlanLine[];
}