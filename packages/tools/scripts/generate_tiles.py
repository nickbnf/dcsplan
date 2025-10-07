#!/usr/bin/env python3
"""
Map Tile Generator

This script takes a large PNG image and divides it into 256x256 tiles
using the XYZ tile server naming convention.

Usage:
    python generate_tiles.py <input_image> <output_directory> [--zoom-levels ZOOM_LEVELS]

Example:
    python generate_tiles.py map.png ./tiles --zoom-levels 0,1,2,3,4,5
"""

import argparse
import json
import os
import sys
from pathlib import Path
from PIL import Image
import math


def calculate_zoom_levels(image_width, image_height, max_zoom=5):
    """
    Calculate appropriate zoom levels based on image dimensions.
    
    Args:
        image_width: Width of the input image
        image_height: Height of the input image
        max_zoom: Maximum zoom level to generate
    
    Returns:
        List of zoom levels to generate
    """
    # Calculate the minimum zoom level needed to fit the image
    max_dimension = max(image_width, image_height)
    min_zoom = math.ceil(math.log2(max_dimension / 256))
    
    # Generate zoom levels from min_zoom to max_zoom
    return list(range(min_zoom, max_zoom + 1))


def generate_tiles(image_path, output_dir, zoom_levels=None, tile_size=256):
    """
    Generate XYZ tiles from a large image.
    
    Args:
        image_path: Path to the input image
        output_dir: Directory to save tiles
        zoom_levels: List of zoom levels to generate (auto-calculated if None)
        tile_size: Size of each tile (default: 256x256)
    """
    Image.MAX_IMAGE_PIXELS = 5000000000
    # Open the image
    try:
        image = Image.open(image_path)
        print(f"Loaded image: {image.size[0]}x{image.size[1]} pixels", file=sys.stderr)
    except Exception as e:
        print(f"Error opening image: {e}", file=sys.stderr)
        return False
    
    # Calculate zoom levels if not provided
    if zoom_levels is None:
        zoom_levels = calculate_zoom_levels(image.size[0], image.size[1])
        print(f"Auto-calculated zoom levels: {zoom_levels}", file=sys.stderr)
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    total_tiles = 0
    original_width = image.size[0]
    original_height = image.size[1]
    max_dimension = max(original_width, original_height)

    # "Natural" zoom level is the zoom level where pixel are one to one withe original map
    natural_zoom = math.ceil(math.log2(max_dimension / tile_size))

    zoom_info = []

    for zoom in zoom_levels:
        print(f"\nGenerating tiles for zoom level {zoom}...", file=sys.stderr)

        # Calculate number of tiles at this zoom level
        nb_tiles_w = math.ceil(original_width / (tile_size * 2 ** (natural_zoom - zoom)))
        nb_tiles_h = math.ceil(original_height / (tile_size * 2 ** (natural_zoom - zoom)))
        width_px = math.floor(original_width / (2 ** (natural_zoom - zoom)))
        height_px = math.floor(original_height / (2 ** (natural_zoom - zoom)))

        zoom_info.append({
            "zoom": zoom,
            "nb_tiles_w": nb_tiles_w,
            "nb_tiles_h": nb_tiles_h,
            "width_px": width_px,
            "height_px": height_px
        })

        # Calculate tile dimensions
        tile_size_in_original_image = (2 ** (natural_zoom - zoom)) * tile_size
        
        # Create zoom level directory
        zoom_dir = output_path / str(zoom)
        zoom_dir.mkdir(exist_ok=True)
        
        zoom_tiles = 0
        
        for x in range(nb_tiles_w):
            # Create X directory
            x_dir = zoom_dir / str(x)
            x_dir.mkdir(exist_ok=True)
            
            for y in range(nb_tiles_h):
                # Calculate crop coordinates
                left = int(x * tile_size_in_original_image)
                top = int(y * tile_size_in_original_image)
                right = int((x + 1) * tile_size_in_original_image)
                bottom = int((y + 1) * tile_size_in_original_image)
                
                # Crop the tile
                tile = image.crop((left, top, right, bottom))
                
                # Resize to standard tile size if needed
                if tile.size != (tile_size, tile_size):
                    tile = tile.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
                
                # Save the tile using XYZ naming convention: z/x/y.png
                tile_path = x_dir / f"{y}.png"
                tile.save(tile_path, "PNG")
                
                zoom_tiles += 1
                total_tiles += 1
        
        print(f"Generated {zoom_tiles} tiles for zoom level {zoom}", file=sys.stderr)
    
    print(f"\n✅ Successfully generated {total_tiles} tiles in {output_dir}", file=sys.stderr)

    print(json.dumps({"zoom_info": zoom_info}, indent=4))

    return True


def main():
    parser = argparse.ArgumentParser(
        description="Generate XYZ tiles from a large PNG image",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_tiles.py map.png
  python generate_tiles.py map.png ./custom_tiles
  python generate_tiles.py map.png --zoom-levels 0,1,2,3,4,5
  python generate_tiles.py map.png --max-zoom 6
        """
    )
    
    parser.add_argument("input_image", help="Path to the input PNG image")
    parser.add_argument("output_directory", nargs='?', default="../../backend/static/tiles", 
                       help="Directory to save the generated tiles (default: ../../backend/static/tiles)")
    parser.add_argument(
        "--zoom-levels", 
        help="Comma-separated list of zoom levels (e.g., 0,1,2,3,4,5)"
    )
    parser.add_argument(
        "--max-zoom", 
        type=int, 
        default=5,
        help="Maximum zoom level to generate (default: 5)"
    )
    parser.add_argument(
        "--tile-size", 
        type=int, 
        default=256,
        help="Size of each tile in pixels (default: 256)"
    )
    
    args = parser.parse_args()
    
    # Validate input image
    if not os.path.exists(args.input_image):
        print(f"Error: Input image '{args.input_image}' not found")
        sys.exit(1)
    
    # Parse zoom levels
    zoom_levels = None
    if args.zoom_levels:
        try:
            zoom_levels = [int(z.strip()) for z in args.zoom_levels.split(",")]
            if any(z < 0 for z in zoom_levels):
                print("Error: Zoom levels must be non-negative integers")
                sys.exit(1)
        except ValueError:
            print("Error: Invalid zoom levels format. Use comma-separated integers (e.g., 0,1,2,3)")
            sys.exit(1)
    else:
        # Use max_zoom to calculate zoom levels
        zoom_levels = None
    
    # Generate tiles
    success = generate_tiles(
        args.input_image, 
        args.output_directory, 
        zoom_levels, 
        args.tile_size
    )
    
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
