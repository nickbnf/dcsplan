"""
Flight plan data models.

This module defines the Pydantic models for flight plan validation and data structures.
"""

import math
import pprint
import logging
from tokenize import Pointfloat
from pydantic import BaseModel, Field
from typing import List, Tuple
from pyproj import Transformer

CENTRAL_MERIDIAN = 39

# Set up logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

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
    points: List[FlightPlanTurnPoint]
    declination: float = Field(..., ge=-25, le=25, description="Magnetic declination")
    bankAngle: float = Field(..., ge=5, le=85, description="Bank angle for turns (degrees)")
    initTimeSec: int = Field(..., ge=0, le=86399, description="Initial time seconds (0-86399)")
    initFob: float = Field(..., ge=0, description="Initial fuel on board")

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

def calculate_bearing(point1: Point, point2: Point) -> float:
    """Calculate the bearing between two points in degrees (0-360)."""
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

def calculate_distance(point1: Point, point2: Point) -> float:
    """Calculate the distance between two points."""
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

# TODO: Move to a separate module
def _lat_lon_to_transverse_mercator(lat: float, lon: float) -> Tuple[float, float]:
    """
    Convert lat/lon to Transverse Mercator coordinates.
    
    Args:
        lat: Latitude in degrees
        lon: Longitude in degrees
        
    Returns:
        Tuple of (x, y) in meters
    """
    # Transverse Mercator projection with central meridian at 39°
    transformer = Transformer.from_crs(
        "EPSG:4326",  # WGS84
        f"+proj=tmerc +lat_0=0 +lon_0={CENTRAL_MERIDIAN} +k=1.0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
        always_xy=True
    )
    x, y = transformer.transform(lon, lat)
    return x, y

def _transverse_mercator_to_lat_lon(x: float, y: float) -> Tuple[float, float]:
    """
    Convert Transverse Mercator coordinates to lat/lon.
    
    Args:
        x: X coordinate in meters
        y: Y coordinate in meters
        
    Returns:
        Tuple of (lat, lon) in degrees
    """
    # Reverse Transverse Mercator projection with central meridian at 39°
    transformer = Transformer.from_crs(
        f"+proj=tmerc +lat_0=0 +lon_0={CENTRAL_MERIDIAN} +k=1.0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
        "EPSG:4326",  # WGS84
        always_xy=True
    )
    lon, lat = transformer.transform(x, y)
    return lat, lon

def calculate_straigthening_point(inbound_bearing: float, point1: Point, point2: Point, turn_radius_m: float) -> Tuple[TurnData, float, float]:
    """Calculate the straigthening point (point where the turn is finished)."""
    aprox_outbound_bearing = calculate_bearing(point1, point2)
    sx, sy = _lat_lon_to_transverse_mercator(point1.lat, point1.lon)
    dx, dy = _lat_lon_to_transverse_mercator(point2.lat, point2.lon)
    logger.info(f"Start point: {sx}, {sy}")

    # Calculate the turning circle
    if (aprox_outbound_bearing - inbound_bearing + 360) % 360 > 180:
        # Left turn (direct)
        turn_direction = 1
    else:
        # Right turn (reverse)
        turn_direction = -1

    cx = sx - turn_direction * math.cos(math.radians(inbound_bearing)) * turn_radius_m
    cy = sy + turn_direction * math.sin(math.radians(inbound_bearing)) * turn_radius_m
    c_lat, c_lon = _transverse_mercator_to_lat_lon(cx, cy)
    turn_data = TurnData(c_lat, c_lon)

    logger.info(f"Centre of the turning circle: {cx}, {cy}")
    logger.info(f"Destination point: {dx}, {dy}")

    # Calculate the coefs for the equation of the radical axis line
    # Line equation: Ax + By = C
    # According to formulas:
    #   (x₁, y₁) = destination = (dx, dy)
    #   (x₂, y₂) = circle center = (cx, cy)
    #   A = x₂ - x₁, B = y₂ - y₁
    A = cx - dx
    B = cy - dy
    # C = (x₂² + y₂² - r²) - (x₁x₂ + y₁y₂)
    C = (cx**2 + cy**2 - turn_radius_m**2) - (dx * cx + dy * cy)
    
    logger.info(f"Radical axis line: A={A:.2f}, B={B:.2f}, C={C:.2f}")
    
    # Handle edge case: if B = 0, the line is horizontal (y = constant)
    if abs(B) < 1e-10:
        # Horizontal line: y = constant
        # Circle: (x - cx)² + (y - cy)² = r²
        if abs(A) < 1e-10:
            raise ValueError("Line is degenerate (both A and B are zero)")
        x_line = C / A
        discriminant = turn_radius_m**2 - (x_line - cx)**2
        if discriminant < 0:
            raise ValueError(f"No intersection: line too far from circle (discriminant={discriminant})")
        sqrt_disc = math.sqrt(discriminant)
        # Choose the point in the direction of travel
        sy_result = cy + turn_direction * sqrt_disc
        sx_result = x_line
        logger.info(f"Edge case: horizontal line, sx_result={sx_result:.2f}, sy_result={sy_result:.2f}")
    else:
        # Calculate the coefs for the quadratic equation
        # Circle: (x - cx)² + (y - cy)² = r²
        # After substitution: ax² + bx + c = 0
        # According to formulas (using circle center cx, cy):
        a = A**2 + B**2
        b = -2 * B**2 * cx + 2 * A * (B * cy - C)
        c = B**2 * cx**2 + (C - B * cy)**2 - turn_radius_m**2 * B**2

        logger.info(f"Quadratic coefficients: a={a:.2f}, b={b:.2f}, c={c:.2f}")

        # Check discriminant before taking square root
        discriminant = b**2 - 4 * a * c
        logger.info(f"Discriminant: {discriminant:.2f}")
        if discriminant < 0:
            raise ValueError(f"No intersection: line does not intersect circle (discriminant={discriminant})")
        
        # Calculate the straigthening point (x₃, y₃)
        sqrt_disc = math.sqrt(discriminant)
        
        # Calculate both solutions for the straigthening point
        x1_intersect = (-b + sqrt_disc) / (2 * a)
        y1_intersect = (C - A * x1_intersect) / B
        x2_intersect = (-b - sqrt_disc) / (2 * a)
        y2_intersect = (C - A * x2_intersect) / B
        
        # Calculate angles from intersection points to destination point
        angle1 = math.atan2(dy - y1_intersect, dx - x1_intersect)
        angle2 = math.atan2(dy - y2_intersect, dx - x2_intersect)
        
        # Convert inbound_bearing (compass bearing: 0°=north, 90°=east, clockwise) 
        # to math angle (0°=east, counter-clockwise)
        # Compass 0° (north) = math 90° (π/2)
        # Compass 90° (east) = math 0° (0)
        # Formula: math_angle = 90° - compass_bearing
        angle_entry = math.radians(90 - inbound_bearing)
        # Normalize to [0, 2π)
        while angle_entry < 0:
            angle_entry += 2 * math.pi
        while angle_entry >= 2 * math.pi:
            angle_entry -= 2 * math.pi
        
        # Turning in the correct direction, determine which angle we reach first
        if turn_direction == -1:
            logger.info(f"Right turn")
            if angle1 - angle_entry < angle2 - angle_entry:
                sx_result = x1_intersect
                sy_result = y1_intersect
            else:
                sx_result = x2_intersect
                sy_result = y2_intersect
        else:
            logger.info(f"Left turn")
            if angle1 - angle_entry > angle2 - angle_entry:
                sx_result = x1_intersect
                sy_result = y1_intersect
            else:
                sx_result = x2_intersect
                sy_result = y2_intersect

    s_lat, s_lon = _transverse_mercator_to_lat_lon(sx_result, sy_result)
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

    def __init__(self, flightPlan: FlightPlan, indexWptFrom: int, indexWptTo: int):
        """Initialize a new leg from indexWptFrom to indexWptTo."""
        
        logger.info(f"Calculating leg from {indexWptFrom} to {indexWptTo}")
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
        else:
            inbound_bearing = calculate_bearing(
                Point(flightPlan.points[indexWptFrom-1].lat, flightPlan.points[indexWptFrom-1].lon),
                Point(flightPlan.points[indexWptFrom].lat, flightPlan.points[indexWptFrom].lon))
            turn_data, s_lat, s_lon = calculate_straigthening_point(inbound_bearing, flightPlan.points[indexWptFrom], flightPlan.points[indexWptTo], turn_radius_m)
        self.straigthening_point = Point(s_lat, s_lon)
        logger.info(f"Straigthening point: {self.straigthening_point}")
        self.turn_data = turn_data

        # Calculate the course and distance of the leg.
        bearing = calculate_bearing(self.straigthening_point, self.destination)
        self.course = (bearing + flightPlan.declination + 360) % 360
        logger.info(f"Course: {self.course}")

        # Calculate the distance of the leg.
        # How many degrees are we turning? (this is the angle difference between two vectors)
        # inbound vector: (sin inbound_bearing, cos inbound_bearing)
        # outbound vector: (sin outbound_bearing, cos outbound_bearing)
        dot_product = math.sin(math.radians(inbound_bearing)) * math.sin(math.radians(bearing)) +\
            math.cos(math.radians(inbound_bearing)) * math.cos(math.radians(bearing))
        turn_angle_rd = math.acos(dot_product)
        logger.info(f"Turn angle: {math.degrees(turn_angle_rd):.2f} degrees")
        arc_distance = turn_radius_m * turn_angle_rd
        distance = arc_distance + calculate_distance(self.straigthening_point, self.destination)
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

        for i in range(len(flightPlan.points)):
            if i == 0:
                tp = TurnpointData()
                tp.etaSec = flightPlan.initTimeSec
                tp.efr = flightPlan.initFob
                self.turnpointData.append(tp)
            else:
                if i < len(flightPlan.points):
                    leg = LegData(flightPlan, i-1, i)
                    self.legData.append(leg)
                tp = TurnpointData()
                tp.etaSec = self.turnpointData[-1].etaSec + leg.eteSec
                tp.efr = self.turnpointData[-1].efr - leg.legFuel
                self.turnpointData.append(tp)

    def __repr__(self) -> str:
        return f"FlightPlanData(turnpointData={pprint.pformat(self.turnpointData)}, legData={pprint.pformat(self.legData)}, totalDistanceNm={self.totalDistanceNm}, totalTimeSec={self.totalTimeSec}, totalFuel={self.totalFuel}, fuelReserve={self.fuelReserve})"