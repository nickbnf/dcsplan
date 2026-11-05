"""
Departure path on the kneeboard leg map and the overview map (departure, "Backend departure parity").
"""

import math

import pytest
from PIL import Image, ImageDraw

import map_annotations
from flight_plan import FlightPlan, FlightPlanData
from kneeboard import MAP_HEIGHT, MAP_WIDTH, generate_leg_map
from overview_map_page import generate_overview_map_page


def _plan():
    pt = {"tas": 400, "alt": 3000, "fuelFlow": 6000, "windSpeed": 10, "windDir": 0}
    # Runway 27 with WP1 east of the airfield: the departure turns back over WP0
    return FlightPlan(
        theatre="syria", declination=6.0, bankAngle=30.0, initTimeSec=36000, initFob=8000,
        points=[
            {"lat": 34.0, "lon": 36.0, "runway": 27, "groundAlt": 0, **pt},
            {"lat": 34.0, "lon": 36.4, **pt},
            {"lat": 34.3, "lon": 36.6, **pt},
        ],
    )


@pytest.fixture
def recorded_legs(monkeypatch):
    """Record every draw_leg call (leg, coord_to_pixel, image size) while still drawing."""
    calls = []
    original = map_annotations.draw_leg

    def recording(draw, leg_data, coord_to_pixel, *args, **kwargs):
        calls.append((leg_data, coord_to_pixel, draw.im.size))
        return original(draw, leg_data, coord_to_pixel, *args, **kwargs)

    monkeypatch.setattr(map_annotations, "draw_leg", recording)
    return calls


def _departure_pixels(calls):
    leg_calls = [c for c in calls if getattr(c[0], "departure_path", None) is not None]
    assert leg_calls, "leg 1 with its departure path was not drawn"
    leg, to_px, size = leg_calls[-1]
    return [to_px(lat, lon) for lat, lon in leg.departure_path.points], size


def test_draw_leg_draws_the_departure_polyline():
    plan = _plan()
    leg = FlightPlanData(plan).legData[0]
    assert leg.departure_path is not None
    image = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    lat0, lon0 = plan.points[0].lat, plan.points[0].lon

    def to_px(lat, lon):
        # 2000 px per degree, WP0 at the centre
        return 200 + (lon - lon0) * 2000 * math.cos(math.radians(lat0)), 200 - (lat - lat0) * 2000

    map_annotations.draw_leg(ImageDraw.Draw(image), leg, to_px)
    # A point on the runway segment, west of WP0 and outside its circle, is painted
    rx, ry = to_px(*leg.departure_path.points[1])
    mx, my = (200 + rx) / 2, (200 + ry) / 2
    assert math.hypot(mx - 200, my - 200) > 12
    assert image.getpixel((round(mx), round(my)))[3] > 0


def test_overview_map_contains_the_departure(recorded_legs):
    plan = _plan()
    generate_overview_map_page(plan, FlightPlanData(plan))
    pixels, (w, h) = _departure_pixels(recorded_legs)
    assert all(0 <= x <= w and 0 <= y <= h for x, y in pixels)


def test_leg_map_contains_the_departure(recorded_legs):
    plan = _plan()
    png = generate_leg_map(plan, FlightPlanData(plan), 0)
    assert png
    pixels, _ = _departure_pixels(recorded_legs)
    # Pixels are on the rotated image; the page is a MAP_WIDTH x MAP_HEIGHT crop of it
    # centred on the straight part of the leg. Check against that crop.
    leg = FlightPlanData(plan).legData[0]
    _, to_px, _ = recorded_legs[-1]
    sx, sy = to_px(leg.straigthening_point.lat, leg.straigthening_point.lon)
    dx, dy = to_px(leg.destination.lat, leg.destination.lon)
    cx, cy = (sx + dx) / 2, (sy + dy) / 2
    assert all(abs(x - cx) <= MAP_WIDTH / 2 and abs(y - cy) <= MAP_HEIGHT / 2 for x, y in pixels)
