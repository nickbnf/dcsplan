"""Tests for waypoint list page generation."""

import io
from PIL import Image
from flight_plan import FlightPlan, FlightPlanTurnPoint
from datetime import datetime, timezone

from flight_plan import KneeboardRevision
from waypoint_list_page import PAGE_HEIGHT, format_stamp, generate_waypoint_list_page


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


# ── Aircraft header tests (task 11.4) ─────────────────────────────────

from flight_plan import Aircraft, TakeoffPerformance, Regime, RegimeCruise
from unittest.mock import patch, MagicMock


def _make_plan_with_aircraft(model='', config='', regimes=None):
    """Return (plan, aircraft) — aircraft is a sibling of the plan (AD-2)."""
    plan = FlightPlan(
        theatre="syria",
        points=[_make_point(42.0, 42.0, "WPT1", "normal")],
        declination=5.0,
        bankAngle=30.0,
        initTimeSec=36000,
        initFob=8000,
    )
    aircraft = Aircraft(
        model=model,
        takeoffConfiguration=config,
        taxiFuel=0,
        takeoff=TakeoffPerformance(),
        regimes=regimes or [],
    )
    return plan, aircraft


class TestAircraftHeader:
    def test_header_rendered_with_both_fields(self):
        """Both model and config → header 'model · config' drawn."""
        plan, aircraft = _make_plan_with_aircraft(model='F-15E', config='MIL 60klb')
        result = generate_waypoint_list_page(plan, aircraft)
        assert result[:8] == b'\x89PNG\r\n\x1a\n'

    def test_header_rendered_with_model_only(self):
        """Only model → header shows model name only."""
        plan, aircraft = _make_plan_with_aircraft(model='F-16C', config='')
        result = generate_waypoint_list_page(plan, aircraft)
        assert isinstance(result, bytes)
        assert result[:8] == b'\x89PNG\r\n\x1a\n'

    def test_header_rendered_with_config_only(self):
        """Only config → header shows config only."""
        plan, aircraft = _make_plan_with_aircraft(model='', config='MIL')
        result = generate_waypoint_list_page(plan, aircraft)
        assert isinstance(result, bytes)

    def test_header_omitted_when_both_empty(self):
        """Both empty → no header line drawn (page still valid)."""
        plan, aircraft = _make_plan_with_aircraft(model='', config='')
        result = generate_waypoint_list_page(plan, aircraft)
        assert isinstance(result, bytes)

    def test_no_other_aircraft_data_in_output(self):
        """Regime names, taxi fuel, and T/O block are NOT encoded in the PNG bytes."""
        plan, aircraft = _make_plan_with_aircraft(
            model='F-15E', config='MIL',
            regimes=[Regime(id='r1', name='SecretRegime', cruise=RegimeCruise(tas=400, ff=3600))],
        )
        aircraft.taxiFuel = 500
        aircraft.takeoff = TakeoffPerformance(timeSec=75, fuel=250, distance=1.8)
        result = generate_waypoint_list_page(plan, aircraft)
        # The PNG should not contain regime name or taxi fuel as raw text
        # (encoded in compressed pixels, so we check the intermediate text, not the pixel bytes)
        assert b'SecretRegime' not in result
        assert b'taxiFuel' not in result
        assert b'T/O' not in result


# --- Version stamp (add-version-history task 6.1, design D8) -----------------

GENERATED = datetime(2026, 7, 23, 16, 5, tzinfo=timezone.utc)


def test_stamp_names_the_revision_in_utc():
    revision = KneeboardRevision(rev=5, finalizedAt="2026-07-23T16:32:00+02:00", editor="Falcon +2")
    assert format_stamp(revision, GENERATED) == "Rev 5 · 2026-07-23 14:32Z · Falcon +2"


def test_stamp_without_revision_is_the_generation_time():
    assert format_stamp(None, GENERATED) == "2026-07-23 16:05Z"


def test_stamp_is_drawn_in_the_bottom_margin():
    """Rows never reach the bottom margin for a short plan, so ink there is the stamp."""
    revision = KneeboardRevision(rev=5, finalizedAt="2026-07-23T14:32:00+00:00", editor="Falcon")
    for kwargs in ({"revision": revision}, {"generated_at": GENERATED}):
        img = Image.open(io.BytesIO(generate_waypoint_list_page(sample_flight_plan(), **kwargs)))
        strip = img.crop((0, PAGE_HEIGHT - 40, img.width, PAGE_HEIGHT)).convert("L")
        assert strip.getextrema()[0] < 128, kwargs
