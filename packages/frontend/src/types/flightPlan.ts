export type LegData = {
  course: number;
  distance: number;
}

// A single turn point
export type FlightPlanTurnPoint = {
  lat: number;
  lon: number;
  tas: number; // TAS going into this WP
  alt: number; // Altitude going into this WP
}

// Main type containing the full flight plan
export type FlightPlan = {
  points: FlightPlanTurnPoint[];
}