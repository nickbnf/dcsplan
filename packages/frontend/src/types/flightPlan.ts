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
  theatre: string;
  points: FlightPlanTurnPoint[];
  declination: number;
  bankAngle: number; // Bank angle for turns (degrees, 5-85)
  initTimeSec: number; // Initial time in seconds since midnight
  initFob: number;
  name: string; // Name of the flight plan
}

export const FLIGHT_PLAN_VERSION = "1.1";

export interface VersionedFlightPlan {
  version: string;
  flightPlan: FlightPlan;
}
