#!/usr/bin/env python3
"""
Map Tile Generator

This script takes a large PNG image and divides it into 256x256 tiles
using the XYZ tile server naming convention.

Usage:
    python generate_tiles.py <input_image> <output_directory> [--zoom-levels ZOOM_LEVELS]
    python generate_tiles.py <input_image> --theatre THEATRE --map MAP

Example:
    python generate_tiles.py map.png ./tiles --zoom-levels 0,1,2,3,4,5
    python generate_tiles.py vfr.png --theatre germany --map vfr

With --theatre and --map, tiles are written to the backend's tile directory for
that map (tiles/<theatre>/<map>/) and the tile grid is merged into the map's
config, backend/theatres/<theatre>/maps/<map>.json. The theatre's own
theatre.json (with its navigation settings) is never written.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from PIL import Image, ImageFilter
import math


def calculate_zoom_levels(image_width, image_height, tile_size=256):
    """
    Calculate the default zoom levels based on image dimensions.

    Args:
        image_width: Width of the input image
        image_height: Height of the input image
        tile_size: Size of each tile on the map grid

    Returns:
        Zoom levels from 0 to the natural zoom level, where pixels are one to one
        with the original image
    """
    max_dimension = max(image_width, image_height)
    natural_zoom = math.ceil(math.log2(max_dimension / tile_size))
    return list(range(0, natural_zoom + 1))


def resize_level(image, width, height, unsharp_radius, unsharp_percent, unsharp_threshold):
    """
    One pyramid level, resized straight from the original image.

    Resizing from the original rather than from the previous level avoids stacking
    one resampling (and its softening) per level. Pillow's LANCZOS widens its kernel
    with the scale factor, so it antialiases without a pre-blur; reducing_gap first
    box-reduces the image to about 3x the target size, which is much faster and
    indistinguishable from a full Lanczos. A light unsharp mask then restores the
    contrast of fine details (text, thin lines).
    """
    if (width, height) == image.size:
        return image
    level = image.resize((width, height), Image.LANCZOS, reducing_gap=3.0)
    return level.filter(
        ImageFilter.UnsharpMask(radius=unsharp_radius, percent=unsharp_percent, threshold=unsharp_threshold)
    )


def generate_tiles(
    image_path,
    output_dir,
    zoom_levels=None,
    tile_size=256,
    hidpi=True,
    unsharp_radius=0.6,
    unsharp_percent=60,
    unsharp_threshold=1,
):
    """
    Generate XYZ tiles from a large image, each zoom level resized from the original.

    With hidpi, the tile z/x/y covers the same area as a standard tile but has twice
    the pixels in each direction (2*tile_size): its content is the next zoom level.
    The browser then draws it one tile pixel per screen pixel on a 2x display. The
    natural zoom level gets no tiles (they would only be the original upscaled): the
    planner shows it by scaling up the level below.

    Args:
        image_path: Path to the input image
        output_dir: Directory to save tiles
        zoom_levels: List of zoom levels to generate (auto-calculated if None)
        tile_size: Size of each tile on the map grid (default: 256x256)
        hidpi: Generate 2x tiles (default: True)
        unsharp_radius: Radius of the UnsharpMask pass (default: 0.6)
        unsharp_percent: Strength of the UnsharpMask pass (default: 60)
        unsharp_threshold: Threshold of the UnsharpMask pass (default: 1)

    Returns:
        The tiling fields of the map config (zoom_info, tile_pixel_ratio,
        max_tile_zoom), or False on error.
    """
    Image.MAX_IMAGE_PIXELS = 5000000000
    # Open the image
    try:
        image = Image.open(image_path)
        print(f"Loaded image: {image.size[0]}x{image.size[1]} pixels, mode={image.mode}", file=sys.stderr)
        # Indexed/palette images must be converted before any resampling, which
        # would otherwise blend raw palette indices.
        if image.mode == "P":
            target_mode = "RGBA" if image.info.get("transparency") is not None else "RGB"
            image = image.convert(target_mode)
            print(f"  Converted indexed image to {target_mode}", file=sys.stderr)
        image.load()
    except Exception as e:
        print(f"Error opening image: {e}", file=sys.stderr)
        return False

    # Calculate zoom levels if not provided
    if zoom_levels is None:
        zoom_levels = calculate_zoom_levels(image.size[0], image.size[1], tile_size)
        print(f"Auto-calculated zoom levels: {zoom_levels}", file=sys.stderr)

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    total_tiles = 0
    original_width = image.size[0]
    original_height = image.size[1]
    max_dimension = max(original_width, original_height)

    # "Natural" zoom level is the zoom level where pixels are one to one with the original map
    natural_zoom = math.ceil(math.log2(max_dimension / tile_size))

    tile_pixel_ratio = 2 if hidpi else 1
    # A 2x tile holds the next zoom level, so the last level with tiles is one below natural
    max_tile_zoom = min(max(zoom_levels), natural_zoom - (tile_pixel_ratio - 1))
    tile_px = tile_size * tile_pixel_ratio

    zoom_info = []

    print(f"\nNatural zoom level is {natural_zoom}", file=sys.stderr)
    print(f"Tile pixel ratio {tile_pixel_ratio}, tiles up to zoom {max_tile_zoom}", file=sys.stderr)

    # --- Pass 1: Build zoom_info metadata (ascending order, unchanged) ---
    for zoom in zoom_levels:
        # Calculate number of tiles at this zoom level
        nb_tiles_w = math.ceil(
            original_width / (tile_size * 2 ** (natural_zoom - zoom))
        )
        nb_tiles_h = math.ceil(
            original_height / (tile_size * 2 ** (natural_zoom - zoom))
        )
        width_px = math.floor(original_width / (2 ** (natural_zoom - zoom)))
        height_px = math.floor(original_height / (2 ** (natural_zoom - zoom)))

        zoom_info.append(
            {
                "zoom": zoom,
                "nb_tiles_w": nb_tiles_w,
                "nb_tiles_h": nb_tiles_h,
                "width_px": width_px,
                "height_px": height_px,
            }
        )

    # --- Pass 2: Tile generation (descending from the last level with tiles) ---
    for zoom in sorted((z for z in zoom_levels if z <= max_tile_zoom), reverse=True):
        # The pyramid level the tile pixels come from: the next one for 2x tiles
        source_zoom = zoom + (tile_pixel_ratio - 1)
        level_width = math.floor(original_width / (2 ** (natural_zoom - source_zoom)))
        level_height = math.floor(original_height / (2 ** (natural_zoom - source_zoom)))

        working_image = resize_level(
            image, level_width, level_height, unsharp_radius, unsharp_percent, unsharp_threshold
        )
        print(
            f"\nPyramid level {source_zoom}: {level_width}x{level_height}", file=sys.stderr
        )

        # Save the full pyramid image for debugging/quality inspection
        debug_path = Path.cwd() / f"pyramid_zoom_{source_zoom}.png"
        working_image.save(debug_path, "PNG")
        print(f"  Saved debug image: {debug_path}", file=sys.stderr)

        print(f"  Generating {tile_px}px tiles for zoom level {zoom}...", file=sys.stderr)

        nb_tiles_w = math.ceil(
            original_width / (tile_size * 2 ** (natural_zoom - zoom))
        )
        nb_tiles_h = math.ceil(
            original_height / (tile_size * 2 ** (natural_zoom - zoom))
        )

        zoom_dir = output_path / str(zoom)
        zoom_dir.mkdir(exist_ok=True)
        zoom_tiles = 0

        for x in range(nb_tiles_w):
            x_dir = zoom_dir / str(x)
            x_dir.mkdir(exist_ok=True)

            for y in range(nb_tiles_h):
                # Tile coordinates within the working image (already at correct resolution)
                left = x * tile_px
                top = y * tile_px
                right = min((x + 1) * tile_px, level_width)
                bottom = min((y + 1) * tile_px, level_height)

                tile = working_image.crop((left, top, right, bottom))

                # Pad edge tiles to full tile_px x tile_px with black
                if tile.size != (tile_px, tile_px):
                    padded = Image.new(tile.mode, (tile_px, tile_px), 0)
                    padded.paste(tile, (0, 0))
                    tile = padded

                # Save the tile using XYZ naming convention: z/x/y.png
                tile_path = x_dir / f"{y}.png"
                tile.save(tile_path, "PNG")

                zoom_tiles += 1
                total_tiles += 1

        print(f"  Generated {zoom_tiles} tiles for zoom level {zoom}", file=sys.stderr)

    print(
        f"\n✅ Successfully generated {total_tiles} tiles in {output_dir}",
        file=sys.stderr,
    )

    tiling = {
        "zoom_info": zoom_info,
        "tile_pixel_ratio": tile_pixel_ratio,
        "max_tile_zoom": max_tile_zoom,
    }
    print(json.dumps(tiling, indent=4))

    return tiling


BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import map_georeference  # noqa: E402

# Fields a map config needs besides its tile grid and image size; they describe
# how the source image is georeferenced. `crs` and `control_points` are entered
# by hand, the rest is fitted by georeference.py (see README.md).
MAP_GEOREFERENCE_FIELDS = (
    "crs", "control_points", "origin_x", "origin_y", "resolution",
)


def write_map_config(theatres_dir, theatre, map_id, tiling, image_size):
    """
    Merge the generated tile grid (the tiling fields returned by generate_tiles)
    and the native image size into
    theatres/<theatre>/maps/<map>.json, creating it if needed and keeping every
    other field (the georeference in particular).

    Returns the config path and the georeference fields still missing.
    """
    theatre_dir = Path(theatres_dir) / theatre
    if not (theatre_dir / "theatre.json").is_file():
        raise SystemExit(
            f"Error: {theatre_dir / 'theatre.json'} not found. Create the theatre "
            "(name, default_map, navigation) by hand before generating its maps."
        )
    map_path = theatre_dir / "maps" / f"{map_id}.json"
    config = json.loads(map_path.read_text(encoding="utf-8")) if map_path.exists() else {"map_name": map_id}
    config["image_width_px"], config["image_height_px"] = image_size
    config.update(tiling)
    map_path.parent.mkdir(parents=True, exist_ok=True)
    map_path.write_text(map_georeference.dumps_map_config(config), encoding="utf-8")
    missing = [f for f in MAP_GEOREFERENCE_FIELDS if f not in config]
    return map_path, missing


def main():
    parser = argparse.ArgumentParser(
        description="Generate XYZ tiles from a large PNG image",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_tiles.py map.png
  python generate_tiles.py map.png ./custom_tiles
  python generate_tiles.py map.png --zoom-levels 0,1,2,3,4,5
  python generate_tiles.py map.png --no-hidpi
  python generate_tiles.py map.png --unsharp-radius 0.8 --unsharp-percent 50 --unsharp-threshold 3
        """,
    )

    parser.add_argument("input_image", help="Path to the input PNG image")
    parser.add_argument(
        "output_directory",
        nargs="?",
        default="./tiles",
        help="Directory to save the generated tiles (default: ../../backend/static/tiles)",
    )
    parser.add_argument(
        "--zoom-levels",
        help="Comma-separated list of zoom levels (e.g., 0,1,2,3,4,5; default: 0 to the natural zoom level)",
    )
    parser.add_argument(
        "--theatre",
        help="Theatre id: with --map, write tiles and the map config into the backend",
    )
    parser.add_argument("--map", dest="map_id", help="Map id within the theatre (with --theatre)")
    parser.add_argument(
        "--theatres-dir",
        default=str(BACKEND_DIR / "theatres"),
        help="Theatre configs directory (default: backend/theatres)",
    )
    parser.add_argument(
        "--tile-size",
        type=int,
        default=256,
        help="Size of each tile in pixels (default: 256)",
    )
    parser.add_argument(
        "--hidpi",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Generate 2x tiles for high-DPI displays (default: on; --no-hidpi for standard tiles)",
    )
    parser.add_argument(
        "--unsharp-radius",
        type=float,
        default=0.6,
        help="Radius of the UnsharpMask pass applied after downscaling (default: 0.6)",
    )
    parser.add_argument(
        "--unsharp-percent",
        type=int,
        default=60,
        help="Strength of the UnsharpMask pass applied after downscaling (default: 60)",
    )
    parser.add_argument(
        "--unsharp-threshold",
        type=int,
        default=1,
        help="Threshold of the UnsharpMask pass applied after downscaling (default: 1)",
    )

    args = parser.parse_args()

    if bool(args.theatre) != bool(args.map_id):
        parser.error("--theatre and --map must be given together")
    output_directory = args.output_directory
    if args.theatre and output_directory == "./tiles":
        output_directory = str(BACKEND_DIR / "config" / "static" / "tiles" / args.theatre / args.map_id)
    if args.theatre and not (Path(args.theatres_dir) / args.theatre / "theatre.json").is_file():
        print(
            f"Error: theatre '{args.theatre}' has no theatre.json in {args.theatres_dir}. Create the "
            "theatre (name, default_map, navigation) by hand before generating its maps."
        )
        sys.exit(1)

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
            print(
                "Error: Invalid zoom levels format. Use comma-separated integers (e.g., 0,1,2,3)"
            )
            sys.exit(1)

    # Generate tiles
    tiling = generate_tiles(
        args.input_image,
        output_directory,
        zoom_levels,
        args.tile_size,
        hidpi=args.hidpi,
        unsharp_radius=args.unsharp_radius,
        unsharp_percent=args.unsharp_percent,
        unsharp_threshold=args.unsharp_threshold,
    )

    if tiling is False:
        sys.exit(1)

    if args.theatre:
        with Image.open(args.input_image) as image:
            image_size = image.size
        map_path, missing = write_map_config(
            args.theatres_dir, args.theatre, args.map_id, tiling, image_size
        )
        print(f"Map config written: {map_path}", file=sys.stderr)
        if missing:
            print(
                f"Still missing in {map_path}: {', '.join(missing)}. Enter crs and "
                "control_points by hand, then run georeference.py (see README.md).",
                file=sys.stderr,
            )


if __name__ == "__main__":
    main()
