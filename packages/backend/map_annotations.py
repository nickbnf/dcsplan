"""
Map annotation module for drawing overlays on map images.

This module provides functions for annotating map images with flight plan legs,
waypoints, and other visual markers.
"""

import os
from typing import Callable, Tuple, Optional
from PIL import Image, ImageDraw, ImageFont
import logging
import math
from flight_plan import FlightPlan, FlightPlanData, FlightPlanTurnPoint, LegData, Point

# Set up logger
logger = logging.getLogger(__name__)

# Frontend color: #0066CC = RGB(0, 102, 204)
# Using alpha ~200 (78% opacity)
BLUE_COLOR_RGBA = (0, 102, 204, 200)
RED_COLOR_RGBA = (204, 0, 0, 200)

FONTS_DIR = os.path.join(os.path.dirname(__file__), "config", "fonts")

def _load_fonts() -> Tuple[ImageFont.FreeTypeFont, ImageFont.FreeTypeFont, ImageFont.FreeTypeFont]:
    """
    Load fonts for map annotations with fallback support.
    
    Returns:
        Tuple of (large_font, medium_font, small_font) for use in annotations
    """
    font_paths = [
        os.path.join(FONTS_DIR, "default.ttf"),
        "/System/Library/Fonts/SFCamera.ttf",  # macOS
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # Linux
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",  # Alternative Linux
    ]
    
    large_size = 24
    medium_size = 20
    small_size = 18
    
    # Try to load a TrueType font
    for font_path in font_paths:
        try:
            logger.info(f"Trying to load font {font_path}")
            large_font = ImageFont.truetype(font_path, large_size)
            # large_font.set_variation_by_name('Bold')
            medium_font = ImageFont.truetype(font_path, medium_size)
            # medium_font.set_variation_by_name('Bold')
            small_font = ImageFont.truetype(font_path, small_size)
            logger.debug(f"Loaded fonts from {font_path}")
            return large_font, medium_font, small_font
        except (OSError, IOError) as e:
            logger.warning(f"Failed to load font from {font_path}: {e}")
            continue
    
    # Fall back to default font
    logger.warning("Using default font (no TrueType fonts found)")
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
    Draw a turnpoint marker on an image for kneeboard maps.
    
    Draws only the outer circle outline (no fill, no center dot) so the underlying
    map graphics are visible inside the circle.
    
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
        
        # Draw outer circle (radius 12, stroke width 3) - outline only, no fill
        radius_outer = 12
        draw.ellipse(
            (x - radius_outer, y - radius_outer, x + radius_outer, y + radius_outer),
            outline=BLUE_COLOR_RGBA,
            width=3
        )
        
        logger.debug(f"Drew turnpoint at ({x_px:.1f}, {y_px:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw turnpoint: {e}")


def draw_leg(
    draw: ImageDraw.ImageDraw,
    leg_data: LegData,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]],
    image_width: int,
    image_height: int
) -> None:
    """
    Draw a leg line between two waypoints on an image.
    
    This function converts lat/lon coordinates to pixel coordinates using the provided
    converter function and draws a blue line with transparency, matching the frontend style.
    The line is shortened at both ends to stop at the circle edge (radius 12 pixels).
    
    Args:
        draw: The ImageDraw object to draw on (must be RGBA mode for transparency)
        leg_data: The leg data containing the course and distance
        coord_to_pixel: Function that converts geographic coordinates (lat, lon) to pixel coordinates (x, y)
                        Signature: (float, float) -> Tuple[float, float]
        image_width: Width of the image (for clamping)
        image_height: Height of the image (for clamping)
    """
    try:
        # Convert lat/lon coordinates to pixel coordinates using the provided converter function
        origin_x_px, origin_y_px = coord_to_pixel(leg_data.origin.lat, leg_data.origin.lon)
        straightening_x_px, straightening_y_px = coord_to_pixel(leg_data.straigthening_point.lat, leg_data.straigthening_point.lon)
        dest_x_px, dest_y_px = coord_to_pixel(leg_data.destination.lat, leg_data.destination.lon)
        center_x_px, center_y_px = coord_to_pixel(leg_data.turn_data.center.lat, leg_data.turn_data.center.lon)
        
        logger.debug(f"Leg endpoints on image: O=({origin_x_px:.1f}, {origin_y_px:.1f}), D=({dest_x_px:.1f}, {dest_y_px:.1f}), S=({straightening_x_px:.1f}, {straightening_y_px:.1f})")
        
        # Clamp to image bounds so line is visible even if slightly outside
        def _clamp(val, lo, hi):
            return max(lo, min(val, hi))
        ox = _clamp(origin_x_px, 0, image_width - 1)
        oy = _clamp(origin_y_px, 0, image_height - 1)
        sx = _clamp(straightening_x_px, 0, image_width - 1)
        sy = _clamp(straightening_y_px, 0, image_height - 1)
        dx = _clamp(dest_x_px, 0, image_width - 1)
        dy = _clamp(dest_y_px, 0, image_height - 1)
        
        # Turnpoint circle radius in pixels
        circle_radius = 12
        
        # Draw the turning arc (only if the straightening point is outside the turnpoint circle)
        if math.sqrt((sx - ox)**2 + (sy - oy)**2) > circle_radius:
            turn_radius_px = math.sqrt((straightening_x_px - center_x_px)**2 + (straightening_y_px - center_y_px)**2)
            
            # Calculate angles from turn center to intersection point and straightening point
            # Pillow's draw.arc uses: 0° = 3 o'clock (east), angles increase counterclockwise
            angle_start = math.degrees(math.atan2(oy - center_y_px, ox - center_x_px)) % 360
            angle_end = math.degrees(math.atan2(sy - center_y_px, sx - center_x_px)) % 360
            
            # Pillow draws arcs counterclockwise. If start > end, it still goes counterclockwise
            # which means it takes the long way. To get the shorter arc, we need to ensure
            # the angular difference is <= 180 degrees.
            # Calculate both possible paths and choose the shorter one
            diff_forward = (angle_end - angle_start) % 360
            diff_backward = (angle_start - angle_end) % 360
            
            tpcircle_angle = math.degrees(math.asin(circle_radius / turn_radius_px))
            logger.info(f"Turnpoint circle angle: {tpcircle_angle:.1f}")

            logger.info(f"Diff forward: {diff_forward:.1f}, Diff backward: {diff_backward:.1f}")
            logger.info(f"Turn angle: {math.degrees(leg_data.turn_angle_rad):.1f}")

            if leg_data.turn_angle_rad < math.pi:
                if diff_backward < diff_forward:
                    # The shorter path is going backwards (clockwise), so swap start and end
                    angle_start, angle_end = angle_end, angle_start
                    angle_end -= tpcircle_angle
                else:
                    angle_start += tpcircle_angle
            else:
                # Long turn, use the longer path
                if diff_forward < diff_backward:
                    angle_start, angle_end = angle_end, angle_start
                    if leg_data.turn_direction == 1:
                        angle_end -= tpcircle_angle
                    else:
                        angle_start -= tpcircle_angle
                else:
                    angle_start += tpcircle_angle
            
            angle_start %= 360
            logger.info(f"Angle start: {angle_start:.1f}, Angle end: {angle_end:.1f}")
            draw.arc(
                (center_x_px - turn_radius_px, center_y_px - turn_radius_px, center_x_px + turn_radius_px, center_y_px + turn_radius_px),
                start=angle_start,
                end=angle_end,
                fill=BLUE_COLOR_RGBA,
                width=3
            )

        # Calculate direction vector and length
        leg_dx = dx - ox
        leg_dy = dy - oy
        leg_length = math.sqrt(leg_dx**2 + leg_dy**2)
        
        # Shorten the line at both ends by the circle radius
        if leg_length > 2 * circle_radius:
            # Normalize direction vector
            leg_dir_x = leg_dx / leg_length
            leg_dir_y = leg_dy / leg_length
            
            # Calculate shortened endpoints
            shortened_ox = ox + leg_dir_x * circle_radius
            shortened_oy = oy + leg_dir_y * circle_radius
            shortened_dx = dx - leg_dir_x * circle_radius
            shortened_dy = dy - leg_dir_y * circle_radius
            
            # Draw line with blue color (#0066CC), width 3, and transparency
            line_width = 3  # Medium thickness
            draw.line([(sx, sy), (shortened_dx, shortened_dy)], fill=BLUE_COLOR_RGBA, width=line_width)
        else:
            # If the leg is too short, don't draw it
            logger.debug(f"Leg too short to draw (length: {leg_length:.1f}px, need > {2 * circle_radius}px)")
        
        logger.debug(f"Drew leg overlay on image: O=({origin_x_px:.1f},{origin_y_px:.1f}) D=({dest_x_px:.1f},{dest_y_px:.1f}) | clamped O=({ox:.1f},{oy:.1f}) D=({dx:.1f},{dy:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw leg overlay on image: {e}")


def annotate_leg(
    draw: ImageDraw.ImageDraw,
    overlay_image: Image.Image,
    time_at_origin: int,
    leg_data: LegData,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]],
) -> None:
    """
    Annotate a leg with the tick marks for time and distance.
    """
    origin = leg_data.origin
    destination = leg_data.destination

    # Convert lat/lon coordinates to pixel coordinates using the provided converter function
    origin_x_px, origin_y_px = coord_to_pixel(origin.lat, origin.lon)
    dest_x_px, dest_y_px = coord_to_pixel(destination.lat, destination.lon)
    straightening_x_px, straightening_y_px = coord_to_pixel(leg_data.straigthening_point.lat, leg_data.straigthening_point.lon)

    dx = dest_x_px - straightening_x_px
    dy = dest_y_px - straightening_y_px
    leg_length_px = math.sqrt(dx**2 + dy**2)
    
    time_to_straightening_s = leg_data.time_to_straightening_s

    if leg_length_px == 0:
        logger.warning("Leg has zero length, cannot annotate")
        return

    logger.debug(f"Leg endpoints on image: O=({origin_x_px:.1f}, {origin_y_px:.1f}), D=({dest_x_px:.1f}, {dest_y_px:.1f})")

    try:
        # Draw a tick every minute
        first_minute_s = (time_at_origin // 60 + 1) * 60
        last_minute_s = (time_at_origin + leg_data.eteSec) // 60 * 60
        for minute_s in range(first_minute_s, last_minute_s + 1, 60):
            # Position in pixels along the straight portion of the leg
            dx_per_min = dx / ((leg_data.eteSec - time_to_straightening_s) / 60)
            dy_per_min = dy / ((leg_data.eteSec - time_to_straightening_s) / 60)
            sec_from_beginning = minute_s - time_at_origin
            sec_from_straightening = sec_from_beginning - time_to_straightening_s
            if sec_from_straightening < 0:
                # If the mark lands on the arc, skip it
                continue
            x = straightening_x_px + dx_per_min * sec_from_straightening / 60
            y = straightening_y_px + dy_per_min * sec_from_straightening / 60
            logger.debug(f"Minute {minute_s} at {x:.1f} {y:.1f}")
            
            # Calculate perpendicular vector to the leg for tick orientation
            # Perpendicular to (dx, dy) is (-dy, dx) or (dy, -dx)
            # Normalize and scale to tick length (5 pixels)
            perp_dx = -dy / leg_length_px * 5
            perp_dy = dx / leg_length_px * 5
            
            draw.line([(x - perp_dx, y - perp_dy), (x + perp_dx, y + perp_dy)], fill=BLUE_COLOR_RGBA, width=3)
            
            distance_from_origin_px = math.sqrt((x - origin_x_px)**2 + (y - origin_y_px)**2)
            distance_from_dest_px = math.sqrt((x - dest_x_px)**2 + (y - dest_y_px)**2)

            NO_LABEL_ZONE_PX = 60
            if distance_from_origin_px > NO_LABEL_ZONE_PX and distance_from_dest_px > NO_LABEL_ZONE_PX:
                # Draw minute number rotated perpendicular to the leg, slightly to the right of the tick
                label_txt = f"{minute_s // 3600:02d}:{minute_s % 3600 // 60:02d}"
                
                # Calculate leg angle for text rotation (perpendicular = leg_angle + 90)
                leg_angle_rad = math.atan2(dx, dy)
                leg_angle_deg = math.degrees(leg_angle_rad)
                # Text should be perpendicular to leg
                text_rotation_angle = leg_angle_deg + 180
                
                # Position text slightly to the right of the tick (perpendicular to the leg)
                text_offset_distance = 10
                text_offset_x = perp_dx * text_offset_distance
                text_offset_y = perp_dy * text_offset_distance
                text_x = x + text_offset_x
                text_y = y + text_offset_y
                
                # Create temporary image for rotated text
                # Estimate text size (small font) - use a temporary image to measure
                temp_measure = Image.new('RGBA', (100, 100), (0, 0, 0, 0))
                temp_measure_draw = ImageDraw.Draw(temp_measure)
                text_bbox = temp_measure_draw.textbbox((0, 0), label_txt, font=SMALL_FONT)
                text_width = text_bbox[2] - text_bbox[0]
                text_height = text_bbox[3] - text_bbox[1]
                
                # Create temp image with padding for rotation
                temp_size = int(math.sqrt(text_width**2 + text_height**2)) + 20
                temp_image = Image.new('RGBA', (temp_size, temp_size), (0, 0, 0, 0))
                temp_draw = ImageDraw.Draw(temp_image, mode='RGBA')
                
                # Draw text centered in temp image
                # Account for bbox offsets to properly center the text
                temp_text_x = (temp_size - text_width) / 2 - text_bbox[0]
                temp_text_y = (temp_size - text_height) / 2 - text_bbox[1]
                text_color = (0, 102, 204, 255)  # Solid blue for text
                temp_draw.text((temp_text_x, temp_text_y), label_txt, fill=text_color, font=SMALL_FONT)
                
                # Rotate the temporary image
                rotated_temp = temp_image.rotate(
                    text_rotation_angle,
                    center=(temp_size / 2, temp_size / 2),
                    expand=True,
                    resample=Image.Resampling.BILINEAR
                )
                
                # Calculate paste position (center of rotated text at text_x, text_y)
                rotated_center_x = rotated_temp.width / 2
                rotated_center_y = rotated_temp.height / 2
                paste_x = int(text_x - rotated_center_x)
                paste_y = int(text_y - rotated_center_y)
                
                # Create temporary overlay and paste rotated text
                temp_overlay = Image.new('RGBA', overlay_image.size, (0, 0, 0, 0))
                temp_overlay.paste(rotated_temp, (paste_x, paste_y))
                
                # Alpha composite onto main overlay
                overlay_image.paste(Image.alpha_composite(overlay_image, temp_overlay))

    except Exception as e:
        logger.warning(f"Failed to annotate leg: {e}")


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
        turnpoint_name = point.name if point.name else f"WP{index + 1}"
        text_x_right = text_x_left + 30  # Offset further right for name/ETA
        
        # Get text bounding boxes for name and ETA to center the stack vertically
        bbox_name = draw.textbbox((0, 0), turnpoint_name, font=MEDIUM_FONT)
        bbox_eta = draw.textbbox((0, 0), eta_str, font=MEDIUM_FONT)
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
        bbox_name_actual = draw.textbbox((text_x_right, text_y_right_name), turnpoint_name, font=MEDIUM_FONT)
        bbox_eta_actual = draw.textbbox((text_x_right, text_y_right_eta), eta_str, font=MEDIUM_FONT)
        
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
        draw.text((text_x_right, text_y_right_name), turnpoint_name, fill=text_color, font=MEDIUM_FONT)
        draw.text((text_x_right, text_y_right_eta), eta_str, fill=text_color, font=MEDIUM_FONT)
        
        logger.debug(f"Annotated turnpoint {index + 1} at ({x_px:.1f}, {y_px:.1f}) with ETA {eta_str}")
    except Exception as e:
        logger.warning(f"Failed to annotate turnpoint: {e}")


def _calculate_doghouse_position(
    origin: Point,
    destination: Point,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]],
    image_width: int,
    image_height: int,
    offset_distance: float = 80,
    position: str = "middle"
) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """
    Calculate the position and orientation of a doghouse relative to a leg.
    
    Args:
        origin: The origin turnpoint of the leg
        destination: The destination turnpoint of the leg
        coord_to_pixel: Function that converts geographic coordinates to pixel coordinates
        image_width: Width of the image (for clamping)
        image_height: Height of the image (for clamping)
        offset_distance: Distance in pixels to offset the doghouse from the leg (perpendicular)
        position: Position along the leg - "beginning", "middle", or "end"
        
    Returns:
        Tuple of (doghouse_center_x, doghouse_center_y, reference_x, reference_y)
        Returns (None, None, None, None) if leg has zero length
    """
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
    
    # Calculate the direction vector of the leg
    leg_dx = dx - ox
    leg_dy = dy - oy
    leg_length = math.sqrt(leg_dx**2 + leg_dy**2)
    
    if leg_length == 0:
        logger.warning("Leg has zero length, cannot calculate doghouse position")
        return None, None, None, None
    
    # Normalize the leg direction vector
    leg_dir_x = leg_dx / leg_length
    leg_dir_y = leg_dy / leg_length
    
    # Calculate perpendicular vector pointing to the left (rotate 90 degrees counterclockwise)
    perp_x = -leg_dir_y
    perp_y = leg_dir_x
    
    # Hardcoded pixel offset for beginning/end positioning
    POSITION_OFFSET_PIXELS = 60
    
    # Determine position along the leg
    if position == "beginning":
        # Position at absolute pixel offset from beginning
        ref_x = ox + leg_dir_x * POSITION_OFFSET_PIXELS
        ref_y = oy + leg_dir_y * POSITION_OFFSET_PIXELS
    elif position == "end":
        # Position at absolute pixel offset from end (going backwards from destination)
        ref_x = dx - leg_dir_x * POSITION_OFFSET_PIXELS
        ref_y = dy - leg_dir_y * POSITION_OFFSET_PIXELS
    else:  # "middle" (default)
        # Position at midpoint
        ref_x = (ox + dx) / 2
        ref_y = (oy + dy) / 2
    
    # Calculate doghouse position (offset to the left)
    doghouse_center_x = ref_x - perp_x * offset_distance
    doghouse_center_y = ref_y - perp_y * offset_distance
    
    return doghouse_center_x, doghouse_center_y, ref_x, ref_y


def _draw_doghouse_roof(
    draw: ImageDraw.ImageDraw,
    roof_left_x: float,
    roof_right_x: float,
    roof_top_y: float,
    roof_bottom_y: float,
    roof_height: float,
    turnpoint_number: str,
    font: ImageFont.FreeTypeFont,
    text_color: Tuple[int, int, int, int],
    outline_color: Tuple[int, int, int, int],
    line_width: int
) -> None:
    """
    Draw the roof of a doghouse with the turnpoint number.
    
    Args:
        draw: The ImageDraw object to draw on
        roof_left_x: Left edge X coordinate
        roof_right_x: Right edge X coordinate
        roof_top_y: Top edge Y coordinate
        roof_bottom_y: Bottom edge Y coordinate
        roof_height: Height of the roof
        turnpoint_number: The turnpoint number string to display
        font: Font to use for the turnpoint number
        text_color: Color for text
        outline_color: Color for outline
        line_width: Width of outline lines
    """
    roof_center_x = roof_left_x + (roof_right_x - roof_left_x) / 2
    roof_top_center_y = roof_top_y + roof_height * 0.15  # Peak of roof
    
    # Draw roof (triangular shape) - outline only
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
    turnpoint_str = str(int(turnpoint_number)+1)
    bbox_roof = draw.textbbox((0, 0), turnpoint_str, font=font)
    text_width_roof = bbox_roof[2] - bbox_roof[0]
    text_height_roof = bbox_roof[3] - bbox_roof[1]
    # Center horizontally
    text_x_roof = roof_center_x - text_width_roof / 2 - bbox_roof[0]
    # Center vertically in roof
    # The y coordinate in text() is the baseline, so we need to account for that
    roof_center_y = (roof_top_y + roof_bottom_y) / 2
    # Calculate the offset from baseline to center of text
    # bbox_roof[1] is the top (may be negative), bbox_roof[3] is the bottom
    text_center_offset_from_baseline = (bbox_roof[1] + bbox_roof[3]) / 2
    text_y_roof = roof_center_y - text_center_offset_from_baseline
    draw.text((text_x_roof, text_y_roof), turnpoint_str, fill=text_color, font=font)


def _draw_doghouse_boxes(
    draw: ImageDraw.ImageDraw,
    box_left_x: float,
    box_start_y: float,
    box_width: float,
    box_height: float,
    box_values: list[str],
    font: ImageFont.FreeTypeFont,
    text_color: Tuple[int, int, int, int],
    outline_color: Tuple[int, int, int, int],
    line_width: int
) -> None:
    """
    Draw boxes below the roof with values.
    
    Args:
        draw: The ImageDraw object to draw on
        box_left_x: Left edge X coordinate of boxes
        box_start_y: Top Y coordinate of first box
        box_width: Width of each box
        box_height: Height of each box
        box_values: List of strings to display in each box
        font: Font to use for values
        text_color: Color for text
        outline_color: Color for outline
        line_width: Width of outline lines
    """
    for i, value in enumerate(box_values):
        box_y = box_start_y + i * box_height
        box_top = box_y
        box_bottom = box_y + box_height
        box_right = box_left_x + box_width
        
        # Draw box lines explicitly to ensure consistent thickness for all lines
        # Top horizontal line
        draw.line([(box_left_x, box_top), (box_right, box_top)], fill=outline_color, width=line_width)
        # Bottom horizontal line
        draw.line([(box_left_x, box_bottom), (box_right, box_bottom)], fill=outline_color, width=line_width)
        # Left vertical line
        draw.line([(box_left_x, box_top), (box_left_x, box_bottom)], fill=outline_color, width=line_width)
        # Right vertical line
        draw.line([(box_right, box_top), (box_right, box_bottom)], fill=outline_color, width=line_width)
        
        # Draw value centered in the box
        # Get text bounding box to calculate dimensions
        bbox_value = draw.textbbox((0, 0), value, font=font)
        value_width = bbox_value[2] - bbox_value[0]
        value_height = bbox_value[3] - bbox_value[1]
        # Center horizontally
        value_x = box_left_x + (box_width - value_width) / 2 - bbox_value[0]
        # Center vertically
        # The y coordinate in text() is the baseline, so we need to account for that
        box_center_y = box_top + box_height / 2
        # Calculate the offset from baseline to center of text
        # bbox_value[1] is the top (may be negative), bbox_value[3] is the bottom
        text_center_offset_from_baseline = (bbox_value[1] + bbox_value[3]) / 2
        value_y = box_center_y - text_center_offset_from_baseline
        draw.text((value_x, value_y), value, fill=text_color, font=font)


def _draw_doghouse_background(
    draw: ImageDraw.ImageDraw,
    roof_left_x: float,
    roof_right_x: float,
    roof_top_y: float,
    roof_bottom_y: float,
    roof_height: float,
    box_start_y: float,
    box_bottom_y: float,
    fill_color: Tuple[int, int, int, int],
    fill_overhang: int,
    line_width: int
) -> None:
    """
    Draw the unified background fill for a doghouse.
    
    Args:
        draw: The ImageDraw object to draw on
        roof_left_x: Left edge X coordinate of roof
        roof_right_x: Right edge X coordinate of roof
        roof_top_y: Top edge Y coordinate of roof
        roof_bottom_y: Bottom edge Y coordinate of roof
        roof_height: Height of the roof
        box_start_y: Top Y coordinate of boxes
        box_bottom_y: Bottom Y coordinate of boxes
        fill_color: Color for fill
        fill_overhang: Pixels to extend fill beyond outline
        line_width: Width of outline lines
    """
    roof_center_x = roof_left_x + (roof_right_x - roof_left_x) / 2
    roof_top_center_y = roof_top_y + roof_height * 0.15  # Peak of roof
    
    # Draw unified background fill as a polygon: triangular roof + rectangular body (with overhang)
    background_polygon = [
        (roof_center_x, roof_top_center_y - fill_overhang),  # Peak - moved up
        (roof_left_x - fill_overhang, box_start_y - fill_overhang + line_width),  # Bottom left of roof
        (roof_left_x - fill_overhang, box_bottom_y + fill_overhang),  # Bottom left of boxes
        (roof_right_x + fill_overhang, box_bottom_y + fill_overhang),  # Bottom right of boxes
        (roof_right_x + fill_overhang, box_start_y - fill_overhang + line_width),  # Bottom right of roof
    ]
    
    draw.polygon(background_polygon, fill=fill_color)


def draw_doghouse(
    draw: ImageDraw.ImageDraw,
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
    - Five boxes showing (from top to bottom): Heading, Distance, ETE, TAS, Alt
    
    Args:
        draw: The ImageDraw object to draw on (must be RGBA mode for transparency)
        leg_data: The leg data containing heading, distance, ETE
        destination_turnpoint_index: The index of the destination turnpoint (0-based)
        coord_to_pixel: Function that converts geographic coordinates (lat, lon) to pixel coordinates (x, y)
        image_width: Width of the image (for clamping)
        image_height: Height of the image (for clamping)
    """
    try:
        # Calculate doghouse position
        doghouse_center_x, doghouse_center_y, ref_x, ref_y = _calculate_doghouse_position(
            leg_data.straigthening_point, leg_data.destination, coord_to_pixel, image_width, image_height, offset_distance=80
        )
        
        if doghouse_center_x is None:
            return
        
        # Doghouse dimensions (enlarged to fit large font)
        box_width = 95
        box_height = 40
        roof_height = 35
        line_width = 3  # Consistent line width for all lines
        num_boxes = 5
        
        # Total height of doghouse (roof + boxes)
        total_height = roof_height + num_boxes * box_height
        
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
        
        # Calculate bottom of last box
        box_start_y = roof_bottom_y
        box_bottom_y = box_start_y + num_boxes * box_height
        
        # Draw unified background fill
        _draw_doghouse_background(
            draw, roof_left_x, roof_right_x, roof_top_y, roof_bottom_y,
            roof_height, box_start_y, box_bottom_y, fill_color, fill_overhang, line_width
        )
        
        # Draw roof with turnpoint number
        turnpoint_number = str(destination_turnpoint_index + 1)  # 1-based for display
        _draw_doghouse_roof(
            draw, roof_left_x, roof_right_x, roof_top_y, roof_bottom_y,
            roof_height, turnpoint_number, LARGE_FONT, text_color, outline_color, line_width
        )
        
        # Format leg data
        heading_str = f"{leg_data.heading:.0f}°M"
        distance_str = f"{leg_data.distanceNm:.1f}NM"
        
        # Format ETE (Estimated Time En route) in MM:SS format
        ete_minutes = leg_data.eteSec // 60
        ete_seconds = leg_data.eteSec % 60
        ete_str = f"{ete_minutes:02d}+{ete_seconds:02d}"
        
        # TAS from destination turnpoint
        tas_str = f"{leg_data.tas:.0f}K"
        
        # Altitude from destination turnpoint
        alt_str = f"{leg_data.alt:.0f}'"
        
        # Values for each box (from top to bottom: Heading, Distance, ETE, TAS, Alt)
        box_values = [
            heading_str,
            distance_str,
            ete_str,
            tas_str,
            alt_str,
        ]
        
        # Draw boxes
        _draw_doghouse_boxes(
            draw, doghouse_top_x, box_start_y, box_width, box_height,
            box_values, LARGE_FONT, text_color, outline_color, line_width
        )
        
        logger.debug(f"Drew doghouse for leg at ({ref_x:.1f}, {ref_y:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw doghouse: {e}")


def draw_mini_doghouse(
    overlay_image: Image.Image,
    leg_data: LegData,
    destination_turnpoint_index: int,
    coord_to_pixel: Callable[[float, float], Tuple[float, float]],
    image_width: int,
    image_height: int,
    position: str = "end"
) -> None:
    """
    Draw a "mini-doghouse" diagram on the left of a leg, rotated to be parallel to the leg.
    
    The mini-doghouse consists of:
    - A roof containing the destination turnpoint number
    - Three boxes showing (from top to bottom): Heading, Alt, TAS
    
    Args:
        draw: The ImageDraw object to draw on (must be RGBA mode for transparency)
        overlay_image: The overlay image to paste the rotated doghouse onto
        leg_data: The leg data containing heading, distance, ETE
        destination_turnpoint_index: The index of the destination turnpoint (0-based)
        coord_to_pixel: Function that converts geographic coordinates (lat, lon) to pixel coordinates (x, y)
        image_width: Width of the image (for clamping)
        image_height: Height of the image (for clamping)
        position: Position along the leg - "beginning" or "end" (default: "end")
    """
    try:
        # Calculate doghouse position
        origin = leg_data.origin
        destination = leg_data.destination
        doghouse_center_x, doghouse_center_y, ref_x, ref_y = _calculate_doghouse_position(
            leg_data.straigthening_point, leg_data.destination, coord_to_pixel, image_width, image_height, 
            offset_distance=70, position=position
        )
        
        if doghouse_center_x is None:
            return
        
        # Convert leg endpoints to pixel coordinates to calculate leg angle
        origin_x_px, origin_y_px = coord_to_pixel(leg_data.straigthening_point.lat, leg_data.straigthening_point.lon)
        dest_x_px, dest_y_px = coord_to_pixel(destination.lat, destination.lon)
        
        # Clamp to image bounds
        def _clamp(val, lo, hi):
            return max(lo, min(val, hi))
        ox = _clamp(origin_x_px, 0, image_width - 1)
        oy = _clamp(origin_y_px, 0, image_height - 1)
        dx = _clamp(dest_x_px, 0, image_width - 1)
        dy = _clamp(dest_y_px, 0, image_height - 1)
        
        logger.info(f"Origin: ({ox:.1f}, {oy:.1f}), Destination: ({dx:.1f}, {dy:.1f})")

        # Calculate leg direction vector and angle
        leg_dx = dest_x_px - origin_x_px
        leg_dy = dest_y_px - origin_y_px
        leg_length = math.sqrt(leg_dx**2 + leg_dy**2)
        
        logger.info(f"leg_dx: {leg_dx:.1f}, leg_dy: {leg_dy:.1f}")

        if leg_length == 0:
            logger.warning("Leg has zero length, cannot draw mini-doghouse")
            return
        
        # Calculate rotation angle in degrees
        # The doghouse is drawn vertically (roof at top, boxes below)
        # To make it parallel to the leg, we need to rotate by leg_angle - 90 degrees
        leg_angle_rad = math.atan2(leg_dx, leg_dy)
        leg_angle_deg = math.degrees(leg_angle_rad)
        logger.info(f"Leg angle: {leg_angle_deg:.1f}°")
        rotation_angle = 180 + leg_angle_deg
        
        # Mini-doghouse dimensions (smaller to fit small font)
        box_width = 70
        box_height = 28
        roof_height = 25
        line_width = 2  # Thinner lines for mini version
        num_boxes = 3
        
        # Total height of mini-doghouse (roof + 3 boxes)
        total_height = roof_height + num_boxes * box_height
        
        # Calculate size needed for rotated image (diagonal)
        diagonal = math.sqrt(box_width**2 + total_height**2)
        temp_size = int(diagonal) + 20  # Add padding
        temp_center = temp_size / 2
        
        # Create temporary image for drawing the doghouse (ensure RGBA mode)
        temp_image = Image.new('RGBA', (temp_size, temp_size), (0, 0, 0, 0))
        temp_draw = ImageDraw.Draw(temp_image, mode='RGBA')
        
        # Calculate positions relative to temp image center
        temp_box_left_x = temp_center - box_width / 2
        temp_roof_top_y = temp_center - total_height / 2
        temp_roof_bottom_y = temp_roof_top_y + roof_height
        temp_roof_left_x = temp_box_left_x
        temp_roof_right_x = temp_box_left_x + box_width
        temp_box_start_y = temp_roof_bottom_y
        temp_box_bottom_y = temp_box_start_y + num_boxes * box_height
        
        # Text color - using blue to match other annotations
        text_color = (0, 102, 204, 255)  # Solid blue for text
        outline_color = BLUE_COLOR_RGBA
        # Transparent white fill at 30% opacity
        fill_color = (255, 255, 255, int(255 * 0.3))  # 30% opacity white
        fill_overhang = 3  # Smaller overhang for mini version
        
        # Draw unified background fill on temp image
        _draw_doghouse_background(
            temp_draw, temp_roof_left_x, temp_roof_right_x, temp_roof_top_y, temp_roof_bottom_y,
            roof_height, temp_box_start_y, temp_box_bottom_y, fill_color, fill_overhang, line_width
        )
        
        # Draw roof with turnpoint number on temp image
        turnpoint_number = str(destination_turnpoint_index + 1)  # 1-based for display
        _draw_doghouse_roof(
            temp_draw, temp_roof_left_x, temp_roof_right_x, temp_roof_top_y, temp_roof_bottom_y,
            roof_height, turnpoint_number, MEDIUM_FONT, text_color, outline_color, line_width
        )
        
        # Format heading from leg data
        heading_str = f"{leg_data.heading:.0f}°M"
        
        # Format Alt and TAS from destination turnpoint
        tas_str = f"{leg_data.tas:.0f}K"
        alt_str = f"{leg_data.alt:.0f}'"
        
        # Values for each box (from top to bottom: Heading, Alt, TAS)
        box_values = [heading_str, alt_str, tas_str]
        
        # Draw boxes on temp image
        _draw_doghouse_boxes(
            temp_draw, temp_box_left_x, temp_box_start_y, box_width, box_height,
            box_values, MEDIUM_FONT, text_color, outline_color, line_width
        )
        
        # Rotate the temporary image around its center
        # Use expand=True to ensure the rotated image isn't clipped
        # Use resample=Image.Resampling.BILINEAR for better quality
        rotated_temp = temp_image.rotate(
           rotation_angle, 
           center=(temp_center, temp_center), 
           expand=True, 
           resample=Image.Resampling.BILINEAR
        )

        # After rotation with expand=True, the image size changes, so recalculate center
        rotated_center_x = rotated_temp.width / 2
        rotated_center_y = rotated_temp.height / 2
        
        # Calculate paste position (center of rotated image should be at doghouse_center)
        paste_x = int(doghouse_center_x - rotated_center_x)
        paste_y = int(doghouse_center_y - rotated_center_y)
        
        # Create a temporary overlay the same size as the main overlay
        # Paste the rotated doghouse onto it at the correct position
        temp_overlay = Image.new('RGBA', overlay_image.size, (0, 0, 0, 0))
        temp_overlay.paste(rotated_temp, (paste_x, paste_y))
        
        # Alpha composite the temporary overlay onto the main overlay
        # This properly blends the alpha channels
        overlay_image.paste(Image.alpha_composite(overlay_image, temp_overlay))
        
        logger.debug(f"Drew mini-doghouse for leg at ({ref_x:.1f}, {ref_y:.1f}) with rotation {rotation_angle:.1f}° (leg angle: {leg_angle_deg:.1f}°)")
    except Exception as e:
        logger.warning(f"Failed to draw mini-doghouse: {e}")


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
        if len(flight_plan.points) < 2:
            logger.warning("Flight plan has no points to draw")
            return
        
        # Create an overlay layer in RGBA mode for drawing with transparency
        overlay = Image.new('RGBA', image.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        
        # Draw all legs on the overlay
        for i in range(1, len(flight_plan.points)):
            if i-1 == focus_leg_index:
                # Skip the focus leg so we can draw it last
                continue
            draw_leg(overlay_draw, flight_plan_data.legData[i-1], coord_to_pixel, image.width, image.height)
            annotate_leg(overlay_draw, overlay, flight_plan_data.turnpointData[i-1].etaSec, flight_plan_data.legData[i-1], coord_to_pixel)

        # Draw the focus leg last
        draw_leg(overlay_draw, flight_plan_data.legData[focus_leg_index], coord_to_pixel, image.width, image.height)
        annotate_leg(overlay_draw, overlay, flight_plan_data.turnpointData[focus_leg_index].etaSec, flight_plan_data.legData[focus_leg_index], coord_to_pixel)

        # Draw all turnpoints on the overlay
        for i, point in enumerate(flight_plan.points):
            if i == focus_leg_index or i == focus_leg_index + 1:
                # Skip the focus leg so we can draw it last
                continue
            logger.debug(f"Drawing turnpoint {i}")
            draw_turnpoint(overlay_draw, point, coord_to_pixel, image.width, image.height)
            annotate_turnpoint(overlay_draw, point, i, flight_plan_data, coord_to_pixel, image.width, image.height)

        # Draw the focus turnpoints last
        point = flight_plan.points[focus_leg_index]
        draw_turnpoint(overlay_draw, point, coord_to_pixel, image.width, image.height)
        annotate_turnpoint(overlay_draw, point, focus_leg_index, flight_plan_data, coord_to_pixel, image.width, image.height)
        point = flight_plan.points[focus_leg_index + 1]
        draw_turnpoint(overlay_draw, point, coord_to_pixel, image.width, image.height)
        annotate_turnpoint(overlay_draw, point, focus_leg_index + 1, flight_plan_data, coord_to_pixel, image.width, image.height)

        # Temp: Draw the straigthening point
        leg_data = flight_plan_data.legData[focus_leg_index]
        # logger.info(f"Centre point: {leg_data.turn_data.center.lat}, {leg_data.turn_data.center.lon}")
        # logger.info(f"Straigthening point: {leg_data.straigthening_point.lat}, {leg_data.straigthening_point.lon}")
        # cx, cy = coord_to_pixel(leg_data.turn_data.center.lat, leg_data.turn_data.center.lon)
        # x, y = coord_to_pixel(leg_data.straigthening_point.lat, leg_data.straigthening_point.lon)
        
        # Temp: Draw turn circle
        # radius_outer = 4
        # overlay_draw.ellipse(
        #     (cx - radius_outer, cy - radius_outer, cx + radius_outer, cy + radius_outer),
        #     outline=RED_COLOR_RGBA,
        #     width=3
        # )

        # Draw the turnpoint circle (radius 12, stroke width 3) - outline only, no fill
        # overlay_draw.ellipse(
        #     (x - radius_outer, y - radius_outer, x + radius_outer, y + radius_outer),
        #     outline=BLUE_COLOR_RGBA,
        #     width=3
        # )

        # Add the doghouses for this leg
        if focus_leg_index < len(flight_plan_data.legData):
            draw_doghouse(
                overlay_draw,
                leg_data,
                focus_leg_index,  # This leg's index
                coord_to_pixel,
                image.width,
                image.height
            )
        if focus_leg_index > 0:
            draw_mini_doghouse(
                overlay,
                flight_plan_data.legData[focus_leg_index - 1],
                focus_leg_index - 1,  # Destination turnpoint index (where it connects to focus leg)
                coord_to_pixel,
                image.width, image.height, position="end")
        if focus_leg_index < len(flight_plan_data.legData) - 1:
            draw_mini_doghouse(
                overlay,
                flight_plan_data.legData[focus_leg_index + 1],
                focus_leg_index + 1,  # Destination turnpoint index (0-based)
                coord_to_pixel,
                image.width, image.height, position="beginning")

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