"""Map georeference (georeference-control-points).

A map's tile image is tied to the earth by:

    crs                 proj string of the map's projection (never an EPSG code)
    origin_x, origin_y  projected metres of the outer top-left corner of the image
    resolution          projected metres per native pixel, both axes
    image_width_px      native image size
    image_height_px
    control_points      [{label, px, py, lat, lon}] the georeference is fitted from
    alignment_tolerance_px  optional, largest accepted control point error

A control point's lat/lon is either a number in decimal degrees or a string in
degrees and decimal minutes as DCS shows it, e.g. "N 41°55.678'" / "E 041°51.234'".
Pixel positions use the corner-edge convention: (0, 0) is the top-left corner
of the image, so the centre of the top-left pixel is (0.5, 0.5).

Shared by the backend (configuration check, kneeboard) and the preparation tool
(packages/tools/scripts/georeference.py), so both use the same formulas.
"""
import json
import math
import re
from functools import lru_cache

import numpy as np
from pyproj import Transformer

REQUIRED_FIELDS = ("crs", "origin_x", "origin_y", "resolution", "image_width_px", "image_height_px")
MIN_CONTROL_POINTS = 3
# Largest accepted control point error, native pixels, for a map that does not
# set alignment_tolerance_px. A map drawn from real-world data can set a larger
# one: DCS terrain differs locally from reality, and the control points are DCS
# positions.
DEFAULT_ALIGNMENT_TOLERANCE_PX = 2.0
# Control points closer than this (RMS, native pixels) to a single straight line
# are treated as collinear.
COLLINEAR_SPREAD_PX = 1.0

# Degrees and decimal minutes with a hemisphere letter before or after:
# "N 41°55.678'", "E 041°51.234'", "N41 55.678", "41°55.678' N".
_DEGREES_DECIMAL_MINUTES = re.compile(
    r"^\s*([NSEW])?\s*(\d{1,3})\s*(?:°|º|\s)\s*(\d{1,2}(?:\.\d+)?)\s*['′]?\s*([NSEW])?\s*$",
    re.IGNORECASE,
)
_HEMISPHERES = {"lat": ("N", "S", 90), "lon": ("E", "W", 180)}


class GeoreferenceError(ValueError):
    """The map's control points cannot produce a georeference."""


@lru_cache(maxsize=None)
def transformer_for_crs(crs: str) -> Transformer:
    """WGS84 lon/lat → the map's projected coordinates."""
    return Transformer.from_crs("EPSG:4326", crs, always_xy=True)


def alignment_tolerance_px(map_cfg: dict) -> float:
    """The map's largest accepted control point error, in native pixels."""
    value = map_cfg.get("alignment_tolerance_px", DEFAULT_ALIGNMENT_TOLERANCE_PX)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not value > 0:
        raise GeoreferenceError(f"alignment_tolerance_px {value!r} is not a positive number")
    return float(value)


def missing_fields(map_cfg: dict) -> list[str]:
    """Required georeference fields absent from a map config."""
    return [f for f in REQUIRED_FIELDS if f not in map_cfg]


def parse_coordinate(value, axis: str) -> float:
    """
    A control point latitude (axis "lat") or longitude ("lon") in decimal
    degrees, from a number or a degrees-and-decimal-minutes string such as
    "N 41°55.678'". The string needs its hemisphere letter, N/S or E/W.
    """
    positive, negative, limit = _HEMISPHERES[axis]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        degrees = float(value)
    elif isinstance(value, str):
        match = _DEGREES_DECIMAL_MINUTES.match(value)
        hemispheres = [h.upper() for h in (match.group(1), match.group(4)) if h] if match else []
        if len(hemispheres) != 1 or hemispheres[0] not in (positive, negative):
            raise GeoreferenceError(
                f"{axis} {value!r} is not degrees and decimal minutes like "
                f"\"{positive} 41°55.678'\" ({positive}/{negative} hemisphere)"
            )
        minutes = float(match.group(3))
        if minutes >= 60:
            raise GeoreferenceError(f"{axis} {value!r} has {minutes} minutes")
        degrees = int(match.group(2)) + minutes / 60
        if hemispheres[0] == negative:
            degrees = -degrees
    else:
        raise GeoreferenceError(f"{axis} {value!r} is neither a number nor a string")
    if abs(degrees) > limit:
        raise GeoreferenceError(f"{axis} {value!r} is out of range")
    return degrees


def control_point_lat_lon(cp: dict) -> tuple[float, float]:
    """A control point's (lat, lon) in decimal degrees."""
    try:
        return parse_coordinate(cp["lat"], "lat"), parse_coordinate(cp["lon"], "lon")
    except GeoreferenceError as e:
        raise GeoreferenceError(f"control point {cp.get('label', '')!r}: {e}") from None


def project_control_points(map_cfg: dict) -> list[tuple[float, float]]:
    """Projected (x, y) of each control point, in config order."""
    transformer = transformer_for_crs(map_cfg["crs"])
    return [
        transformer.transform(lon, lat)
        for lat, lon in map(control_point_lat_lon, map_cfg.get("control_points", []))
    ]


def residuals_px(map_cfg: dict) -> list[dict]:
    """
    Where the map's georeference places each control point, against where it
    was recorded, in native pixels: {label, px, py, dx, dy, error}.
    """
    origin_x, origin_y, resolution = map_cfg["origin_x"], map_cfg["origin_y"], map_cfg["resolution"]
    result = []
    for cp, (x, y) in zip(map_cfg.get("control_points", []), project_control_points(map_cfg)):
        dx = (x - origin_x) / resolution - cp["px"]
        dy = (origin_y - y) / resolution - cp["py"]
        result.append({
            "label": cp.get("label", ""),
            "px": cp["px"],
            "py": cp["py"],
            "dx": dx,
            "dy": dy,
            "error": math.hypot(dx, dy),
        })
    return result


def rms(residuals: list[dict]) -> float:
    """RMS of the residual errors, in native pixels."""
    if not residuals:
        return 0.0
    return math.sqrt(sum(r["error"] ** 2 for r in residuals) / len(residuals))


def check_control_points(map_cfg: dict) -> None:
    """Raise GeoreferenceError unless there are enough, non-collinear control points."""
    points = map_cfg.get("control_points", [])
    if len(points) < MIN_CONTROL_POINTS:
        raise GeoreferenceError(
            f"{len(points)} control point(s); at least {MIN_CONTROL_POINTS} are required"
        )
    pixels = np.array([[cp["px"], cp["py"]] for cp in points], dtype=float)
    centred = pixels - pixels.mean(axis=0)
    # The smallest singular value over sqrt(N) is the RMS distance of the points
    # from their best-fitting straight line.
    spread = np.linalg.svd(centred, compute_uv=False)[-1] / math.sqrt(len(points))
    if spread < COLLINEAR_SPREAD_PX:
        raise GeoreferenceError("control points lie on a single straight line in the image")


def fit(map_cfg: dict) -> dict:
    """
    Least-squares origin and resolution from the map's CRS and control points:

        x = origin_x + resolution * px
        y = origin_y - resolution * py

    Returns {origin_x, origin_y, resolution}.
    """
    check_control_points(map_cfg)
    rows, values = [], []
    for cp, (x, y) in zip(map_cfg["control_points"], project_control_points(map_cfg)):
        rows.append([1.0, 0.0, cp["px"]])
        values.append(x)
        rows.append([0.0, 1.0, -cp["py"]])
        values.append(y)
    (origin_x, origin_y, resolution), *_ = np.linalg.lstsq(np.array(rows), np.array(values), rcond=None)
    return {"origin_x": float(origin_x), "origin_y": float(origin_y), "resolution": float(resolution)}


def affine_diagnostic(map_cfg: dict) -> dict:
    """
    Compare the map's north-up, square-pixel georeference with a full affine
    fit (rotation and separate x/y scales) of the same control points.

    Returns {rms_px, affine_rms_px, rotation_deg, scale_ratio}. rotation_deg is
    the angle of the image's x axis from projected east, counter-clockwise;
    scale_ratio is the x scale over the y scale. Residuals are in native pixels
    at the map's resolution.
    """
    check_control_points(map_cfg)
    pixels = np.array([[1.0, cp["px"], cp["py"]] for cp in map_cfg["control_points"]])
    projected = np.array(project_control_points(map_cfg))
    (a0, a1, a2), *_ = np.linalg.lstsq(pixels, projected[:, 0], rcond=None)
    (b0, b1, b2), *_ = np.linalg.lstsq(pixels, projected[:, 1], rcond=None)
    predicted = pixels @ np.array([[a0, b0], [a1, b1], [a2, b2]])
    affine_errors = np.hypot(*(predicted - projected).T) / map_cfg["resolution"]
    return {
        "rms_px": rms(residuals_px(map_cfg)),
        "affine_rms_px": float(math.sqrt(np.mean(affine_errors ** 2))),
        "rotation_deg": math.degrees(math.atan2(b1, a1)),
        "scale_ratio": math.hypot(a1, b1) / math.hypot(a2, b2),
    }


def dumps_map_config(map_cfg: dict) -> str:
    """A map config as the preparation tools write it: 4-space indent, one control point per line."""
    points = map_cfg.get("control_points")
    if not points:
        return json.dumps(map_cfg, indent=4, ensure_ascii=False) + "\n"
    placeholder = "__control_points__"
    text = json.dumps({**map_cfg, "control_points": placeholder}, indent=4, ensure_ascii=False)
    lines = ",\n".join(
        "        { " + json.dumps(cp, ensure_ascii=False)[1:-1] + " }" for cp in points
    )
    return text.replace(f'"{placeholder}"', "[\n" + lines + "\n    ]") + "\n"
