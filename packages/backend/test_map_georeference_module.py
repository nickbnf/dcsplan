"""Unit tests for map_georeference (georeference-control-points)."""
import math
import random

import pytest
from pyproj import Transformer

import map_georeference as mg

TMERC_21 = "+proj=tmerc +lat_0=0 +lon_0=21 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs"
LCC_10 = "+proj=lcc +lat_0=0 +lon_0=10.5 +lat_1=50 +lat_2=54 +ellps=WGS84 +units=m +no_defs"


def synthetic_map(crs=TMERC_21, origin=(-1450000.0, 6170000.0), resolution=32.0,
                  size=(40960, 32768), pixels=None, rotation_deg=0.0, noise_px=0.0, seed=1):
    """A map config whose control points are generated from a known georeference."""
    width, height = size
    if pixels is None:
        pixels = [(width * fx, height * fy) for fx, fy in
                  [(0.1, 0.1), (0.9, 0.1), (0.5, 0.5), (0.1, 0.9), (0.9, 0.9), (0.3, 0.7), (0.7, 0.3)]]
    rng = random.Random(seed)
    inverse = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    angle = math.radians(rotation_deg)
    control_points = []
    for i, (px, py) in enumerate(pixels):
        # Image x axis rotated counter-clockwise by rotation_deg from projected east.
        dx, dy = resolution * px, -resolution * py
        x = origin[0] + dx * math.cos(angle) - dy * math.sin(angle)
        y = origin[1] + dx * math.sin(angle) + dy * math.cos(angle)
        lon, lat = inverse.transform(x, y)
        control_points.append({
            "label": f"P{i}",
            "px": px + rng.uniform(-noise_px, noise_px),
            "py": py + rng.uniform(-noise_px, noise_px),
            "lat": lat,
            "lon": lon,
        })
    return {
        "crs": crs,
        "origin_x": origin[0],
        "origin_y": origin[1],
        "resolution": resolution,
        "image_width_px": width,
        "image_height_px": height,
        "control_points": control_points,
    }


@pytest.mark.parametrize("crs", [TMERC_21, LCC_10])
def test_transformer_matches_pyproj(crs):
    expected = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform(8.5706, 50.0333)
    assert mg.transformer_for_crs(crs).transform(8.5706, 50.0333) == pytest.approx(expected, abs=1e-6)


def test_missing_fields():
    assert mg.missing_fields({"crs": TMERC_21, "origin_x": 0}) == [
        "origin_y", "resolution", "image_width_px", "image_height_px"
    ]


def test_residuals_zero_for_exact_georeference():
    residuals = mg.residuals_px(synthetic_map())
    assert len(residuals) == 7
    assert max(r["error"] for r in residuals) < 1e-6


def test_residuals_follow_origin_shift():
    map_cfg = synthetic_map()
    map_cfg["origin_x"] += 3 * map_cfg["resolution"]
    for r in mg.residuals_px(map_cfg):
        assert r["dx"] == pytest.approx(-3.0, abs=1e-6)
        assert r["error"] == pytest.approx(3.0, abs=1e-6)


@pytest.mark.parametrize("crs", [TMERC_21, LCC_10])
def test_fit_recovers_exact_georeference(crs):
    map_cfg = synthetic_map(crs=crs)
    fitted = mg.fit(map_cfg)
    assert fitted["origin_x"] == pytest.approx(map_cfg["origin_x"], abs=1e-3)
    assert fitted["origin_y"] == pytest.approx(map_cfg["origin_y"], abs=1e-3)
    assert fitted["resolution"] == pytest.approx(map_cfg["resolution"], abs=1e-9)


def test_fit_with_noisy_points():
    map_cfg = synthetic_map(noise_px=0.5)
    fitted = mg.fit(map_cfg)
    assert abs(fitted["origin_x"] - map_cfg["origin_x"]) / map_cfg["resolution"] < 0.5
    assert abs(fitted["origin_y"] - map_cfg["origin_y"]) / map_cfg["resolution"] < 0.5
    # Over a 40960 px wide image, a 0.1 px drift at the far edge.
    assert abs(fitted["resolution"] / map_cfg["resolution"] - 1) * 40960 < 0.1


def test_fit_rejects_two_points():
    map_cfg = synthetic_map(pixels=[(100, 100), (5000, 4000)])
    with pytest.raises(mg.GeoreferenceError, match="at least 3"):
        mg.fit(map_cfg)


def test_fit_rejects_collinear_points():
    map_cfg = synthetic_map(pixels=[(100, 100), (2000, 2000), (9000, 9000)])
    with pytest.raises(mg.GeoreferenceError, match="straight line"):
        mg.fit(map_cfg)


def test_affine_diagnostic_detects_rotation():
    map_cfg = synthetic_map(rotation_deg=2.5)
    map_cfg.update(mg.fit(map_cfg))
    diagnostic = mg.affine_diagnostic(map_cfg)
    assert diagnostic["rotation_deg"] == pytest.approx(2.5, abs=0.01)
    assert diagnostic["rms_px"] > 100
    assert diagnostic["affine_rms_px"] < 1


def test_affine_diagnostic_north_up():
    diagnostic = mg.affine_diagnostic(synthetic_map())
    assert diagnostic["rotation_deg"] == pytest.approx(0.0, abs=1e-6)
    assert diagnostic["scale_ratio"] == pytest.approx(1.0, abs=1e-9)
    assert diagnostic["rms_px"] < 1e-6


@pytest.mark.parametrize("value, axis, expected", [
    ("N 41°55.678'", "lat", 41 + 55.678 / 60),
    ("E 041°51.234'", "lon", 41 + 51.234 / 60),
    ("S 33°52.5'", "lat", -(33 + 52.5 / 60)),
    ("W 003°07.000'", "lon", -(3 + 7 / 60)),
    ("N41 55.678", "lat", 41 + 55.678 / 60),
    ("41°55.678' N", "lat", 41 + 55.678 / 60),
    ("e 8° 34.236'", "lon", 8 + 34.236 / 60),
    (41.927967, "lat", 41.927967),
    (-3, "lon", -3.0),
])
def test_parse_coordinate(value, axis, expected):
    assert mg.parse_coordinate(value, axis) == pytest.approx(expected, abs=1e-12)


@pytest.mark.parametrize("value, axis", [
    ("E 041°51.234'", "lat"),   # longitude hemisphere given for a latitude
    ("N 41°55.678'", "lon"),
    ("41°55.678'", "lat"),      # no hemisphere: the sign would be a guess
    ("N 41°60.000'", "lat"),    # minutes out of range
    ("N 91°00.000'", "lat"),
    ("E 181°00.000'", "lon"),
    ("N 41°55'12\"", "lat"),    # degrees, minutes, seconds
    ("41.9", "lat"),            # decimal degrees belong in a JSON number
    (True, "lat"),
])
def test_parse_coordinate_rejects(value, axis):
    with pytest.raises(mg.GeoreferenceError):
        mg.parse_coordinate(value, axis)


def test_control_points_in_degrees_decimal_minutes():
    def to_ddm(value, positive, negative):
        degrees, minutes = divmod(abs(value) * 60, 60)
        return f"{positive if value >= 0 else negative} {int(degrees):03d}°{minutes:.6f}'"

    cfg = synthetic_map()
    for cp in cfg["control_points"]:
        cp["lat"] = to_ddm(cp["lat"], "N", "S")
        cp["lon"] = to_ddm(cp["lon"], "E", "W")
    assert all(r["error"] < 0.01 for r in mg.residuals_px(cfg))
    fitted = mg.fit(cfg)
    assert fitted["origin_x"] == pytest.approx(cfg["origin_x"], abs=0.1)
    assert fitted["resolution"] == pytest.approx(cfg["resolution"], rel=1e-7)


def test_bad_control_point_coordinate_names_the_point():
    cfg = synthetic_map()
    cfg["control_points"][2]["lat"] = "E 041°51.234'"
    with pytest.raises(mg.GeoreferenceError, match=cfg["control_points"][2]["label"]):
        mg.fit(cfg)


def test_alignment_tolerance_defaults_to_two_pixels():
    assert mg.alignment_tolerance_px(synthetic_map()) == mg.DEFAULT_ALIGNMENT_TOLERANCE_PX == 2.0
    assert mg.alignment_tolerance_px(dict(synthetic_map(), alignment_tolerance_px=12)) == 12.0


@pytest.mark.parametrize("value", [0, -1, "12", True, None])
def test_alignment_tolerance_rejects(value):
    with pytest.raises(mg.GeoreferenceError, match="alignment_tolerance_px"):
        mg.alignment_tolerance_px(dict(synthetic_map(), alignment_tolerance_px=value))


def test_dumps_map_config_keeps_one_control_point_per_line():
    import json
    cfg = synthetic_map()
    cfg["control_points"][0]["lat"] = "N 53° 10.025"
    text = mg.dumps_map_config(cfg)
    assert json.loads(text) == cfg
    assert text.endswith("}\n")
    lines = text.splitlines()
    point_lines = [l for l in lines if l.lstrip().startswith('{ "label"')]
    assert len(point_lines) == len(cfg["control_points"])
    assert point_lines[0].startswith('        { "label": "P0", ') and "N 53° 10.025" in point_lines[0]
    assert json.loads(mg.dumps_map_config({k: v for k, v in cfg.items() if k != "control_points"})) == {
        k: v for k, v in cfg.items() if k != "control_points"
    }
