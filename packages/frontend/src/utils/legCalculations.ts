import type { FlightPlan, FlightPlanTurnPoint } from "../types/flightPlan";
import { transform } from "ol/proj";
import { get } from "ol/proj";
import proj4 from "proj4";
import { register } from "ol/proj/proj4";

const CENTRAL_MERIDIAN = 39;

// Ensure the transverse Mercator projection is registered
const TRANSVERSE_MERCATOR_CODE = 'EPSG:123456';
if (!proj4.defs(TRANSVERSE_MERCATOR_CODE)) {
  const proj4Def = `+proj=tmerc +lat_0=0 +lon_0=${CENTRAL_MERIDIAN} +k=1.0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
  proj4.defs(TRANSVERSE_MERCATOR_CODE, proj4Def);
  register(proj4);
}

/**
 * Calculate the bearing between two points in degrees (0-360).
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lon1Rad = (lon1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const lon2Rad = (lon2 * Math.PI) / 180;
  const dLon = lon2Rad - lon1Rad;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  // Normalize to 0-360 degrees
  return (bearing + 360) % 360;
}

/**
 * Calculate turn radius from TAS and bank angle.
 * Formula: (tas * 0.514)^2 / (9.80665 * tan(bankAngle))
 */
export function calculateTurnRadius(tas: number, bankAngleDeg: number): number {
  const tasMs = tas * 0.514; // Convert knots to m/s
  const bankAngleRad = (bankAngleDeg * Math.PI) / 180;
  return (tasMs * tasMs) / (9.80665 * Math.tan(bankAngleRad));
}

/**
 * Convert lat/lon to Transverse Mercator coordinates.
 */
function latLonToTransverseMercator(lat: number, lon: number): [number, number] {
  const projection = get(TRANSVERSE_MERCATOR_CODE);
  if (!projection) {
    throw new Error(`Failed to get projection ${TRANSVERSE_MERCATOR_CODE}`);
  }
  const [x, y] = transform([lon, lat], "EPSG:4326", TRANSVERSE_MERCATOR_CODE);
  return [x, y];
}

/**
 * Convert Transverse Mercator coordinates to lat/lon.
 */
function transverseMercatorToLatLon(x: number, y: number): [number, number] {
  const [lon, lat] = transform([x, y], TRANSVERSE_MERCATOR_CODE, "EPSG:4326");
  return [lat, lon];
}

/**
 * Calculate the straightening point (point where the turn is finished).
 * Returns: [turnCenterLat, turnCenterLon, straighteningLat, straighteningLon]
 */
export function calculateStraighteningPoint(
  inboundBearing: number,
  point1Lat: number,
  point1Lon: number,
  point2Lat: number,
  point2Lon: number,
  turnRadiusM: number
): [number, number, number, number, number] {
  const aproxOutboundBearing = calculateBearing(
    point1Lat,
    point1Lon,
    point2Lat,
    point2Lon
  );
  const [sx, sy] = latLonToTransverseMercator(point1Lat, point1Lon);
  const [dx, dy] = latLonToTransverseMercator(point2Lat, point2Lon);

  // Calculate the turning circle
  const turnDirection =
    ((aproxOutboundBearing - inboundBearing + 360) % 360 > 180) ? 1 : -1;

  const cx =
    sx - turnDirection * Math.cos((inboundBearing * Math.PI) / 180) * turnRadiusM;
  const cy =
    sy + turnDirection * Math.sin((inboundBearing * Math.PI) / 180) * turnRadiusM;
  const [cLat, cLon] = transverseMercatorToLatLon(cx, cy);

  // Calculate the coefs for the equation of the radical axis line
  // Line equation: Ax + By = C
  const A = cx - dx;
  const B = cy - dy;
  const C = cx * cx + cy * cy - turnRadiusM * turnRadiusM - (dx * cx + dy * cy);

  let sxResult: number;
  let syResult: number;

  // Handle edge case: if B = 0, the line is horizontal (y = constant)
  if (Math.abs(B) < 1e-10) {
    // Horizontal line: y = constant
    if (Math.abs(A) < 1e-10) {
      throw new Error("Line is degenerate (both A and B are zero)");
    }
    const xLine = C / A;
    const discriminant = turnRadiusM * turnRadiusM - (xLine - cx) * (xLine - cx);
    if (discriminant < 0) {
      throw new Error(
        `No intersection: line too far from circle (discriminant=${discriminant})`
      );
    }
    const sqrtDisc = Math.sqrt(discriminant);
    syResult = cy + turnDirection * sqrtDisc;
    sxResult = xLine;
  } else {
    // Calculate the coefs for the quadratic equation
    const a = A * A + B * B;
    const b = -2 * B * B * cx + 2 * A * (B * cy - C);
    const c =
      B * B * cx * cx + (C - B * cy) * (C - B * cy) - turnRadiusM * turnRadiusM * B * B;

    // Check discriminant before taking square root
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      throw new Error(
        `No intersection: line does not intersect circle (discriminant=${discriminant})`
      );
    }

    // Calculate the straightening point
    const sqrtDisc = Math.sqrt(discriminant);

    // Calculate both solutions for the straightening point
    const x1Intersect = (-b + sqrtDisc) / (2 * a);
    const y1Intersect = (C - A * x1Intersect) / B;
    const x2Intersect = (-b - sqrtDisc) / (2 * a);
    const y2Intersect = (C - A * x2Intersect) / B;

    // Select the correct intersection point based on smooth transition criterion:
    // The tangent vector of the arc at the intersection point must be parallel
    // to the direction vector from the intersection point to the destination.
    // This ensures C1 continuity (smooth transition, no sharp angle).

    // For intersection point 1:
    // Radius vector from circle center to intersection point
    const radius1X = x1Intersect - cx;
    const radius1Y = y1Intersect - cy;
    // Tangent vector (perpendicular to radius)
    // For counter-clockwise (turnDirection=1): rotate radius 90° CCW: (-y, x)
    // For clockwise (turnDirection=-1): rotate radius 90° CW: (y, -x)
    const tangent1X = turnDirection === 1 ? -radius1Y : radius1Y;
    const tangent1Y = turnDirection === 1 ? radius1X : -radius1X;
    // Direction vector from intersection point to destination
    const dir1X = dx - x1Intersect;
    const dir1Y = dy - y1Intersect;
    // Dot product: positive means tangent and direction are aligned
    const dot1 = tangent1X * dir1X + tangent1Y * dir1Y;

    // For intersection point 2:
    const radius2X = x2Intersect - cx;
    const radius2Y = y2Intersect - cy;
    const tangent2X = turnDirection === 1 ? -radius2Y : radius2Y;
    const tangent2Y = turnDirection === 1 ? radius2X : -radius2X;
    const dir2X = dx - x2Intersect;
    const dir2Y = dy - y2Intersect;
    const dot2 = tangent2X * dir2X + tangent2Y * dir2Y;

    // Select the point where tangent and direction are aligned (positive dot product)
    if (dot1 > 0) {
      sxResult = x1Intersect;
      syResult = y1Intersect;
    } else if (dot2 > 0) {
      sxResult = x2Intersect;
      syResult = y2Intersect;
    } else {
      // Fallback: if neither has positive dot product, choose the one with larger dot product
      // (less negative, closer to alignment)
      if (dot1 > dot2) {
        sxResult = x1Intersect;
        syResult = y1Intersect;
        console.warn(
          `Both dot products negative, selected point 1 (dot=${dot1.toFixed(2)} vs ${dot2.toFixed(2)})`
        );
      } else {
        sxResult = x2Intersect;
        syResult = y2Intersect;
        console.warn(
          `Both dot products negative, selected point 2 (dot=${dot2.toFixed(2)} vs ${dot1.toFixed(2)})`
        );
      }
    }
  }

  const [sLat, sLon] = transverseMercatorToLatLon(sxResult, syResult);
  return [cLat, cLon, sLat, sLon, turnDirection];
}

/**
 * Generate points along an arc from a start point to an end point around a center point.
 * Returns array of [lat, lon] coordinates.
 * All points are specified in lat/lon, and angles are calculated in transverse Mercator coordinates.
 */
export function generateArcPoints(
  centerLat: number,
  centerLon: number,
  radiusM: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  turnDirection: number,
  numPoints: number = 6
): Array<[number, number]> {
  const [cx, cy] = latLonToTransverseMercator(centerLat, centerLon);
  const [sx, sy] = latLonToTransverseMercator(startLat, startLon);
  const [ex, ey] = latLonToTransverseMercator(endLat, endLon);
  const points: Array<[number, number]> = [];

  // Calculate angles in transverse Mercator coordinates (math angles: 0° = east, counter-clockwise)
  // atan2(y, x) gives: 0° = east, 90° = north, -90° = south, 180° = west
  let startAngleRad = Math.atan2(sy - cy, sx - cx);
  let endAngleRad = Math.atan2(ey - cy, ex - cx);
  if (startAngleRad < 0) {
    startAngleRad += 2 * Math.PI;
  }
  if (endAngleRad < 0) {
    endAngleRad += 2 * Math.PI;
  }

  // Calculate angular difference, taking the shorter path
  let angleDiff = endAngleRad - startAngleRad;
  if (turnDirection === 1 && angleDiff < 0) {
    angleDiff += 2 * Math.PI;
  }
  if (turnDirection === -1 && angleDiff > 0) {
    angleDiff -= 2 * Math.PI;
  }

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const angle = startAngleRad + angleDiff * t;

    // Calculate point on circle in transverse Mercator
    var px: number;
    var py: number;
    if (turnDirection === 1) {
      px = cx + radiusM * Math.cos(angle);
      py = cy + radiusM * Math.sin(angle);
    } else {
      px = cx + radiusM * Math.cos(angle);
      py = cy + radiusM * Math.sin(angle);
    }

    // Convert back to lat/lon
    const [lat, lon] = transverseMercatorToLatLon(px, py);
    points.push([lat, lon]);
  }

  return points;
}

/**
 * Calculate heading from course, wind, and ground speed.
 */
function calculateHeading(
  course: number,
  windSpeed: number,
  windDir: number,
  tas: number
): number {
  const windAngleRad =
    ((((windDir + 180) % 360) - course + 360) % 360) * (Math.PI / 180);
  const tailComponent = windSpeed * Math.cos(windAngleRad);
  const crossComponent = windSpeed * Math.sin(windAngleRad);

  const groundSpeed = tas + tailComponent;
  let heading =
    course - (Math.asin(crossComponent / groundSpeed) * 180) / Math.PI;
  if (heading < 0) {
    heading += 360;
  }
  return heading % 360;
}

/**
 * Leg calculation result for drawing.
 */
export interface LegCalculationResult {
  originLat: number;
  originLon: number;
  destinationLat: number;
  destinationLon: number;
  turnCenterLat: number;
  turnCenterLon: number;
  straighteningLat: number;
  straighteningLon: number;
  turnRadiusM: number;
  inboundBearing: number;
  outboundBearing: number;
  heading: number; // For next leg's inbound bearing
  turnDirection: number;
}

/**
 * Calculate all leg data sequentially (each leg depends on previous leg's heading).
 */
export function calculateAllLegData(
  flightPlan: FlightPlan
): LegCalculationResult[] {
  const results: LegCalculationResult[] = [];

  if (flightPlan.points.length < 2) {
    return results;
  }

  let inboundBearing = 0; // First leg has no inbound bearing

  for (let i = 0; i < flightPlan.points.length - 1; i++) {
    const origin = flightPlan.points[i];
    const destination = flightPlan.points[i + 1];

    // Calculate turn radius based on TAS at destination turnpoint
    const turnRadiusM = calculateTurnRadius(destination.tas, flightPlan.bankAngle);

    let turnCenterLat: number;
    let turnCenterLon: number;
    let straighteningLat: number;
    let straighteningLon: number;
    let turnDirection: number;

    if (i === 0) {
      // First leg: no turning arc, use origin as straightening point
      turnCenterLat = 0;
      turnCenterLon = 0;
      straighteningLat = origin.lat;
      straighteningLon = origin.lon;
      inboundBearing = 0;
      turnDirection = 1;
    } else {
      try {
        [turnCenterLat, turnCenterLon, straighteningLat, straighteningLon, turnDirection] =
          calculateStraighteningPoint(
            inboundBearing,
            origin.lat,
            origin.lon,
            destination.lat,
            destination.lon,
            turnRadiusM
          );
      } catch (error) {
        // Fallback: use origin as straightening point if calculation fails
        console.warn(
          `Failed to calculate straightening point for leg ${i}:`,
          error
        );
        turnCenterLat = 0;
        turnCenterLon = 0;
        straighteningLat = origin.lat;
        straighteningLon = origin.lon;
        turnDirection = 1;
      }
    }

    // Calculate outbound bearing (from straightening point to destination)
    const outboundBearing = calculateBearing(
      straighteningLat,
      straighteningLon,
      destination.lat,
      destination.lon
    );

    // Calculate course (magnetic)
    const course = (outboundBearing + flightPlan.declination + 360) % 360;

    // Calculate heading for next leg's inbound bearing
    const heading = calculateHeading(
      course,
      destination.windSpeed,
      destination.windDir,
      destination.tas
    );

    results.push({
      originLat: origin.lat,
      originLon: origin.lon,
      destinationLat: destination.lat,
      destinationLon: destination.lon,
      turnCenterLat,
      turnCenterLon,
      straighteningLat,
      straighteningLon,
      turnRadiusM,
      inboundBearing,
      outboundBearing,
      heading,
      turnDirection,
    });

    // Update inbound bearing for next leg
    inboundBearing = heading;
  }

  return results;
}

