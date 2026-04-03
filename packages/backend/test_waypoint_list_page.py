"""Tests for waypoint list page generation."""

import io
from PIL import Image
from flight_plan import FlightPlan, FlightPlanTurnPoint
from waypoint_list_page import generate_waypoint_list_page


def _make_point(lat, lon, name=None, wpt_type=None):
    return FlightPlanTurnPoint(
        lat=lat, lon=lon, tas=250, alt=20000,
        fuelFlow=2000, windSpeed=10, windDir=270,
        name=name, waypointType=wpt_type,
    )


def sample_flight_plan():
    return FlightPlan(
        theatre="syria",
        points=[
            _make_point(42.1723, 42.4687, "KUTAISI", "normal"),
            _make_point(41.9667, 43.2611, "WPT2", "normal"),
            _make_point(41.7537, 43.5073, "HOLD", "push"),
            _make_point(41.5017, 43.7648, "IP1", "ip"),
            _make_point(41.3425, 44.002, "TARGET", "tgt"),
            _make_point(41.5967, 43.8389, "EGRESS", "normal"),
        ],
        declination=5.0,
        bankAngle=30.0,
        initTimeSec=36000,
        initFob=8000,
    )


def test_returns_valid_png():
    result = generate_waypoint_list_page(sample_flight_plan())
    assert isinstance(result, bytes)
    # Check PNG magic bytes
    assert result[:8] == b'\x89PNG\r\n\x1a\n'


def test_image_dimensions():
    result = generate_waypoint_list_page(sample_flight_plan())
    img = Image.open(io.BytesIO(result))
    assert img.size == (768, 1024)


def test_single_waypoint():
    plan = FlightPlan(
        theatre="syria",
        points=[_make_point(42.0, 42.0, "ONLY", "normal")],
        declination=5.0,
        bankAngle=30.0,
        initTimeSec=36000,
        initFob=8000,
    )
    result = generate_waypoint_list_page(plan)
    img = Image.open(io.BytesIO(result))
    assert img.size == (768, 1024)


def test_no_name_waypoint():
    plan = FlightPlan(
        theatre="syria",
        points=[
            _make_point(42.0, 42.0, None, "normal"),
            _make_point(41.0, 43.0, None, "tgt"),
        ],
        declination=5.0,
        bankAngle=30.0,
        initTimeSec=36000,
        initFob=8000,
    )
    result = generate_waypoint_list_page(plan)
    assert isinstance(result, bytes)
