"""
Flight plan data models.

This module defines the Pydantic models for flight plan validation and data structures.
"""

from pydantic import BaseModel, Field
from typing import List


class FlightPlanTurnPoint(BaseModel):
    """Represents a single turn point in a flight plan."""
    lat: float = Field(..., ge=-90, le=90, description="Latitude (-90 to 90)")
    lon: float = Field(..., ge=-180, le=180, description="Longitude (-180 to 180)")
    tas: float = Field(..., ge=0, description="True Air Speed")
    alt: float = Field(..., ge=0, description="Altitude")
    fuelFlow: float = Field(..., ge=0, description="Fuel flow rate")
    windSpeed: float = Field(..., ge=0, description="Wind speed")
    windDir: float = Field(..., ge=0, le=360, description="Wind direction (0-360)")


class FlightPlan(BaseModel):
    """Represents a complete flight plan with waypoints and initial conditions."""
    points: List[FlightPlanTurnPoint]
    declination: float
    initTimeSec: int = Field(..., ge=0, le=86399, description="Initial time seconds (0-86399)")
    initFob: float = Field(..., ge=0, description="Initial fuel on board")

