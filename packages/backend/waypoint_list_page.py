"""
Waypoint list page generator for kneeboard output.

Generates a 768x1024 PNG table listing all waypoints with their
type icon, number, name, and coordinates in a monospace teletype style.
"""

import io
import os
import math
import logging
from PIL import Image, ImageDraw, ImageFont
from flight_plan import FlightPlan
from map_annotations import _format_coord_ddm

logger = logging.getLogger(__name__)

# Page dimensions (same as kneeboard map pages)
PAGE_WIDTH = 768
PAGE_HEIGHT = 1024

# Colors
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)

# Layout constants
MARGIN_LEFT = 40
MARGIN_RIGHT = 40
MARGIN_TOP = 40
TITLE_FONT_SIZE = 32
ROW_FONT_SIZE = 22
ROW_HEIGHT = 54
LINE_WIDTH = 1

# Column x-offsets (from left margin)
COL_ICON_CENTER = 30    # center of the icon column
COL_NUMBER = 65         # start of waypoint number
COL_NAME = 115          # start of waypoint name
COL_POSITION = 330      # start of lat/lon

# Icon sizing
ICON_RADIUS = 8
ICON_STROKE = 2

FONTS_DIR = os.path.join(os.path.dirname(__file__), "config", "fonts")


def _load_fixed_font(size: int) -> ImageFont.FreeTypeFont:
    """Load the fixed-width font at the given size."""
    font_path = os.path.join(FONTS_DIR, "fixed.ttf")
    try:
        return ImageFont.truetype(font_path, size)
    except (IOError, OSError):
        logger.warning(f"Could not load fixed.ttf, falling back to default")
        return ImageFont.load_default()


def _draw_waypoint_icon(draw: ImageDraw.ImageDraw, cx: float, cy: float,
                        wpt_type: str, font: ImageFont.FreeTypeFont) -> None:
    """Draw a small waypoint type icon centered at (cx, cy).

    - normal: small circle outline
    - push: text "PSH"
    - ip: small diamond (rotated square) outline
    - tgt: small triangle outline
    """
    r = ICON_RADIUS
    stroke = ICON_STROKE

    if wpt_type == 'push':
        # Draw "PSH" text centered using anchor="mm" (middle-middle)
        draw.text((cx, cy), "PSH", fill=BLACK, font=font, anchor="mm")

    elif wpt_type == 'ip':
        # Diamond (square rotated 45 degrees)
        diamond = [
            (cx, cy - r),       # top
            (cx + r, cy),       # right
            (cx, cy + r),       # bottom
            (cx - r, cy),       # left
        ]
        draw.polygon(diamond, outline=BLACK, fill=None)

    elif wpt_type == 'tgt':
        # Triangle (point up)
        h = r * math.sqrt(3)
        triangle = [
            (cx, cy - r),                 # top
            (cx + h / 2, cy + r / 2),     # bottom right
            (cx - h / 2, cy + r / 2),     # bottom left
        ]
        draw.polygon(triangle, outline=BLACK, fill=None)

    else:
        # Normal: circle outline
        draw.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            outline=BLACK,
            width=stroke,
        )


def generate_waypoint_list_page(flight_plan: FlightPlan) -> bytes:
    """Generate a 768x1024 PNG image with a waypoint list table.

    Args:
        flight_plan: The flight plan containing waypoints.

    Returns:
        PNG image data as bytes.
    """
    img = Image.new("RGBA", (PAGE_WIDTH, PAGE_HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)

    title_font = _load_fixed_font(TITLE_FONT_SIZE)
    row_font = _load_fixed_font(ROW_FONT_SIZE)

    table_left = MARGIN_LEFT
    table_right = PAGE_WIDTH - MARGIN_RIGHT

    # Draw title
    title = "WAYPOINTS"
    title_bbox = title_font.getbbox(title)
    title_w = title_bbox[2] - title_bbox[0]
    title_x = (PAGE_WIDTH - title_w) / 2
    title_y = MARGIN_TOP
    draw.text((title_x, title_y), title, fill=BLACK, font=title_font)

    # Horizontal line below title
    title_bottom = title_y + (title_bbox[3] - title_bbox[1]) + 26 
    draw.line([(table_left, title_bottom), (table_right, title_bottom)],
              fill=BLACK, width=LINE_WIDTH)

    # Draw waypoint rows
    current_y = title_bottom + 4

    for i, point in enumerate(flight_plan.points):
        row_center_y = current_y + ROW_HEIGHT / 2
        wpt_type = point.waypointType or 'normal'

        # Icon
        _draw_waypoint_icon(draw, table_left + COL_ICON_CENTER, row_center_y,
                            wpt_type, row_font)

        # Waypoint number (1-indexed, zero-padded) — anchor="lm": left-middle
        num_str = f"{i + 1:02d}"
        draw.text((table_left + COL_NUMBER, row_center_y),
                  num_str, fill=BLACK, font=row_font, anchor="lm")

        # Waypoint name — anchor="lm": left-middle
        name = point.name or ""
        draw.text((table_left + COL_NAME, row_center_y),
                  name, fill=BLACK, font=row_font, anchor="lm")

        # Position (lat/lon) — right-aligned to table_right, anchor="rm": right-middle
        lat_str = _format_coord_ddm(point.lat, "N", "S", deg_width=2)
        lon_str = _format_coord_ddm(point.lon, "E", "W", deg_width=3)
        pos_str = f"{lat_str} {lon_str}"
        draw.text((table_right, row_center_y),
                  pos_str, fill=BLACK, font=row_font, anchor="rm")

        # Horizontal separator line below this row
        line_y = current_y + ROW_HEIGHT
        draw.line([(table_left, line_y), (table_right, line_y)],
                  fill=BLACK, width=LINE_WIDTH)

        current_y = line_y

    # Convert to RGB (kneeboard pages are RGB PNGs) and save
    img_rgb = img.convert("RGB")
    buf = io.BytesIO()
    img_rgb.save(buf, format="PNG")
    return buf.getvalue()
