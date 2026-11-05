import type { Aircraft, FlightPlan, Regime, TakeoffPerformance, Wind } from '../types/flightPlan';
import { transform } from 'ol/proj';
import { effectiveTas } from './regimeUtils';

/** Straight-out distance used when the profile has none (departure). */
export const DEFAULT_STRAIGHT_OUT_NM = 2;

/** Along-track distance from brake release to the departure turn, in NM. */
export function straightOutDistanceNm(aircraft: Aircraft): number {
  return aircraft.straightOutDistance ?? DEFAULT_STRAIGHT_OUT_NM;
}

// --- Phase predicates, shared by computeLegSegments and the departure schedule ---

/** Whether leg 1 gets a take-off segment (aircraft-performance, "Take-off segment on leg 1"). */
export function isTakeoffActive(
  legIndex: number | undefined,
  regime: Regime | undefined,
  takeoff: TakeoffPerformance | undefined
): boolean {
  return legIndex === 0 && regime !== undefined && takeoff !== undefined && takeoff.timeSec > 0 && takeoff.distance > 0;
}

export type TransitionPhase = { phase: 'climb' | 'descent'; tas: number; ff: number; rate: number /* fpm */ };

/** The climb or descent flown at the start of a leg, if the regime has matching data. */
export function transitionPhase(altDelta: number, regime: Regime | undefined): TransitionPhase | undefined {
  if (!regime || altDelta === 0) return undefined;
  if (altDelta > 0) {
    return regime.climb ? { phase: 'climb', tas: regime.climb.tas, ff: regime.climb.ff, rate: regime.climb.roc } : undefined;
  }
  return regime.descent ? { phase: 'descent', tas: regime.descent.tas, ff: regime.descent.ff, rate: regime.descent.rod } : undefined;
}

// --- Speed schedule (design D1) ---

type SchedulePiece = {
  t0: number; // seconds from brake release
  t1: number;
  tasAt: (t: number) => number;       // knots
  distanceTo: (t: number) => number;  // NM flown from t0 to t (t0 <= t <= t1)
};

/** TAS as a function of time from brake release, for leg 1 of a departure. */
export type DepartureSchedule = {
  takeoffEndSec: number;    // 0 when there is no take-off phase
  transitionEndSec: number; // equals takeoffEndSec when there is no climb or descent
  pieces: SchedulePiece[];  // the last piece is open-ended (cruise)
};

function constantPiece(t0: number, t1: number, tas: number): SchedulePiece {
  return { t0, t1, tasAt: () => tas, distanceTo: (t) => tas * (t - t0) / 3600 };
}

/**
 * Take-off speed v(t) = Vc·(t/T)^p with p = Vc·T/D − 1, reaching Vc after exactly D.
 * When D ≥ Vc·T the data is inconsistent and the phase is flown at the constant D/T.
 */
function takeoffPiece(timeSec: number, distanceNm: number, vc: number): SchedulePiece {
  const vcT = vc * timeSec / 3600; // NM flown at Vc over T
  if (distanceNm >= vcT) return constantPiece(0, timeSec, distanceNm * 3600 / timeSec);
  const p = vcT / distanceNm - 1;
  return {
    t0: 0,
    t1: timeSec,
    tasAt: (t) => vc * Math.pow(t / timeSec, p),
    distanceTo: (t) => distanceNm * Math.pow(t / timeSec, p + 1),
  };
}

export function departureSchedule(flightPlan: FlightPlan, aircraft: Aircraft): DepartureSchedule {
  const origin = flightPlan.points[0];
  const destination = flightPlan.points[1];
  const regime = destination.regimeId ? aircraft.regimes.find(r => r.id === destination.regimeId) : undefined;
  const transition = transitionPhase(destination.alt - (origin.groundAlt ?? 0), regime);
  const cruiseTas = effectiveTas(destination, aircraft);
  const vc = transition ? transition.tas : cruiseTas;

  const pieces: SchedulePiece[] = [];
  let t = 0;
  if (isTakeoffActive(0, regime, aircraft.takeoff)) {
    pieces.push(takeoffPiece(aircraft.takeoff.timeSec, aircraft.takeoff.distance, vc));
    t = aircraft.takeoff.timeSec;
  }
  const takeoffEndSec = t;
  if (transition) {
    const durationSec = Math.abs(destination.alt - (origin.groundAlt ?? 0)) / transition.rate * 60;
    pieces.push(constantPiece(t, t + durationSec, transition.tas));
    t += durationSec;
  }
  pieces.push(constantPiece(t, Infinity, cruiseTas));
  return { takeoffEndSec, transitionEndSec: t, pieces };
}

function pieceAt(schedule: DepartureSchedule, t: number): SchedulePiece {
  return schedule.pieces.find(p => t < p.t1) ?? schedule.pieces[schedule.pieces.length - 1];
}

export function scheduleTasAt(schedule: DepartureSchedule, t: number): number {
  return pieceAt(schedule, t).tasAt(t);
}

/** Air distance (NM) flown between t0 and t1, exact for every piece. */
export function scheduleAirDistanceNm(schedule: DepartureSchedule, t0: number, t1: number): number {
  let total = 0;
  for (const p of schedule.pieces) {
    const a = Math.max(t0, p.t0);
    const b = Math.min(t1, p.t1);
    if (b > a) total += p.distanceTo(b) - p.distanceTo(a);
  }
  return total;
}

/** Time (s) at which the cumulative air distance from brake release reaches `distanceNm`. */
function timeAtAirDistance(schedule: DepartureSchedule, distanceNm: number): number {
  let hi = 1;
  while (scheduleAirDistanceNm(schedule, 0, hi) < distanceNm) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (scheduleAirDistanceNm(schedule, 0, mid) < distanceNm) lo = mid; else hi = mid;
  }
  return hi;
}

// --- Departure path (design D2) ---

const STEP_SEC = 1;
const MAX_TIME_SEC = 3 * 3600;

export type DepartureSample = { t: number; s: number; track: number }; // s in NM (air), track unwrapped degrees

export type DeparturePath = {
  points: Array<[number, number]>; // [lat, lon], WP0 → roll-out point
  samples: DepartureSample[];
  rollOut: { t: number; s: number; lat: number; lon: number };
  turnStart: { t: number; s: number };
  turnAngleRad: number;   // signed, CCW positive (same convention as other legs)
  turnDirection: number;  // 1 = left (CCW), -1 = right, as calculateStraighteningPoint
  schedule: DepartureSchedule;
};

function norm180(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
}

function gridBearing(x: number, y: number, tx: number, ty: number): number {
  return (Math.atan2(tx - x, ty - y) * 180 / Math.PI + 360) % 360;
}

/** Turn radius (m) at `tas` knots; same constants as calculateTurnRadius. */
function turnRadiusM(tas: number, bankAngleDeg: number): number {
  const tasMs = tas * 0.514;
  return (tasMs * tasMs) / (9.80665 * Math.tan(bankAngleDeg * Math.PI / 180));
}

type TurnState = { x: number; y: number; track: number; turned: number };

/**
 * Advance one turning step from t0 to t1. The step flies its exact air distance
 * on a circular arc at the step's average speed, so a constant-speed turn is exact.
 */
function turnStep(state: TurnState, schedule: DepartureSchedule, t0: number, t1: number, bank: number, sign: number): TurnState {
  const dsNm = scheduleAirDistanceNm(schedule, t0, t1);
  const dsM = dsNm * 1852;
  if (dsM <= 0) return state;
  const vAvg = dsNm / ((t1 - t0) / 3600);
  const r = turnRadiusM(vAvg, bank);
  const dPsi = dsM / r; // radians
  const chord = dPsi < 1e-12 ? dsM : 2 * r * Math.sin(dPsi / 2);
  const chordDir = (state.track + sign * dPsi * 90 / Math.PI) * Math.PI / 180;
  return {
    x: state.x + chord * Math.sin(chordDir),
    y: state.y + chord * Math.cos(chordDir),
    track: state.track + sign * dPsi * 180 / Math.PI,
    turned: state.turned + dPsi,
  };
}

/**
 * Build leg 1's departure path: straight along the runway, an accelerating turn
 * at the plan's bank angle, roll-out where the track points at WP1. Positions are
 * integrated in projected coordinates, like every other turn (calculateStraighteningPoint).
 * Returns undefined when WP1 cannot be reached (closer than the straight-out
 * distance, or the turn passes 360° without pointing at WP1).
 */
export function buildDeparturePath(params: {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  runwayTrue: number;
  straightOutNm: number;
  schedule: DepartureSchedule;
  bankAngle: number;
  projection: any;
}): DeparturePath | undefined {
  const { origin, destination, runwayTrue, straightOutNm, schedule, bankAngle, projection } = params;
  const code = projection.getCode();
  const [x0, y0] = transform([origin.lon, origin.lat], 'EPSG:4326', code);
  const [tx, ty] = transform([destination.lon, destination.lat], 'EPSG:4326', code);
  const toLatLon = (x: number, y: number): [number, number] => {
    const [lon, lat] = transform([x, y], code, 'EPSG:4326');
    return [lat, lon];
  };

  const straightOutM = straightOutNm * 1852;
  if (Math.hypot(tx - x0, ty - y0) < straightOutM) return undefined;

  // 1. Straight out along the runway
  const tS = timeAtAirDistance(schedule, straightOutNm);
  const rwyRad = runwayTrue * Math.PI / 180;
  let state: TurnState = { x: x0 + straightOutM * Math.sin(rwyRad), y: y0 + straightOutM * Math.cos(rwyRad), track: runwayTrue, turned: 0 };
  const points: Array<[number, number]> = [[origin.lat, origin.lon], toLatLon(state.x, state.y)];
  const samples: DepartureSample[] = [{ t: 0, s: 0, track: runwayTrue }, { t: tS, s: straightOutNm, track: runwayTrue }];

  // 2. Turn towards the side of the runway heading on which WP1 lies
  const offset = norm180(gridBearing(state.x, state.y, tx, ty) - state.track);
  const sign = offset >= 0 ? 1 : -1; // +1 = right (track increases)
  const turnDirection = sign === 1 ? -1 : 1;
  const finish = (rollT: number): DeparturePath => {
    const last = samples[samples.length - 1];
    const [lat, lon] = toLatLon(state.x, state.y);
    if (rollT > last.t) {
      samples.push({ t: rollT, s: scheduleAirDistanceNm(schedule, 0, rollT), track: state.track });
      points.push([lat, lon]);
    }
    return {
      points,
      samples,
      rollOut: { t: rollT, s: scheduleAirDistanceNm(schedule, 0, rollT), lat, lon },
      turnStart: { t: tS, s: straightOutNm },
      turnAngleRad: -sign * state.turned,
      turnDirection,
      schedule,
    };
  };
  if (Math.abs(offset) < 1e-9) return finish(tS);

  // Step boundaries: whole seconds plus every phase boundary after the turn start
  const breaks = [schedule.takeoffEndSec, schedule.transitionEndSec].filter(b => b > tS);
  let t = tS;
  while (t < MAX_TIME_SEC) {
    let tNext = Math.floor(t / STEP_SEC + 1e-9) * STEP_SEC + STEP_SEC;
    for (const b of breaks) if (b > t + 1e-9 && b < tNext) tNext = b;

    const next = turnStep(state, schedule, t, tNext, bankAngle, sign);
    if (next.turned > 2 * Math.PI) return undefined;
    const after = norm180(gridBearing(next.x, next.y, tx, ty) - next.track) * sign;
    if (after <= 0 && after > -90) {
      // Roll-out inside this step: bisect on the step end time
      const start = state;
      let lo = t;
      let hi = tNext;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        const s = turnStep(start, schedule, t, mid, bankAngle, sign);
        if (norm180(gridBearing(s.x, s.y, tx, ty) - s.track) * sign > 0) lo = mid; else hi = mid;
      }
      state = turnStep(start, schedule, t, hi, bankAngle, sign);
      return finish(hi);
    }
    state = next;
    t = tNext;
    samples.push({ t, s: scheduleAirDistanceNm(schedule, 0, t), track: state.track });
    points.push(toLatLon(state.x, state.y));
  }
  return undefined;
}

// --- Wind along the track (design D4) ---

/** Ground-distance and time integrals of leg 1 along the departure track. */
export type DepartureTiming = {
  /** NM over ground between t0 and t1 seconds from brake release, at the scheduled TAS. */
  groundDistance: (t0: number, t1: number, wind: Wind) => number;
  /** Minutes to fly from path distance s0 to s1 (NM) at a constant TAS. */
  timeOver: (s0: number, s1: number, tas: number, wind: Wind) => number;
};

function interpolateTrack(samples: DepartureSample[], key: 't' | 's', value: number, after: number): number {
  const last = samples[samples.length - 1];
  if (value >= last[key]) return after;
  let i = 1;
  while (i < samples.length && samples[i][key] < value) i++;
  const a = samples[i - 1];
  const b = samples[i];
  const f = b[key] > a[key] ? (value - a[key]) / (b[key] - a[key]) : 0;
  return a.track + f * (b.track - a.track);
}

/** Wind component along `track` (knots, positive = tailwind); same formula as applyWind. */
function windAlong(wind: Wind, track: number): number {
  const windAngleRad = ((((wind.windDir + 180) % 360) - track + 360) % 360) * (Math.PI / 180);
  return wind.windSpeed * Math.cos(windAngleRad);
}

/**
 * Time-defined phases read the track from the still-air schedule (track at time t);
 * the distance-defined cruise reads it by path position. With wind the aircraft is
 * not exactly at its still-air position at time t; like every drawn path in the app,
 * the geometry is in the air frame and wind only changes time and fuel.
 */
export function departureTiming(path: DeparturePath, outboundBearing: number): DepartureTiming {
  const { samples, schedule } = path;
  const SUB_SEC = 0.25;
  const SUB_NM = 0.01;
  return {
    groundDistance: (t0, t1, wind) => {
      if (t1 <= t0) return 0;
      const n = Math.max(1, Math.ceil((t1 - t0) / SUB_SEC));
      const h = (t1 - t0) / n;
      let windNmSum = 0;
      for (let i = 0; i < n; i++) {
        const tm = t0 + (i + 0.5) * h;
        windNmSum += windAlong(wind, interpolateTrack(samples, 't', tm, outboundBearing)) * h / 3600;
      }
      return scheduleAirDistanceNm(schedule, t0, t1) + windNmSum;
    },
    timeOver: (s0, s1, tas, wind) => {
      if (s1 <= s0) return 0;
      const rollS = path.rollOut.s;
      let minutes = 0;
      const turnEnd = Math.min(s1, rollS);
      if (turnEnd > s0) {
        const n = Math.max(1, Math.ceil((turnEnd - s0) / SUB_NM));
        const h = (turnEnd - s0) / n;
        for (let i = 0; i < n; i++) {
          const sm = s0 + (i + 0.5) * h;
          minutes += h / (tas + windAlong(wind, interpolateTrack(samples, 's', sm, outboundBearing))) * 60;
        }
      }
      const straightStart = Math.max(s0, rollS);
      if (s1 > straightStart) minutes += (s1 - straightStart) / (tas + windAlong(wind, outboundBearing)) * 60;
      return minutes;
    },
  };
}
