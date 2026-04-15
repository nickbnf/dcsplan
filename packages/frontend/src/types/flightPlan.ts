export type LegData = {
  course: number;
  distance: number;
  legFuel: number;
  heading: number;
  ete: number; // ETE for this leg, in seconds
  eta: number; // ETA at this TP, in seconds since midnight
  efr: number; // EFR at this TP, unitless (typically in lbs)
  hackEta?: number; // Hack-relative ETA in seconds (present after a hack push point)
}

export type WaypointType = 'normal' | 'push' | 'ip' | 'tgt';

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
  waypointType?: WaypointType; // defaults to 'normal'
  exitTimeSec?: number; // Push only: exit time in seconds since midnight
  hack?: boolean; // Push only: HACK enabled
}

export type FlightPlanPointChange = {
  tas?: number;
  alt?: number;
  fuelFlow?: number;
  windSpeed?: number;
  windDir?: number;
  name?: string;
  waypointType?: WaypointType;
  exitTimeSec?: number;
  hack?: boolean;
}

// Attack planning types
export type AttackPlanningParams = {
  attackType: 'oblique_popup';
  angleOff: 30 | 45 | 60;    // degrees, dropdown
  climbTas: number;           // knots
  climbAngle: number;         // degrees
  diveAngle: number;          // degrees
  apexAltitude: number;       // feet
  dropAltitude: number;       // feet
  targetAltitude: number;     // feet
  windDir: number;            // degrees (direction wind is coming from)
  windSpeed: number;          // knots
  rollInG: number;            // g-load for roll-in and PUP turns
  diveTas: number;            // knots — speed during dive (used for run-in time)
}

export type AttackPlanningResults = {
  climbHeading: number;       // degrees (IP→TGT heading + angleOff)
  runInHeading: number;       // degrees (bearing EoRI → TGT, computed)
  runInDistance: number;      // nm (horizontal distance EoRI → TGT = cone radius)
  climbDistance: number;      // nm (horizontal distance PUP → roll-in point)
  ingressAlt: number;         // feet AMSL (altitude of IP→TGT leg, from TGT waypoint)
  ipToPupTime: number;        // seconds (IP to PUP, based on IP leg TAS/wind)
  climbTime: number;          // seconds (wind-corrected)
  runInTime: number;          // seconds (wind-corrected, EoRI to drop point)
  dropLat: number;            // latitude of drop point (for diagram)
  dropLon: number;            // longitude of drop point (for diagram)
  endOfRollInLat: number;
  endOfRollInLon: number;
  rollInLat: number;
  rollInLon: number;
  ectLat: number;             // End of Climbing Turn (start of straight climb)
  ectLon: number;
  pupLat: number;
  pupLon: number;
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
  attackPlanning?: {        // optional; params are user-supplied, results are computed on Calculate
    params: AttackPlanningParams;
    results?: AttackPlanningResults;
  };
}

export const FLIGHT_PLAN_VERSION = "1.1";

export interface VersionedFlightPlan {
  version: string;
  flightPlan: FlightPlan;
}
