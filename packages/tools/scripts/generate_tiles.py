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
import cv2
import numpy as np


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


def pil_to_cv2(pil_image):
    """Convert a PIL Image to a numpy array suitable for OpenCV."""
    arr = np.array(pil_image)
    if pil_image.mode == "RGBA":
        # PIL is RGBA, OpenCV expects BGRA
        return cv2.cvtColor(arr, cv2.COLOR_RGBA2BGRA)
    elif pil_image.mode == "RGB":
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    else:
        return arr


def cv2_to_pil(cv2_array, mode):
    """Convert an OpenCV numpy array back to a PIL Image."""
    if mode == "RGBA":
        arr = cv2.cvtColor(cv2_array, cv2.COLOR_BGRA2RGBA)
    elif mode == "RGB":
        arr = cv2.cvtColor(cv2_array, cv2.COLOR_BGR2RGB)
    else:
        arr = cv2_array
    return Image.fromarray(arr)


def generate_tiles(
    image_path,
    output_dir,
    zoom_levels=None,
    tile_size=256,
    gaussian_sigma=0.6,
    unsharp_percent=30,
    unsharp_threshold=2,
):
    """
    Generate XYZ tiles from a large image using an image pyramid for quality.

    Args:
        image_path: Path to the input image
        output_dir: Directory to save tiles
        zoom_levels: List of zoom levels to generate (auto-calculated if None)
        tile_size: Size of each tile (default: 256x256)
        gaussian_sigma: Sigma for the GaussianBlur pre-blur (default: 0.6)
        unsharp_percent: Strength of the UnsharpMask pass (default: 30)
        unsharp_threshold: Threshold for the UnsharpMask pass (default: 2)
    """
    Image.MAX_IMAGE_PIXELS = 5000000000
    # Open the image
    try:
        image = Image.open(image_path)
        print(f"Loaded image: {image.size[0]}x{image.size[1]} pixels, mode={image.mode}", file=sys.stderr)
        # Indexed/palette images must be converted before any pixel manipulation —
        # numpy/OpenCV would otherwise see raw palette indices (0-255) as grayscale.
        if image.mode == "P":
            target_mode = "RGBA" if image.info.get("transparency") is not None else "RGB"
            image = image.convert(target_mode)
            print(f"  Converted indexed image to {target_mode}", file=sys.stderr)
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

    # "Natural" zoom level is the zoom level where pixels are one to one with the original map
    natural_zoom = math.ceil(math.log2(max_dimension / tile_size))

    zoom_info = []

    print(f"\nNatural zoom level is {natural_zoom}", file=sys.stderr)

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

    # --- Pass 2: Pyramid tile generation (descending from natural_zoom) ---
    zoom_level_set = set(zoom_levels)
    min_zoom = min(zoom_levels)
    image_mode = image.mode
    working_image = None  # PIL Image at current pyramid level

    for zoom in range(natural_zoom, min_zoom - 1, -1):
        level_width = math.floor(original_width / (2 ** (natural_zoom - zoom)))
        level_height = math.floor(original_height / (2 ** (natural_zoom - zoom)))

        if zoom == natural_zoom:
            # Start of pyramid: use the original image as-is
            working_image = image
            print(
                f"\nPyramid level {zoom} (natural): {level_width}x{level_height}",
                file=sys.stderr,
            )
        else:
            # Gaussian pyramid step:
            # - sigma=0.5 pre-blur removes the highest-frequency aliasing that causes
            #   staircase on diagonals, without visible softening (unlike sigma=1.0)
            # - INTER_LANCZOS4 then resamples sharply with its 8-tap sinc kernel
            # - No UnsharpMask needed: Lanczos4 is already sharp; adding USM on top
            #   was causing over-sharpening
            cv2_img = pil_to_cv2(working_image)
            cv2_img = cv2.GaussianBlur(cv2_img, (0, 0), sigmaX=gaussian_sigma, sigmaY=gaussian_sigma)
            cv2_img = cv2.resize(
                cv2_img,
                (level_width, level_height),
                interpolation=cv2.INTER_LANCZOS4,
            )
            working_image = cv2_to_pil(cv2_img, image_mode)
            # Restore local contrast lost to the Gaussian pre-blur, targeting fine
            # details (text, thin lines) with a small radius
            working_image = working_image.filter(
                ImageFilter.UnsharpMask(radius=0.8, percent=unsharp_percent, threshold=unsharp_threshold)
            )
            print(
                f"\nPyramid level {zoom}: {level_width}x{level_height}", file=sys.stderr
            )

        # Save the full pyramid image for debugging/quality inspection
        debug_path = Path.cwd() / f"pyramid_zoom_{zoom}.png"
        working_image.save(debug_path, "PNG")
        print(f"  Saved debug image: {debug_path}", file=sys.stderr)

        # Skip tile output if this zoom level was not requested
        if zoom not in zoom_level_set:
            continue

        print(f"  Generating tiles for zoom level {zoom}...", file=sys.stderr)

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
                left = x * tile_size
                top = y * tile_size
                right = min((x + 1) * tile_size, level_width)
                bottom = min((y + 1) * tile_size, level_height)

                tile = working_image.crop((left, top, right, bottom))

                # Pad edge tiles to full tile_size x tile_size with black
                if tile.size != (tile_size, tile_size):
                    padded = Image.new(tile.mode, (tile_size, tile_size), 0)
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

    print(json.dumps({"zoom_info": zoom_info}, indent=4))

    return zoom_info


BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import map_georeference  # noqa: E402

# Fields a map config needs besides its tile grid and image size; they describe
# how the source image is georeferenced. `crs` and `control_points` are entered
# by hand, the rest is fitted by georeference.py (see README.md).
MAP_GEOREFERENCE_FIELDS = (
    "crs", "control_points", "origin_x", "origin_y", "resolution",
)


def write_map_config(theatres_dir, theatre, map_id, zoom_info, image_size):
    """
    Merge the generated tile grid and the native image size into
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
    config["zoom_info"] = zoom_info
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
  python generate_tiles.py map.png --max-zoom 6
  python generate_tiles.py map.png --gaussian-sigma 0.8 --unsharp-percent 50 --unsharp-threshold 3
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
        "--zoom-levels", help="Comma-separated list of zoom levels (e.g., 0,1,2,3,4,5)"
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
        "--max-zoom",
        type=int,
        default=5,
        help="Maximum zoom level to generate (default: 5)",
    )
    parser.add_argument(
        "--tile-size",
        type=int,
        default=256,
        help="Size of each tile in pixels (default: 256)",
    )
    parser.add_argument(
        "--gaussian-sigma",
        type=float,
        default=0.6,
        help="Sigma for the Gaussian pre-blur applied before each pyramid downscale (default: 0.6)",
    )
    parser.add_argument(
        "--unsharp-percent",
        type=int,
        default=30,
        help="Strength of the UnsharpMask pass applied after downscaling (default: 30)",
    )
    parser.add_argument(
        "--unsharp-threshold",
        type=int,
        default=2,
        help="Threshold of the UnsharpMask pass applied after downscaling (default: 2)",
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
    else:
        # Use max_zoom to calculate zoom levels
        zoom_levels = None

    # Generate tiles
    zoom_info = generate_tiles(
        args.input_image,
        output_directory,
        zoom_levels,
        args.tile_size,
        gaussian_sigma=args.gaussian_sigma,
        unsharp_percent=args.unsharp_percent,
        unsharp_threshold=args.unsharp_threshold,
    )

    if zoom_info is False:
        sys.exit(1)

    if args.theatre:
        with Image.open(args.input_image) as image:
            image_size = image.size
        map_path, missing = write_map_config(
            args.theatres_dir, args.theatre, args.map_id, zoom_info, image_size
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
