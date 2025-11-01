"""
Map annotation module for drawing overlays on map images.

This module provides functions for annotating map images with flight plan legs,
waypoints, and other visual markers.
"""

from typing import Callable, Tuple
from PIL import Image, ImageDraw
import logging
from flight_plan import FlightPlan, FlightPlanTurnPoint

# Set up logger
logger = logging.getLogger(__name__)


def draw_leg(
    draw: ImageDraw.ImageDraw,
    origin: FlightPlanTurnPoint,
    destination: FlightPlanTurnPoint,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]],
    image_width: int,
    image_height: int
) -> None:
    """
    Draw a leg line between two waypoints on an image.
    
    This function converts lat/lon coordinates to pixel coordinates using the provided
    converter function and draws a thick, high-contrast line with markers at the endpoints.
    
    Args:
        draw: The ImageDraw object to draw on
        origin: The starting waypoint
        destination: The ending waypoint
        coord_to_pixel: Function that converts geographic coordinates (lat, lon) to pixel coordinates (x, y)
                        Signature: (float, float) -> Tuple[float, float]
        image_width: Width of the image (for clamping)
        image_height: Height of the image (for clamping)
    """
    try:
        # Convert lat/lon coordinates to pixel coordinates using the provided converter function
        origin_x_px, origin_y_px = coord_to_pixel(origin.lat, origin.lon)
        dest_x_px, dest_y_px = coord_to_pixel(destination.lat, destination.lon)
        
        logger.debug(f"Leg endpoints on image: O=({origin_x_px:.1f}, {origin_y_px:.1f}), D=({dest_x_px:.1f}, {dest_y_px:.1f})")
        
        # Clamp to image bounds so line is visible even if slightly outside
        def _clamp(val, lo, hi):
            return max(lo, min(val, hi))
        ox = _clamp(origin_x_px, 0, image_width - 1)
        oy = _clamp(origin_y_px, 0, image_height - 1)
        dx = _clamp(dest_x_px, 0, image_width - 1)
        dy = _clamp(dest_y_px, 0, image_height - 1)
        
        # Draw a high-contrast thick line (white outline + magenta core)
        outline_width = 12
        core_width = 8
        draw.line([(ox, oy), (dx, dy)], fill=(255, 255, 255), width=outline_width)
        draw.line([(ox, oy), (dx, dy)], fill=(255, 0, 255), width=core_width)
        
        # Draw larger endpoint markers with white outline and magenta fill
        r_outer = 9
        r_inner = 6
        # Origin marker
        draw.ellipse((ox - r_outer, oy - r_outer, ox + r_outer, oy + r_outer), outline=(255, 255, 255), width=3)
        draw.ellipse((ox - r_inner, oy - r_inner, ox + r_inner, oy + r_inner), fill=(255, 0, 255))
        # Destination marker
        draw.ellipse((dx - r_outer, dy - r_outer, dx + r_outer, dy + r_outer), outline=(255, 255, 255), width=3)
        draw.ellipse((dx - r_inner, dy - r_inner, dx + r_inner, dy + r_inner), fill=(255, 0, 255))
        
        logger.debug(f"Drew leg overlay on image: O=({origin_x_px:.1f},{origin_y_px:.1f}) D=({dest_x_px:.1f},{dest_y_px:.1f}) | clamped O=({ox:.1f},{oy:.1f}) D=({dx:.1f},{dy:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw leg overlay on image: {e}")


def annotate_map(
    image: Image.Image,
    flight_plan: FlightPlan,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]]
) -> None:
    """
    Annotate a map image with a leg line between two waypoints.
    
    This function extracts the first leg from the flight plan and draws it on the image.
    
    Args:
        image: The PIL Image to annotate (will be modified in place)
        flight_plan: The flight plan
        coord_to_pixel: Function that converts geographic coordinates (lat, lon) to pixel coordinates (x, y)
                        Signature: (float, float) -> Tuple[float, float]
    """
    try:
        # Extract the first leg from the flight plan
        if len(flight_plan.points) < 2:
            logger.warning("Flight plan must have at least 2 points to draw a leg")
            return
        
        origin = flight_plan.points[0]
        destination = flight_plan.points[1]
        
        draw = ImageDraw.Draw(image)
        
        # Draw the leg using the drawing function
        draw_leg(draw, origin, destination, coord_to_pixel, image.width, image.height)
    except Exception as e:
        logger.warning(f"Failed to annotate map image: {e}")