"""
Kneeboard generation module for flight plan visualization.

This module handles validation of flight plan data and generation of
kneeboard PNG images.
"""

import pprint
import time
from typing import Tuple, Optional, Dict, List
import zipfile
from PIL import Image
import math
import io
import os
import json
import logging
from pydantic import BaseModel, Field
from pyproj import Transformer
from map_annotations import annotate_map
from flight_plan import FlightPlan, FlightPlanData

# Set up logger (logging configuration is handled centrally in main.py)
logger = logging.getLogger(__name__)


class ZoomLevelInfo(BaseModel):
    """Information about a specific zoom level in the tile grid."""
    zoom: int
    nb_tiles_w: int
    nb_tiles_h: int
    width_px: int
    height_px: int


class MapBounds(BaseModel):
    """Bounding box for the map in geographic coordinates."""
    minLon: float
    minLat: float
    maxLon: float
    maxLat: float


class MapInfo(BaseModel):
    """Complete map information including zoom levels and bounds."""
    zoom_info: List[ZoomLevelInfo]
    central_meridian: float = Field(..., description="Central meridian for Transverse Mercator projection")
    origin_lat: float = Field(..., description="Origin latitude (NW corner) for tile grid")
    origin_lon: float = Field(..., description="Origin longitude (NW corner) for tile grid")
    ref_corner_ne_lat: float = Field(..., description="Reference corner latitude (NE) for resolution calculation")
    ref_corner_ne_lon: float = Field(..., description="Reference corner longitude (NE) for resolution calculation")
    bounds: Optional[MapBounds] = None
    minZoom: Optional[int] = None
    maxZoom: Optional[int] = None
    tileSize: Optional[int] = 256


def generate_kneeboard_single_png(flight_plan: FlightPlan, leg_index: int) -> bytes:
    """
    Generate a 768x1024 PNG image with the map for the given leg of the flight plan.
    
    Args:
        flight_plan: The flight plan
        leg_index: Index of the leg to generate the map for
    Returns:
        PNG image data as bytes (768x1024)
        
    Raises:
        ValueError: If flight plan has fewer than 2 waypoints
    """
    logger.info(f"=== Generating kneeboard PNG (leg {leg_index} map) ===")
    
    if len(flight_plan.points) < 2:
        raise ValueError("Flight plan must have at least 2 waypoints to generate a leg map")
    
    # Generate map for the given leg
    flightPlanData = FlightPlanData(flight_plan)
    logger.info(f"Flight plan data: {pprint.pformat(flightPlanData)}")
    leg_map_png = generate_leg_map(flight_plan, flightPlanData, leg_index)
    logger.info(f"Kneeboard PNG generated: {len(leg_map_png)} bytes")
    
    return leg_map_png

def generate_kneeboard_zip(flight_plan: FlightPlan) -> bytes:
    """
    Generate a ZIP file containing all the leg maps for the flight plan.
    
    Args:
        flight_plan: The flight plan
    Returns:
        ZIP file data as bytes
    """
    logger.info(f"=== Generating kneeboard ZIP ===")
    
    if len(flight_plan.points) < 2:
        raise ValueError("Flight plan must have at least 2 waypoints to generate a leg map")
    
    # Generate all leg maps
    flightPlanData = FlightPlanData(flight_plan)
    leg_maps = []
    for i in range(len(flightPlanData.legData)):
        logger.info(f"Processing leg {i+1}/{len(flightPlanData.legData)}")
        
        leg_map = generate_leg_map(flight_plan, flightPlanData, i)
        leg_maps.append(leg_map)
        logger.info(f"Leg {i+1}/{len(flightPlanData.legData)} completed: {len(leg_map)} bytes")

    logger.info(f"All leg maps generated: {len(leg_maps)} maps")
    
    # Create ZIP file
    zip_data = io.BytesIO()
    with zipfile.ZipFile(zip_data, 'w', compression=zipfile.ZIP_STORED) as zipf:
        for i, leg_map in enumerate(leg_maps):
            zipf.writestr(f"leg_{i+1}.png", leg_map)
    return zip_data.getvalue()

# Constants for leg map generation
TILES_DIR = os.path.join(os.path.dirname(__file__), "config", "static", "tiles")
BLANK_TILE_PATH = os.path.join(os.path.dirname(__file__), "config", "blank.png")
MAP_INFO_PATH = os.path.join(TILES_DIR, "tiles_info.json")
TILES_INFO_PATH = MAP_INFO_PATH  # Alias for backward compatibility with tests
MAP_WIDTH = 768
MAP_HEIGHT = 1024
LEG_HEIGHT_TARGET = 0.70  # Leg should occupy 70% of height
TILE_SIZE = 256  # Standard tile size in pixels


def _get_map_info() -> MapInfo:
    """Load and return tile info from JSON file."""
    logger.info(f"Loading map info from {MAP_INFO_PATH}")
    if not os.path.exists(MAP_INFO_PATH):
        logger.error(f"Map info file not found at {MAP_INFO_PATH}")
        raise FileNotFoundError(f"Map info file not found at {MAP_INFO_PATH}")
    with open(MAP_INFO_PATH, 'r') as f:
        data = json.load(f)
    map_info = MapInfo.model_validate(data)
    logger.info(f"Map info loaded: {len(map_info.zoom_info)} zoom levels")
    return map_info


def _lat_lon_to_transverse_mercator(lat: float, lon: float, central_meridian: float) -> Tuple[float, float]:
    """
    Convert lat/lon to Transverse Mercator coordinates.
    
    Args:
        lat: Latitude in degrees
        lon: Longitude in degrees
        central_meridian: Central meridian for the projection
        
    Returns:
        Tuple of (x, y) in meters
    """
    # Transverse Mercator projection with central meridian at 39°
    transformer = Transformer.from_crs(
        "EPSG:4326",  # WGS84
        f"+proj=tmerc +lat_0=0 +lon_0={central_meridian} +k=1.0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
        always_xy=True
    )
    x, y = transformer.transform(lon, lat)
    return x, y


def _calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in meters using Haversine formula."""
    R = 6371000  # Earth's radius in meters
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    d_lat = lat2_rad - lat1_rad
    d_lon = lon2_rad - lon1_rad
    
    a = math.sin(d_lat/2) * math.sin(d_lat/2) + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * \
        math.sin(d_lon/2) * math.sin(d_lon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def _get_resolution_for_zoom(map_info: MapInfo, zoom: int) -> float:
    """
    Calculate resolution (meters per pixel) for a given zoom level.
    
    Args:
        map_info: MapInfo object
        zoom: Zoom level
        
    Returns:
        Resolution in meters per pixel
    """
    # Calculate reference distance in Transverse Mercator
    origin_x, origin_y = _lat_lon_to_transverse_mercator(map_info.origin_lat, map_info.origin_lon, map_info.central_meridian)
    ref_x, ref_y = _lat_lon_to_transverse_mercator(map_info.ref_corner_ne_lat, map_info.ref_corner_ne_lon, map_info.central_meridian)
    x_distance = math.sqrt((ref_x - origin_x)**2 + (ref_y - origin_y)**2)
    
    # Find zoom info for this zoom level
    this_zoom = None
    for z_info in map_info.zoom_info:
        if z_info.zoom == zoom:
            this_zoom = z_info
            break
    
    if this_zoom is None:
        raise ValueError(f"Zoom level {zoom} not found in tile info")
    
    # Resolution = distance / pixels
    resolution = x_distance / this_zoom.width_px
    return resolution


def _select_zoom_level(map_info: MapInfo, leg_distance_meters: float) -> Tuple[int, float]:
    """
    Select the zoom level just above the one giving 70% height.
    
    Args:
        map_info: MapInfo object
        leg_distance_meters: Distance of the leg in meters
        
    Returns:
        Tuple of (selected zoom level, leg height in pixels at that zoom)
    """
    target_height_px = MAP_HEIGHT * LEG_HEIGHT_TARGET  # ~717 pixels
    logger.debug(f"Target leg height: {target_height_px:.1f} pixels")
    
    # Try each zoom level from highest to lowest
    zoom_levels = sorted([z_info.zoom for z_info in map_info.zoom_info], reverse=False)
    logger.info(f"Available zoom levels: {zoom_levels}")
    
    # Find the zoom level where leg height is just above target (or highest if all are below)
    selected_zoom = None
    selected_leg_height = None
    
    for zoom in zoom_levels:
        resolution = _get_resolution_for_zoom(map_info, zoom)
        leg_height_px = leg_distance_meters / resolution
        logger.debug(f"Zoom {zoom}: resolution={resolution:.2f} m/px, leg_height={leg_height_px:.1f} px")
        
        if leg_height_px > target_height_px:
            # This zoom gives more than 70%, use it
            logger.debug(f"Selected zoom {zoom} (leg height {leg_height_px:.1f}px > target {target_height_px:.1f}px)")
            return zoom, leg_height_px
        
        # Track the largest zoom that's <= target (in case all are below target)
        if selected_zoom is None or zoom > selected_zoom:
            selected_zoom = zoom
            selected_leg_height = leg_height_px
    
    # If all zoom levels give <= 70%, use the highest one
    if selected_zoom is None:
        selected_zoom = max(zoom_levels)
        resolution = _get_resolution_for_zoom(map_info, selected_zoom)
        selected_leg_height = leg_distance_meters / resolution
    
    logger.debug(f"Using zoom {selected_zoom} (leg height {selected_leg_height:.1f}px <= target {target_height_px:.1f}px, will scale up)")
    return selected_zoom, selected_leg_height


def _fetch_tile(z: int, x: int, y: int) -> Optional[Image.Image]:
    """
    Fetch a tile from the file system.
    
    Args:
        z, x, y: Tile coordinates
        
    Returns:
        PIL Image or None if tile doesn't exist
    """
    tile_path = os.path.join(TILES_DIR, str(z), str(x), f"{y}.png")
    # logger.debug(f"Fetching tile z={z}, x={x}, y={y} from {tile_path}")
    
    if os.path.exists(tile_path):
        try:
            tile_img = Image.open(tile_path).convert('RGB')
            # logger.debug(f"Successfully loaded tile z={z}, x={x}, y={y}")
            return tile_img
        except Exception as e:
            logger.warning(f"Failed to load tile z={z}, x={x}, y={y}: {e}")
    
    # Fallback to blank tile
    if os.path.exists(BLANK_TILE_PATH):
        try:
            logger.debug(f"Using blank tile for z={z}, x={x}, y={y}")
            return Image.open(BLANK_TILE_PATH).convert('RGB')
        except Exception as e:
            logger.warning(f"Failed to load blank tile: {e}")
    
    # If all else fails, return a white tile
    logger.debug(f"Using white tile for z={z}, x={x}, y={y}")
    return Image.new('RGB', (TILE_SIZE, TILE_SIZE), color='white')


def _bbox_tm_to_tile_bounds(
    bbox_tm: Tuple[float, float, float, float],
    map_info: MapInfo,
    zoom: int
) -> Tuple[int, int, int, int]:
    """
    Convert a bounding box in Transverse Mercator coordinates to tile grid bounds.
    
    This function takes a bounding box specified in Transverse Mercator (TM) coordinates
    and converts it to the tile grid coordinate system. It performs the following steps:
    
    1. Converts TM coordinates to pixel coordinates relative to the tile grid origin
    2. Converts pixel coordinates to tile coordinates (integer division by tile size)
    3. Clamps tile coordinates to the valid tile grid bounds for the zoom level
    4. Ensures min/max ordering is correct (swaps if needed)
    
    The coordinate system uses a flipped Y axis (Y increases downward in pixel space,
    but increases northward in TM space), which is handled by subtracting from origin_y.
    
    Args:
        bbox_tm: Bounding box in Transverse Mercator coordinates 
                 as (min_x, min_y, max_x, max_y) in meters
                 where min_y is the southernmost point and max_y is northernmost
        map_info: MapInfo object
        zoom: Zoom level to use for resolution calculation
        
    Returns:
        Tuple of (min_tile_x, min_tile_y, max_tile_x, max_tile_y) representing
        the tile grid bounds. These are guaranteed to be:
        - Within valid tile grid bounds [0, nb_tiles_w-1] and [0, nb_tiles_h-1]
        - Ordered correctly (min <= max for both x and y)
        - Representing the tiles that cover the input bounding box
        
    Raises:
        ValueError: If the zoom level is not found in map_info
    """
    min_x_tm, min_y_tm, max_x_tm, max_y_tm = bbox_tm
    
    # Get the tile grid origin (NW corner) in Transverse Mercator
    origin_x, origin_y = _lat_lon_to_transverse_mercator(map_info.origin_lat, map_info.origin_lon, map_info.central_meridian)
    
    # Get resolution (meters per pixel) for this zoom level
    resolution = _get_resolution_for_zoom(map_info, zoom)
    
    # Convert TM bounding box to pixel coordinates relative to grid origin
    # Note: Y axis is flipped (TM Y increases north, pixel Y increases down)
    min_px_x = (min_x_tm - origin_x) / resolution
    min_px_y = (origin_y - min_y_tm) / resolution  # Flip Y: subtract from origin_y
    max_px_x = (max_x_tm - origin_x) / resolution
    max_px_y = (origin_y - max_y_tm) / resolution  # Flip Y
    
    # Convert pixel coordinates to tile coordinates (integer division)
    min_tile_x = int(min_px_x // TILE_SIZE)
    min_tile_y = int(min_px_y // TILE_SIZE)
    max_tile_x = int(max_px_x // TILE_SIZE)
    max_tile_y = int(max_px_y // TILE_SIZE)
    
    # Get zoom info to know the tile grid bounds
    this_zoom = None
    for z_info in map_info.zoom_info:
        if z_info.zoom == zoom:
            this_zoom = z_info
            break
    
    if this_zoom is None:
        raise ValueError(f"Zoom level {zoom} not found in map info")
    
    # Clamp tile coordinates to available tile grid bounds
    min_tile_x = max(0, min_tile_x)
    min_tile_y = max(0, min_tile_y)
    max_tile_x = min(this_zoom.nb_tiles_w - 1, max_tile_x)
    max_tile_y = min(this_zoom.nb_tiles_h - 1, max_tile_y)
    
    # Ensure max >= min (swap if needed)
    # This can happen due to coordinate system inversions or edge cases
    if max_tile_x < min_tile_x:
        min_tile_x, max_tile_x = max_tile_x, min_tile_x
    if max_tile_y < min_tile_y:
        min_tile_y, max_tile_y = max_tile_y, min_tile_y
    
    return (min_tile_x, min_tile_y, max_tile_x, max_tile_y)


def _assemble_tiles(
    map_info: MapInfo,
    zoom: int,
    bbox_tm: Tuple[float, float, float, float]
) -> Image.Image:
    """
    Assemble tiles covering the bounding box into a composite image.
    
    Args:
        map_info: MapInfo object
        zoom: Zoom level
        bbox_tm: Bounding box in Transverse Mercator (min_x, min_y, max_x, max_y)
        
    Returns:
        Composite PIL Image
    """
    min_x_tm, min_y_tm, max_x_tm, max_y_tm = bbox_tm
    logger.info(f"Assembling tiles for zoom={zoom}, bbox_tm=({min_x_tm:.2f}, {min_y_tm:.2f}, {max_x_tm:.2f}, {max_y_tm:.2f})")
    
    # Convert bounding box to tile grid bounds using utility function
    min_tile_x, min_tile_y, max_tile_x, max_tile_y = _bbox_tm_to_tile_bounds(bbox_tm, map_info, zoom)
    
    # Get zoom info for tile grid dimensions (needed for image size calculation)
    this_zoom = None
    for z_info in map_info.zoom_info:
        if z_info.zoom == zoom:
            this_zoom = z_info
            break
    
    if this_zoom is None:
        raise ValueError(f"Zoom level {zoom} not found")
    
    # Calculate image size
    num_tiles_x = max_tile_x - min_tile_x + 1
    num_tiles_y = max_tile_y - min_tile_y + 1
    
    # Safety check: ensure we have valid dimensions
    if num_tiles_x <= 0 or num_tiles_y <= 0:
        logger.error(f"Invalid tile range: x=[{min_tile_x}, {max_tile_x}], y=[{min_tile_y}, {max_tile_y}]")
        resolution = _get_resolution_for_zoom(map_info.zoom_info, zoom)
        logger.error(f"Bounding box TM: {bbox_tm}, zoom: {zoom}, resolution: {resolution}")
        raise ValueError(f"Invalid tile coordinates: cannot create image with {num_tiles_x}x{num_tiles_y} tiles")
    
    img_width = num_tiles_x * TILE_SIZE
    img_height = num_tiles_y * TILE_SIZE
    
    # Create composite image
    composite = Image.new('RGB', (img_width, img_height))
    logger.info(f"Creating composite image: {img_width}x{img_height} pixels, tiles: {num_tiles_x}x{num_tiles_y}")
    
    # Fetch and paste tiles
    tiles_fetched = 0
    for ty in range(min_tile_y, max_tile_y + 1):
        for tx in range(min_tile_x, max_tile_x + 1):
            tile_img = _fetch_tile(zoom, tx, ty)
            x_pos = (tx - min_tile_x) * TILE_SIZE
            y_pos = (ty - min_tile_y) * TILE_SIZE
            composite.paste(tile_img, (x_pos, y_pos))
            tiles_fetched += 1
    logger.info(f"Fetched and pasted {tiles_fetched} tiles, {composite.width}x{composite.height}")
    
    return composite


def _create_bbox_around_leg(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
    zoom: int,
    map_info: MapInfo,
    scale_factor: float = 1.0,
    margin_factor: float = 1.0
) -> Tuple[float, float, float, float]:
    """
    Create a bounding box around a leg with margins.
    
    The bounding box is created to ensure sufficient coverage after scaling and rotation.
    Since we'll scale the composite and then rotate it, we need a box that's large enough
    to cover the diagonal of the rotated/scaled image.
    
    Args:
        lat1, lon1: Starting point
        lat2, lon2: Ending point
        zoom: Zoom level
        map_info: MapInfo object
        scale_factor: Scale factor that will be applied to the composite
        margin_factor: Factor to add margins (1.2 = 20% margin)
        
    Returns:
        Bounding box in Transverse Mercator (min_x, min_y, max_x, max_y)
    """
    # Convert to Transverse Mercator
    x1, y1 = _lat_lon_to_transverse_mercator(lat1, lon1, map_info.central_meridian)
    x2, y2 = _lat_lon_to_transverse_mercator(lat2, lon2, map_info.central_meridian)
    
    # Get resolution to convert pixels to meters
    resolution = _get_resolution_for_zoom(map_info, zoom)
    
    # Calculate the final image dimensions after scaling
    # The final cropped image will be MAP_WIDTH x MAP_HEIGHT
    # But before rotation, we need to ensure we have enough coverage
    # The scaled composite will be smaller, but after rotation, we need diagonal coverage
    
    # Calculate the size of the scaled composite that will contain MAP_WIDTH x MAP_HEIGHT after rotation
    # After scaling by scale_factor, the composite dimensions are scaled
    # After rotation, a rectangle of size W x H needs a bounding box of diagonal = sqrt(W^2 + H^2)
    # But we also need to account for the fact that we're scaling BEFORE rotation
    
    # The target final image is MAP_WIDTH x MAP_HEIGHT (in pixels)
    # After rotation, we need diagonal coverage for the final image
    final_diagonal_px = math.sqrt(MAP_WIDTH**2 + MAP_HEIGHT**2)
    
    # Before scaling, we need more coverage since we scale down
    # If we scale by scale_factor, to get final_diagonal_px coverage after scaling,
    # we need: pre_scale_diagonal_px = final_diagonal_px / scale_factor
    pre_scale_diagonal_px = final_diagonal_px / scale_factor
    
    # Convert to meters using resolution
    pre_scale_diagonal_meters = pre_scale_diagonal_px * resolution
    
    # Convert diagonal to square side (worst case for rotation)
    # For a square with diagonal d: side = d / sqrt(2)
    # Add extra margin for rotation
    side_meters = (pre_scale_diagonal_meters / math.sqrt(2)) * margin_factor
    
    half_width = side_meters
    half_height = side_meters
    
    # Center of leg
    center_x = (x1 + x2) / 2
    center_y = (y1 + y2) / 2
    
    # Create a bounding box centered on the leg center
    # This ensures we have enough coverage regardless of leg orientation
    min_x = center_x - half_width
    max_x = center_x + half_width
    min_y = center_y - half_height
    max_y = center_y + half_height
    
    logger.debug(f"Bounding box: center=({center_x:.2f}, {center_y:.2f}), "
                 f"dimensions=({2*half_width:.2f}m x {2*half_height:.2f}m)")
    
    return (min_x, min_y, max_x, max_y)


def _rotate_image(image: Image.Image, angle_deg: float, center: Tuple[int, int]) -> Image.Image:
    """
    Rotate image around a center point.
    
    Args:
        image: PIL Image to rotate
        angle_deg: Rotation angle in degrees (positive = counterclockwise)
        center: Center point (x, y) in pixels
        
    Returns:
        Rotated PIL Image (with expand=True to prevent clipping)
    """
    # Rotate with expand=True to ensure no clipping
    # This creates a larger image that contains the rotated content
    rotated = image.rotate(angle_deg, center=center, expand=True, fillcolor='black')
    return rotated


def _tm_to_pixel_on_rotated_image(
    x_tm: float,
    y_tm: float,
    bbox_tm: Tuple[float, float, float, float],
    map_info: MapInfo,
    zoom: int,
    rotation_angle_deg: float,
    rotation_center_orig: Tuple[int, int],
    original_composite_size: Tuple[int, int],
    rotated_image_size: Tuple[int, int],
    scale_factor: float = 1.0
) -> Tuple[float, float]:
    """
    Convert Transverse Mercator coordinates (in meters) to pixel coordinates on a rotated image.
    
    This function handles the full transformation chain:
    1. TM coordinates → pixel coordinates in original composite
    2. Apply scaling if scale_factor != 1.0
    3. Apply rotation transformation around the rotation center
    4. Account for image expansion offset (when expand=True is used)
    
    Args:
        x_tm, y_tm: Transverse Mercator coordinates in meters
        bbox_tm: Bounding box in Transverse Mercator (min_x, min_y, max_x, max_y)
        map_info: MapInfo object
        zoom: Zoom level used for the composite
        rotation_angle_deg: Rotation angle in degrees (positive = counterclockwise)
        rotation_center_orig: Rotation center point (x, y) in original composite pixel coordinates
        original_composite_size: Size (width, height) of the original composite before rotation
        rotated_image_size: Size (width, height) of the rotated image after expansion
        scale_factor: Scale factor applied to the composite (default 1.0)
        
    Returns:
        Tuple of (x, y) pixel coordinates in the rotated image
    """
    # Step 1: Convert TM coordinates to pixel coordinates in the original composite
    grid_origin_x, grid_origin_y = _lat_lon_to_transverse_mercator(map_info.origin_lat, map_info.origin_lon, map_info.central_meridian)
    resolution = _get_resolution_for_zoom(map_info, zoom)
    # Account for scaling: effective resolution = resolution / scale_factor
    effective_resolution = resolution / scale_factor
    
    # Get tile bounds for the original composite
    min_tile_x, min_tile_y, _, _ = _bbox_tm_to_tile_bounds(bbox_tm, map_info, zoom)
    
    # Convert TM to pixel coordinates in the full tile grid
    # Use effective resolution which accounts for scaling
    px_x_full = (x_tm - grid_origin_x) / effective_resolution
    px_y_full = (grid_origin_y - y_tm) / effective_resolution  # Flip Y (TM Y increases north, pixel Y increases down)
    
    # Convert to composite-local pixel coordinates
    # Note: tile positions also need to account for scaling
    px_x_orig = px_x_full - (min_tile_x * TILE_SIZE * scale_factor)
    px_y_orig = px_y_full - (min_tile_y * TILE_SIZE * scale_factor)
    
    # Step 2: Apply rotation transformation
    # PIL rotates the image counterclockwise by rotation_angle_deg.
    # To find where a point from the original image is in the rotated image,
    # we rotate the point counterclockwise by the same angle.
    angle_rad = -math.radians(rotation_angle_deg)
    
    # Get rotation center (should be in the scaled composite coordinate system)
    cx, cy = rotation_center_orig
    
    # Translate point relative to rotation center
    rel_x = px_x_orig - cx
    rel_y = px_y_orig - cy
    
    # Apply rotation matrix (counterclockwise rotation)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    rotated_rel_x = rel_x * cos_a - rel_y * sin_a
    rotated_rel_y = rel_x * sin_a + rel_y * cos_a
    
    # Translate back and account for image expansion
    # When PIL rotates with center=(cx, cy) and expand=True, PIL:
    # 1. Calculates the bounding box needed for the rotated image
    # 2. Creates a new image of that size
    # 3. Places the rotated center point at the center of the new image
    # So the center (cx, cy) maps to (new_w/2, new_h/2)
    new_w, new_h = rotated_image_size
    
    # PIL places the rotated center at the center of the expanded image
    new_cx = new_w / 2
    new_cy = new_h / 2
    
    # Final coordinates in rotated image
    px_x_rot = rotated_rel_x + new_cx
    px_y_rot = rotated_rel_y + new_cy
    
    logger.debug(f"TM to rotated pixel: TM=({x_tm:.1f}, {y_tm:.1f}) -> "
                 f"orig_px=({px_x_orig:.1f}, {px_y_orig:.1f}), "
                 f"rel_to_center=({rel_x:.1f}, {rel_y:.1f}), "
                 f"rotated_rel=({rotated_rel_x:.1f}, {rotated_rel_y:.1f}), "
                 f"final=({px_x_rot:.1f}, {px_y_rot:.1f})")
    
    return px_x_rot, px_y_rot

def generate_leg_map(
    flight_plan: FlightPlan,
    flight_plan_data: FlightPlanData,
    leg_index: int
) -> bytes:
    """
    Generate a map image for a single leg of the flight plan.
    
    Args:
        flight_plan: The flight plan
        flight_plan_data: The flight plan data
        leg_index: Index of the leg to generate the map for
        
    Returns:
        PNG image data as bytes (768x1024)
    """
    start_time = time.time()

    map_info = _get_map_info()
    
    leg_data = flight_plan_data.legData[leg_index]
    origin = leg_data.origin
    destination = leg_data.destination
    straigthening_point = leg_data.straigthening_point

    logger.info(f"=== Starting leg map generation ===")
    logger.info(f"Leg: {leg_index}")

    # Calculate leg distance
    leg_distance = _calculate_distance_meters(
        origin.lat, origin.lon,
        destination.lat, destination.lon
    )
    logger.info(f"Leg distance: {leg_distance:.2f} meters ({leg_distance/1852:.2f} NM)")
    
    # Select zoom level (just above 70% height)
    zoom, leg_height_px = _select_zoom_level(map_info, leg_distance)
    logger.info(f"Selected zoom level: {zoom}, leg height at this zoom: {leg_height_px:.1f} px")
    
    # Calculate scale factor to make leg exactly 70% of height
    target_height_px = MAP_HEIGHT * LEG_HEIGHT_TARGET  # ~717 pixels
    scale_factor = target_height_px / leg_height_px
    logger.info(f"Scale factor: {scale_factor:.4f} (to achieve {target_height_px:.1f} px leg height)")
    
    # Create bounding box around leg (accounting for scaling)
    bbox_tm = _create_bbox_around_leg(
        origin.lat, origin.lon,
        destination.lat, destination.lon,
        zoom, map_info,
        scale_factor
    )
    logger.info(f"Bounding box created: {bbox_tm}")
    
    # Assemble tiles
    composite = _assemble_tiles(map_info, zoom, bbox_tm)
    
    # Scale the composite before rotation to make leg exactly 70% of height
    if scale_factor != 1.0:
        new_width = int(composite.width * scale_factor)
        new_height = int(composite.height * scale_factor)
        logger.info(f"Scaling composite from {composite.width}x{composite.height} to {new_width}x{new_height}")
        composite = composite.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Calculate the angle of the leg line in pixel/image coordinates
    # This is the straight part of the leg, excluding the turn.
    # We need to use the projected coordinates (Transverse Mercator) converted to pixels
    origin_x_tm, origin_y_tm = _lat_lon_to_transverse_mercator(straigthening_point.lat, straigthening_point.lon, map_info.central_meridian)
    dest_x_tm, dest_y_tm = _lat_lon_to_transverse_mercator(destination.lat, destination.lon, map_info.central_meridian)
    
    # Convert to pixel coordinates in the scaled composite
    grid_origin_x, grid_origin_y = _lat_lon_to_transverse_mercator(map_info.origin_lat, map_info.origin_lon, map_info.central_meridian)
    resolution = _get_resolution_for_zoom(map_info, zoom)
    # Account for scaling: effective resolution in scaled composite
    effective_resolution = resolution / scale_factor
    
    # Get tile bounds for the composite
    min_tile_x, min_tile_y, _, _ = _bbox_tm_to_tile_bounds(bbox_tm, map_info, zoom)
    
    # Convert TM to pixel coordinates using effective resolution (accounts for scaling)
    origin_px_x = (origin_x_tm - grid_origin_x) / effective_resolution
    origin_px_y = (grid_origin_y - origin_y_tm) / effective_resolution  # Flip Y
    dest_px_x = (dest_x_tm - grid_origin_x) / effective_resolution
    dest_px_y = (grid_origin_y - dest_y_tm) / effective_resolution  # Flip Y
    
    # Convert to composite-local pixel coordinates (tile positions also scaled)
    origin_x_px = origin_px_x - (min_tile_x * TILE_SIZE * scale_factor)
    origin_y_px = origin_px_y - (min_tile_y * TILE_SIZE * scale_factor)
    dest_x_px = dest_px_x - (min_tile_x * TILE_SIZE * scale_factor)
    dest_y_px = dest_px_y - (min_tile_y * TILE_SIZE * scale_factor)
    
    # Calculate the angle of the leg line in pixel coordinates
    # In PIL coordinates: (0,0) is top-left, x increases right, y increases down
    # atan2(y, x) gives angle where 0° = right, 90° = down, -90° = up, 180° = left
    dx = dest_x_px - origin_x_px
    dy = dest_y_px - origin_y_px
    leg_angle_rad = math.atan2(dy, dx)
    leg_angle_deg = 90 + math.degrees(leg_angle_rad)
    if leg_angle_deg < 0:
        leg_angle_deg = 360 + leg_angle_deg
    logger.info(f"Leg angle in pixel coordinates: {leg_angle_deg:.2f}° (dx={dx:.1f}, dy={dy:.1f})")
    
    # Rotate so leg is vertical (pointing north/up)
    # In PIL coordinates: -90° = up (north), 0° = right (east), 90° = down (south), 180° = left (west)
    # To make the leg point upward (-90°), we need to rotate by: -90° - leg_angle_deg
    rotation_angle = leg_angle_deg
    logger.info(f"Rotation angle: {rotation_angle:.2f}° (to make leg point up at -90°)")
    
    # Get center of scaled composite image (before rotation)
    center_x = composite.width // 2
    center_y = composite.height // 2
    logger.info(f"Scaled composite image size: {composite.width}x{composite.height}, center: ({center_x}, {center_y})")
    
    # Store scaled composite size before rotation
    scaled_composite_size = (composite.width, composite.height)
    
    # Rotate image (with expand=True to prevent clipping)
    logger.info(f"Rotating image by {rotation_angle:.2f}° around center ({center_x}, {center_y})")
    rotated = _rotate_image(composite, rotation_angle, (center_x, center_y))
    logger.info(f"Rotated image size: {rotated.width}x{rotated.height}")
    
    # Create a converter function that converts lat/lon to pixel coordinates on the rotated image
    def coord_to_pixel(lat: float, lon: float) -> Tuple[float, float]:
        """Convert geographic coordinates to pixel coordinates on the rotated image."""
        x_tm, y_tm = _lat_lon_to_transverse_mercator(lat, lon, map_info.central_meridian)
        return _tm_to_pixel_on_rotated_image(
            x_tm, y_tm,
            bbox_tm, map_info, zoom,
            rotation_angle, (center_x, center_y),
            scaled_composite_size, rotated.size,
            scale_factor
        )
    
    # Draw the leg onto the rotated image
    annotate_map(
        rotated,
        flight_plan,
        flight_plan_data,
        leg_index,
        coord_to_pixel
    )
    
    # Find the leg center in the rotated image for cropping
    # Calculate leg center in Transverse Mercator coordinates (reuse values calculated earlier)
    leg_center_x_tm = (origin_x_tm + dest_x_tm) / 2
    leg_center_y_tm = (origin_y_tm + dest_y_tm) / 2
    
    # Convert leg center to pixel coordinates on the rotated image
    leg_center_x_px, leg_center_y_px = _tm_to_pixel_on_rotated_image(
        leg_center_x_tm, leg_center_y_tm,
        bbox_tm, map_info, zoom,
        rotation_angle, (center_x, center_y),
        scaled_composite_size, rotated.size,
        scale_factor
    )
    logger.info(f"Leg center in rotated image: ({leg_center_x_px:.1f}, {leg_center_y_px:.1f})")
    
    # Crop the rotated image to MAP_WIDTH x MAP_HEIGHT, centered on the leg center
    half_width = MAP_WIDTH // 2
    half_height = MAP_HEIGHT // 2
    
    # Calculate crop box coordinates
    left = int(leg_center_x_px - half_width)
    top = int(leg_center_y_px - half_height)
    right = int(leg_center_x_px + half_width)
    bottom = int(leg_center_y_px + half_height)
    
    # Ensure crop box is within image bounds
    # If crop box extends outside, shift it inward while keeping the leg centered
    if left < 0:
        shift = -left
        left = 0
        right += shift
    if top < 0:
        shift = -top
        top = 0
        bottom += shift
    if right > rotated.width:
        shift = right - rotated.width
        right = rotated.width
        left = max(0, left - shift)
    if bottom > rotated.height:
        shift = bottom - rotated.height
        bottom = rotated.height
        top = max(0, top - shift)
    
    logger.info(f"Cropping rotated image: box=({left}, {top}, {right}, {bottom}), "
                f"rotated size={rotated.width}x{rotated.height}")
    
    # Crop the image
    cropped = rotated.crop((left, top, right, bottom))
    
    # If the cropped image is smaller than target size (e.g., near edges), pad it
    if cropped.width < MAP_WIDTH or cropped.height < MAP_HEIGHT:
        logger.warning(f"Cropped image is smaller than target: {cropped.width}x{cropped.height}, padding to {MAP_WIDTH}x{MAP_HEIGHT}")
        final_image = Image.new('RGB', (MAP_WIDTH, MAP_HEIGHT), color='black')
        # Center the cropped image in the final image
        paste_x = (MAP_WIDTH - cropped.width) // 2
        paste_y = (MAP_HEIGHT - cropped.height) // 2
        final_image.paste(cropped, (paste_x, paste_y))
        cropped = final_image
    else:
        # Ensure exact size by resizing if needed (shouldn't happen normally, but handle edge cases)
        if cropped.width != MAP_WIDTH or cropped.height != MAP_HEIGHT:
            logger.info(f"Resizing cropped image from {cropped.width}x{cropped.height} to {MAP_WIDTH}x{MAP_HEIGHT}")
            cropped = cropped.resize((MAP_WIDTH, MAP_HEIGHT), Image.Resampling.LANCZOS)
    
    # Save cropped image as PNG
    img_byte_arr = io.BytesIO()
    cropped.save(img_byte_arr, format='PNG')
    img_bytes = img_byte_arr.getvalue()
    logger.info(f"Generated cropped PNG: {len(img_bytes)} bytes")
    time_taken = time.time() - start_time
    logger.info(f"=== Leg map generation completed in {time_taken:.2f} seconds ===")
    return img_bytes
