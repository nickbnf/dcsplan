import type { FlightPlan, AttackPlanningParams, AttackPlanningResults } from '../types/flightPlan';

// ── Constants ────────────────────────────────────────────────────────────────
const FT_PER_NM = 6076.115;
const G_FT_S2 = 32.174;       // ft/s²
const KTS_TO_FT_S = 1.68781;  // 1 kt = 1.68781 ft/s

// ── Small helpers ────────────────────────────────────────────────────────────

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Unit vector [East, North] for a heading in degrees CW from North */
function headingVec(hdgDeg: number): [number, number] {
  const r = toRad(hdgDeg);
  return [Math.sin(r), Math.cos(r)];
}

/** 90° right-perpendicular of heading vector */
function rightPerp(hdgDeg: number): [number, number] {
  const r = toRad(hdgDeg);
  return [Math.cos(r), -Math.sin(r)];
}

/**
 * Convert lat/lon to local [East_nm, North_nm] centred at refLat/refLon.
 */
function toLocal(lat: number, lon: number, refLat: number, refLon: number): [number, number] {
  const E = (lon - refLon) * 60 * Math.cos(toRad(refLat));
  const N = (lat - refLat) * 60;
  return [E, N];
}

/**
 * Convert local [East_nm, North_nm] back to lat/lon.
 */
function fromLocal(E: number, N: number, refLat: number, refLon: number): [number, number] {
  const lat = refLat + N / 60;
  const lon = refLon + E / (60 * Math.cos(toRad(refLat)));
  return [lat, lon];
}

/** Bearing (degrees CW from North) from point A to point B in local [E, N] coords */
function localBearing(fromE: number, fromN: number, toE: number, toN: number): number {
  const dE = toE - fromE;
  const dN = toN - fromN;
  return norm360(toDeg(Math.atan2(dE, dN)));
}

/** Dot product of two 2-element vectors */
function dot2(a: [number, number], b: [number, number]): number {
  return a[0] * b[0] + a[1] * b[1];
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Calculates the oblique pop-up attack profile from a flight plan.
 *
 * All intermediate geometry is worked in a flat-Earth local coordinate system
 * [East_nm, North_nm] centred at the TGT waypoint.
 *
 * Returns null when:
 *  - no IP waypoint is present
 *  - no TGT waypoint follows the IP
 *  - the geometry has no valid solution (|sinVal| > 1)
 */
export function calculateAttackProfile(
  plan: FlightPlan,
  params: AttackPlanningParams,
): AttackPlanningResults | null {

  // ── Step 1: Find IP and TGT waypoints ────────────────────────────────────
  const ipIdx = plan.points.findIndex(p => p.waypointType === 'ip');
  if (ipIdx === -1) {
    console.log('[AttackPlanning] Step 1: No IP waypoint found → returning null');
    return null;
  }
  const tgtIdx = plan.points.findIndex((p, i) => i > ipIdx && p.waypointType === 'tgt');
  if (tgtIdx === -1) {
    console.log('[AttackPlanning] Step 1: No TGT waypoint after IP → returning null');
    return null;
  }
  const ip = plan.points[ipIdx];
  const tgt = plan.points[tgtIdx];
  console.log('[AttackPlanning] Step 1: IP =', ip, ' TGT =', tgt);

  // ── Step 2: IPTGT heading ─────────────────────────────────────────────────
  // Convert IP into local coords centred at TGT
  const [ipE, ipN] = toLocal(ip.lat, ip.lon, tgt.lat, tgt.lon);
  const iptgtHdgDeg = localBearing(ipE, ipN, 0, 0); // bearing from IP to TGT (origin)
  const iptgtHdgRad = toRad(iptgtHdgDeg);
  console.log('[AttackPlanning] Step 2: IP local =', [ipE, ipN], ' IPTGT heading =', iptgtHdgDeg, '°');

  // ── Step 3: Climb heading ─────────────────────────────────────────────────
  const climbHeadingDeg = norm360(iptgtHdgDeg + params.angleOff);
  console.log('[AttackPlanning] Step 3: Climb heading =', climbHeadingDeg, '° (CCW roll-in case)');

  // ── Step 4: Turn radius ───────────────────────────────────────────────────
  const V_ft_s = params.climbTas * KTS_TO_FT_S;
  const n = params.rollInG;
  const R_ft = (V_ft_s * V_ft_s) / (G_FT_S2 * Math.sqrt(n * n - 1));
  const R_nm = R_ft / FT_PER_NM;
  console.log('[AttackPlanning] Step 4: V =', V_ft_s, 'ft/s  n =', n, '  R =', R_nm, 'nm');

  // ── Step 5: Dive cone radius ───────────────────────────────────────────────────
  const diveAngleRad = toRad(params.diveAngle);
  const R_cone_nm = (params.apexAltitude - params.targetAltitude) / Math.tan(diveAngleRad) / FT_PER_NM;
  console.log('[AttackPlanning] Step 5: R_cone =', R_cone_nm, 'nm');

  // ── Step 6: Ingress altitude (TGT waypoint alt field) ────────────────────
  const ingressAlt = tgt.alt; // feet
  console.log('[AttackPlanning] Step 6: Ingress altitude =', ingressAlt, 'ft');

  // ── Step 7: Climb distance ────────────────────────────────────────────────
  const climbAngleRad = toRad(params.climbAngle);
  const distClimb_nm = (params.apexAltitude - ingressAlt) / Math.tan(climbAngleRad) / FT_PER_NM;
  console.log('[AttackPlanning] Step 7: Climb distance =', distClimb_nm, 'nm');

  // ── Step 8: Analytical solve ──────────────────────────────────────────────
  const R_eff = Math.sqrt(R_cone_nm * R_cone_nm + R_nm * R_nm);
  const alpha = Math.atan2(R_nm, R_cone_nm);
  console.log('[AttackPlanning] Step 8a: R_eff =', R_eff, ' alpha =', toDeg(alpha), '°');

  // Climb heading unit vector and right-perpendicular
  const ch_vec = headingVec(climbHeadingDeg);
  const ch_rp = rightPerp(climbHeadingDeg);

  // Centre C of the roll-in arc in local coords (relative to TGT at origin)
  const C_E = R_nm * ch_rp[0] - distClimb_nm * ch_vec[0];
  const C_N = R_nm * ch_rp[1] - distClimb_nm * ch_vec[1];
  console.log('[AttackPlanning] Step 8b: C =', [C_E, C_N]);

  // Project C onto the IPTGT bearing (unit vector pointing TGT → opposite, i.e. toward IP)
  // We use: K = C · (sin iptgt, cos iptgt) ... but formula says:
  //   K = C_E * cos(IPTGT_rad) - C_N * sin(IPTGT_rad)
  // This is the component of C perpendicular to the IPTGT direction.
  const K = C_E * Math.cos(iptgtHdgRad) - C_N * Math.sin(iptgtHdgRad);
  console.log('[AttackPlanning] Step 8c: K =', K);

  const sinVal = -K / R_eff;
  console.log('[AttackPlanning] Step 8d: sinVal =', sinVal);
  if (Math.abs(sinVal) > 1) {
    console.log('[AttackPlanning] Step 8d: |sinVal| > 1, no solution → returning null');
    return null;
  }

  const arcSinVal = Math.asin(sinVal);

  // Two candidate ψ angles
  const psiCandidates = [
    iptgtHdgRad + arcSinVal,
    iptgtHdgRad + Math.PI - arcSinVal,
  ];

  // IPTGT unit vector (from TGT origin looking back toward IP, i.e. direction of the line)
  const u_iptgt: [number, number] = [Math.sin(iptgtHdgRad), Math.cos(iptgtHdgRad)];

  let bestT = -Infinity;
  let bestEoRI: [number, number] | null = null;
  let bestRollIn: [number, number] | null = null;
  let bestPUP: [number, number] | null = null;

  for (const psi of psiCandidates) {
    // Orbital centre O (centre of the imaginary circle of radius R_eff)
    const O: [number, number] = [R_eff * Math.sin(psi), R_eff * Math.cos(psi)];

    // EoRI angle on cone circle
    const phi = psi - alpha;
    const EoRI: [number, number] = [R_cone_nm * Math.sin(phi), R_cone_nm * Math.cos(phi)];

    // Roll-in point P = O + R * rightPerp(CH)
    const P: [number, number] = [O[0] + R_nm * ch_rp[0], O[1] + R_nm * ch_rp[1]];

    // PUP = P - distClimb * headingVec(CH)
    const PUP: [number, number] = [P[0] - distClimb_nm * ch_vec[0], P[1] - distClimb_nm * ch_vec[1]];

    // t = dot(PUP, u_IPTGT); keep only t < 0 (PUP before TGT on the IPTGT line)
    const t = dot2(PUP, u_iptgt);

    // Reject if the CCW roll-in arc would exceed 180° (i.e. loop back on itself)
    const runInHdg = localBearing(EoRI[0], EoRI[1], 0, 0);
    const riHdgChange = norm360(climbHeadingDeg - runInHdg);

    console.log('[AttackPlanning] Step 8e: psi =', toDeg(psi), '°  O =', O, '  EoRI =', EoRI, '  P =', P, '  PUP =', PUP, '  t =', t, '  riHdgChange =', riHdgChange);

    if (riHdgChange > 180) {
      console.log('[AttackPlanning] Step 8e: skipping candidate — roll-in arc would loop (riHdgChange =', riHdgChange, '°)');
      continue;
    }

    if (t < 0 && t > bestT) {
      bestT = t;
      bestEoRI = EoRI;
      bestRollIn = P;
      bestPUP = PUP;
    }
  }

  if (!bestEoRI || !bestRollIn || !bestPUP) {
    console.log('[AttackPlanning] Step 8: No valid candidate (t < 0) found → returning null');
    return null;
  }

  console.log('[AttackPlanning] Step 8 result: EoRI =', bestEoRI, '  RollIn =', bestRollIn, '  PUP =', bestPUP);

  // ── Step 9: Run-in heading and distance ──────────────────────────────────
  // EoRI → TGT (origin = [0,0])
  const runInHeading = localBearing(bestEoRI[0], bestEoRI[1], 0, 0);
  const runInDistance = Math.sqrt(bestEoRI[0] ** 2 + bestEoRI[1] ** 2);
  console.log('[AttackPlanning] Step 9: Run-in heading =', runInHeading, '°  Run-in distance =', runInDistance, 'nm');

  // ── Step 10: Climb time ───────────────────────────────────────────────────
  const climbSlant_nm = (params.apexAltitude - ingressAlt) / Math.sin(climbAngleRad) / FT_PER_NM;
  const windComp = params.windSpeed * Math.cos(toRad(params.windDir - climbHeadingDeg));
  const gs = Math.max(params.climbTas - windComp, 1);
  const climbTime = (climbSlant_nm / gs) * 3600;
  console.log('[AttackPlanning] Step 10: climbSlant =', climbSlant_nm, 'nm  windComp =', windComp, '  gs =', gs, '  climbTime =', climbTime, 's');

  // ── Step 11: End of Climbing Turn (ECT) ──────────────────────────────────
  // Aircraft at PUP is heading iptgtHdgDeg; it turns to climbHeadingDeg.
  // CW angle determines right (≤180°) or left (>180°) turn.
  const cwAnglePup = norm360(climbHeadingDeg - iptgtHdgDeg);
  const pupTurnRight = cwAnglePup <= 180;
  const climbHdgRad = toRad(climbHeadingDeg);
  let ECT: [number, number];
  if (pupTurnRight) {
    // Center to the right of iptgt heading
    const C_E = bestPUP[0] + R_nm * Math.cos(iptgtHdgRad);
    const C_N = bestPUP[1] + R_nm * (-Math.sin(iptgtHdgRad));
    // ECT = center + leftPerp(climbHdg) * R
    ECT = [C_E + R_nm * (-Math.cos(climbHdgRad)), C_N + R_nm * Math.sin(climbHdgRad)];
  } else {
    // Center to the left of iptgt heading
    const C_E = bestPUP[0] + R_nm * (-Math.cos(iptgtHdgRad));
    const C_N = bestPUP[1] + R_nm * Math.sin(iptgtHdgRad);
    // ECT = center + rightPerp(climbHdg) * R
    ECT = [C_E + R_nm * Math.cos(climbHdgRad), C_N + R_nm * (-Math.sin(climbHdgRad))];
  }
  console.log('[AttackPlanning] Step 11: cwAnglePup =', cwAnglePup, '°  pupTurnRight =', pupTurnRight, '  ECT =', ECT);

  // ── Convert local coords back to lat/lon ──────────────────────────────────
  const [eoriLat, eoriLon] = fromLocal(bestEoRI[0], bestEoRI[1], tgt.lat, tgt.lon);
  const [rollInLat, rollInLon] = fromLocal(bestRollIn[0], bestRollIn[1], tgt.lat, tgt.lon);
  const [ectLat, ectLon] = fromLocal(ECT[0], ECT[1], tgt.lat, tgt.lon);
  const [pupLat, pupLon] = fromLocal(bestPUP[0], bestPUP[1], tgt.lat, tgt.lon);
  console.log('[AttackPlanning] Converted: EoRI =', [eoriLat, eoriLon], '  RollIn =', [rollInLat, rollInLon], '  ECT =', [ectLat, ectLon], '  PUP =', [pupLat, pupLon]);

  return {
    climbHeading: climbHeadingDeg,
    runInHeading,
    runInDistance,
    climbDistance: distClimb_nm,
    climbTime,
    endOfRollInLat: eoriLat,
    endOfRollInLon: eoriLon,
    rollInLat,
    rollInLon,
    ectLat,
    ectLon,
    pupLat,
    pupLon,
  };
}
