"""
Flight plan data models.

This module defines the Pydantic models for flight plan validation and data structures.
"""

import math
import pprint
from pydantic import BaseModel, Field
from typing import List

class FlightPlanTurnPoint(BaseModel):
    """Represents a single turn point in a flight plan."""
    lat: float = Field(..., ge=-90, le=90, description="Latitude (-90 to 90)")
    lon: float = Field(..., ge=-180, le=180, description="Longitude (-180 to 180)")
    tas: float = Field(..., ge=0, description="True Air Speed into this TP")
    alt: float = Field(..., ge=0, description="Altitude into this TP")
    fuelFlow: float = Field(..., ge=0, description="Fuel flow rate into this TP")
    windSpeed: float = Field(..., ge=0, description="Wind speed")
    windDir: float = Field(..., ge=0, le=360, description="Wind direction (0-360)")


class FlightPlan(BaseModel):
    """Represents a complete flight plan with waypoints and initial conditions."""
    points: List[FlightPlanTurnPoint]
    declination: float
    initTimeSec: int = Field(..., ge=0, le=86399, description="Initial time seconds (0-86399)")
    initFob: float = Field(..., ge=0, description="Initial fuel on board")

class TurnpointData:
    """Represent a turnpoint with all the data to display."""
    etaSec: int
    efr: float

    def __repr__(self) -> str:
        return f"TurnpointData(etaSec={self.etaSec}, efr={self.efr})"

def calculate_bearing(point1: FlightPlanTurnPoint, point2: FlightPlanTurnPoint) -> float:
    """Calculate the bearing between two points."""
    lat1 = math.radians(point1.lat)
    lon1 = math.radians(point1.lon)
    lat2 = math.radians(point2.lat)
    lon2 = math.radians(point2.lon)
    dLon = lon2 - lon1
    y = math.sin(dLon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dLon)
    return math.degrees(math.atan2(y, x))

def calculate_distance(point1: FlightPlanTurnPoint, point2: FlightPlanTurnPoint) -> float:
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

class LegData:
    """Represent a leg with all the data to display."""
    course: float
    distanceNm: float
    eteSec: int
    legFuel: float
    heading: float

    def __init__(self, flightPlan: FlightPlan, indexWptFrom: int, indexWptTo: int):
        """Initialize a new leg from indexWptFrom to indexWptTo."""
        bearing = calculate_bearing(flightPlan.points[indexWptFrom], flightPlan.points[indexWptTo])
        self.course = (bearing + flightPlan.declination + 360) % 360

        distance = calculate_distance(flightPlan.points[indexWptFrom], flightPlan.points[indexWptTo])
        self.distanceNm = distance / 1852
        
        """Calculate wind"""
        windAngleRad = ((((flightPlan.points[indexWptTo].windDir + 180) % 360) - self.course + 360) % 360) * (math.pi / 180)
        tailComponent = flightPlan.points[indexWptTo].windSpeed * math.cos(windAngleRad)
        crossComponent = flightPlan.points[indexWptTo].windSpeed * math.sin(windAngleRad)

        groundSpeed = flightPlan.points[indexWptTo].tas + tailComponent
        self.eteSec = round(self.distanceNm / groundSpeed * 3600)
        self.legFuel = self.eteSec * flightPlan.points[indexWptTo].fuelFlow / 3600
        self.heading = self.course - math.asin(crossComponent / groundSpeed) * 180 / math.pi

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