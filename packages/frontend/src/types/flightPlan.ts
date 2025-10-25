export type LegData = {
  course: number;
  distance: number;
  ete: number;
  legFuel: number;
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
}

export type FlightPlanPointChange = {
  tas?: number;
  alt?: number;
  fuelFlow?: number;
  windSpeed?: number;
  windDir?: number;
}

// Main type containing the full flight plan
export type FlightPlan = {
  points: FlightPlanTurnPoint[];
  declination: number;
  initTimeHour: number;
  initTimeMin: number;
  initFob: number;
}