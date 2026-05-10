"""Tests for compute_leg_segments — mirrors the TypeScript test suite."""

import pytest
from flight_plan import compute_leg_segments, apply_wind, Regime, RegimeCruise, RegimeClimb, RegimeDescent, TakeoffPerformance


def make_regime(**kwargs):
    return Regime(
        id='r1',
        name='Test Regime',
        cruise=RegimeCruise(tas=400, ff=3600),
        **kwargs,
    )


NO_WIND = dict(wind_a_speed=0, wind_a_dir=0, wind_b_speed=0, wind_b_dir=0)
BASE = dict(distance_nm=50, course=0, tas=400, ff=3600, **NO_WIND)


class TestComputeLegSegments:
    def test_level_leg_manual_no_regime(self):
        result = compute_leg_segments(prev_alt=10000, leg_alt=10000, **BASE)
        assert result['kind'] == 'level'
        assert result['tas'] == 400
        assert result['ff'] == 3600

    def test_level_leg_with_regime_altdelta_zero(self):
        result = compute_leg_segments(prev_alt=10000, leg_alt=10000, **BASE, regime=make_regime())
        assert result['kind'] == 'level'

    def test_climbing_leg_with_full_climb_data(self):
        regime = make_regime(climb=RegimeClimb(tas=300, ff=4000, roc=2000))
        # altDelta = 10000 ft, roc = 2000 fpm → transitionTime = 5 min
        # transitionGS = 300 kts (no wind) → transitionDistance = 300 * (5/60) = 25 nm
        result = compute_leg_segments(prev_alt=0, leg_alt=10000, **BASE, regime=regime)
        assert result['kind'] == 'segmented'
        assert result['transition']['phase'] == 'climb'
        assert abs(result['transition']['time'] - 5.0) < 1e-5
        assert abs(result['transition']['distance'] - 25.0) < 1e-5
        assert abs(result['transition']['fuel'] - 4000 * (5 / 60)) < 1e-3
        assert abs(result['cruise']['distance'] - 25.0) < 1e-5

    def test_climbing_leg_without_climb_data_falls_back_to_cruise(self):
        regime = make_regime()  # no climb
        result = compute_leg_segments(prev_alt=0, leg_alt=10000, **BASE, regime=regime)
        assert result['kind'] == 'level'

    def test_descending_leg_with_full_descent_data(self):
        regime = make_regime(descent=RegimeDescent(tas=300, ff=2000, rod=2000))
        result = compute_leg_segments(prev_alt=10000, leg_alt=0, **BASE, regime=regime)
        assert result['kind'] == 'segmented'
        assert result['transition']['phase'] == 'descent'
        assert abs(result['transition']['time'] - 5.0) < 1e-5

    def test_descending_leg_without_descent_data_falls_back_to_cruise(self):
        regime = make_regime()
        result = compute_leg_segments(prev_alt=10000, leg_alt=0, **BASE, regime=regime)
        assert result['kind'] == 'level'

    def test_manual_leg_with_alt_delta_returns_level(self):
        result = compute_leg_segments(prev_alt=0, leg_alt=10000, **BASE)
        assert result['kind'] == 'level'
        assert result['tas'] == 400

    def test_over_long_climb_fires_warning(self):
        regime = make_regime(climb=RegimeClimb(tas=300, ff=4000, roc=2000))
        # altDelta = 30000 ft → transitionTime = 15 min → transitionDistance = 75 nm > 50 nm
        result = compute_leg_segments(prev_alt=0, leg_alt=30000, **BASE, regime=regime)
        assert result['kind'] == 'warning'
        assert result['reason'] == 'transition-too-long'
        assert result['transition_distance'] > 50
        assert result['reachable_alt_delta'] > 0

    def test_over_long_descent_fires_warning(self):
        regime = make_regime(descent=RegimeDescent(tas=300, ff=2000, rod=2000))
        result = compute_leg_segments(prev_alt=30000, leg_alt=0, **BASE, regime=regime)
        assert result['kind'] == 'warning'
        assert result['reachable_alt_delta'] < 0

    def test_level_leg_no_regime_unchanged(self):
        # Level, no regime: ground speed should equal TAS (no wind)
        result = compute_leg_segments(prev_alt=10000, leg_alt=10000, **BASE)
        assert result['kind'] == 'level'
        gs = apply_wind(result['tas'], 0, 0, 0)
        assert abs(gs - 400) < 1e-10


class TestTakeoffSegment:
    """T/O segment scenarios matching the TypeScript legCalculations.test.ts suite."""

    def make_regime_with_climb(self):
        return Regime(
            id='r1', name='Test',
            cruise=RegimeCruise(tas=400, ff=3600),
            climb=RegimeClimb(tas=300, ff=4000, roc=2000),
        )

    TO = TakeoffPerformance(timeSec=75, fuel=250, distance=1.8)
    ZERO_TO = TakeoffPerformance(timeSec=0, fuel=0, distance=0)
    NO_WIND = dict(wind_a_speed=0, wind_a_dir=0, wind_b_speed=0, wind_b_dir=0)

    def test_leg0_with_takeoff_and_climb_yields_three_phases(self):
        # T/O: 75s/250lb/1.8nm + climb 10000ft + cruise
        regime = self.make_regime_with_climb()
        result = compute_leg_segments(
            prev_alt=0, leg_alt=10000, distance_nm=100, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=regime, leg_index=0, takeoff=self.TO,
        )
        assert result['kind'] == 'segmented'
        assert result.get('takeoff') is not None
        assert abs(result['takeoff']['time'] - 1.25) < 1e-5
        assert abs(result['takeoff']['distance'] - 1.8) < 1e-5
        assert abs(result['takeoff']['fuel'] - 250) < 1e-5
        assert result['transition']['phase'] == 'climb'
        assert abs(result['transition']['time'] - 5.0) < 1e-5
        assert abs(result['transition']['distance'] - 25.0) < 1e-5
        # cruise: remaining = 100 - 1.8 = 98.2, cruise_dist = 98.2 - 25 = 73.2
        assert abs(result['cruise']['distance'] - 73.2) < 1e-3

    def test_leg0_with_takeoff_and_no_climb_yields_two_phases(self):
        # Regime has no climb data → no_transition=True → T/O + cruise
        regime = Regime(id='r1', name='Test', cruise=RegimeCruise(tas=400, ff=3600))
        result = compute_leg_segments(
            prev_alt=0, leg_alt=10000, distance_nm=100, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=regime, leg_index=0, takeoff=self.TO,
        )
        assert result['kind'] == 'segmented'
        assert result.get('takeoff') is not None
        assert result['transition']['time'] == 0
        # cruise covers remaining 100 - 1.8 = 98.2 nm
        assert abs(result['cruise']['distance'] - 98.2) < 1e-3

    def test_leg0_zero_takeoff_reproduces_two_phase_result(self):
        # Zero T/O block → falls through to normal 2-phase computation
        regime = self.make_regime_with_climb()
        result_with_zero_to = compute_leg_segments(
            prev_alt=0, leg_alt=10000, distance_nm=50, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=regime, leg_index=0, takeoff=self.ZERO_TO,
        )
        result_baseline = compute_leg_segments(
            prev_alt=0, leg_alt=10000, distance_nm=50, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=regime,
        )
        assert result_with_zero_to['kind'] == result_baseline['kind']
        assert result_with_zero_to.get('takeoff') is None
        assert abs(result_with_zero_to['transition']['time'] - result_baseline['transition']['time']) < 1e-5
        assert abs(result_with_zero_to['cruise']['distance'] - result_baseline['cruise']['distance']) < 1e-5

    def test_leg0_manual_mode_skips_takeoff(self):
        # No regime → level result even with takeoff set
        result = compute_leg_segments(
            prev_alt=0, leg_alt=10000, distance_nm=50, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=None, leg_index=0, takeoff=self.TO,
        )
        assert result['kind'] == 'level'

    def test_leg1_ignores_takeoff(self):
        # leg_index=1 → T/O not applied
        regime = self.make_regime_with_climb()
        result_leg1 = compute_leg_segments(
            prev_alt=0, leg_alt=10000, distance_nm=100, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=regime, leg_index=1, takeoff=self.TO,
        )
        result_baseline = compute_leg_segments(
            prev_alt=0, leg_alt=10000, distance_nm=100, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=regime,
        )
        assert result_leg1.get('takeoff') is None
        assert abs(result_leg1['cruise']['distance'] - result_baseline['cruise']['distance']) < 1e-5

    def test_takeoff_time_and_fuel_verbatim_under_any_wind(self):
        # T/O time and fuel are taken verbatim from the spec, not affected by wind
        regime = Regime(id='r1', name='Test', cruise=RegimeCruise(tas=400, ff=3600))
        result_no_wind = compute_leg_segments(
            prev_alt=10000, leg_alt=10000, distance_nm=100, course=0,
            wind_a_speed=0, wind_a_dir=0, wind_b_speed=0, wind_b_dir=0,
            tas=400, ff=3600, regime=regime, leg_index=0, takeoff=self.TO,
        )
        result_tailwind = compute_leg_segments(
            prev_alt=10000, leg_alt=10000, distance_nm=100, course=0,
            wind_a_speed=50, wind_a_dir=180, wind_b_speed=50, wind_b_dir=180,
            tas=400, ff=3600, regime=regime, leg_index=0, takeoff=self.TO,
        )
        # Time and fuel verbatim
        assert result_no_wind['takeoff']['time'] == pytest.approx(result_tailwind['takeoff']['time'])
        assert result_no_wind['takeoff']['fuel'] == pytest.approx(result_tailwind['takeoff']['fuel'])

    def test_takeoff_distance_shrinks_with_headwind(self):
        regime = Regime(id='r1', name='Test', cruise=RegimeCruise(tas=400, ff=3600))
        result_no_wind = compute_leg_segments(
            prev_alt=10000, leg_alt=10000, distance_nm=100, course=0,
            wind_a_speed=0, wind_a_dir=0, wind_b_speed=0, wind_b_dir=0,
            tas=400, ff=3600, regime=regime, leg_index=0, takeoff=self.TO,
        )
        result_headwind = compute_leg_segments(
            prev_alt=10000, leg_alt=10000, distance_nm=100, course=0,
            wind_a_speed=20, wind_a_dir=0, wind_b_speed=20, wind_b_dir=0,
            tas=400, ff=3600, regime=regime, leg_index=0, takeoff=self.TO,
        )
        assert result_headwind['takeoff']['distance'] < result_no_wind['takeoff']['distance']

    def test_takeoff_distance_grows_with_tailwind(self):
        regime = Regime(id='r1', name='Test', cruise=RegimeCruise(tas=400, ff=3600))
        result_no_wind = compute_leg_segments(
            prev_alt=10000, leg_alt=10000, distance_nm=100, course=0,
            wind_a_speed=0, wind_a_dir=0, wind_b_speed=0, wind_b_dir=0,
            tas=400, ff=3600, regime=regime, leg_index=0, takeoff=self.TO,
        )
        result_tailwind = compute_leg_segments(
            prev_alt=10000, leg_alt=10000, distance_nm=100, course=0,
            wind_a_speed=20, wind_a_dir=180, wind_b_speed=20, wind_b_dir=180,
            tas=400, ff=3600, regime=regime, leg_index=0, takeoff=self.TO,
        )
        assert result_tailwind['takeoff']['distance'] > result_no_wind['takeoff']['distance']

    def test_warning_fires_when_to_plus_climb_exceeds_leg(self):
        regime = self.make_regime_with_climb()
        # T/O is 1.8nm, climb for 30000ft at 300kts/2000fpm = 75nm → total 76.8nm > 50nm
        result = compute_leg_segments(
            prev_alt=0, leg_alt=30000, distance_nm=50, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=regime, leg_index=0, takeoff=self.TO,
        )
        assert result['kind'] == 'warning'
        assert result['transition_distance'] > 50

    def test_warning_fires_when_to_alone_exceeds_leg(self):
        # T/O distance > leg distance, no climb
        big_to = TakeoffPerformance(timeSec=3600, fuel=5000, distance=100)
        regime = Regime(id='r1', name='Test', cruise=RegimeCruise(tas=400, ff=3600))
        result = compute_leg_segments(
            prev_alt=10000, leg_alt=10000, distance_nm=50, course=0,
            **self.NO_WIND, tas=400, ff=3600,
            regime=regime, leg_index=0, takeoff=big_to,
        )
        assert result['kind'] == 'warning'


class TestApplyWind:
    def test_no_wind(self):
        assert apply_wind(400, 0, 0, 0) == pytest.approx(400.0)

    def test_pure_tailwind(self):
        # wind from 180 (south), flying north (course=0) → tailwind
        gs = apply_wind(400, 20, 180, 0)
        assert gs == pytest.approx(420.0)

    def test_pure_headwind(self):
        # wind from 0 (north), flying north (course=0) → headwind
        gs = apply_wind(400, 20, 0, 0)
        assert gs == pytest.approx(380.0)

    def test_crosswind_has_no_tail_component(self):
        # wind from 90 (east), flying north (course=0) → pure crosswind → GS unchanged
        gs = apply_wind(400, 20, 90, 0)
        assert abs(gs - 400) < 0.1
