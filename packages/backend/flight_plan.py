"""
Flight plan data models.

This module defines the Pydantic models for flight plan validation and data structures.
"""

import math
import pprint
import logging
import os
import json
from pydantic import BaseModel, Field
from typing import List, Tuple
from pyproj import Transformer

# Set up logger (logging configuration is handled centrally in main.py)
logger = logging.getLogger(__name__)

THEATRES_DIR = os.path.join(os.path.dirname(__file__), "theatres")

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


class FlightPlan(BaseModel):
    """Represents a complete flight plan with waypoints and initial conditions."""
    theatre: str = Field(..., description="Theatre name")
    points: List[FlightPlanTurnPoint]
    declination: float = Field(..., ge=-25, le=25, description="Magnetic declination")
    bankAngle: float = Field(..., ge=5, le=85, description="Bank angle for turns (degrees)")
    initTimeSec: int = Field(..., ge=0, le=86399, description="Initial time seconds (0-86399)")
    initFob: float = Field(..., ge=0, description="Initial fuel on board")
    name: str | None = Field(default=None, description="Name of the flight plan")


class ImportFlightPlanRequest(BaseModel):
    """Request model for importing a flight plan with version."""
    version: str
    flightPlan: FlightPlan

class TurnpointData:
    """Represent a turnpoint with all the data to display."""
    etaSec: int
    efr: float

    def __repr__(self) -> str:
        return f"TurnpointData(etaSec={self.etaSec}, efr={self.efr})"

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

        # Calculate wind.
        windAngleRad = ((((flightPlan.points[indexWptTo].windDir + 180) % 360) - self.course + 360) % 360) * (math.pi / 180)
        tailComponent = flightPlan.points[indexWptTo].windSpeed * math.cos(windAngleRad)
        crossComponent = flightPlan.points[indexWptTo].windSpeed * math.sin(windAngleRad)

        groundSpeed = flightPlan.points[indexWptTo].tas + tailComponent
        self.time_to_straightening_s = round((arc_distance / 1852) / groundSpeed * 3600)
        self.eteSec = round(self.distanceNm / groundSpeed * 3600)
        self.legFuel = self.eteSec * flightPlan.points[indexWptTo].fuelFlow / 3600
        self.heading = (self.course - math.asin(crossComponent / groundSpeed) * 180 / math.pi + 360) % 360

        self.tas = flightPlan.points[indexWptTo].tas
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
                tp.etaSec = self.turnpointData[-1].etaSec + leg.eteSec
                tp.efr = self.turnpointData[-1].efr - leg.legFuel
                self.turnpointData.append(tp)

    def __repr__(self) -> str:
        return f"FlightPlanData(turnpointData={pprint.pformat(self.turnpointData)}, legData={pprint.pformat(self.legData)}, totalDistanceNm={self.totalDistanceNm}, totalTimeSec={self.totalTimeSec}, totalFuel={self.totalFuel}, fuelReserve={self.fuelReserve})"
