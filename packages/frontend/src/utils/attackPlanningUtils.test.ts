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
  attackType: 'oblique_popup', // right turn
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
  diveTas: 400,
};

const BASE_PARAMS_LEFT: AttackPlanningParams = {
  ...BASE_PARAMS,
  attackType: 'oblique_popup_l', // left turn
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

  it('drop point lies between EoRI and TGT at correct horizontal distance', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();

    // Horizontal distance from EoRI to drop = (apexAlt - dropAlt) / tan(diveAngle)
    const expectedDropHorizDist = (8000 - 3000) / Math.tan(toRad(45)) / FT_PER_NM;

    const tgtLat = 36.0, tgtLon = 36.0;

    // Distance from EoRI to drop point
    const dLatEoriDrop = result!.dropLat - result!.endOfRollInLat;
    const dLonEoriDrop = result!.dropLon - result!.endOfRollInLon;
    const eoriToDropNm = Math.sqrt(
      (dLatEoriDrop * LAT_NM) ** 2 + (dLonEoriDrop * lonNmPerDeg(tgtLat)) ** 2,
    );
    expect(eoriToDropNm).toBeCloseTo(expectedDropHorizDist, 2);

    // Distance from drop to TGT = cone radius - dropHorizDist
    const R_cone_nm = (8000 - 100) / Math.tan(toRad(45)) / FT_PER_NM;
    const dLatDropTgt = tgtLat - result!.dropLat;
    const dLonDropTgt = tgtLon - result!.dropLon;
    const dropToTgtNm = Math.sqrt(
      (dLatDropTgt * LAT_NM) ** 2 + (dLonDropTgt * lonNmPerDeg(tgtLat)) ** 2,
    );
    expect(dropToTgtNm).toBeCloseTo(R_cone_nm - expectedDropHorizDist, 2);
  });

  it('run-in time equals slant dive distance divided by diveTas (zero wind)', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(result).not.toBeNull();

    const slantNm = (8000 - 3000) / Math.sin(toRad(45)) / FT_PER_NM;
    const expectedRunInTime = (slantNm / 400) * 3600; // diveTas = 400, no wind
    expect(result!.runInTime).toBeCloseTo(expectedRunInTime, 1);
  });

  it('run-in time is shorter with tailwind on run-in leg', () => {
    // First determine the run-in heading from the no-wind result, then pick a
    // tailwind direction (wind FROM run-in heading, i.e. wind pushes the aircraft
    // forward along the run-in).
    // With angleOff=30 and IPTGT heading=0° (due North), climbHeading=30°.
    // The EoRI is in the NE quadrant, so run-in heading ≈ 230°.
    // A wind from ~50° (NE) blows toward SW, which is a tailwind for a 230° run-in.
    const noWind = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    expect(noWind).not.toBeNull();
    // Wind FROM the direction the aircraft is flying toward (i.e. from run-in heading)
    // gives a tailwind. runInHeading ≈ 230°, so wind from 230° is a headwind;
    // wind from (runInHeading + 180°) ≈ 50° is a tailwind.
    const tailwindDir = (noWind!.runInHeading + 180) % 360;
    const paramsWithWind: AttackPlanningParams = { ...BASE_PARAMS, windDir: tailwindDir, windSpeed: 30 };
    const withWind = calculateAttackProfile(PLAN_WITH_IP_TGT, paramsWithWind);
    expect(withWind).not.toBeNull();
    // Tailwind means higher GS → shorter time
    expect(withWind!.runInTime).toBeLessThan(noWind!.runInTime);
  });

  // ── Left-turn (oblique_popup_l) tests ─────────────────────────────────────

  it('left turn: computes climb heading as IPTGT heading - angleOff', () => {
    // IPTGT = 0°, angleOff = 30 → climbHeading = 330°
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS_LEFT);
    expect(result).not.toBeNull();
    expect(result!.climbHeading).toBeCloseTo(330, 1);
  });

  it('left turn: places EoRI on the cone circle', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS_LEFT);
    expect(result).not.toBeNull();
    const R_cone_nm = (8000 - 100) / Math.tan(toRad(45)) / FT_PER_NM;
    const tgtLat = 36.0, tgtLon = 36.0;
    const dLat = result!.endOfRollInLat - tgtLat;
    const dLon = result!.endOfRollInLon - tgtLon;
    const eoriDistNm = Math.sqrt((dLat * LAT_NM) ** 2 + (dLon * lonNmPerDeg(tgtLat)) ** 2);
    expect(eoriDistNm).toBeCloseTo(R_cone_nm, 2);
  });

  it('left turn: places PUP on the IP→TGT line', () => {
    // For a N-S ingress (IP due south of TGT), PUP should be on the same meridian
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS_LEFT);
    expect(result).not.toBeNull();
    expect(result!.pupLon).toBeCloseTo(36.0, 3);
  });

  it('left turn: places PUP south of TGT (before TGT on IPTGT line)', () => {
    const result = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS_LEFT);
    expect(result).not.toBeNull();
    expect(result!.pupLat).toBeLessThan(36.0);
  });

  it('left turn: EoRI is in the NW quadrant (mirror of right-turn NE)', () => {
    // Right turn produces EoRI east of TGT; left turn should produce EoRI west of TGT
    const resultR = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    const resultL = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS_LEFT);
    expect(resultR).not.toBeNull();
    expect(resultL).not.toBeNull();
    const tgtLon = 36.0;
    expect(resultR!.endOfRollInLon).toBeGreaterThan(tgtLon); // NE → east
    expect(resultL!.endOfRollInLon).toBeLessThan(tgtLon);    // NW → west
  });

  it('left/right symmetry: identical distances and times at zero wind', () => {
    const resultR = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS);
    const resultL = calculateAttackProfile(PLAN_WITH_IP_TGT, BASE_PARAMS_LEFT);
    expect(resultR).not.toBeNull();
    expect(resultL).not.toBeNull();
    expect(resultL!.climbDistance).toBeCloseTo(resultR!.climbDistance, 3);
    expect(resultL!.runInDistance).toBeCloseTo(resultR!.runInDistance, 3);
    expect(resultL!.climbTime).toBeCloseTo(resultR!.climbTime, 2);
    expect(resultL!.runInTime).toBeCloseTo(resultR!.runInTime, 2);
    expect(resultL!.ipToPupTime).toBeCloseTo(resultR!.ipToPupTime, 2);
    expect(resultL!.pupToTgtDistance).toBeCloseTo(resultR!.pupToTgtDistance, 3);
  });
});
