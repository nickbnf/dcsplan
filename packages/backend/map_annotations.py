"""
Map annotation module for drawing overlays on map images.

This module provides functions for annotating map images with flight plan legs,
waypoints, and other visual markers.
"""

from typing import Callable, Tuple
from PIL import Image, ImageDraw, ImageFont
import logging
import math
from flight_plan import FlightPlan, FlightPlanData, FlightPlanTurnPoint, LegData

# Set up logger
logger = logging.getLogger(__name__)

# Frontend color: #0066CC = RGB(0, 102, 204)
# Using alpha ~200 (78% opacity) for "a bit of transparency"
BLUE_COLOR_RGBA = (0, 102, 204, 200)


def _load_fonts() -> Tuple[ImageFont.FreeTypeFont, ImageFont.FreeTypeFont, ImageFont.FreeTypeFont]:
    """
    Load fonts for map annotations with fallback support.
    
    Returns:
        Tuple of (large_font, medium_font, small_font) for use in annotations
    """
    font_paths = [
        "/System/Library/Fonts/Helvetica.ttc",  # macOS
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # Linux
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",  # Alternative Linux
    ]
    
    large_size = 24
    medium_size = 20
    small_size = 18
    
    # Try to load a TrueType font
    for font_path in font_paths:
        try:
            large_font = ImageFont.truetype(font_path, large_size)
            medium_font = ImageFont.truetype(font_path, medium_size)
            small_font = ImageFont.truetype(font_path, small_size)
            logger.debug(f"Loaded fonts from {font_path}")
            return large_font, medium_font, small_font
        except (OSError, IOError):
            continue
    
    # Fall back to default font
    logger.debug("Using default font (no TrueType fonts found)")
    default_font = ImageFont.load_default()
    return default_font, default_font, default_font


# Load fonts once at module level for reuse across all annotation functions
LARGE_FONT, MEDIUM_FONT, SMALL_FONT = _load_fonts()


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


def annotate_turnpoint(
    draw: ImageDraw.ImageDraw,
    point: FlightPlanTurnPoint,
    index: int,
    flightPlanData: FlightPlanData,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]],
    image_width: int,
    image_height: int
) -> None:
    """
    Annotate a turnpoint with its number, name, and ETA.
    
    Args:
        draw: The ImageDraw object to draw on (must be RGBA mode for transparency)
        point: The turnpoint to annotate
        index: The index of the turnpoint in the flight plan (0-based)
        flightPlanData: The flight plan data containing ETA information
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
        
        # Get ETA from flightPlanData (etaSec is in seconds since midnight)
        if index < len(flightPlanData.turnpointData):
            eta_sec = flightPlanData.turnpointData[index].etaSec
            hours = eta_sec // 3600
            minutes = (eta_sec % 3600) // 60
            seconds = eta_sec % 60
            eta_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        else:
            eta_str = "00:00:00"
        
        # Position text slightly to the right of the turnpoint
        # The turnpoint marker has radius 12, so offset by ~20 pixels
        offset_x = 20
        
        # Text color - using blue to match the turnpoint marker
        text_color = (0, 102, 204, 255)  # Solid blue for text
        
        # Draw turnpoint number on the left (bigger font)
        turnpoint_number = str(index + 1)  # 1-based for display
        text_x_left = x + offset_x
        
        # Get text bounding box to calculate height for vertical centering
        bbox_large = draw.textbbox((0, 0), turnpoint_number, font=LARGE_FONT)
        text_height_large = bbox_large[3] - bbox_large[1]
        text_y_left = y - text_height_large // 2  # Center vertically with turnpoint
        
        # Draw turnpoint name and ETA on the right (superposed/stacked)
        turnpoint_name = "TurnPoint"
        text_x_right = text_x_left + 30  # Offset further right for name/ETA
        
        # Get text bounding boxes for name and ETA to center the stack vertically
        bbox_name = draw.textbbox((0, 0), turnpoint_name, font=SMALL_FONT)
        bbox_eta = draw.textbbox((0, 0), eta_str, font=SMALL_FONT)
        text_height_name = bbox_name[3] - bbox_name[1]
        text_height_eta = bbox_eta[3] - bbox_eta[1]
        
        # Calculate spacing between name and ETA (stack them with a small gap)
        spacing = 4
        total_height = text_height_name + spacing + text_height_eta
        
        # Center the entire stack vertically with the turnpoint
        # Name goes above center, ETA goes below center
        text_y_right_name = y - total_height // 2
        text_y_right_eta = y - total_height // 2 + text_height_name + spacing
        
        # Calculate bounding box for name and ETA only (exclude the number)
        bbox_name_actual = draw.textbbox((text_x_right, text_y_right_name), turnpoint_name, font=SMALL_FONT)
        bbox_eta_actual = draw.textbbox((text_x_right, text_y_right_eta), eta_str, font=SMALL_FONT)
        
        # Find the overall bounding box for name and ETA
        annotation_left = min(bbox_name_actual[0], bbox_eta_actual[0])
        annotation_right = max(bbox_name_actual[2], bbox_eta_actual[2])
        annotation_top = min(bbox_name_actual[1], bbox_eta_actual[1])
        annotation_bottom = max(bbox_name_actual[3], bbox_eta_actual[3])
        
        # Add padding (similar to doghouse fill_overhang)
        annotation_padding = 4
        foundation_left = annotation_left - annotation_padding
        foundation_right = annotation_right + annotation_padding
        foundation_top = annotation_top - annotation_padding
        foundation_bottom = annotation_bottom + annotation_padding
        
        # Draw transparent white foundation (same as doghouse)
        fill_color = (255, 255, 255, int(255 * 0.3))  # 30% opacity white
        draw.rectangle(
            [(foundation_left, foundation_top), (foundation_right, foundation_bottom)],
            fill=fill_color
        )
        
        # Draw number (left, bigger font)
        draw.text((text_x_left, text_y_left), turnpoint_number, fill=text_color, font=LARGE_FONT)
        
        # Draw name and ETA (right, stacked, smaller font)
        draw.text((text_x_right, text_y_right_name), turnpoint_name, fill=text_color, font=SMALL_FONT)
        draw.text((text_x_right, text_y_right_eta), eta_str, fill=text_color, font=SMALL_FONT)
        
        logger.debug(f"Annotated turnpoint {index + 1} at ({x_px:.1f}, {y_px:.1f}) with ETA {eta_str}")
    except Exception as e:
        logger.warning(f"Failed to annotate turnpoint: {e}")


def draw_doghouse(
    draw: ImageDraw.ImageDraw,
    origin: FlightPlanTurnPoint,
    destination: FlightPlanTurnPoint,
    leg_data: LegData,
    destination_turnpoint_index: int,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]],
    image_width: int,
    image_height: int
) -> None:
    """
    Draw a "doghouse" diagram on the left of the focus leg.
    
    The doghouse consists of:
    - A roof containing the destination turnpoint number
    - Four boxes showing (from top to bottom): Heading, Distance, ETE, Alt
    
    Args:
        draw: The ImageDraw object to draw on (must be RGBA mode for transparency)
        origin: The origin turnpoint of the leg
        destination: The destination turnpoint of the leg
        leg_data: The leg data containing heading, distance, ETE
        destination_turnpoint_index: The index of the destination turnpoint (0-based)
        coord_to_pixel: Function that converts geographic coordinates (lat, lon) to pixel coordinates (x, y)
        image_width: Width of the image (for clamping)
        image_height: Height of the image (for clamping)
    """
    try:
        # Convert leg endpoints to pixel coordinates
        origin_x_px, origin_y_px = coord_to_pixel(origin.lat, origin.lon)
        dest_x_px, dest_y_px = coord_to_pixel(destination.lat, destination.lon)
        
        # Clamp to image bounds
        def _clamp(val, lo, hi):
            return max(lo, min(val, hi))
        ox = _clamp(origin_x_px, 0, image_width - 1)
        oy = _clamp(origin_y_px, 0, image_height - 1)
        dx = _clamp(dest_x_px, 0, image_width - 1)
        dy = _clamp(dest_y_px, 0, image_height - 1)
        
        # Calculate the midpoint of the leg
        mid_x = (ox + dx) / 2
        mid_y = (oy + dy) / 2
        
        # Calculate the direction vector of the leg
        leg_dx = dx - ox
        leg_dy = dy - oy
        leg_length = math.sqrt(leg_dx**2 + leg_dy**2)
        
        if leg_length == 0:
            logger.warning("Leg has zero length, cannot draw doghouse")
            return
        
        # Normalize the leg direction vector
        leg_dir_x = leg_dx / leg_length
        leg_dir_y = leg_dy / leg_length
        
        # Calculate perpendicular vector pointing to the left (rotate 90 degrees counterclockwise)
        perp_x = -leg_dir_y
        perp_y = leg_dir_x
        
        # Offset distance from the leg (to position doghouse on the left)
        offset_distance = 80  # pixels
        
        # Calculate doghouse position (midpoint of leg, offset to the left)
        doghouse_center_x = mid_x - perp_x * offset_distance
        doghouse_center_y = mid_y + perp_y * offset_distance
        
        # Doghouse dimensions (enlarged to fit medium font)
        box_width = 95
        box_height = 40
        roof_height = 35
        line_width = 3  # Consistent line width for all lines
        
        # Total height of doghouse (roof + 4 boxes)
        total_height = roof_height + 4 * box_height
        
        # Starting position (top of roof)
        doghouse_top_x = doghouse_center_x - box_width / 2
        doghouse_top_y = doghouse_center_y - total_height / 2
        
        # Text color - using blue to match other annotations
        text_color = (0, 102, 204, 255)  # Solid blue for text
        outline_color = BLUE_COLOR_RGBA
        # Transparent white fill at 30% opacity
        fill_color = (255, 255, 255, int(255 * 0.3))  # 30% opacity white
        fill_overhang = 4  # Pixels to extend fill beyond outline
        
        # Calculate boundaries for the entire doghouse
        roof_top_y = doghouse_top_y
        roof_bottom_y = doghouse_top_y + roof_height
        roof_left_x = doghouse_top_x
        roof_right_x = doghouse_top_x + box_width
        roof_center_x = doghouse_top_x + box_width / 2
        roof_top_center_y = roof_top_y + roof_height * 0.15  # Peak of roof - higher for more space above number
        
        # Calculate bottom of last box
        box_start_y = roof_bottom_y
        box_bottom_y = box_start_y + 4 * box_height
        
        # Draw unified background fill as a polygon: triangular roof + rectangular body (with 2px overhang)
        # The polygon points form a "house" shape:
        # 1. Peak (top center, moved up by overhang)
        # 2. Bottom left of roof (moved down and left by overhang)
        # 3. Bottom left of boxes (moved down and left by overhang)
        # 4. Bottom right of boxes (moved down and right by overhang)
        # 5. Bottom right of roof (moved down and right by overhang)
        background_polygon = [
            (roof_center_x, roof_top_center_y - fill_overhang),  # Peak - moved up
            (roof_left_x - fill_overhang, box_start_y - fill_overhang + line_width),  # Bottom left of roof - moved down and left
            (roof_left_x - fill_overhang, box_bottom_y + fill_overhang),  # Bottom left of boxes - moved down and left
            (roof_right_x + fill_overhang, box_bottom_y + fill_overhang),  # Bottom right of boxes - moved down and right
            (roof_right_x + fill_overhang, box_start_y - fill_overhang + line_width),  # Bottom right of roof - moved down and right
        ]
        
        draw.polygon(background_polygon, fill=fill_color)
        
        # Draw roof (triangular/trapezoid shape) - outline only
        roof_points = [
            (roof_left_x, roof_bottom_y),  # Bottom left
            (roof_center_x, roof_top_center_y),  # Top center (peak)
            (roof_right_x, roof_bottom_y),  # Bottom right
        ]
        # Draw roof lines explicitly to ensure consistent thickness
        draw.line([roof_points[0], roof_points[1]], fill=outline_color, width=line_width)
        draw.line([roof_points[1], roof_points[2]], fill=outline_color, width=line_width)
        draw.line([roof_points[2], roof_points[0]], fill=outline_color, width=line_width)
        
        # Draw turnpoint number in the roof
        turnpoint_number = str(destination_turnpoint_index + 1)  # 1-based for display
        # Use the actual font for bbox calculation
        bbox_roof = draw.textbbox((0, 0), turnpoint_number, font=LARGE_FONT)
        text_width_roof = bbox_roof[2] - bbox_roof[0]
        text_height_roof = bbox_roof[3] - bbox_roof[1]
        text_x_roof = roof_center_x - text_width_roof / 2
        # Center vertically in roof - account for font baseline
        roof_center_y = (roof_top_y + roof_bottom_y) / 2
        text_y_roof = roof_center_y - text_height_roof / 2
        draw.text((text_x_roof, text_y_roof), turnpoint_number, fill=text_color, font=LARGE_FONT)
        
        # Draw four boxes below the roof
        box_left_x = doghouse_top_x
        
        # Format leg data
        heading_str = f"{leg_data.heading:.0f}°M"
        distance_str = f"{leg_data.distanceNm:.1f}NM"
        
        # Format ETE (Estimated Time En route) in MM:SS format
        ete_minutes = leg_data.eteSec // 60
        ete_seconds = leg_data.eteSec % 60
        ete_str = f"{ete_minutes:02d}+{ete_seconds:02d}"
        
        # Altitude from destination turnpoint
        alt_str = f"{destination.alt:.0f}'"
        
        # Values for each box (from top to bottom: Heading, Distance, ETE, Alt)
        box_values = [
            heading_str,
            distance_str,
            ete_str,
            alt_str,
        ]
        
        for i, value in enumerate(box_values):
            box_y = box_start_y + i * box_height
            box_top = box_y
            box_bottom = box_y + box_height
            box_right = box_left_x + box_width
            
            # Draw box lines explicitly to ensure consistent thickness for all lines
            # (Background fill already drawn as unified shape above)
            # Top horizontal line
            draw.line([(box_left_x, box_top), (box_right, box_top)], fill=outline_color, width=line_width)
            # Bottom horizontal line
            draw.line([(box_left_x, box_bottom), (box_right, box_bottom)], fill=outline_color, width=line_width)
            # Left vertical line
            draw.line([(box_left_x, box_top), (box_left_x, box_bottom)], fill=outline_color, width=line_width)
            # Right vertical line
            draw.line([(box_right, box_top), (box_right, box_bottom)], fill=outline_color, width=line_width)
            
            # Draw value centered in the box - use the actual font for bbox calculation
            bbox_value = draw.textbbox((0, 0), value, font=LARGE_FONT)
            value_width = bbox_value[2] - bbox_value[0]
            value_height = bbox_value[3] - bbox_value[1]
            # Center horizontally
            value_x = box_left_x + (box_width - value_width) / 2
            # Center vertically - account for font baseline by using box center
            box_center_y = box_top + box_height / 2
            value_y = box_center_y - value_height / 2
            draw.text((value_x, value_y), value, fill=text_color, font=LARGE_FONT)
        
        logger.debug(f"Drew doghouse for leg at ({mid_x:.1f}, {mid_y:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw doghouse: {e}")


def annotate_map(
    image: Image.Image,
    flight_plan: FlightPlan,
    flight_plan_data: FlightPlanData,
    focus_leg_index: int,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]]
) -> None:
    """
    Annotate a map image with leg lines and turnpoints.
    
    This function draws all legs and turnpoints from the flight plan on the image.
    Uses an overlay layer with transparency to support RGBA drawing on any image mode.
    
    Args:
        image: The PIL Image to annotate (will be modified in place)
        flight_plan: The flight plan
        flightPlanData: The flight plan data containing ETA information
        focus_leg_index: The index of the leg to focus on
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
        for i, point in enumerate(flight_plan.points):
            draw_turnpoint(overlay_draw, point, coord_to_pixel, image.width, image.height)
            annotate_turnpoint(overlay_draw, point, i, flight_plan_data, coord_to_pixel, image.width, image.height)
        
        # Add the doghouse for this leg
        if focus_leg_index < len(flight_plan_data.legData):
            draw_doghouse(
                overlay_draw,
                flight_plan.points[focus_leg_index],
                flight_plan.points[focus_leg_index + 1],
                flight_plan_data.legData[focus_leg_index],
                focus_leg_index + 1,  # Destination turnpoint index (0-based)
                coord_to_pixel,
                image.width,
                image.height
            )

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