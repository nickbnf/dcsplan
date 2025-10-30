"""
Kneeboard generation module for flight plan visualization.

This module handles validation of flight plan data and generation of
kneeboard PNG images.
"""

from pydantic import BaseModel, Field
from typing import List, Tuple, Optional, Dict
from PIL import Image, ImageDraw, ImageFont
import math
import io
import os
import json
import logging
from pyproj import Transformer

# Set up logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


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


def generate_kneeboard_png(flight_plan: FlightPlan) -> bytes:
    """
    Generate a 768x1024 PNG image with the map for the first leg of the flight plan.
    
    Args:
        flight_plan: The flight plan
        
    Returns:
        PNG image data as bytes (768x1024)
        
    Raises:
        ValueError: If flight plan has fewer than 2 waypoints
    """
    logger.info("=== Generating kneeboard PNG (first leg map) ===")
    
    if len(flight_plan.points) < 2:
        raise ValueError("Flight plan must have at least 2 waypoints to generate a leg map")
    
    # Generate map for the first leg
    origin = flight_plan.points[0]
    destination = flight_plan.points[1]
    logger.info(f"Generating kneeboard for first leg: ({origin.lat}, {origin.lon}) -> ({destination.lat}, {destination.lon})")
    
    leg_map = generate_leg_map(origin, destination)
    logger.info(f"Kneeboard PNG generated: {len(leg_map)} bytes")
    
    return leg_map


# Constants for leg map generation
TILES_DIR = os.path.join(os.path.dirname(__file__), "static", "tiles")
BLANK_TILE_PATH = os.path.join(os.path.dirname(__file__), "tiles", "blank.png")
TILES_INFO_PATH = os.path.join(TILES_DIR, "tiles_info.json")
MAP_WIDTH = 768
MAP_HEIGHT = 1024
LEG_HEIGHT_TARGET = 0.70  # Leg should occupy 70% of height
TILE_SIZE = 256  # Standard tile size in pixels
CENTRAL_MERIDIAN = 39  # Central meridian for Transverse Mercator projection
# Origin corner (NW) for tile grid
ORIGIN_LAT = 37.50575
ORIGIN_LON = 29.9266
# Distance reference for resolution calculation
REF_CORNER_NE_LAT = 37.8254
REF_CORNER_NE_LON = 41.695


def _get_tile_info() -> Dict:
    """Load and return tile info from JSON file."""
    logger.info(f"Loading tile info from {TILES_INFO_PATH}")
    if not os.path.exists(TILES_INFO_PATH):
        logger.error(f"Tile info file not found at {TILES_INFO_PATH}")
        raise FileNotFoundError(f"Tile info file not found at {TILES_INFO_PATH}")
    with open(TILES_INFO_PATH, 'r') as f:
        tile_info = json.load(f)
    logger.info(f"Tile info loaded: {len(tile_info.get('zoom_info', []))} zoom levels")
    return tile_info


def _lat_lon_to_transverse_mercator(lat: float, lon: float) -> Tuple[float, float]:
    """
    Convert lat/lon to Transverse Mercator coordinates.
    
    Args:
        lat: Latitude in degrees
        lon: Longitude in degrees
        
    Returns:
        Tuple of (x, y) in meters
    """
    # Transverse Mercator projection with central meridian at 39°
    transformer = Transformer.from_crs(
        "EPSG:4326",  # WGS84
        f"+proj=tmerc +lat_0=0 +lon_0={CENTRAL_MERIDIAN} +k=1.0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
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


def _calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate bearing from point 1 to point 2 in degrees.
    
    Args:
        lat1, lon1: Starting point
        lat2, lon2: Destination point
        
    Returns:
        Bearing in degrees (0-360)
    """
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    d_lon = lon2_rad - lon1_rad
    
    y = math.sin(d_lon) * math.cos(lat2_rad)
    x = math.cos(lat1_rad) * math.sin(lat2_rad) - \
        math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(d_lon)
    
    bearing = math.atan2(y, x)
    bearing_deg = math.degrees(bearing)
    
    # Normalize to 0-360
    if bearing_deg < 0:
        bearing_deg += 360
    
    return bearing_deg


def _get_resolution_for_zoom(tile_info: Dict, zoom: int) -> float:
    """
    Calculate resolution (meters per pixel) for a given zoom level.
    
    Args:
        tile_info: Tile info dictionary
        zoom: Zoom level
        
    Returns:
        Resolution in meters per pixel
    """
    # Calculate reference distance in Transverse Mercator
    origin_x, origin_y = _lat_lon_to_transverse_mercator(ORIGIN_LAT, ORIGIN_LON)
    ref_x, ref_y = _lat_lon_to_transverse_mercator(REF_CORNER_NE_LAT, REF_CORNER_NE_LON)
    x_distance = math.sqrt((ref_x - origin_x)**2 + (ref_y - origin_y)**2)
    
    # Find zoom info for this zoom level
    zoom_info = None
    for z_info in tile_info.get('zoom_info', []):
        if z_info.get('zoom') == zoom:
            zoom_info = z_info
            break
    
    if zoom_info is None:
        raise ValueError(f"Zoom level {zoom} not found in tile info")
    
    # Resolution = distance / pixels
    resolution = x_distance / zoom_info['width_px']
    return resolution


def _select_zoom_level(tile_info: Dict, leg_distance_meters: float) -> int:
    """
    Select the best zoom level so the leg occupies ~70% of map height.
    
    Args:
        tile_info: Tile info dictionary
        leg_distance_meters: Distance of the leg in meters
        
    Returns:
        Selected zoom level
    """
    target_height_px = MAP_HEIGHT * LEG_HEIGHT_TARGET  # ~717 pixels
    logger.debug(f"Target leg height: {target_height_px:.1f} pixels")
    
    # Try each zoom level from highest to lowest
    zoom_levels = sorted([z_info['zoom'] for z_info in tile_info.get('zoom_info', [])], reverse=True)
    logger.debug(f"Available zoom levels: {zoom_levels}")
    
    for zoom in zoom_levels:
        resolution = _get_resolution_for_zoom(tile_info, zoom)
        leg_height_px = leg_distance_meters / resolution
        logger.debug(f"Zoom {zoom}: resolution={resolution:.2f} m/px, leg_height={leg_height_px:.1f} px")
        
        if leg_height_px <= target_height_px:
            logger.debug(f"Selected zoom {zoom} (leg height {leg_height_px:.1f}px <= target {target_height_px:.1f}px)")
            return zoom
    
    # If no zoom level fits, return the lowest one
    selected = min(zoom_levels)
    logger.debug(f"No zoom level fits perfectly, using lowest zoom {selected}")
    return selected


def _lat_lon_to_tile_coords(lat: float, lon: float, zoom: int, tile_info: Dict) -> Tuple[int, int]:
    """
    Convert lat/lon to tile coordinates (x, y) for a given zoom level.
    
    Args:
        lat, lon: Coordinates in degrees
        zoom: Zoom level
        tile_info: Tile info dictionary
        
    Returns:
        Tuple of (tile_x, tile_y)
    """
    # Convert to Transverse Mercator
    x_tm, y_tm = _lat_lon_to_transverse_mercator(lat, lon)
    
    # Get origin in Transverse Mercator
    origin_x, origin_y = _lat_lon_to_transverse_mercator(ORIGIN_LAT, ORIGIN_LON)
    
    # Calculate offset from origin
    offset_x = x_tm - origin_x
    offset_y = origin_y - y_tm  # Flip Y axis (origin is NW, Y increases downward)
    
    # Get resolution for this zoom level
    resolution = _get_resolution_for_zoom(tile_info, zoom)
    
    # Convert to pixel coordinates
    pixel_x = offset_x / resolution
    pixel_y = offset_y / resolution
    
    # Convert to tile coordinates
    tile_x = int(pixel_x // TILE_SIZE)
    tile_y = int(pixel_y // TILE_SIZE)
    
    return tile_x, tile_y


def _fetch_tile(z: int, x: int, y: int) -> Optional[Image.Image]:
    """
    Fetch a tile from the file system.
    
    Args:
        z, x, y: Tile coordinates
        
    Returns:
        PIL Image or None if tile doesn't exist
    """
    tile_path = os.path.join(TILES_DIR, str(z), str(x), f"{y}.png")
    logger.debug(f"Fetching tile z={z}, x={x}, y={y} from {tile_path}")
    
    if os.path.exists(tile_path):
        try:
            tile_img = Image.open(tile_path).convert('RGB')
            logger.debug(f"Successfully loaded tile z={z}, x={x}, y={y}")
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
    tile_info: Dict,
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
        tile_info: Tile info dictionary containing zoom level information
        zoom: Zoom level to use for resolution calculation
        
    Returns:
        Tuple of (min_tile_x, min_tile_y, max_tile_x, max_tile_y) representing
        the tile grid bounds. These are guaranteed to be:
        - Within valid tile grid bounds [0, nb_tiles_w-1] and [0, nb_tiles_h-1]
        - Ordered correctly (min <= max for both x and y)
        - Representing the tiles that cover the input bounding box
        
    Raises:
        ValueError: If the zoom level is not found in tile_info
    """
    min_x_tm, min_y_tm, max_x_tm, max_y_tm = bbox_tm
    
    # Get the tile grid origin (NW corner) in Transverse Mercator
    origin_x, origin_y = _lat_lon_to_transverse_mercator(ORIGIN_LAT, ORIGIN_LON)
    
    # Get resolution (meters per pixel) for this zoom level
    resolution = _get_resolution_for_zoom(tile_info, zoom)
    
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
    zoom_info = None
    for z_info in tile_info.get('zoom_info', []):
        if z_info.get('zoom') == zoom:
            zoom_info = z_info
            break
    
    if zoom_info is None:
        raise ValueError(f"Zoom level {zoom} not found in tile info")
    
    # Clamp tile coordinates to available tile grid bounds
    min_tile_x = max(0, min_tile_x)
    min_tile_y = max(0, min_tile_y)
    max_tile_x = min(zoom_info['nb_tiles_w'] - 1, max_tile_x)
    max_tile_y = min(zoom_info['nb_tiles_h'] - 1, max_tile_y)
    
    # Ensure max >= min (swap if needed)
    # This can happen due to coordinate system inversions or edge cases
    if max_tile_x < min_tile_x:
        min_tile_x, max_tile_x = max_tile_x, min_tile_x
    if max_tile_y < min_tile_y:
        min_tile_y, max_tile_y = max_tile_y, min_tile_y
    
    return (min_tile_x, min_tile_y, max_tile_x, max_tile_y)


def _assemble_tiles(
    tile_info: Dict,
    zoom: int,
    bbox_tm: Tuple[float, float, float, float]
) -> Image.Image:
    """
    Assemble tiles covering the bounding box into a composite image.
    
    Args:
        tile_info: Tile info dictionary
        zoom: Zoom level
        bbox_tm: Bounding box in Transverse Mercator (min_x, min_y, max_x, max_y)
        
    Returns:
        Composite PIL Image
    """
    min_x_tm, min_y_tm, max_x_tm, max_y_tm = bbox_tm
    logger.info(f"Assembling tiles for zoom={zoom}, bbox_tm=({min_x_tm:.2f}, {min_y_tm:.2f}, {max_x_tm:.2f}, {max_y_tm:.2f})")
    
    # Convert bounding box to tile grid bounds using utility function
    min_tile_x, min_tile_y, max_tile_x, max_tile_y = _bbox_tm_to_tile_bounds(bbox_tm, tile_info, zoom)
    
    # Get zoom info for tile grid dimensions (needed for image size calculation)
    zoom_info = None
    for z_info in tile_info.get('zoom_info', []):
        if z_info.get('zoom') == zoom:
            zoom_info = z_info
            break
    
    if zoom_info is None:
        raise ValueError(f"Zoom level {zoom} not found")
    
    # Calculate image size
    num_tiles_x = max_tile_x - min_tile_x + 1
    num_tiles_y = max_tile_y - min_tile_y + 1
    
    # Safety check: ensure we have valid dimensions
    if num_tiles_x <= 0 or num_tiles_y <= 0:
        logger.error(f"Invalid tile range: x=[{min_tile_x}, {max_tile_x}], y=[{min_tile_y}, {max_tile_y}]")
        resolution = _get_resolution_for_zoom(tile_info, zoom)
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
    logger.info(f"Fetched and pasted {tiles_fetched} tiles")
    
    # Don't crop before rotation - use the full composite
    # The bounding box already ensures we have enough tiles, and cropping here
    # can cause issues when the leg is nearly horizontal due to projection distortions.
    # We'll crop after rotation when we have the final orientation.
    logger.info(f"Using full composite (no pre-rotation crop): {composite.width}x{composite.height}")
    
    return composite


def _create_bbox_around_leg(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
    zoom: int,
    tile_info: Dict,
    margin_factor: float = 1.2
) -> Tuple[float, float, float, float]:
    """
    Create a bounding box around a leg with margins.
    
    The bounding box is created to ensure sufficient coverage after rotation.
    Since we'll rotate the leg to vertical, we need a box that's large enough
    to cover both dimensions after rotation (accounting for diagonal).
    
    Args:
        lat1, lon1: Starting point
        lat2, lon2: Ending point
        zoom: Zoom level
        tile_info: Tile info dictionary
        margin_factor: Factor to add margins (1.5 = 50% margin)
        
    Returns:
        Bounding box in Transverse Mercator (min_x, min_y, max_x, max_y)
    """
    # Convert to Transverse Mercator
    x1, y1 = _lat_lon_to_transverse_mercator(lat1, lon1)
    x2, y2 = _lat_lon_to_transverse_mercator(lat2, lon2)
    
    # Calculate leg vector
    leg_dx = x2 - x1
    leg_dy = y2 - y1
    leg_length = math.sqrt(leg_dx**2 + leg_dy**2)
    
    # Get resolution to convert pixels to meters
    resolution = _get_resolution_for_zoom(tile_info, zoom)
    
    # Calculate required dimensions in meters based on map size at this zoom.
    # Use target width/height directly rather than diagonal-based overprovisioning.
    target_width_meters = MAP_WIDTH * resolution
    target_height_meters = MAP_HEIGHT * resolution

    # Add margins independently on each axis
    half_width = (target_width_meters / 2) * margin_factor
    half_height = (target_height_meters / 2) * margin_factor
    
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
    tile_info: Dict,
    zoom: int,
    rotation_angle_deg: float,
    rotation_center_orig: Tuple[int, int],
    original_composite_size: Tuple[int, int],
    rotated_image_size: Tuple[int, int]
) -> Tuple[float, float]:
    """
    Convert Transverse Mercator coordinates (in meters) to pixel coordinates on a rotated image.
    
    This function handles the full transformation chain:
    1. TM coordinates → pixel coordinates in original composite
    2. Apply rotation transformation around the rotation center
    3. Account for image expansion offset (when expand=True is used)
    
    Args:
        x_tm, y_tm: Transverse Mercator coordinates in meters
        bbox_tm: Bounding box in Transverse Mercator (min_x, min_y, max_x, max_y)
        tile_info: Tile info dictionary
        zoom: Zoom level used for the composite
        rotation_angle_deg: Rotation angle in degrees (positive = counterclockwise)
        rotation_center_orig: Rotation center point (x, y) in original composite pixel coordinates
        original_composite_size: Size (width, height) of the original composite before rotation
        rotated_image_size: Size (width, height) of the rotated image after expansion
        
    Returns:
        Tuple of (x, y) pixel coordinates in the rotated image
    """
    # Step 1: Convert TM coordinates to pixel coordinates in the original composite
    grid_origin_x, grid_origin_y = _lat_lon_to_transverse_mercator(ORIGIN_LAT, ORIGIN_LON)
    resolution = _get_resolution_for_zoom(tile_info, zoom)
    
    # Get tile bounds for the original composite
    min_tile_x, min_tile_y, max_tile_x, max_tile_y = _bbox_tm_to_tile_bounds(bbox_tm, tile_info, zoom)
    
    # Convert TM to pixel coordinates in the full tile grid
    px_x_full = (x_tm - grid_origin_x) / resolution
    px_y_full = (grid_origin_y - y_tm) / resolution  # Flip Y (TM Y increases north, pixel Y increases down)
    
    # Convert to composite-local pixel coordinates
    px_x_orig = px_x_full - (min_tile_x * TILE_SIZE)
    px_y_orig = px_y_full - (min_tile_y * TILE_SIZE)
    
    # Step 2: Apply rotation transformation
    # PIL rotates the image counterclockwise by rotation_angle_deg.
    # To find where a point from the original image is in the rotated image,
    # we rotate the point counterclockwise by the same angle.
    angle_rad = math.radians(rotation_angle_deg)
    
    # Get rotation center in original composite
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
    
    # Calculate where the center of the original image ends up
    # The center point (cx, cy) in the original image maps to the center
    # of the rotated image after rotation
    orig_w, orig_h = original_composite_size
    
    # PIL places the rotated center at the center of the expanded image
    new_cx = new_w / 2
    new_cy = new_h / 2
    
    # However, we need to account for the fact that the center might not be
    # exactly at (orig_w/2, orig_h/2) if we used a custom center point.
    # Since we're using the composite center, this should be fine.
    
    # Final coordinates in rotated image
    px_x_rot = rotated_rel_x + new_cx
    px_y_rot = rotated_rel_y + new_cy
    
    logger.debug(f"TM to rotated pixel: TM=({x_tm:.1f}, {y_tm:.1f}) -> "
                 f"orig_px=({px_x_orig:.1f}, {px_y_orig:.1f}), "
                 f"rel_to_center=({rel_x:.1f}, {rel_y:.1f}), "
                 f"rotated_rel=({rotated_rel_x:.1f}, {rotated_rel_y:.1f}), "
                 f"final=({px_x_rot:.1f}, {px_y_rot:.1f})")
    
    return px_x_rot, px_y_rot


def _draw_leg_on_rotated_image(
    rotated_image: Image.Image,
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    bbox_tm: Tuple[float, float, float, float],
    tile_info: Dict,
    zoom: int,
    rotation_angle_deg: float,
    rotation_center_orig: Tuple[int, int],
    original_composite_size: Tuple[int, int]
) -> None:
    """
    Draw a leg line on a rotated image.
    
    This function converts lat/lon coordinates to pixel coordinates on the rotated image
    and draws a thick, high-contrast line with markers at the endpoints.
    
    Args:
        rotated_image: The rotated PIL Image to draw on (will be modified)
        origin_lat, origin_lon: Starting point coordinates
        dest_lat, dest_lon: Destination point coordinates
        bbox_tm: Bounding box in Transverse Mercator (min_x, min_y, max_x, max_y)
        tile_info: Tile info dictionary
        zoom: Zoom level used for the composite
        rotation_angle_deg: Rotation angle in degrees that was applied
        rotation_center_orig: Rotation center point (x, y) in original composite pixel coordinates
        original_composite_size: Size (width, height) of the original composite before rotation
    """
    try:
        draw = ImageDraw.Draw(rotated_image)
        
        # Convert origin/destination lat/lon to TM
        origin_x_tm, origin_y_tm = _lat_lon_to_transverse_mercator(origin_lat, origin_lon)
        dest_x_tm, dest_y_tm = _lat_lon_to_transverse_mercator(dest_lat, dest_lon)
        
        # Get rotated image size
        rotated_size = rotated_image.size
        
        # Convert TM coordinates to pixel coordinates on rotated image
        origin_x_px, origin_y_px = _tm_to_pixel_on_rotated_image(
            origin_x_tm, origin_y_tm,
            bbox_tm, tile_info, zoom,
            rotation_angle_deg, rotation_center_orig,
            original_composite_size, rotated_size
        )
        
        dest_x_px, dest_y_px = _tm_to_pixel_on_rotated_image(
            dest_x_tm, dest_y_tm,
            bbox_tm, tile_info, zoom,
            rotation_angle_deg, rotation_center_orig,
            original_composite_size, rotated_size
        )
        
        logger.debug(f"Leg endpoints on rotated image: O=({origin_x_px:.1f}, {origin_y_px:.1f}), D=({dest_x_px:.1f}, {dest_y_px:.1f})")
        
        # Clamp to image bounds so line is visible even if slightly outside
        def _clamp(val, lo, hi):
            return max(lo, min(val, hi))
        ox = _clamp(origin_x_px, 0, rotated_image.width - 1)
        oy = _clamp(origin_y_px, 0, rotated_image.height - 1)
        dx = _clamp(dest_x_px, 0, rotated_image.width - 1)
        dy = _clamp(dest_y_px, 0, rotated_image.height - 1)
        
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
        
        logger.debug(f"Drew leg overlay on rotated image: O=({origin_x_px:.1f},{origin_y_px:.1f}) D=({dest_x_px:.1f},{dest_y_px:.1f}) | clamped O=({ox:.1f},{oy:.1f}) D=({dx:.1f},{dy:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw leg overlay on rotated image: {e}")


def _draw_leg_on_composite(
    composite: Image.Image,
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    bbox_tm: Tuple[float, float, float, float],
    tile_info: Dict,
    zoom: int
) -> None:
    """
    Draw a leg line on a composite image.
    
    This function converts lat/lon coordinates to composite pixel coordinates
    and draws a thick, high-contrast line with markers at the endpoints.
    
    Args:
        composite: The composite PIL Image to draw on (will be modified)
        origin_lat, origin_lon: Starting point coordinates
        dest_lat, dest_lon: Destination point coordinates
        bbox_tm: Bounding box in Transverse Mercator (min_x, min_y, max_x, max_y)
        tile_info: Tile info dictionary
        zoom: Zoom level used for the composite
    """
    try:
        draw = ImageDraw.Draw(composite)
        
        # Convert origin/destination lat/lon to TM
        origin_x_tm, origin_y_tm = _lat_lon_to_transverse_mercator(origin_lat, origin_lon)
        dest_x_tm, dest_y_tm = _lat_lon_to_transverse_mercator(dest_lat, dest_lon)
        
        # Grid origin and resolution
        grid_origin_x, grid_origin_y = _lat_lon_to_transverse_mercator(ORIGIN_LAT, ORIGIN_LON)
        resolution = _get_resolution_for_zoom(tile_info, zoom)
        
        # Convert bounding box to tile grid bounds using utility function
        min_tile_x, min_tile_y, max_tile_x, max_tile_y = _bbox_tm_to_tile_bounds(bbox_tm, tile_info, zoom)
        logger.debug(f"Tile bounds: x=[{min_tile_x}, {max_tile_x}], y=[{min_tile_y}, {max_tile_y}]")
        
        # Get grid origin for converting points to pixel coordinates
        origin_x, origin_y = grid_origin_x, grid_origin_y
        
        origin_px_x = (origin_x_tm - origin_x) / resolution
        origin_px_y = (origin_y - origin_y_tm) / resolution  # Flip Y
        dest_px_x = (dest_x_tm - origin_x) / resolution
        dest_px_y = (origin_y - dest_y_tm) / resolution  # Flip Y
        
        # Debug: log intermediate values
        logger.debug(f"Origin px: ({origin_px_x:.1f}, {origin_px_y:.1f}), Dest px: ({dest_px_x:.1f}, {dest_px_y:.1f})")
        logger.debug(f"Min tile pixel origin: ({min_tile_x * TILE_SIZE}, {min_tile_y * TILE_SIZE})")
        
        # Convert to composite-local pixel coordinates (subtract the composite's tile origin)
        origin_x_px = origin_px_x - (min_tile_x * TILE_SIZE)
        origin_y_px = origin_px_y - (min_tile_y * TILE_SIZE)
        dest_x_px = dest_px_x - (min_tile_x * TILE_SIZE)
        dest_y_px = dest_px_y - (min_tile_y * TILE_SIZE)
        
        logger.debug(f"After subtracting tile origin: O=({origin_x_px:.1f}, {origin_y_px:.1f}), D=({dest_x_px:.1f}, {dest_y_px:.1f})")
        
        # Clamp to image bounds so line is visible even if slightly outside
        def _clamp(val, lo, hi):
            return max(lo, min(val, hi))
        ox = _clamp(origin_x_px, 0, composite.width - 1)
        oy = _clamp(origin_y_px, 0, composite.height - 1)
        dx = _clamp(dest_x_px, 0, composite.width - 1)
        dy = _clamp(dest_y_px, 0, composite.height - 1)
        
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
        
        logger.debug(f"Drew leg overlay on composite: O=({origin_x_px:.1f},{origin_y_px:.1f}) D=({dest_x_px:.1f},{dest_y_px:.1f}) | clamped O=({ox:.1f},{oy:.1f}) D=({dx:.1f},{dy:.1f})")
    except Exception as e:
        logger.warning(f"Failed to draw leg overlay: {e}")


def generate_leg_map(
    origin: FlightPlanTurnPoint,
    destination: FlightPlanTurnPoint
) -> bytes:
    """
    Generate a map image for a single leg of the flight plan.
    
    Args:
        origin: Starting waypoint
        destination: Ending waypoint
        
    Returns:
        PNG image data as bytes (768x1024)
    """
    logger.info(f"=== Starting leg map generation ===")
    logger.info(f"Origin: lat={origin.lat}, lon={origin.lon}")
    logger.info(f"Destination: lat={destination.lat}, lon={destination.lon}")
    
    tile_info = _get_tile_info()
    
    # Calculate leg distance
    leg_distance = _calculate_distance_meters(
        origin.lat, origin.lon,
        destination.lat, destination.lon
    )
    logger.info(f"Leg distance: {leg_distance:.2f} meters ({leg_distance/1852:.2f} NM)")
    
    # Select zoom level
    zoom = _select_zoom_level(tile_info, leg_distance)
    logger.info(f"Selected zoom level: {zoom}")
    
    # Create bounding box around leg
    bbox_tm = _create_bbox_around_leg(
        origin.lat, origin.lon,
        destination.lat, destination.lon,
        zoom, tile_info
    )
    logger.info(f"Bounding box created: {bbox_tm}")
    
    # Assemble tiles
    composite = _assemble_tiles(tile_info, zoom, bbox_tm)
    
    # Calculate the angle of the leg line in pixel/image coordinates
    # We need to use the projected coordinates (Transverse Mercator) converted to pixels
    origin_x_tm, origin_y_tm = _lat_lon_to_transverse_mercator(origin.lat, origin.lon)
    dest_x_tm, dest_y_tm = _lat_lon_to_transverse_mercator(destination.lat, destination.lon)
    
    # Convert to pixel coordinates in the composite
    grid_origin_x, grid_origin_y = _lat_lon_to_transverse_mercator(ORIGIN_LAT, ORIGIN_LON)
    resolution = _get_resolution_for_zoom(tile_info, zoom)
    
    # Get tile bounds for the composite
    min_tile_x, min_tile_y, max_tile_x, max_tile_y = _bbox_tm_to_tile_bounds(bbox_tm, tile_info, zoom)
    
    # Convert TM to pixel coordinates
    origin_px_x = (origin_x_tm - grid_origin_x) / resolution
    origin_px_y = (grid_origin_y - origin_y_tm) / resolution  # Flip Y
    dest_px_x = (dest_x_tm - grid_origin_x) / resolution
    dest_px_y = (grid_origin_y - dest_y_tm) / resolution  # Flip Y
    
    # Convert to composite-local pixel coordinates
    origin_x_px = origin_px_x - (min_tile_x * TILE_SIZE)
    origin_y_px = origin_px_y - (min_tile_y * TILE_SIZE)
    dest_x_px = dest_px_x - (min_tile_x * TILE_SIZE)
    dest_y_px = dest_px_y - (min_tile_y * TILE_SIZE)
    
    # Calculate the angle of the leg line in pixel coordinates
    # In PIL coordinates: (0,0) is top-left, x increases right, y increases down
    # atan2(y, x) gives angle where 0° = right, 90° = down, -90° = up, 180° = left
    dx = dest_x_px - origin_x_px
    dy = dest_y_px - origin_y_px
    leg_angle_rad = math.atan2(dy, dx)
    leg_angle_deg = math.degrees(leg_angle_rad)
    logger.info(f"Leg angle in pixel coordinates: {leg_angle_deg:.2f}° (dx={dx:.1f}, dy={dy:.1f})")
    
    # Rotate so leg is vertical (pointing north/up)
    # In PIL coordinates: -90° = up (north), 0° = right (east), 90° = down (south), 180° = left (west)
    # To make the leg point upward (-90°), we need to rotate by: -90° - leg_angle_deg
    rotation_angle = -90 - leg_angle_deg
    logger.info(f"Rotation angle: {rotation_angle:.2f}° (to make leg point up at -90°)")
    
    # Get center of composite image (before rotation)
    center_x = composite.width // 2
    center_y = composite.height // 2
    logger.info(f"Composite image size: {composite.width}x{composite.height}, center: ({center_x}, {center_y})")
    
    # Store original composite size before rotation
    original_composite_size = (composite.width, composite.height)
    
    # Rotate image FIRST (with expand=True to prevent clipping)
    logger.info(f"Rotating image by {rotation_angle:.2f}° around center ({center_x}, {center_y})")
    rotated = _rotate_image(composite, rotation_angle, (center_x, center_y))
    logger.info(f"Rotated image size: {rotated.width}x{rotated.height}")
    
    # Draw the leg onto the rotated image
    _draw_leg_on_rotated_image(
        rotated,
        origin.lat, origin.lon,
        destination.lat, destination.lon,
        bbox_tm, tile_info, zoom,
        rotation_angle, (center_x, center_y),
        original_composite_size
    )
    
    # Save rotated image as PNG
    logger.info("Saving rotated image with leg overlay to PNG bytes")
    img_byte_arr = io.BytesIO()
    rotated.save(img_byte_arr, format='PNG')
    img_bytes = img_byte_arr.getvalue()
    logger.info(f"Generated rotated PNG: {len(img_bytes)} bytes")
    logger.info("=== Leg map generation completed ===")
    return img_bytes


def _tm_to_pixel_in_composite(
    x_tm: float, y_tm: float,
    bbox_tm: Tuple[float, float, float, float],
    img_width: int, img_height: int
) -> Tuple[int, int]:
    """
    Convert Transverse Mercator coordinates to pixel coordinates in composite image.
    
    Args:
        x_tm, y_tm: Transverse Mercator coordinates
        bbox_tm: Bounding box in TM (min_x, min_y, max_x, max_y)
        img_width, img_height: Image dimensions
        
    Returns:
        Pixel coordinates (x, y)
    """
    min_x, min_y, max_x, max_y = bbox_tm
    
    # Normalize to 0-1
    if max_x != min_x:
        x_norm = (x_tm - min_x) / (max_x - min_x)
    else:
        x_norm = 0.5
    
    if max_y != min_y:
        y_norm = (y_tm - min_y) / (max_y - min_y)
    else:
        y_norm = 0.5
    
    # Convert to pixels (note: y increases downward)
    px_x = int(x_norm * img_width)
    px_y = int((1 - y_norm) * img_height)  # Flip Y
    
    return px_x, px_y


def generate_leg_maps(flight_plan: FlightPlan) -> List[bytes]:
    """
    Generate map images for all legs of the flight plan.
    
    Args:
        flight_plan: The flight plan
        
    Returns:
        List of PNG image data as bytes, one for each leg
        
    Raises:
        ValueError: If flight plan has fewer than 2 waypoints
    """
    if len(flight_plan.points) < 2:
        raise ValueError("Flight plan must have at least 2 waypoints")
    
    num_legs = len(flight_plan.points) - 1
    logger.info(f"Generating maps for {num_legs} leg(s)")
    
    leg_maps = []
    for i in range(num_legs):
        logger.info(f"Processing leg {i+1}/{num_legs}")
        origin = flight_plan.points[i]
        destination = flight_plan.points[i + 1]
        
        leg_map = generate_leg_map(origin, destination)
        leg_maps.append(leg_map)
        logger.info(f"Leg {i+1}/{num_legs} completed: {len(leg_map)} bytes")
    
    logger.info(f"Generated {len(leg_maps)} leg map(s)")
    return leg_maps

def generate_leg_maps(flight_plan: FlightPlan) -> List[bytes]:
    """
    Generate map images for all legs of the flight plan.
    
    Args:
        flight_plan: The flight plan
        
    Returns:
        List of PNG image data as bytes, one for each leg
        
    Raises:
        ValueError: If flight plan has fewer than 2 waypoints
    """
    if len(flight_plan.points) < 2:
        raise ValueError("Flight plan must have at least 2 waypoints")
    
    num_legs = len(flight_plan.points) - 1
    logger.info(f"Generating maps for {num_legs} leg(s)")
    
    leg_maps = []
    for i in range(num_legs):
        logger.info(f"Processing leg {i+1}/{num_legs}")
        origin = flight_plan.points[i]
        destination = flight_plan.points[i + 1]
        
        leg_map = generate_leg_map(origin, destination)
        leg_maps.append(leg_map)
        logger.info(f"Leg {i+1}/{num_legs} completed: {len(leg_map)} bytes")
    
    logger.info(f"Generated {len(leg_maps)} leg map(s)")
    return leg_maps

