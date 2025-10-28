"""
Kneeboard generation module for flight plan visualization.

This module handles validation of flight plan data and generation of
kneeboard PNG images.
"""

from pydantic import BaseModel, Field
from typing import List
from PIL import Image, ImageDraw, ImageFont
import math
import io


# Pydantic models for flight plan validation
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
    initTimeHour: int = Field(..., ge=0, le=23, description="Initial time hour (0-23)")
    initTimeMin: int = Field(..., ge=0, le=59, description="Initial time minute (0-59)")
    initFob: float = Field(..., ge=0, description="Initial fuel on board")


def calculate_ete(origin: FlightPlanTurnPoint, destination: FlightPlanTurnPoint) -> float:
    """
    Calculate Estimated Time Enroute (ETE) in minutes between two waypoints.
    
    Args:
        origin: The starting waypoint
        destination: The ending waypoint
        
    Returns:
        ETE in minutes (float)
    """
    # Convert to radians
    lat1 = math.radians(origin.lat)
    lon1 = math.radians(origin.lon)
    lat2 = math.radians(destination.lat)
    lon2 = math.radians(destination.lon)
    
    # Calculate bearing
    dLon = lon2 - lon1
    y = math.sin(dLon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dLon)
    bearing = math.atan2(y, x)
    course = math.degrees(bearing)
    if course < 0:
        course += 360
    
    # Calculate distance using Haversine formula
    R = 6371000  # Earth's radius in meters
    dLat = lat2 - lat1
    a = math.sin(dLat/2) * math.sin(dLat/2) + \
        math.cos(lat1) * math.cos(lat2) * \
        math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    length_meters = R * c
    
    # Convert to nautical miles
    distance_nm = length_meters / 1852
    
    # Calculate wind component
    wind_angle_rad = math.radians(((origin.windDir + 180) % 360 - course + 360) % 360)
    tail_component = origin.windSpeed * math.cos(wind_angle_rad)
    
    ground_speed = origin.tas + tail_component
    
    # ETE in minutes
    ete = distance_nm / (ground_speed / 60)
    
    return ete


def calculate_total_duration(flight_plan: FlightPlan) -> float:
    """
    Calculate total flight duration in minutes.
    
    Args:
        flight_plan: The flight plan to process
        
    Returns:
        Total flight duration in minutes (float)
        
    Raises:
        ValueError: If flight plan has fewer than 2 waypoints
    """
    if len(flight_plan.points) < 2:
        raise ValueError("Flight plan must have at least 2 waypoints")
    
    total_minutes = 0
    for i in range(len(flight_plan.points) - 1):
        ete = calculate_ete(flight_plan.points[i], flight_plan.points[i + 1])
        total_minutes += ete
    return total_minutes


def generate_kneeboard_png(total_duration: float) -> bytes:
    """
    Generate a 768x1024 PNG image with flight duration text.
    
    Args:
        total_duration: Total flight duration in minutes
        
    Returns:
        PNG image data as bytes
    """
    # Create a white image
    width, height = 768, 1024
    image = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(image)
    
    # Try to use a nice font, fallback to default if not available
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 72)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
    except:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()
    
    # Calculate total hours and minutes
    total_hours = int(total_duration // 60)
    total_mins = int(total_duration % 60)
    
    # Create text
    if total_hours > 0:
        duration_text = f"{total_hours}h {total_mins}m"
    else:
        duration_text = f"{total_mins}m"
    
    # Get text size and center it
    bbox = draw.textbbox((0, 0), duration_text, font=font_large)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (width - text_width) // 2
    y = (height - text_height) // 2
    
    # Draw the text
    draw.text((x, y), duration_text, fill='black', font=font_large)
    
    # Add label
    label_text = "Total Flight Duration"
    bbox_label = draw.textbbox((0, 0), label_text, font=font_small)
    text_width_label = bbox_label[2] - bbox_label[0]
    x_label = (width - text_width_label) // 2
    y_label = y - 80
    
    draw.text((x_label, y_label), label_text, fill='gray', font=font_small)
    
    # Save to bytes
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()

