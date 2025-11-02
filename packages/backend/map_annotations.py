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

# Frontend color: #0066CC = RGB(0, 102, 204)
# Using alpha ~200 (78% opacity) for "a bit of transparency"
BLUE_COLOR_RGBA = (0, 102, 204, 200)


def draw_turnpoint(
    draw: ImageDraw.ImageDraw,
    point: FlightPlanTurnPoint,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]],
    image_width: int,
    image_height: int
) -> None:
    """
    Draw a turnpoint marker on an image, matching the frontend style.
    
    Args:
        draw: The ImageDraw object to draw on (must be RGBA mode for transparency)
        point: The turnpoint to draw
        coord_to_pixel: Function that converts geographic coordinates (lat, lon) to pixel coordinates (x, y)
        image_width: Width of the image (for clamping)
        image_height: Height of the image (for clamping)
    """
    try:
        x_px, y_px = coord_to_pixel(point.lat, point.lon)
        
        # Clamp to image bounds
        def _clamp(val, lo, hi):
            return max(lo, min(val, hi))
        x = _clamp(x_px, 0, image_width - 1)
        y = _clamp(y_px, 0, image_height - 1)
        
        # Draw outer circle (radius 12, stroke width 3) - matching frontend
        radius_outer = 12
        draw.ellipse(
            (x - radius_outer, y - radius_outer, x + radius_outer, y + radius_outer),
            outline=BLUE_COLOR_RGBA,
            width=3
        )
        
        # Draw center dot (radius 1) - matching frontend
        radius_center = 1
        draw.ellipse(
            (x - radius_center, y - radius_center, x + radius_center, y + radius_center),
            fill=BLUE_COLOR_RGBA
        )
        
        logger.debug(f"Drew turnpoint at ({x_px:.1f}, {y_px:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw turnpoint: {e}")


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
    converter function and draws a blue line with transparency, matching the frontend style.
    
    Args:
        draw: The ImageDraw object to draw on (must be RGBA mode for transparency)
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
        
        # Draw line with blue color (#0066CC), width 3, and transparency - matching frontend
        line_width = 3  # Medium thickness
        draw.line([(ox, oy), (dx, dy)], fill=BLUE_COLOR_RGBA, width=line_width)
        
        logger.debug(f"Drew leg overlay on image: O=({origin_x_px:.1f},{origin_y_px:.1f}) D=({dest_x_px:.1f},{dest_y_px:.1f}) | clamped O=({ox:.1f},{oy:.1f}) D=({dx:.1f},{dy:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw leg overlay on image: {e}")


def annotate_map(
    image: Image.Image,
    flight_plan: FlightPlan,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]]
) -> None:
    """
    Annotate a map image with leg lines and turnpoints, matching the frontend style.
    
    This function draws all legs and turnpoints from the flight plan on the image.
    Uses an overlay layer with transparency to support RGBA drawing on any image mode.
    
    Args:
        image: The PIL Image to annotate (will be modified in place)
        flight_plan: The flight plan
        coord_to_pixel: Function that converts geographic coordinates (lat, lon) to pixel coordinates (x, y)
                        Signature: (float, float) -> Tuple[float, float]
    """
    try:
        if len(flight_plan.points) < 1:
            logger.warning("Flight plan has no points to draw")
            return
        
        # Create an overlay layer in RGBA mode for drawing with transparency
        overlay = Image.new('RGBA', image.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        
        # Draw all legs on the overlay
        if len(flight_plan.points) >= 2:
            for i in range(1, len(flight_plan.points)):
                origin = flight_plan.points[i-1]
                destination = flight_plan.points[i]
                draw_leg(overlay_draw, origin, destination, coord_to_pixel, image.width, image.height)
        
        # Draw all turnpoints on the overlay
        for point in flight_plan.points:
            draw_turnpoint(overlay_draw, point, coord_to_pixel, image.width, image.height)
        
        # Composite the overlay onto the image
        if image.mode != 'RGBA':
            # Convert to RGBA for compositing
            image_rgba = image.convert('RGBA')
            # Composite the overlay onto the image
            image_composited = Image.alpha_composite(image_rgba, overlay)
            # Convert back to original mode
            result = image_composited.convert(image.mode)
            # Update the original image by copying pixel data
            image.paste(result, (0, 0))
        else:
            # If already RGBA, composite directly using alpha_composite
            image_composited = Image.alpha_composite(image, overlay)
            # Update the original image by copying pixel data
            image.paste(image_composited, (0, 0))
        
        logger.debug(f"Annotated map with {len(flight_plan.points)} turnpoints and {max(0, len(flight_plan.points) - 1)} legs")
    except Exception as e:
        logger.warning(f"Failed to annotate map image: {e}")