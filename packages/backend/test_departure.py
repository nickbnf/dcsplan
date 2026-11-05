"""
Unit tests for departure.py (runway departure on leg 1).

Mirrors packages/frontend/src/utils/departure.test.ts.
"""

import math

import pytest
from pyproj import Transformer

from departure import (
    DepartureTiming, build_departure_path, departure_schedule, schedule_air_distance_nm,
    schedule_tas_at, straight_out_distance_nm,
)
from flight_plan import (
    Aircraft, FlightPlan, FlightPlanTurnPoint, Point, Regime, RegimeClimb, RegimeCruise,
    TakeoffPerformance, calculate_straigthening_point,
)

NM = 1852
# Transverse Mercator on the equator at lon 0: projected metres are ground metres.
TRANSFORMER = Transformer.from_crs(
    "EPSG:4326", "+proj=tmerc +lat_0=0 +lon_0=0 +k=1.0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
    always_xy=True,
)
INVERSE = Transformer.from_crs(TRANSFORMER.target_crs, TRANSFORMER.source_crs, always_xy=True)


def at(nm, brg):
    r = math.radians(brg)
    lon, lat = INVERSE.transform(nm * NM * math.sin(r), nm * NM * math.cos(r))
    return lat, lon


def xy(lat, lon):
    return TRANSFORMER.transform(lon, lat)


def wpt(pos, **kw):
    lat, lon = pos
    base = dict(lat=lat, lon=lon, tas=400, alt=0, fuelFlow=3600, windSpeed=0, windDir=0)
    base.update(kw)
    return FlightPlanTurnPoint(**base)


def plan(wp1, ground_alt=0, **wp1_kw):
    return FlightPlan(
        theatre="syria",
        points=[wpt(at(0, 0), groundAlt=ground_alt, runway=27), wpt(wp1, **wp1_kw)],
        declination=0, bankAngle=30, initTimeSec=0, initFob=10000,
    )


CLIMB = Regime(id="r1", name="Climb", cruise=RegimeCruise(tas=450, ff=4000), climb=RegimeClimb(tas=300, ff=8000, roc=4000))


def aircraft(**kw):
    return Aircraft(regimes=[CLIMB], **kw)


def build(p, ac, straight_out_nm=2.0):
    return build_departure_path(
        p.points[0], p.points[1], 270, straight_out_nm,
        departure_schedule(p, ac), p.bankAngle, TRANSFORMER,
    )


def test_straight_out_default_and_value():
    assert straight_out_distance_nm(Aircraft()) == 2
    assert straight_out_distance_nm(Aircraft(straightOutDistance=3.5)) == 3.5


class TestSchedule:
    climbing = plan(at(30, 90), regimeId="r1", alt=20000)

    def test_linear_when_d_is_half_vc_t(self):
        s = departure_schedule(self.climbing, aircraft(takeoff=TakeoffPerformance(timeSec=60, fuel=200, distance=2.5)))
        assert schedule_tas_at(s, 0) == 0
        assert schedule_tas_at(s, 30) == pytest.approx(150, abs=1e-9)
        assert schedule_tas_at(s, 60) == 300

    def test_takeoff_covers_distance(self):
        s = departure_schedule(self.climbing, aircraft(takeoff=TakeoffPerformance(timeSec=75, fuel=250, distance=1.8)))
        assert abs(schedule_air_distance_nm(s, 0, 75) - 1.8) * NM < 1

    def test_constant_fallback(self):
        s = departure_schedule(self.climbing, aircraft(takeoff=TakeoffPerformance(timeSec=60, fuel=200, distance=6)))
        assert schedule_tas_at(s, 1) == pytest.approx(360)
        assert schedule_tas_at(s, 59) == pytest.approx(360)

    def test_no_takeoff_block_starts_at_climb_tas(self):
        s = departure_schedule(self.climbing, aircraft())
        assert s.takeoff_end_sec == 0
        assert schedule_tas_at(s, 0) == 300
        assert s.transition_end_sec == pytest.approx(300)
        assert schedule_tas_at(s, 301) == 450

    def test_manual_leg_stored_tas(self):
        s = departure_schedule(plan(at(30, 90), tas=380, alt=20000), aircraft(takeoff=TakeoffPerformance(timeSec=60, fuel=200, distance=2.5)))
        assert len(s.pieces) == 1
        assert schedule_tas_at(s, 0) == 380


class TestPath:
    @staticmethod
    def manual(wp1):
        return plan(wp1, tas=400)

    def test_constant_speed_matches_circular_arc(self):
        p = self.manual(at(20, 0))
        path = build(p, Aircraft())
        start = Point(*at(2, 270))
        radius = (400 * 0.514) ** 2 / (9.80665 * math.tan(math.radians(30)))
        _, s_lat, s_lon = calculate_straigthening_point(270, start, Point(p.points[1].lat, p.points[1].lon), radius, TRANSFORMER, "projected")
        ex, ey = xy(s_lat, s_lon)
        ax, ay = xy(path.roll_out_lat, path.roll_out_lon)
        assert math.hypot(ax - ex, ay - ey) < 1

    def test_auto_direction(self):
        assert build(self.manual(at(20, 0)), Aircraft()).turn_direction == -1
        assert build(self.manual(at(20, 180)), Aircraft()).turn_direction == 1

    def test_on_axis_no_turn(self):
        path = build(self.manual(at(10, 270)), Aircraft())
        assert abs(path.turn_angle_rad) < 1e-6
        assert path.roll_out_s == pytest.approx(2, abs=1e-6)

    def test_behind_airfield(self):
        path = build(self.manual(at(20, 90)), Aircraft())
        assert 170 < abs(math.degrees(path.turn_angle_rad)) < 210

    def test_accelerating_turn_widens(self):
        p = plan(at(20, 90), regimeId="r1", alt=20000)
        path = build(p, aircraft(takeoff=TakeoffPerformance(timeSec=60, fuel=200, distance=2.5)), 0.5)
        i = next(k for k, s in enumerate(path.samples) if s.t > path.turn_start_t)

        def rate(k):
            a, b = path.samples[k], path.samples[k + 1]
            return abs(b.track - a.track) / (b.s - a.s)

        assert rate(len(path.samples) - 3) < rate(i)

    def test_top_of_climb_in_turn(self):
        p = plan(at(20, 90), regimeId="r1", alt=1000)
        path = build(p, aircraft(), 0.5)
        before = [s for s in path.samples if path.turn_start_t < s.t <= 15]
        after = [s for s in path.samples if 15 < s.t < path.roll_out_t]

        def radius_m(a, b):
            return (b.s - a.s) / math.radians(abs(b.track - a.track)) * NM

        def r(tas):
            return (tas * 0.514) ** 2 / (9.80665 * math.tan(math.radians(30)))

        assert radius_m(before[0], before[-1]) == pytest.approx(r(300), rel=1e-3)
        assert radius_m(after[0], after[-1]) == pytest.approx(r(450), rel=1e-3)

    def test_unreachable_closer_than_straight_out(self):
        assert build(self.manual(at(1.5, 90)), Aircraft()) is None

    def test_unreachable_inside_turn(self):
        assert build(self.manual(at(2.2, 280)), Aircraft()) is None


class TestTiming:
    p = plan(at(20, 90), regimeId="r1", alt=20000)

    def timing(self):
        path = build(self.p, aircraft(takeoff=TakeoffPerformance(timeSec=60, fuel=200, distance=1.5)))
        return DepartureTiming(path, 90)

    def test_still_air(self):
        t = self.timing()
        assert t.ground_distance(0, 60, 0, 0) == pytest.approx(1.5)
        assert t.ground_distance(60, 200, 0, 0) == pytest.approx(300 * 140 / 3600)
        assert t.time_over(5, 25, 450, 0, 0) == pytest.approx(20 / 450 * 60)

    def test_runway_headwind(self):
        assert self.timing().ground_distance(0, 60, 20, 270) == pytest.approx(1.5 - 20 * 60 / 3600, abs=1e-6)
