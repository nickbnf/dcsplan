"""Tests for compute_leg_segments — mirrors the TypeScript test suite."""

import pytest
from flight_plan import compute_leg_segments, apply_wind, Regime, RegimeCruise, RegimeClimb, RegimeDescent


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
