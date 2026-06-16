/**
 * A named performance regime. `climb` describes climbing UP TO this regime's cruise altitude;
 * `descent` describes descending DOWN TO it (both are start-of-leg transitions toward legAlt).
 */
export type Regime = {
  id: string;       // opaque, generated on creation, immutable
  name: string;     // user-facing label, unique within plan
  comment?: string; // free-form note
  cruise: { tas: number; ff: number };
  climb?: { tas: number; ff: number; roc: number };   // fpm
  descent?: { tas: number; ff: number; rod: number }; // fpm
}

export type TakeoffPerformance = {
  timeSec: number;   // seconds
  fuel: number;      // lbs
  distance: number;  // NM
}

export type Aircraft = {
  model: string;
  takeoffConfiguration: string;
  taxiFuel: number;  // lbs
  takeoff: TakeoffPerformance;
  regimes: Regime[];
}

export function defaultAircraft(): Aircraft {
  return {
    model: '',
    takeoffConfiguration: '',
    taxiFuel: 0,
    takeoff: { timeSec: 0, fuel: 0, distance: 0 },
    regimes: [],
  };
}

export type Wind = { windSpeed: number; windDir: number };

export type LegSegmentsLevel = { kind: 'level'; tas: number; ff: number };
export type LegSegmentsSegmented = {
  kind: 'segmented';
  takeoff?: { time: number; distance: number; fuel: number };
  transition: { phase: 'climb' | 'descent'; time: number; distance: number; fuel: number };
  cruise: { time: number; distance: number; fuel: number };
};
export type LegSegmentsWarning = {
  kind: 'warning';
  reason: 'transition-too-long';
  reachableAltDelta: number;
  transitionDistance: number;
  fallbackTimeSec: number;
  fallbackFuel: number;
};
export type LegSegmentsResult = LegSegmentsLevel | LegSegmentsSegmented | LegSegmentsWarning;

export type LegData = {
  course: number;
  distance: number;
  legFuel: number;
  heading: number;
  ete: number; // ETE for this leg, in seconds
  eta: number; // ETA at this TP, in seconds since midnight
  efr: number; // EFR at this TP, unitless (typically in lbs)
  hackEta?: number; // Hack-relative ETA in seconds (present after a hack push point)
  segmentsResult?: LegSegmentsResult;
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
  groundAlt?: number; // Field elevation (ft MSL); meaningful only on first and last waypoints
  name?: string; // Name of the turnpoint
  waypointType?: WaypointType; // defaults to 'normal'
  exitTimeSec?: number; // Push only: exit time in seconds since midnight
  hack?: boolean; // Push only: HACK enabled
  comment?: string; // Optional free-text note for the kneeboard
  regimeId?: string; // Optional reference to a regime in the plan's regimes collection
}

export type FlightPlanPointChange = {
  tas?: number;
  alt?: number;
  fuelFlow?: number;
  windSpeed?: number;
  windDir?: number;
  groundAlt?: number;
  name?: string;
  waypointType?: WaypointType;
  exitTimeSec?: number;
  hack?: boolean;
  comment?: string;
  regimeId?: string;
}

// Attack planning types
export type AttackPlanningParams = {
  attackType: 'oblique_popup' | 'oblique_popup_l';
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
  ingressHeading: number;     // degrees (IP→TGT bearing)
  ingressTas: number;         // knots (IP leg TAS)
  climbHeading: number;       // degrees (IP→TGT heading + angleOff)
  runInHeading: number;       // degrees (bearing EoRI → TGT, computed)
  runInDistance: number;      // nm (horizontal distance EoRI → TGT = cone radius)
  climbDistance: number;      // nm (horizontal distance PUP → roll-in point)
  ingressAlt: number;         // feet AMSL (altitude of IP→TGT leg, from TGT waypoint)
  apexAlt: number;            // feet AMSL (apex altitude, from params)
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
  pupToTgtDistance: number;     // nm (straight-line PUP → TGT)
  pupToTgtTime: number;         // seconds (straight-line at diveTas, no wind)
}

// Pictogram type identifier from the closed catalog
export type PictogramType =
  | 'sam_site'
  | 'aaa'
  | 'manpads'
  | 'radar'
  | 'troops'
  | 'flot'
  | 'radio_tower'
  | 'bridge'
  | 'city'
  | 'village'
  | 'church'
  | 'factory'
  | 'farm'
  | 'farp'
  | 'friendly_forces'
  | 'checkpoint'
  | 'generic_marker'
  | 'marker_1'
  | 'marker_2'
  | 'marker_3';

// A library entry: a reusable per-theatre map object
export type LibraryObject = {
  id: string;               // stable UUID, immutable, generated on creation
  type: PictogramType;
  lat: number;
  lon: number;
  name?: string;
  defaultComment?: string;
  range?: number;           // NM — only present when type is ranged
}

// A flight-plan reference to a library object with optional per-plan comment override
export type PlanLibraryRef = {
  uuid: string;     // references LibraryObject.id
  comment?: string; // per-plan override
}

// A plan-local marker (not backed by the library)
export type PlanMarker = {
  id: string;       // stable UUID, generated on creation
  type: PictogramType;
  lat: number;
  lon: number;
  name?: string;
  range?: number;   // NM — only present when type is ranged
  comment?: string;
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
  libraryRefs?: PlanLibraryRef[];
  markers?: PlanMarker[];
  attackPlanning?: {        // optional; params are user-supplied, results are computed on Calculate
    params: AttackPlanningParams;
    results?: AttackPlanningResults;
  };
}

export const FLIGHT_PLAN_VERSION = "1.5";
export const PERFORMANCE_FILE_VERSION = "1.0";
export const LIBRARY_FILE_VERSION = "1.0";

export interface VersionedFlightPlan {
  version: string;
  flightPlan: FlightPlan;
  librarySnapshot?: LibraryObject[];    // embedded on export for standalone files
  performanceSnapshot?: Aircraft;       // embedded on export for standalone files
}

export interface PerformanceFileV1 {
  version: string;
  aircraft: Aircraft;
}

export interface LibraryFile {
  version: string;
  library: LibraryObject[];
}
