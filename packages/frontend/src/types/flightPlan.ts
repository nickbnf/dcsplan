export type LegData = {
  course: number;
  distance: number;
  legFuel: number;
  heading: number;
  ete: number; // ETE for this leg, in seconds
  eta: number; // ETA at this TP, in seconds since midnight
  efr: number; // EFR at this TP, unitless (typically in lbs)
}

// A single turn point
export type FlightPlanTurnPoint = {
  lat: number;
  lon: number;
  tas: number; // TAS going into this WP
  alt: number; // Altitude going into this WP
  fuelFlow: number; // Fuel flow going into this WP
  windSpeed: number; // Wind speed at this WP
  windDir: number; // Wind direction (dir the wind is coming from)at this WP
  name?: string; // Name of the turnpoint
}

export type FlightPlanPointChange = {
  tas?: number;
  alt?: number;
  fuelFlow?: number;
  windSpeed?: number;
  windDir?: number;
  name?: string;
}

// Main type containing the full flight plan
export type FlightPlan = {
  points: FlightPlanTurnPoint[];
  declination: number;
  bankAngle: number; // Bank angle for turns (degrees, 5-85)
  initTimeSec: number; // Initial time in seconds since midnight
  initFob: number;
}
