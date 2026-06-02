"""
Flight plan data models.

This module defines the Pydantic models for flight plan validation and data structures.
"""

import math
import pprint
import logging
import os
import json
from pydantic import BaseModel, Field, model_validator
from typing import Any, List, Tuple, Optional
from pyproj import Transformer

# Set up logger (logging configuration is handled centrally in main.py)
logger = logging.getLogger(__name__)

THEATRES_DIR = os.path.join(os.path.dirname(__file__), "theatres")

class RegimeCruise(BaseModel):
    tas: float = Field(..., gt=0, description="Cruise TAS (knots)")
    ff: float = Field(..., gt=0, description="Cruise fuel flow (pph)")

class RegimeClimb(BaseModel):
    tas: float = Field(..., gt=0, description="Climb TAS (knots)")
    ff: float = Field(..., gt=0, description="Climb fuel flow (pph)")
    roc: float = Field(..., gt=0, description="Rate of climb (fpm)")

class RegimeDescent(BaseModel):
    tas: float = Field(..., gt=0, description="Descent TAS (knots)")
    ff: float = Field(..., gt=0, description="Descent fuel flow (pph)")
    rod: float = Field(..., gt=0, description="Rate of descent (fpm)")

class Regime(BaseModel):
    """A named performance regime on the flight plan."""
    id: str = Field(..., description="Opaque unique identifier")
    name: str = Field(..., description="User-facing label")
    comment: Optional[str] = Field(default=None, description="Free-form note")
    cruise: RegimeCruise
    climb: Optional[RegimeClimb] = None
    descent: Optional[RegimeDescent] = None


class TakeoffPerformance(BaseModel):
    """Take-off performance block (brake release → climb speed)."""
    timeSec: float = Field(default=0, ge=0, description="Time in seconds")
    fuel: float = Field(default=0, ge=0, description="Fuel consumed (lbs)")
    distance: float = Field(default=0, ge=0, description="Ground distance (nm)")


class Aircraft(BaseModel):
    """Aircraft-level performance data."""
    model: str = Field(default='', description="Aircraft model name")
    takeoffConfiguration: str = Field(default='', description="T/O configuration label")
    taxiFuel: float = Field(default=0, ge=0, description="Taxi fuel deduction (lbs)")
    takeoff: TakeoffPerformance = Field(default_factory=TakeoffPerformance)
    regimes: List[Regime] = Field(default_factory=list, description="Named performance regimes")


def default_aircraft() -> Aircraft:
    return Aircraft()


class FlightPlanTurnPoint(BaseModel):
    """Represents a single turn point in a flight plan."""
    lat: float = Field(..., ge=-90, le=90, description="Latitude (-90 to 90)")
    lon: float = Field(..., ge=-180, le=180, description="Longitude (-180 to 180)")
    tas: float = Field(..., ge=0, description="True Air Speed into this TP")
    alt: float = Field(..., ge=0, description="Altitude into this TP")
    fuelFlow: float = Field(..., ge=0, description="Fuel flow rate into this TP")
    windSpeed: float = Field(..., ge=0, description="Wind speed")
    windDir: float = Field(..., ge=0, le=360, description="Wind direction (0-360)")
    name: str | None = Field(default=None, description="Name of the turnpoint")
    waypointType: str | None = Field(default=None, description="Waypoint type: normal, push, ip, tgt")
    exitTimeSec: int | None = Field(default=None, ge=0, le=86399, description="Push only: exit time")
    hack: bool | None = Field(default=None, description="Push only: HACK enabled")
    comment: str | None = Field(default=None, description="Optional kneeboard note for this waypoint")
    regimeId: str | None = Field(default=None, description="Optional reference to a regime in the plan")


class PlanLibraryRef(BaseModel):
    """A reference to a library entry in the plan."""
    uuid: str
    comment: Optional[str] = None


class LibraryObject(BaseModel):
    """A library entry snapshot embedded in the plan on export."""
    id: str
    type: str
    lat: float
    lon: float
    name: Optional[str] = None
    defaultComment: Optional[str] = None
    range: Optional[float] = None  # nautical miles


class PlanMarker(BaseModel):
    """A plan-local marker (not from the library)."""
    id: str
    type: str
    lat: float
    lon: float
    name: Optional[str] = None
    range: Optional[float] = None  # nautical miles
    comment: Optional[str] = None


class FlightPlan(BaseModel):
    """Represents a complete flight plan with waypoints and initial conditions."""
    theatre: str = Field(..., description="Theatre name")
    points: List[FlightPlanTurnPoint]
    aircraft: Aircraft = Field(default_factory=default_aircraft, description="Aircraft performance data")
    declination: float = Field(..., ge=-25, le=25, description="Magnetic declination")
    bankAngle: float = Field(..., ge=5, le=85, description="Bank angle for turns (degrees)")
    initTimeSec: int = Field(..., ge=0, le=86399, description="Initial time seconds (0-86399)")
    initFob: float = Field(..., ge=0, description="Initial fuel on board")
    name: str | None = Field(default=None, description="Name of the flight plan")
    libraryRefs: Optional[List[PlanLibraryRef]] = Field(default=None)
    markers: Optional[List[PlanMarker]] = Field(default=None)
    librarySnapshot: Optional[List[LibraryObject]] = Field(default=None)

    @model_validator(mode='before')
    @classmethod
    def migrate_legacy_regimes(cls, data: Any) -> Any:
        """Accept v1.2 plans with top-level regimes and synthesise aircraft block."""
        if not isinstance(data, dict):
            return data
        if 'regimes' in data:
            legacy_regimes = data.pop('regimes')
            if 'aircraft' not in data:
                data['aircraft'] = {'regimes': legacy_regimes}
        return data


class ImportFlightPlanRequest(BaseModel):
    """Request model for importing a flight plan with version."""
    version: str
    flightPlan: FlightPlan

def get_effective_exit_time(exit_time_sec: int | None, eta: int) -> int:
    return max(exit_time_sec if exit_time_sec is not None else eta, eta)


class TurnpointData:
    """Represent a turnpoint with all the data to display."""
    etaSec: int
    efr: float
    hackEtaSec: int | None
    exitTimeSec: int | None  # Push only: effective exit time

    def __init__(self):
        self.hackEtaSec = None
        self.exitTimeSec = None

    def __repr__(self) -> str:
        return f"TurnpointData(etaSec={self.etaSec}, efr={self.efr}, hackEtaSec={self.hackEtaSec})"

class Point:
    """Represent a point in latitude and longitude."""
    lat: float
    lon: float

    def __init__(self, lat: float, lon: float):
        self.lat = lat
        self.lon = lon

    def __repr__(self) -> str:
        return f"Point(lat={self.lat:.6f}, lon={self.lon:.6f})"

class TurnData:
    """Represent the data for initial the turn. (to help drawing)."""
    center: Point

    def __init__(self, center_lat: float, center_lon: float):
        self.center = Point(center_lat, center_lon)


def _load_theatre_config(theatre: str) -> dict:
    """Load theatre configuration from JSON file."""
    map_info_path = os.path.join(THEATRES_DIR, f"{theatre}.json")
    if not os.path.exists(map_info_path):
        raise FileNotFoundError(f"Theatre config not found at {map_info_path}")
    with open(map_info_path, 'r') as f:
        return json.load(f)


def _create_transformer(theatre_config: dict) -> Transformer:
    """Create a pyproj Transformer from theatre configuration."""
    projection = theatre_config.get("projection", "transverse_mercator")
    central_meridian = theatre_config.get("central_meridian", 39)

    if projection == "transverse_mercator":
        return Transformer.from_crs(
            "EPSG:4326",
            f"+proj=tmerc +lat_0=0 +lon_0={central_meridian} +k=1.0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
            always_xy=True
        )
    elif projection == "mercator":
        return Transformer.from_crs(
            "EPSG:4326",
            "EPSG:3857",
            always_xy=True
        )
    else:
        raise ValueError(f"Unsupported projection: {projection}")


def _project(transformer: Transformer, lat: float, lon: float) -> Tuple[float, float]:
    """Project lat/lon to map coordinates using the given transformer."""
    x, y = transformer.transform(lon, lat)
    return x, y


def _unproject(transformer: Transformer, x: float, y: float) -> Tuple[float, float]:
    """Unproject map coordinates to lat/lon. Returns (lat, lon)."""
    # Create inverse transformer
    inv = Transformer.from_crs(
        transformer.target_crs,
        transformer.source_crs,
        always_xy=True
    )
    lon, lat = inv.transform(x, y)
    return lat, lon


def calculate_bearing(point1: Point, point2: Point, navigation_mode: str = "geographic", transformer: Transformer = None) -> float:
    """Calculate the bearing between two points in degrees (0-360).
    In 'projected' mode, uses atan2 on projected coordinates.
    In 'geographic' mode, uses the spherical forward-azimuth formula.
    """
    if navigation_mode == "projected" and transformer is not None:
        x1, y1 = _project(transformer, point1.lat, point1.lon)
        x2, y2 = _project(transformer, point2.lat, point2.lon)
        return (math.degrees(math.atan2(x2 - x1, y2 - y1)) + 360) % 360

    lat1 = math.radians(point1.lat)
    lon1 = math.radians(point1.lon)
    lat2 = math.radians(point2.lat)
    lon2 = math.radians(point2.lon)
    dLon = lon2 - lon1
    y = math.sin(dLon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dLon)
    bearing = math.degrees(math.atan2(y, x))
    # Normalize to 0-360 degrees
    return (bearing + 360) % 360

def calculate_distance(point1: Point, point2: Point, navigation_mode: str = "geographic", transformer: Transformer = None) -> float:
    """Calculate the distance between two points in meters.
    In 'projected' mode, uses Euclidean distance in projected coordinates.
    In 'geographic' mode, uses the Haversine formula.
    """
    if navigation_mode == "projected" and transformer is not None:
        x1, y1 = _project(transformer, point1.lat, point1.lon)
        x2, y2 = _project(transformer, point2.lat, point2.lon)
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    R = 6371000  # Earth's radius in meters
    lat1_rad = math.radians(point1.lat)
    lon1_rad = math.radians(point1.lon)
    lat2_rad = math.radians(point2.lat)
    lon2_rad = math.radians(point2.lon)
    d_lat = lat2_rad - lat1_rad
    d_lon = lon2_rad - lon1_rad
    a = math.sin(d_lat/2) * math.sin(d_lat/2) + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lon/2) * math.sin(d_lon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def calculate_straigthening_point(inbound_bearing: float, point1: Point, point2: Point, turn_radius_m: float, transformer: Transformer = None, navigation_mode: str = "geographic") -> Tuple[TurnData, float, float]:
    """Calculate the straigthening point (point where the turn is finished)."""

    sx, sy = _project(transformer, point1.lat, point1.lon)
    dx, dy = _project(transformer, point2.lat, point2.lon)

    if navigation_mode == "projected":
        aprox_outbound_bearing = (math.degrees(math.atan2(dx - sx, dy - sy)) + 360) % 360
    else:
        aprox_outbound_bearing = calculate_bearing(point1, point2)

    logger.info(f"Start point: {sx}, {sy}")

    # Calculate the turning circle
    if (aprox_outbound_bearing - inbound_bearing + 360) % 360 > 180:
        # Left turn (direct)
        logger.info(f"Left turn")
        turn_direction = 1
    else:
        # Right turn (reverse)
        logger.info(f"Right turn")
        turn_direction = -1

    cx = sx - turn_direction * math.cos(math.radians(inbound_bearing)) * turn_radius_m
    cy = sy + turn_direction * math.sin(math.radians(inbound_bearing)) * turn_radius_m
    c_lat, c_lon = _unproject(transformer, cx, cy)
    turn_data = TurnData(c_lat, c_lon)

    logger.info(f"Centre of the turning circle: {cx}, {cy}")
    logger.info(f"Destination point: {dx}, {dy}")

    # Calculate the coefs for the equation of the radical axis line
    # Line equation: Ax + By = C
    A = cx - dx
    B = cy - dy
    C = (cx**2 + cy**2 - turn_radius_m**2) - (dx * cx + dy * cy)

    logger.info(f"Radical axis line: A={A:.2f}, B={B:.2f}, C={C:.2f}")

    # Handle edge case: if B = 0, the line is horizontal (y = constant)
    if abs(B) < 1e-10:
        if abs(A) < 1e-10:
            raise ValueError("Line is degenerate (both A and B are zero)")
        x_line = C / A
        discriminant = turn_radius_m**2 - (x_line - cx)**2
        if discriminant < 0:
            raise ValueError(f"No intersection: line too far from circle (discriminant={discriminant})")
        sqrt_disc = math.sqrt(discriminant)
        sy_result = cy + turn_direction * sqrt_disc
        sx_result = x_line
        logger.info(f"Edge case: horizontal line, sx_result={sx_result:.2f}, sy_result={sy_result:.2f}")
    else:
        a = A**2 + B**2
        b = -2 * B**2 * cx + 2 * A * (B * cy - C)
        c = B**2 * cx**2 + (C - B * cy)**2 - turn_radius_m**2 * B**2

        logger.info(f"Quadratic coefficients: a={a:.2f}, b={b:.2f}, c={c:.2f}")

        discriminant = b**2 - 4 * a * c
        logger.info(f"Discriminant: {discriminant:.2f}")
        if discriminant < 0:
            raise ValueError(f"No intersection: line does not intersect circle (discriminant={discriminant})")

        sqrt_disc = math.sqrt(discriminant)

        x1_intersect = (-b + sqrt_disc) / (2 * a)
        y1_intersect = (C - A * x1_intersect) / B
        x2_intersect = (-b - sqrt_disc) / (2 * a)
        y2_intersect = (C - A * x2_intersect) / B

        # Select the correct intersection point based on smooth transition criterion
        radius1_x = x1_intersect - cx
        radius1_y = y1_intersect - cy
        if turn_direction == 1:
            tangent1_x = -radius1_y
            tangent1_y = radius1_x
        else:
            tangent1_x = radius1_y
            tangent1_y = -radius1_x
        dir1_x = dx - x1_intersect
        dir1_y = dy - y1_intersect
        dot1 = tangent1_x * dir1_x + tangent1_y * dir1_y

        radius2_x = x2_intersect - cx
        radius2_y = y2_intersect - cy
        if turn_direction == 1:
            tangent2_x = -radius2_y
            tangent2_y = radius2_x
        else:
            tangent2_x = radius2_y
            tangent2_y = -radius2_x
        dir2_x = dx - x2_intersect
        dir2_y = dy - y2_intersect
        dot2 = tangent2_x * dir2_x + tangent2_y * dir2_y

        logger.debug(f"Intersection point 1: ({x1_intersect:.2f}, {y1_intersect:.2f}), dot product: {dot1:.2f}")
        logger.debug(f"Intersection point 2: ({x2_intersect:.2f}, {y2_intersect:.2f}), dot product: {dot2:.2f}")

        if dot1 > 0:
            sx_result = x1_intersect
            sy_result = y1_intersect
            logger.debug(f"Selected intersection point 1 (dot={dot1:.2f})")
        elif dot2 > 0:
            sx_result = x2_intersect
            sy_result = y2_intersect
            logger.debug(f"Selected intersection point 2 (dot={dot2:.2f})")
        else:
            if dot1 > dot2:
                sx_result = x1_intersect
                sy_result = y1_intersect
                logger.warning(f"Both dot products negative, selected point 1 (dot={dot1:.2f} vs {dot2:.2f})")
            else:
                sx_result = x2_intersect
                sy_result = y2_intersect
                logger.warning(f"Both dot products negative, selected point 2 (dot={dot2:.2f} vs {dot1:.2f})")

    s_lat, s_lon = _unproject(transformer, sx_result, sy_result)
    return turn_data, s_lat, s_lon


def apply_wind(tas: float, wind_speed: float, wind_dir: float, course: float) -> float:
    """Returns ground speed (knots) for given TAS, wind and course."""
    wind_angle_rad = ((((wind_dir + 180) % 360) - course + 360) % 360) * (math.pi / 180)
    return tas + wind_speed * math.cos(wind_angle_rad)


def compute_leg_segments(
    prev_alt: float,
    leg_alt: float,
    distance_nm: float,
    course: float,
    wind_a_speed: float, wind_a_dir: float,
    wind_b_speed: float, wind_b_dir: float,
    tas: float,
    ff: float,
    regime: Optional['Regime'] = None,
    leg_index: Optional[int] = None,
    takeoff: Optional['TakeoffPerformance'] = None,
) -> dict:
    """Mirror of the TypeScript computeLegSegments. Returns a dict with 'kind' discriminator."""
    alt_delta = leg_alt - prev_alt

    # Determine if take-off segment is active
    takeoff_active = (
        leg_index == 0 and
        regime is not None and
        takeoff is not None and
        takeoff.timeSec > 0 and
        takeoff.distance > 0
    )

    # Wind-corrected take-off segment
    takeoff_seg = None
    if takeoff_active and takeoff is not None:
        tas_to = takeoff.distance / (takeoff.timeSec / 3600)
        gs_to = apply_wind(tas_to, wind_a_speed, wind_a_dir, course)
        ground_dist = gs_to * (takeoff.timeSec / 3600)
        takeoff_seg = {'time': takeoff.timeSec / 60, 'distance': ground_dist, 'fuel': takeoff.fuel}

    remaining_distance = distance_nm - takeoff_seg['distance'] if takeoff_seg else distance_nm

    # Level-leg path: fall back to stored tas/ff
    no_transition = (
        alt_delta == 0 or
        regime is None or
        (alt_delta > 0 and regime.climb is None) or
        (alt_delta < 0 and regime.descent is None)
    )

    if no_transition:
        if not takeoff_seg or regime is None:
            return {'kind': 'level', 'tas': tas, 'ff': ff}

        # T/O + cruise (no transition)
        if takeoff_seg['distance'] > distance_nm:
            return {
                'kind': 'warning',
                'reason': 'transition-too-long',
                'reachable_alt_delta': 0,
                'transition_distance': takeoff_seg['distance'],
                'fallback_time_sec': round(takeoff_seg['time'] * 60),
                'fallback_fuel': takeoff_seg['fuel'],
            }
        cruise_gs = apply_wind(regime.cruise.tas, wind_b_speed, wind_b_dir, course)
        cruise_time = (remaining_distance / cruise_gs) * 60
        return {
            'kind': 'segmented',
            'takeoff': takeoff_seg,
            'transition': {'phase': 'climb', 'time': 0, 'distance': 0, 'fuel': 0},
            'cruise': {'time': cruise_time, 'distance': remaining_distance, 'fuel': regime.cruise.ff * (cruise_time / 60)},
        }

    if alt_delta > 0:
        phase_roc = regime.climb.roc
        phase_tas = regime.climb.tas
        phase_ff = regime.climb.ff
        phase_label = 'climb'
    else:
        phase_roc = regime.descent.rod
        phase_tas = regime.descent.tas
        phase_ff = regime.descent.ff
        phase_label = 'descent'

    # Time to transition altitude (minutes)
    transition_time = abs(alt_delta) / phase_roc

    # Ground speed during transition (using origin wind)
    transition_gs = apply_wind(phase_tas, wind_a_speed, wind_a_dir, course)
    transition_distance = transition_gs * (transition_time / 60)

    # Warning when transition can't fit (including T/O distance)
    combined_transition_dist = (takeoff_seg['distance'] if takeoff_seg else 0) + transition_distance
    if combined_transition_dist > distance_nm:
        if takeoff_seg:
            reachable_transition_time = ((distance_nm - takeoff_seg['distance']) / transition_gs) * 60
        else:
            reachable_transition_time = (distance_nm / transition_gs) * 60
        reachable_alt_delta = math.copysign(phase_roc * max(reachable_transition_time, 0), alt_delta)
        fallback_time_sec = round(transition_time * 60)
        fallback_fuel = phase_ff * (transition_time / 60)
        return {
            'kind': 'warning',
            'reason': 'transition-too-long',
            'reachable_alt_delta': reachable_alt_delta,
            'transition_distance': combined_transition_dist,
            'fallback_time_sec': fallback_time_sec,
            'fallback_fuel': fallback_fuel,
        }

    # Cruise covers the remainder
    cruise_distance = remaining_distance - transition_distance
    cruise_gs = apply_wind(regime.cruise.tas, wind_b_speed, wind_b_dir, course)
    cruise_time = (cruise_distance / cruise_gs) * 60

    result = {
        'kind': 'segmented',
        'transition': {
            'phase': phase_label,
            'time': transition_time,
            'distance': transition_distance,
            'fuel': phase_ff * (transition_time / 60),
        },
        'cruise': {
            'time': cruise_time,
            'distance': cruise_distance,
            'fuel': regime.cruise.ff * (cruise_time / 60),
        },
    }
    if takeoff_seg:
        result['takeoff'] = takeoff_seg
    return result


class LegData:
    """Represent a leg with all the data to display."""
    origin: Point               # Origin turnpoint (where the turn starts)
    destination: Point          # Destination turnpoint
    straigthening_point: Point  # Point where the turn is finished
    turn_data: TurnData         # Data for the turn (center point and radius)
    course: float               # Magnetic course after the turn
    distanceNm: float           # Distance of the leg in nautical miles
    eteSec: int                 # Estimated time of arrival in seconds
    legFuel: float              # Fuel consumed on the leg
    heading: float              # Magnetic heading after the turn (considering the wind)
    tas: float                  # True air speed
    prev_alt: float             # Altitude at the origin waypoint (for climb/descent detection)
    alt: float                  # Altitude after any climb / descend
    time_to_straightening_s: int # Time to the straigthening point in seconds
    turn_angle_rad: float       # Turn angle in radians (along the arc)
    turn_direction: int         # Turn direction: 1 for counter-clockwise, -1 for clockwise

    def __init__(self, flightPlan: FlightPlan, indexWptFrom: int, indexWptTo: int, inbound_bearing: float, transformer: Transformer = None, navigation_mode: str = "geographic"):
        """Initialize a new leg from indexWptFrom to indexWptTo."""

        logger.info(f"== Calculating leg from {indexWptFrom} to {indexWptTo} ==")
        self.origin = Point(flightPlan.points[indexWptFrom].lat, flightPlan.points[indexWptFrom].lon)
        self.destination = Point(flightPlan.points[indexWptTo].lat, flightPlan.points[indexWptTo].lon)

        turn_radius_m = (flightPlan.points[indexWptTo].tas * 0.514)**2 / (9.80665 * math.tan(math.radians(flightPlan.bankAngle)))
        logger.info(f"Turn radius: {turn_radius_m:.2f} meters")

        # Calculate the straigthening point (point where the turn is finished).
        if indexWptFrom == 0:
            # First point has no straigthening point, use the point itself.
            inbound_bearing = 0
            s_lat, s_lon = self.origin.lat, self.origin.lon
            turn_data = TurnData(0, 0)
            turn_direction = 1  # Default, not used for first leg
        else:
            turn_data, s_lat, s_lon = calculate_straigthening_point(inbound_bearing, flightPlan.points[indexWptFrom], flightPlan.points[indexWptTo], turn_radius_m, transformer, navigation_mode)
        self.straigthening_point = Point(s_lat, s_lon)
        logger.info(f"Straigthening point: {self.straigthening_point}")
        self.turn_data = turn_data

        # Calculate the course and distance of the leg.
        bearing = calculate_bearing(self.straigthening_point, self.destination, navigation_mode, transformer)
        self.course = (bearing + flightPlan.declination + 360) % 360
        logger.info(f"Course: {self.course}")

        # Calculate the distance of the leg.
        if indexWptFrom == 0:
            turn_angle_rd = 0
            arc_distance = 0
        else:
            cx, cy = _project(transformer, turn_data.center.lat, turn_data.center.lon)
            sx_entry, sy_entry = _project(transformer, self.origin.lat, self.origin.lon)
            sx_exit, sy_exit = _project(transformer, self.straigthening_point.lat, self.straigthening_point.lon)

            angle_entry = math.atan2(sy_entry - cy, sx_entry - cx)
            angle_exit = math.atan2(sy_exit - cy, sx_exit - cx)

            aprox_outbound_bearing = calculate_bearing(self.origin, self.destination, navigation_mode, transformer)
            if (aprox_outbound_bearing - inbound_bearing + 360) % 360 > 180:
                turn_direction = 1  # Counter-clockwise
            else:
                turn_direction = -1  # Clockwise

            def normalize_angle(angle):
                """Normalize angle to [0, 2π)"""
                while angle < 0:
                    angle += 2 * math.pi
                while angle >= 2 * math.pi:
                    angle -= 2 * math.pi
                return angle

            angle_entry_norm = normalize_angle(angle_entry)
            angle_exit_norm = normalize_angle(angle_exit)

            if turn_direction == 1:  # Counter-clockwise: increasing angle direction
                if angle_exit_norm >= angle_entry_norm:
                    turn_angle_rd = angle_exit_norm - angle_entry_norm
                else:
                    turn_angle_rd = (2 * math.pi - angle_entry_norm) + angle_exit_norm
            else:  # Clockwise: decreasing angle direction
                if angle_exit_norm <= angle_entry_norm:
                    turn_angle_rd = angle_entry_norm - angle_exit_norm
                else:
                    turn_angle_rd = angle_entry_norm + (2 * math.pi - angle_exit_norm)

        logger.info(f"Turn angle: {math.degrees(turn_angle_rd):.2f} degrees")
        self.turn_angle_rad = turn_angle_rd
        self.turn_direction = turn_direction if indexWptFrom > 0 else 1

        arc_distance = turn_radius_m * turn_angle_rd
        distance = arc_distance + calculate_distance(self.straigthening_point, self.destination, navigation_mode, transformer)
        self.distanceNm = distance / 1852

        # Calculate wind for heading and arc time (uses destination wind)
        windAngleRad = ((((flightPlan.points[indexWptTo].windDir + 180) % 360) - self.course + 360) % 360) * (math.pi / 180)
        tailComponent = flightPlan.points[indexWptTo].windSpeed * math.cos(windAngleRad)
        crossComponent = flightPlan.points[indexWptTo].windSpeed * math.sin(windAngleRad)
        cruiseGroundSpeed = flightPlan.points[indexWptTo].tas + tailComponent
        self.time_to_straightening_s = round((arc_distance / 1852) / cruiseGroundSpeed * 3600)
        self.heading = (self.course - math.asin(crossComponent / cruiseGroundSpeed) * 180 / math.pi + 360) % 360

        # Regime-aware ETE and fuel
        regime_id = flightPlan.points[indexWptTo].regimeId
        regime = next((r for r in flightPlan.aircraft.regimes if r.id == regime_id), None) if regime_id else None
        origin_pt = flightPlan.points[indexWptFrom]
        dest_pt = flightPlan.points[indexWptTo]
        leg_index = indexWptFrom  # leg 0 = first leg (from point 0 to point 1)
        seg = compute_leg_segments(
            prev_alt=origin_pt.alt,
            leg_alt=dest_pt.alt,
            distance_nm=self.distanceNm,
            course=self.course,
            wind_a_speed=origin_pt.windSpeed, wind_a_dir=origin_pt.windDir,
            wind_b_speed=dest_pt.windSpeed, wind_b_dir=dest_pt.windDir,
            tas=dest_pt.tas,
            ff=dest_pt.fuelFlow,
            regime=regime,
            leg_index=leg_index,
            takeoff=flightPlan.aircraft.takeoff,
        )
        if seg['kind'] == 'level':
            gs = apply_wind(seg['tas'], dest_pt.windSpeed, dest_pt.windDir, self.course)
            self.eteSec = round(self.distanceNm / gs * 3600)
            self.legFuel = self.eteSec * seg['ff'] / 3600
        elif seg['kind'] == 'segmented':
            takeoff_time = seg['takeoff']['time'] if seg.get('takeoff') else 0
            self.eteSec = round((takeoff_time + seg['transition']['time'] + seg['cruise']['time']) * 60)
            takeoff_fuel = seg['takeoff']['fuel'] if seg.get('takeoff') else 0
            self.legFuel = takeoff_fuel + seg['transition']['fuel'] + seg['cruise']['fuel']
        else:  # warning
            self.eteSec = seg['fallback_time_sec']
            self.legFuel = seg['fallback_fuel']

        self.tas = flightPlan.points[indexWptTo].tas
        self.prev_alt = flightPlan.points[indexWptFrom].alt
        self.alt = flightPlan.points[indexWptTo].alt

        logger.info(f"ETE: {self.eteSec}")
        logger.info(f"Leg fuel: {self.legFuel}")
        logger.info(f"Heading: {self.heading}")

    def __repr__(self) -> str:
        return f"LegData(course={self.course}, distanceNm={self.distanceNm}, eteSec={self.eteSec}, legFuel={self.legFuel}, heading={self.heading})"

class FlightPlanData:
    """Represent the processed flight plan with all the data to display."""
    turnpointData: List[TurnpointData]
    legData: List[LegData]
    totalDistanceNm: float
    totalTimeSec: int
    totalFuel: float
    fuelReserve: float

    def __init__(self, flightPlan: FlightPlan):
        self.turnpointData = []
        self.legData = []
        self.totalDistanceNm = 0
        self.totalTimeSec = 0
        self.totalFuel = 0
        self.fuelReserve = 0

        # Load theatre config and create transformer
        theatre_config = _load_theatre_config(flightPlan.theatre)
        transformer = _create_transformer(theatre_config)
        navigation_mode = theatre_config.get("navigation_mode", "geographic")

        hackOffsetSec: int | None = None
        previousEta = flightPlan.initTimeSec
        previousEfr = flightPlan.initFob - flightPlan.aircraft.taxiFuel

        for i in range(len(flightPlan.points)):
            if i == 0:
                tp = TurnpointData()
                tp.etaSec = flightPlan.initTimeSec
                tp.efr = flightPlan.initFob
                self.turnpointData.append(tp)
            else:
                if i < len(flightPlan.points):
                    inbound_bearing = self.legData[-1].heading if len(self.legData) > 0 else 0
                    leg = LegData(flightPlan, i-1, i, inbound_bearing, transformer, navigation_mode)
                    self.legData.append(leg)
                tp = TurnpointData()
                arrivalEta = previousEta + leg.eteSec
                arrivalEfr = previousEfr - leg.legFuel
                tp.etaSec = arrivalEta
                tp.efr = arrivalEfr

                # If destination is a Push point, account for wait time fuel burn
                dest_point = flightPlan.points[i]
                if dest_point.waypointType == 'push':
                    effectiveExitTime = get_effective_exit_time(dest_point.exitTimeSec, arrivalEta)
                    waitTimeSec = effectiveExitTime - arrivalEta
                    waitFuel = waitTimeSec * dest_point.fuelFlow / 3600
                    leg.legFuel += waitFuel
                    tp.efr = arrivalEfr - waitFuel
                    tp.exitTimeSec = effectiveExitTime
                    previousEta = effectiveExitTime
                    # HACK ETA reset
                    if dest_point.hack:
                        hackOffsetSec = effectiveExitTime
                else:
                    previousEta = arrivalEta

                previousEfr = tp.efr

                # Set hackEtaSec for waypoints after a hack push point
                if hackOffsetSec is not None:
                    tp.hackEtaSec = tp.etaSec - hackOffsetSec

                self.turnpointData.append(tp)

    def __repr__(self) -> str:
        return f"FlightPlanData(turnpointData={pprint.pformat(self.turnpointData)}, legData={pprint.pformat(self.legData)}, totalDistanceNm={self.totalDistanceNm}, totalTimeSec={self.totalTimeSec}, totalFuel={self.totalFuel}, fuelReserve={self.fuelReserve})"
