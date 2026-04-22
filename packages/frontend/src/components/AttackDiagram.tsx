import React, { useMemo } from 'react';
import type { AttackPlanningResults } from '../types/flightPlan';

interface Point { lat: number; lon: number }

interface AttackDiagramProps {
  results: AttackPlanningResults;
  ip: Point;
  tgt: Point;
  attackType: 'oblique_popup' | 'oblique_popup_l';
}

const LAT_NM = 60;
const toRad = (d: number) => (d * Math.PI) / 180;
const lonNmPerDeg = (lat: number) => LAT_NM * Math.cos(toRad(lat));
const normalizeHdg = (d: number) => ((d % 360) + 360) % 360;

function toLocal(lat: number, lon: number, tgtLat: number, tgtLon: number): [number, number] {
  return [
    (lon - tgtLon) * lonNmPerDeg(tgtLat),
    (lat - tgtLat) * LAT_NM,
  ];
}

function bearingDeg(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const midLat = (fromLat + toLat) / 2;
  const dE = (toLon - fromLon) * LAT_NM * Math.cos(toRad(midLat));
  const dN = (toLat - fromLat) * LAT_NM;
  return normalizeHdg((Math.atan2(dE, dN) * 180) / Math.PI);
}

/** Derive SVG arc radius from chord length (nm) and heading change (degrees) */
function arcRadius(chordNm: number, hdgChangeDeg: number, scaleVal: number): number {
  const halfAngle = toRad(hdgChangeDeg) / 2;
  return (halfAngle > 0.001 ? chordNm / (2 * Math.sin(halfAngle)) : chordNm) * scaleVal;
}

const PADDING = 48;
const SVG_W = 480;
const SVG_H = 480;

const AttackDiagram: React.FC<AttackDiagramProps> = ({ results, ip, tgt, attackType }) => {
  const {
    riArcR_px, riHdgChange,
    pupArcR_px, pupCwAngle,
    ipSvg, tgtSvg, pupSvg, ectSvg, riSvg, eoriSvg, dropSvg,
  } = useMemo(() => {
    const pts = {
      ip: toLocal(ip.lat, ip.lon, tgt.lat, tgt.lon),
      tgt: [0, 0] as [number, number],
      pup: toLocal(results.pupLat, results.pupLon, tgt.lat, tgt.lon),
      ect: toLocal(results.ectLat, results.ectLon, tgt.lat, tgt.lon),
      rollIn: toLocal(results.rollInLat, results.rollInLon, tgt.lat, tgt.lon),
      eori: toLocal(results.endOfRollInLat, results.endOfRollInLon, tgt.lat, tgt.lon),
    };

    const allE = Object.values(pts).map(p => p[0]);
    const allN = Object.values(pts).map(p => p[1]);
    const minE = Math.min(...allE);
    const maxE = Math.max(...allE);
    const minN = Math.min(...allN);
    const maxN = Math.max(...allN);

    const rangeE = maxE - minE || 1;
    const rangeN = maxN - minN || 1;
    const drawW = SVG_W - 2 * PADDING;
    const drawH = SVG_H - 2 * PADDING;
    const scaleVal = Math.min(drawW / rangeE, drawH / rangeN);

    const toSvgFn = ([E, N]: [number, number]): [number, number] => [
      PADDING + (E - minE) * scaleVal,
      SVG_H - PADDING - (N - minN) * scaleVal,
    ];

    // Roll-in arc: heading change measured in the correct direction for the turn.
    // R turn (CCW roll-in): normalizeHdg(climbHdg - runInHdg)
    // L turn (CW roll-in): normalizeHdg(runInHdg - climbHdg)
    const turnSign = attackType === 'oblique_popup_l' ? -1 : 1;
    const riHdgChange = normalizeHdg(turnSign * (results.climbHeading - results.runInHeading));
    const riChord = Math.sqrt((pts.rollIn[0] - pts.eori[0]) ** 2 + (pts.rollIn[1] - pts.eori[1]) ** 2);
    const riArcR_px = arcRadius(riChord, riHdgChange, scaleVal);

    // PUP arc: CW heading change from iptgtHdg to climbHeading
    const iptgtHdg = bearingDeg(ip.lat, ip.lon, tgt.lat, tgt.lon);
    const pupCwAngle = normalizeHdg(results.climbHeading - iptgtHdg);
    const pupChord = Math.sqrt((pts.pup[0] - pts.ect[0]) ** 2 + (pts.pup[1] - pts.ect[1]) ** 2);
    const pupArcR_px = arcRadius(pupChord, pupCwAngle <= 180 ? pupCwAngle : 360 - pupCwAngle, scaleVal);

    // Drop point — outside pts to avoid affecting bounding box
    const dropSvg = toSvgFn(toLocal(results.dropLat, results.dropLon, tgt.lat, tgt.lon));

    return {
      riArcR_px,
      riHdgChange,
      pupArcR_px,
      pupCwAngle,
      ipSvg: toSvgFn(pts.ip),
      tgtSvg: toSvgFn(pts.tgt),
      pupSvg: toSvgFn(pts.pup),
      ectSvg: toSvgFn(pts.ect),
      riSvg: toSvgFn(pts.rollIn),
      eoriSvg: toSvgFn(pts.eori),
      dropSvg,
    };
  }, [results, ip, tgt, attackType]);

  // Extend IP→TGT dashed line across the full diagram
  const iptgtDx = tgtSvg[0] - ipSvg[0];
  const iptgtDy = tgtSvg[1] - ipSvg[1];
  const iptgtLen = Math.sqrt(iptgtDx ** 2 + iptgtDy ** 2) || 1;
  const extend = 600;
  const courseX1 = ipSvg[0] - (iptgtDx / iptgtLen) * extend;
  const courseY1 = ipSvg[1] - (iptgtDy / iptgtLen) * extend;
  const courseX2 = tgtSvg[0] + (iptgtDx / iptgtLen) * extend;
  const courseY2 = tgtSvg[1] + (iptgtDy / iptgtLen) * extend;

  // Roll-in arc: CCW (left) for R turn → sweep=0; CW (right) for L turn → sweep=1
  const riSweep = attackType === 'oblique_popup_l' ? 1 : 0;
  const riLargeArc = riHdgChange > 180 ? 1 : 0;
  const riArcPath = `M ${riSvg[0]} ${riSvg[1]} A ${riArcR_px} ${riArcR_px} 0 ${riLargeArc} ${riSweep} ${eoriSvg[0]} ${eoriSvg[1]}`;

  // PUP arc: the actual turn angle is always ≤ 180° (angleOff is 30/45/60).
  // For R turn: pupCwAngle = angleOff (e.g. 30°, CW sweep=1)
  // For L turn: pupCwAngle = 360 - angleOff (e.g. 330°), actual angle = 360 - pupCwAngle = 30°
  const pupLargeArc = 0; // actual PUP turn is always < 180°
  const pupSweep = pupCwAngle <= 180 ? 1 : 0; // R: CW (sweep=1), L: CCW (sweep=0)
  const pupArcPath = `M ${pupSvg[0]} ${pupSvg[1]} A ${pupArcR_px} ${pupArcR_px} 0 ${pupLargeArc} ${pupSweep} ${ectSvg[0]} ${ectSvg[1]}`;

  // TGT triangle (upward-pointing)
  const [tx, ty] = tgtSvg;
  const tri = `M ${tx} ${ty - 12} L ${tx - 8} ${ty + 4} L ${tx + 8} ${ty + 4} Z`;

  return (
    <svg width={SVG_W} height={SVG_H} className="bg-white rounded shadow">
      <defs>
        <clipPath id="diagram-clip">
          <rect x={0} y={0} width={SVG_W} height={SVG_H} />
        </clipPath>
        <marker id="arrow-n" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#374151" />
        </marker>
      </defs>

      {/* IP→TGT course (dashed grey) */}
      <line
        x1={courseX1} y1={courseY1} x2={courseX2} y2={courseY2}
        stroke="#9ca3af" strokeWidth={1} strokeDasharray="6,4"
        clipPath="url(#diagram-clip)"
      />

      {/* Approach: IP → PUP (solid blue) */}
      <line x1={ipSvg[0]} y1={ipSvg[1]} x2={pupSvg[0]} y2={pupSvg[1]} stroke="#3b82f6" strokeWidth={2} />

      {/* PUP arc: turn from IP→TGT heading to climb heading */}
      <path d={pupArcPath} fill="none" stroke="#3b82f6" strokeWidth={2} />

      {/* Climb segment: ECT → roll-in */}
      <line x1={ectSvg[0]} y1={ectSvg[1]} x2={riSvg[0]} y2={riSvg[1]} stroke="#3b82f6" strokeWidth={2} />

      {/* Roll-in arc */}
      <path d={riArcPath} fill="none" stroke="#3b82f6" strokeWidth={2} />

      {/* Run-in: EoRI → DROP (solid) */}
      <line x1={eoriSvg[0]} y1={eoriSvg[1]} x2={dropSvg[0]} y2={dropSvg[1]} stroke="#ef4444" strokeWidth={2} />

      {/* Run-in: DROP → TGT (dashed) */}
      <line x1={dropSvg[0]} y1={dropSvg[1]} x2={tgtSvg[0]} y2={tgtSvg[1]} stroke="#ef4444" strokeWidth={2} strokeDasharray="6,4" />

      {/* IP marker */}
      <circle cx={ipSvg[0]} cy={ipSvg[1]} r={5} fill="white" stroke="#9ca3af" strokeWidth={1.5} />
      <text x={ipSvg[0] + 8} y={ipSvg[1] + 4} fontSize={11} fontFamily="monospace" fill="#6b7280">IP</text>

      {/* PUP */}
      <circle cx={pupSvg[0]} cy={pupSvg[1]} r={5} fill="#3b82f6" />
      <text x={pupSvg[0] + 8} y={pupSvg[1] + 4} fontSize={11} fontFamily="monospace" fill="#1d4ed8">PUP</text>

      {/* ECT */}
      <circle cx={ectSvg[0]} cy={ectSvg[1]} r={4} fill="#3b82f6" />
      <text x={ectSvg[0] + 8} y={ectSvg[1] + 4} fontSize={11} fontFamily="monospace" fill="#1d4ed8">ECT</text>

      {/* Roll-in */}
      <circle cx={riSvg[0]} cy={riSvg[1]} r={4} fill="#3b82f6" />
      <text x={riSvg[0] + 8} y={riSvg[1] + 4} fontSize={11} fontFamily="monospace" fill="#1d4ed8">Roll-in</text>

      {/* EoRI */}
      <circle cx={eoriSvg[0]} cy={eoriSvg[1]} r={4} fill="#3b82f6" />
      <text x={eoriSvg[0] + 8} y={eoriSvg[1] + 4} fontSize={11} fontFamily="monospace" fill="#1d4ed8">EoRI</text>

      {/* Drop point */}
      <circle cx={dropSvg[0]} cy={dropSvg[1]} r={4} fill="#f97316" />
      <text x={dropSvg[0] + 8} y={dropSvg[1] + 4} fontSize={11} fontFamily="monospace" fill="#ea580c">DROP</text>

      {/* TGT triangle */}
      <path d={tri} fill="#ef4444" />
      <text x={tx + 10} y={ty + 4} fontSize={11} fontFamily="monospace" fill="#dc2626">TGT</text>

      {/* North arrow (top-right corner) */}
      <line
        x1={SVG_W - 24} y1={40}
        x2={SVG_W - 24} y2={22}
        stroke="#374151" strokeWidth={1.5}
      />
      <polygon points={`${SVG_W - 24},12 ${SVG_W - 29},22 ${SVG_W - 19},22`} fill="#374151" />
      <text x={SVG_W - 29} y={52} fontSize={11} fontFamily="monospace" fill="#374151">N</text>
    </svg>
  );
};

export default AttackDiagram;
