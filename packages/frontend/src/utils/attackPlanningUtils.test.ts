import { describe, it, expect } from 'vitest';
import { calculateAttackProfile } from './attackPlanningUtils';
import type { FlightPlan, AttackPlanningParams } from '../types/flightPlan';

const BASE_PLAN: FlightPlan = {
  theatre: 'syria_old',
  points: [],
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test Plan',
};

const BASE_PARAMS: AttackPlanningParams = {
  attackType: 'oblique_popup',
  angleOff: 30,
  climbTas: 300,
  climbAngle: 20,
  diveAngle: 45,
  apexAltitude: 8000,
  dropAltitude: 3000,
  targetAltitude: 100,
  windDir: 0,
  windSpeed: 0,
  rollInG: 3,
};

// IP at lat=35.8, lon=36.0; TGT at lat=36.0, lon=36.0
// IPTGT heading = 0° (due North). TGT.alt = 500 (ingress altitude).
const PLAN_WITH_IP_TGT: FlightPlan = {
  ...BASE_PLAN,
  points: [
    { lat: 35.8, lon: 36.0, tas: 300, alt: 500, fuelFlow: 5000, windSpeed: 0, windDir: 0, waypointType: 'ip' },
    { lat: 36.0, lon: 36.0, tas: 300, alt: 500, fuelFlow: 5000, windSpeed: 0, windDir: 0, waypointType: 'tgt' },
  ],
};

const FT_PER_NM = 6076.115;
const toRad = (d: number) => (d * Math.PI) / 180;
const LAT_NM = 60;
const lonNmPerDeg = (lat: number) => LAT_NM * Math.cos(toRad(lat));

describe('calculateAttackProfile', () => {
  it('returns null when no IP waypoint', () => {
    const plan: FlightPlan = {
      ...BASE_PLAN,
      points: [
        { lat: 36.0, lon: 36.0, tas: 300, alt: 500, fuelFlow: 5000, windSpeed: 0, windDir: 0, waypointType: 'tgt' },
      ],
    };
    expect(calculateAttackProfile(plan, BASE_PARAMS)).toBeNull();
  });

  it('returns null when no TGT waypoint after IP', () => {
    const plan: FlightPlan = {
      ...BASE_PLAN,
      points: [
        { lat: 35.8, lon: 36.0, tas: 300, alt: 500, fuelFlow: 5000, windSpeed: 0, windDir: 0, waypointType: 'ip' },
      ],
    };
    expect(calculateAttackProfile(plan, BASE_PARAMS)).toBeNull();
  });

  it('computes climb heading as IPTGT heading + angleOff', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    expect(result!.climbHeading).toBeCloseTo(30, 1);
  });

  it('places EoRI on the cone circle (distance from TGT = cone radius)', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    const R_cone_nm = (8000 - 100) / Math.tan(toRad(45)) / FT_PER_NM;
    const tgtLat = 36.0, tgtLon = 36.0;
    const dLat = result!.endOfRollInLat - tgtLat;
    const dLon = result!.endOfRollInLon - tgtLon;
    const eoriDistNm = Math.sqrt((dLat * LAT_NM) ** 2 + (dLon * lonNmPerDeg(tgtLat)) ** 2);
    expect(eoriDistNm).toBeCloseTo(R_cone_nm, 2);
  });

  it('places PUP on the IP→TGT line (lon ≈ 36.0 for N-S axis)', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    expect(result!.pupLon).toBeCloseTo(36.0, 3);
  });

  it('places PUP south of TGT (before TGT on IPTGT line)', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    expect(result!.pupLat).toBeLessThan(36.0);
  });

  it('run-in heading equals bearing from EoRI to TGT', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    const tgtLat = 36.0, tgtLon = 36.0;
    const dE = (tgtLon - result!.endOfRollInLon) * lonNmPerDeg(tgtLat);
    const dN = (tgtLat - result!.endOfRollInLat) * LAT_NM;
    const expectedRIH = (((Math.atan2(dE, dN) * 180) / Math.PI) + 360) % 360;
    expect(result!.runInHeading).toBeCloseTo(expectedRIH, 1);
  });

  it('run-in distance equals cone radius', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    const R_cone_nm = (8000 - 100) / Math.tan(toRad(45)) / FT_PER_NM;
    expect(result!.runInDistance).toBeCloseTo(R_cone_nm, 2);
  });

  it('returns positive climb time', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();
    expect(result!.climbTime).toBeGreaterThan(0);
  });
});
