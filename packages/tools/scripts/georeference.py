#!/usr/bin/env python3
"""
Map Georeference Fitter

Fits a map's georeference (origin_x, origin_y, resolution) from the control
points recorded in its config, reports how well they fit, and writes the result
back into backend/theatres/<theatre>/maps/<map>.json.

Usage:
    python georeference.py --theatre THEATRE --map MAP [--dry-run] [--tolerance PX] [--force]

Example:
    python georeference.py --theatre germany --map default --dry-run

The map config must already hold `crs`, `image_width_px`, `image_height_px` and
at least three `control_points` ({label, px, py, lat, lon}, pixel positions at
native resolution, (0.5, 0.5) being the centre of the top-left pixel; lat/lon
in decimal degrees or as DCS shows them, "N 41°55.678'"). Every
other field of the config is kept as is. See README.md, "Adding a map to a theatre".
"""

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import map_georeference as mg  # noqa: E402


def fitted_config(config):
    """The config with the fitted origin and resolution."""
    fitted = mg.fit(config)
    result = dict(config)
    result["origin_x"] = round(fitted["origin_x"], 3)
    result["origin_y"] = round(fitted["origin_y"], 3)
    result["resolution"] = round(fitted["resolution"], 6)
    # Bounds are computed where needed, no longer stored (drop a leftover one).
    result.pop("bounds", None)
    return result


def print_report(name, config, fitted, tolerance, tolerance_source):
    residuals = mg.residuals_px(fitted)
    diagnostic = mg.affine_diagnostic(fitted)
    print(f"Map {name}: {len(residuals)} control points")
    print(f"  CRS: {config['crs']}")
    print()
    print(f"  {'label':<24} {'px':>10} {'py':>10} {'dx':>7} {'dy':>7} {'error':>7}")
    for r in residuals:
        flag = "  <-- over tolerance" if r["error"] > tolerance else ""
        print(
            f"  {r['label'][:24]:<24} {r['px']:>10.1f} {r['py']:>10.1f} "
            f"{r['dx']:>+7.2f} {r['dy']:>+7.2f} {r['error']:>7.2f}{flag}"
        )
    print()
    worst = max(r["error"] for r in residuals)
    print(f"  RMS {diagnostic['rms_px']:.2f} px, max {worst:.2f} px (tolerance {tolerance:.2f} px, {tolerance_source})")
    print(
        f"  Rotation/scale diagnostic: affine RMS {diagnostic['affine_rms_px']:.2f} px, "
        f"rotation {diagnostic['rotation_deg']:+.4f} deg, x/y scale ratio {diagnostic['scale_ratio']:.6f}"
    )
    if diagnostic["rms_px"] > tolerance and diagnostic["affine_rms_px"] < diagnostic["rms_px"] / 2:
        print(
            "  The image does not look north-up with square pixels in this CRS: check the CRS, "
            "or warp the source image before tiling."
        )
    print()
    print(f"  origin_x   {fitted['origin_x']:.3f}")
    print(f"  origin_y   {fitted['origin_y']:.3f}")
    print(f"  resolution {fitted['resolution']:.6f} m/px")
    if all(k in config for k in ("origin_x", "origin_y", "resolution")):
        shift_x = (fitted["origin_x"] - config["origin_x"]) / fitted["resolution"]
        shift_y = (config["origin_y"] - fitted["origin_y"]) / fitted["resolution"]
        scale_ppm = (fitted["resolution"] / config["resolution"] - 1) * 1e6
        print(
            f"  change from current: origin {shift_x:+.2f} px, {shift_y:+.2f} px; "
            f"resolution {scale_ppm:+.1f} ppm "
            f"({scale_ppm * 1e-6 * config['image_width_px']:+.2f} px across the image)"
        )
    return worst


def main():
    parser = argparse.ArgumentParser(
        description="Fit a map's georeference from its control points",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python georeference.py --theatre germany --map default --dry-run
  python georeference.py --theatre germany --map default
  python georeference.py --theatre germany --map default --tolerance 1.5
        """,
    )
    parser.add_argument("--theatre", required=True, help="Theatre id")
    parser.add_argument("--map", dest="map_id", required=True, help="Map id within the theatre")
    parser.add_argument(
        "--theatres-dir",
        default=str(BACKEND_DIR / "theatres"),
        help="Theatre configs directory (default: backend/theatres)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report the fit without writing")
    parser.add_argument(
        "--tolerance",
        type=float,
        help="Largest accepted control point error, native pixels (default: the map's "
        f"alignment_tolerance_px, else {mg.DEFAULT_ALIGNMENT_TOLERANCE_PX})",
    )
    parser.add_argument(
        "--force", action="store_true", help="Write the fit even if a control point is over tolerance"
    )
    args = parser.parse_args()

    map_path = Path(args.theatres_dir) / args.theatre / "maps" / f"{args.map_id}.json"
    if not map_path.is_file():
        print(f"Error: map config {map_path} not found", file=sys.stderr)
        sys.exit(1)
    config = json.loads(map_path.read_text(encoding="utf-8"))

    missing = [f for f in ("crs", "image_width_px", "image_height_px") if f not in config]
    if missing:
        print(f"Error: {map_path} is missing {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    try:
        fitted = fitted_config(config)
        if args.tolerance is not None:
            tolerance, tolerance_source = args.tolerance, "--tolerance"
        else:
            tolerance = mg.alignment_tolerance_px(config)
            tolerance_source = "map config" if "alignment_tolerance_px" in config else "default"
    except mg.GeoreferenceError as e:
        print(f"Error: {map_path}: {e}", file=sys.stderr)
        sys.exit(1)

    worst = print_report(f"{args.theatre}/{args.map_id}", config, fitted, tolerance, tolerance_source)

    if args.dry_run:
        print("\nDry run: map config not written.")
        return
    if worst > tolerance and not args.force:
        print(
            f"\nError: a control point is {worst:.2f} px off (tolerance {tolerance:.2f} px). "
            "Map config not written; fix the control points or the CRS, raise the map's "
            "alignment_tolerance_px, or pass --force.",
            file=sys.stderr,
        )
        sys.exit(1)
    map_path.write_text(mg.dumps_map_config(fitted), encoding="utf-8")
    print(f"\nMap config written: {map_path}")


if __name__ == "__main__":
    main()
