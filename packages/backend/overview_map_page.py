"""
Overview map page generator for kneeboard output.

Generates a 768x1024 PNG showing the entire route on a single map, with waypoint
symbols, minute marks on legs, a north arrow, and a total distance/time summary.
"""

import io
import math
import logging
from typing import Tuple
from PIL import Image, ImageDraw

from flight_plan import FlightPlan, FlightPlanData
from kneeboard import (
    _get_map_info,
    _transformer_for_projection,
    _get_resolution_for_zoom,
    _assemble_tiles,
    _tm_to_pixel_on_rotated_image,
    _rotate_image,
    MAP_WIDTH,
    MAP_HEIGHT,
)
from map_annotations import (
    annotate_overview_map,
    _draw_north_arrow,
    _draw_route_summary,
    OUTLINE_COLOR_RGBA,
)

logger = logging.getLogger(__name__)

# The route's longest extent (mapped to the page's long dimension) should fill this fraction.
OVERVIEW_FILL_TARGET = 0.85


def generate_overview_map_page(flight_plan: FlightPlan, flight_plan_data: FlightPlanData) -> bytes:
    """
    Generate a 768x1024 PNG overview map showing the entire route.

    The map is auto-rotated so the route's longest axis aligns with the portrait
    page height (1024 px). A north arrow, waypoint annotations, minute marks on
    legs, and a total distance/time box are drawn on the finished page.

    Args:
        flight_plan: The flight plan input model.
        flight_plan_data: Pre-computed flight plan data (legs, ETAs, …).

    Returns:
        PNG image bytes (768 x 1024, RGB).
    """
    map_info = _get_map_info(flight_plan.theatre)
    transformer = _transformer_for_projection(map_info)

    # ── Step 1: Compute route bounding box in projected coordinates ──────────
    # Include waypoints, straightening points, and turn centres so that turn
    # arcs are not clipped at the page edges.
    all_x: list[float] = []
    all_y: list[float] = []

    for pt in flight_plan.points:
        x, y = transformer.transform(pt.lon, pt.lat)
        all_x.append(x)
        all_y.append(y)

    for leg in flight_plan_data.legData:
        x, y = transformer.transform(leg.straigthening_point.lon, leg.straigthening_point.lat)
        all_x.append(x)
        all_y.append(y)
        # First leg has a dummy turn centre at (0, 0) – skip it.
        if leg.turn_data.center.lat != 0 or leg.turn_data.center.lon != 0:
            x, y = transformer.transform(leg.turn_data.center.lon, leg.turn_data.center.lat)
            all_x.append(x)
            all_y.append(y)

    route_min_x = min(all_x)
    route_max_x = max(all_x)
    route_min_y = min(all_y)
    route_max_y = max(all_y)

    route_width_m = route_max_x - route_min_x    # east-west extent
    route_height_m = route_max_y - route_min_y   # north-south extent
    route_center_x = (route_min_x + route_max_x) / 2
    route_center_y = (route_min_y + route_max_y) / 2

    # ── Step 2: Choose orientation ───────────────────────────────────────────
    # If the route is wider (E-W) than tall (N-S), rotate the map 90° CCW so
    # east becomes "up" and the E-W extent fills the portrait height (1024 px).
    if route_width_m >= route_height_m:
        rotation_angle = 90   # CCW; east → up; north → left
        longest_m = route_width_m
        shortest_m = route_height_m
    else:
        rotation_angle = 0    # north up
        longest_m = route_height_m
        shortest_m = route_width_m

    # ── Step 3: Select zoom level and scale factor ───────────────────────────
    # After orientation choice the longest extent maps to MAP_HEIGHT and the
    # shortest to MAP_WIDTH.  Find the lowest zoom where scale_factor <= 1
    # (i.e. we only scale *down*, never up).  If all zoom levels need upscaling,
    # use the highest available zoom with scale_factor > 1.
    target_long_px = MAP_HEIGHT * OVERVIEW_FILL_TARGET   # ~870 px
    target_short_px = MAP_WIDTH * OVERVIEW_FILL_TARGET   # ~653 px

    zoom_levels = sorted(z.zoom for z in map_info.zoom_info)
    selected_zoom = zoom_levels[-1]
    selected_scale = 1.0

    for zoom in zoom_levels:
        resolution = _get_resolution_for_zoom(map_info, zoom)
        if resolution == 0:
            continue
        long_px = longest_m / resolution
        short_px = shortest_m / resolution
        if long_px == 0:
            continue

        sf_long = target_long_px / long_px
        sf_short = (target_short_px / short_px) if short_px > 0 else sf_long
        scale_factor = min(sf_long, sf_short)

        # Always record the latest computed values so we have a valid fallback.
        selected_zoom = zoom
        selected_scale = scale_factor

        if scale_factor <= 1.0:
            break   # This zoom is detailed enough; stop here.

    zoom = selected_zoom
    scale_factor = selected_scale
    resolution = _get_resolution_for_zoom(map_info, zoom)
    logger.info(
        f"Overview: rotation={rotation_angle}°, zoom={zoom}, "
        f"scale_factor={scale_factor:.4f}"
    )

    # ── Step 4: Build tile bounding box centered on route center ─────────────
    # Use the same diagonal-coverage approach as _create_bbox_around_leg so
    # that after scaling and rotation the full MAP_WIDTH × MAP_HEIGHT area is
    # covered by tiles.
    diagonal_px = math.sqrt(MAP_WIDTH ** 2 + MAP_HEIGHT ** 2)
    pre_scale_diagonal_px = diagonal_px / scale_factor
    half_side_m = (pre_scale_diagonal_px * resolution) / 2

    bbox_tm = (
        route_center_x - half_side_m,
        route_center_y - half_side_m,
        route_center_x + half_side_m,
        route_center_y + half_side_m,
    )

    # ── Step 5: Assemble tiles ───────────────────────────────────────────────
    composite = _assemble_tiles(map_info, zoom, bbox_tm)

    # ── Step 6: Scale the composite ─────────────────────────────────────────
    if scale_factor != 1.0:
        new_w = int(composite.width * scale_factor)
        new_h = int(composite.height * scale_factor)
        logger.info(f"Scaling composite {composite.width}×{composite.height} → {new_w}×{new_h}")
        composite = composite.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # ── Step 7: Rotate ───────────────────────────────────────────────────────
    center_x = composite.width // 2
    center_y = composite.height // 2
    scaled_composite_size = (composite.width, composite.height)

    rotated = _rotate_image(composite, rotation_angle, (center_x, center_y))
    logger.info(f"Rotated image size: {rotated.width}×{rotated.height}")

    # ── Step 8: Build coord_to_pixel mapping ─────────────────────────────────
    def coord_to_pixel(lat: float, lon: float) -> Tuple[float, float]:
        """Convert geographic coordinates to pixel position on the rotated image."""
        x_proj, y_proj = transformer.transform(lon, lat)
        return _tm_to_pixel_on_rotated_image(
            x_proj, y_proj,
            bbox_tm, map_info, zoom,
            rotation_angle, (center_x, center_y),
            scaled_composite_size, rotated.size,
            scale_factor,
        )

    # ── Step 9: Annotate legs and waypoints on the rotated image ────────────
    annotate_overview_map(rotated, flight_plan, flight_plan_data, coord_to_pixel)

    # ── Step 10: Compute route centre on rotated image for cropping ──────────
    route_center_px, route_center_py = _tm_to_pixel_on_rotated_image(
        route_center_x, route_center_y,
        bbox_tm, map_info, zoom,
        rotation_angle, (center_x, center_y),
        scaled_composite_size, rotated.size,
        scale_factor,
    )

    # ── Step 11: Crop to MAP_WIDTH × MAP_HEIGHT centered on route centre ─────
    half_w = MAP_WIDTH // 2
    half_h = MAP_HEIGHT // 2

    left = int(route_center_px - half_w)
    top = int(route_center_py - half_h)
    right = left + MAP_WIDTH
    bottom = top + MAP_HEIGHT

    # Shift inward if the box extends beyond image bounds.
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > rotated.width:
        left -= right - rotated.width
        right = rotated.width
    if bottom > rotated.height:
        top -= bottom - rotated.height
        bottom = rotated.height
    left = max(0, left)
    top = max(0, top)

    cropped = rotated.crop((left, top, right, bottom))

    # Pad with black if crop is smaller than target (near tile grid edges).
    if cropped.width < MAP_WIDTH or cropped.height < MAP_HEIGHT:
        logger.warning(
            f"Cropped overview image smaller than target "
            f"({cropped.width}×{cropped.height}), padding."
        )
        padded = Image.new('RGB', (MAP_WIDTH, MAP_HEIGHT), 'black')
        padded.paste(cropped, ((MAP_WIDTH - cropped.width) // 2,
                               (MAP_HEIGHT - cropped.height) // 2))
        cropped = padded

    # ── Step 12: Draw north arrow and route summary on the cropped image ─────
    if cropped.mode != 'RGBA':
        cropped = cropped.convert('RGBA')

    overlay = Image.new('RGBA', cropped.size, (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)

    _draw_north_arrow(ov_draw, rotation_angle)

    total_nm = sum(leg.distanceNm for leg in flight_plan_data.legData)
    total_sec = sum(leg.eteSec for leg in flight_plan_data.legData)
    _draw_route_summary(ov_draw, total_nm, total_sec, MAP_WIDTH, MAP_HEIGHT)

    cropped = Image.alpha_composite(cropped, overlay)

    # ── Step 13: Encode and return ───────────────────────────────────────────
    out = io.BytesIO()
    cropped.convert('RGB').save(out, format='PNG')
    logger.info(f"Overview map page generated: {out.tell()} bytes")
    return out.getvalue()
