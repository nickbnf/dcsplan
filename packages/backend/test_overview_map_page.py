"""
Tests for the overview map page generator.
"""

import io
import pytest
from PIL import Image

from flight_plan import FlightPlan, FlightPlanData
from overview_map_page import generate_overview_map_page


# ── Shared flight-plan fixtures ───────────────────────────────────────────────

def _make_point(lat, lon, **kwargs):
    base = {"tas": 400, "alt": 3000, "fuelFlow": 6000, "windSpeed": 10, "windDir": 0}
    base.update(kwargs)
    return {"lat": lat, "lon": lon, **base}


def _make_plan(points, **kwargs):
    base = {
        "theatre": "syria_old",
        "declination": 6.0,
        "bankAngle": 30.0,
        "initTimeSec": 36000,
        "initFob": 8000,
    }
    base.update(kwargs)
    base["points"] = points
    return base


@pytest.fixture
def minimal_plan():
    """Minimal 2-waypoint flight plan."""
    return _make_plan([
        _make_point(34.0, 36.0),
        _make_point(35.0, 37.0),
    ])


@pytest.fixture
def ns_plan():
    """North-south route (taller than wide → no rotation expected)."""
    return _make_plan([
        _make_point(33.0, 37.0),
        _make_point(36.0, 37.0),
    ])


@pytest.fixture
def ew_plan():
    """East-west route (wider than tall → 90-degree rotation expected)."""
    return _make_plan([
        _make_point(35.0, 34.0),
        _make_point(35.0, 40.0),
    ])


@pytest.fixture
def multi_type_plan():
    """Four waypoints with mixed waypoint types."""
    return _make_plan([
        _make_point(34.0, 36.0, waypointType="normal", name="START"),
        _make_point(34.5, 36.5, waypointType="ip",     name="IP1"),
        _make_point(35.0, 37.0, waypointType="tgt",    name="TGT1"),
        _make_point(35.5, 37.5, waypointType="normal", name="END"),
    ])


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_generates_valid_png(minimal_plan):
    """Function should return valid PNG bytes of the correct size."""
    fp = FlightPlan(**minimal_plan)
    fpd = FlightPlanData(fp)
    result = generate_overview_map_page(fp, fpd)

    assert isinstance(result, bytes)
    assert len(result) > 0
    # PNG magic bytes
    assert result[:8] == b'\x89PNG\r\n\x1a\n'

    img = Image.open(io.BytesIO(result))
    assert img.width == 768
    assert img.height == 1024


def test_north_south_route(ns_plan):
    """North-south route should produce a valid page without errors."""
    fp = FlightPlan(**ns_plan)
    fpd = FlightPlanData(fp)
    result = generate_overview_map_page(fp, fpd)

    assert result[:8] == b'\x89PNG\r\n\x1a\n'
    img = Image.open(io.BytesIO(result))
    assert (img.width, img.height) == (768, 1024)


def test_east_west_route(ew_plan):
    """East-west route should produce a valid page (rotation path exercised)."""
    fp = FlightPlan(**ew_plan)
    fpd = FlightPlanData(fp)
    result = generate_overview_map_page(fp, fpd)

    assert result[:8] == b'\x89PNG\r\n\x1a\n'
    img = Image.open(io.BytesIO(result))
    assert (img.width, img.height) == (768, 1024)


def test_multi_waypoint_mixed_types(multi_type_plan):
    """Route with normal/IP/TGT waypoints should render without errors."""
    fp = FlightPlan(**multi_type_plan)
    fpd = FlightPlanData(fp)
    result = generate_overview_map_page(fp, fpd)

    assert result[:8] == b'\x89PNG\r\n\x1a\n'
    img = Image.open(io.BytesIO(result))
    assert (img.width, img.height) == (768, 1024)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
