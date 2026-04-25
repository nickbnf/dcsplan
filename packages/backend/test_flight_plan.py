"""
Unit tests for waypoint types: Pydantic validation, Push time/fuel calculations,
and HACK ETA reset.
"""

import pytest
from flight_plan import (
    FlightPlan,
    FlightPlanTurnPoint,
    FlightPlanData,
    get_effective_exit_time,
)


def make_point(lat=34.0, lon=36.0, tas=400, alt=3000, fuelFlow=6000,
               windSpeed=0, windDir=0, name=None, waypointType=None,
               exitTimeSec=None, hack=None):
    kwargs = dict(lat=lat, lon=lon, tas=tas, alt=alt, fuelFlow=fuelFlow,
                  windSpeed=windSpeed, windDir=windDir)
    if name is not None:
        kwargs["name"] = name
    if waypointType is not None:
        kwargs["waypointType"] = waypointType
    if exitTimeSec is not None:
        kwargs["exitTimeSec"] = exitTimeSec
    if hack is not None:
        kwargs["hack"] = hack
    return FlightPlanTurnPoint(**kwargs)


def make_plan(points, initTimeSec=43200, initFob=12000, theatre="syria"):
    return FlightPlan(
        theatre=theatre,
        points=points,
        declination=0.0,
        bankAngle=30.0,
        initTimeSec=initTimeSec,
        initFob=initFob,
    )


# ── 1. Import/export round-trip (Pydantic validation) ──────────────────

class TestPydanticModels:
    def test_typed_waypoints_validate(self):
        """Flight plan with typed waypoints validates through Pydantic."""
        points = [
            make_point(lat=34.0, lon=36.0),
            make_point(lat=34.0, lon=36.5, waypointType="push",
                       exitTimeSec=44000, hack=True),
            make_point(lat=34.0, lon=37.0, waypointType="ip"),
            make_point(lat=34.0, lon=37.5, waypointType="tgt"),
        ]
        plan = make_plan(points)
        assert plan.points[1].waypointType == "push"
        assert plan.points[1].exitTimeSec == 44000
        assert plan.points[1].hack is True
        assert plan.points[2].waypointType == "ip"
        assert plan.points[3].waypointType == "tgt"

    def test_backward_compatibility(self):
        """Flight plan WITHOUT the new fields still validates (all optional)."""
        points = [
            make_point(lat=34.0, lon=36.0),
            make_point(lat=34.0, lon=37.0),
        ]
        plan = make_plan(points)
        assert plan.points[0].waypointType is None
        assert plan.points[0].exitTimeSec is None
        assert plan.points[0].hack is None

    def test_exit_time_validation_bounds(self):
        """exitTimeSec must be in [0, 86399]."""
        with pytest.raises(Exception):
            make_point(exitTimeSec=-1)
        with pytest.raises(Exception):
            make_point(exitTimeSec=86400)


# ── 2. get_effective_exit_time helper ───────────────────────────────────

class TestGetEffectiveExitTime:
    def test_none_returns_eta(self):
        assert get_effective_exit_time(None, 100) == 100

    def test_exit_before_eta_returns_eta(self):
        assert get_effective_exit_time(50, 100) == 100

    def test_exit_after_eta_returns_exit(self):
        assert get_effective_exit_time(200, 100) == 200


# ── 3. Push time/fuel calculation ───────────────────────────────────────

class TestPushTimeFuel:
    def _make_push_plan(self, exit_time_sec=44000, hack=False):
        """3-point plan: start -> push -> end, with a 10-minute wait at push."""
        points = [
            make_point(lat=34.0, lon=36.0),
            make_point(lat=34.0, lon=36.5, waypointType="push",
                       exitTimeSec=exit_time_sec, hack=hack),
            make_point(lat=34.0, lon=37.0),
        ]
        return make_plan(points, initTimeSec=43200, initFob=12000)

    def test_efr_at_push_includes_wait_fuel(self):
        """EFR at Push point includes wait fuel deduction."""
        plan_push = self._make_push_plan(exit_time_sec=50000)
        data_push = FlightPlanData(plan_push)

        # Also build a "normal" plan without push for comparison
        plan_normal = make_plan([
            make_point(lat=34.0, lon=36.0),
            make_point(lat=34.0, lon=36.5),
            make_point(lat=34.0, lon=37.0),
        ], initTimeSec=43200, initFob=12000)
        data_normal = FlightPlanData(plan_normal)

        # EFR at push point should be lower (more fuel burned due to wait)
        assert data_push.turnpointData[1].efr < data_normal.turnpointData[1].efr

    def test_eta_after_push_based_on_exit_time(self):
        """ETA at waypoints after Push is based on exit time, not arrival time."""
        exit_time = 50000
        plan = self._make_push_plan(exit_time_sec=exit_time)
        data = FlightPlanData(plan)

        # ETA at the push point itself is the arrival ETA (before wait)
        push_arrival_eta = data.turnpointData[1].etaSec
        assert push_arrival_eta < exit_time  # arrived before exit

        # ETA at the final point should be exit_time + ETE of last leg
        last_leg_ete = data.legData[1].eteSec
        # The final ETA should be based on exit_time, not push_arrival_eta
        expected_final_eta = exit_time + last_leg_ete
        assert data.turnpointData[2].etaSec == expected_final_eta

    def test_fuel_cascades_to_subsequent_waypoints(self):
        """Fuel at final waypoint accounts for push wait fuel."""
        plan = self._make_push_plan(exit_time_sec=50000)
        data = FlightPlanData(plan)

        # Final EFR = push EFR - leg2 fuel
        push_efr = data.turnpointData[1].efr
        leg2_fuel = data.legData[1].legFuel
        assert abs(data.turnpointData[2].efr - (push_efr - leg2_fuel)) < 0.1

    def test_no_effect_on_normal_waypoints(self):
        """Normal waypoints behave identically whether waypointType is set or not."""
        plan_a = make_plan([
            make_point(lat=34.0, lon=36.0),
            make_point(lat=34.0, lon=37.0),
        ])
        plan_b = make_plan([
            make_point(lat=34.0, lon=36.0, waypointType="normal"),
            make_point(lat=34.0, lon=37.0, waypointType="normal"),
        ])
        data_a = FlightPlanData(plan_a)
        data_b = FlightPlanData(plan_b)

        assert data_a.turnpointData[1].etaSec == data_b.turnpointData[1].etaSec
        assert abs(data_a.turnpointData[1].efr - data_b.turnpointData[1].efr) < 0.01


# ── 4. HACK ETA reset ──────────────────────────────────────────────────

class TestHackEtaReset:
    def _make_hack_plan(self, exit_time_sec=50000):
        points = [
            make_point(lat=34.0, lon=36.0),
            make_point(lat=34.0, lon=36.5, waypointType="push",
                       exitTimeSec=exit_time_sec, hack=True),
            make_point(lat=34.0, lon=37.0),
            make_point(lat=34.0, lon=37.5),
        ]
        return make_plan(points, initTimeSec=43200, initFob=12000)

    def test_hack_push_keeps_normal_eta(self):
        """Hack push point keeps its normal arrival ETA."""
        plan = self._make_hack_plan()
        data = FlightPlanData(plan)
        # The push point's ETA should be the normal arrival time
        assert data.turnpointData[1].etaSec < 50000

    def test_subsequent_waypoints_get_hack_eta(self):
        """Waypoints after hack push get hackEtaSec relative to exit time."""
        exit_time = 50000
        plan = self._make_hack_plan(exit_time_sec=exit_time)
        data = FlightPlanData(plan)

        # Waypoints before/at push: no hackEtaSec
        assert data.turnpointData[0].hackEtaSec is None
        # Push point itself may or may not have hackEtaSec (it gets set because
        # hackOffsetSec is set after processing it — check the logic)
        # Waypoints after push should have hackEtaSec
        assert data.turnpointData[2].hackEtaSec is not None
        assert data.turnpointData[3].hackEtaSec is not None

        # hackEtaSec = etaSec - exit_time
        for i in [2, 3]:
            expected = data.turnpointData[i].etaSec - exit_time
            assert data.turnpointData[i].hackEtaSec == expected

    def test_hack_does_not_affect_fuel(self):
        """Fuel calculations are identical whether hack is true or false."""
        points_hack = [
            make_point(lat=34.0, lon=36.0),
            make_point(lat=34.0, lon=36.5, waypointType="push",
                       exitTimeSec=50000, hack=True),
            make_point(lat=34.0, lon=37.0),
        ]
        points_no_hack = [
            make_point(lat=34.0, lon=36.0),
            make_point(lat=34.0, lon=36.5, waypointType="push",
                       exitTimeSec=50000, hack=False),
            make_point(lat=34.0, lon=37.0),
        ]
        data_hack = FlightPlanData(make_plan(points_hack))
        data_no_hack = FlightPlanData(make_plan(points_no_hack))

        for i in range(3):
            assert abs(data_hack.turnpointData[i].efr -
                       data_no_hack.turnpointData[i].efr) < 0.01
