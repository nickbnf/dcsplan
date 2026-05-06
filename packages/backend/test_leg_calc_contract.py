"""
Contract tests: compute_leg_segments must match shared JSON fixtures.
"""
import json
import os
import math
import pytest
from flight_plan import compute_leg_segments, Regime, RegimeCruise, RegimeClimb, RegimeDescent

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'shared', 'leg-calc-fixtures', 'fixtures.json'
)


def load_fixtures():
    with open(FIXTURE_PATH) as f:
        return json.load(f)


def build_regime(data):
    if data is None:
        return None
    return Regime(
        id=data['id'],
        name=data['name'],
        cruise=RegimeCruise(**data['cruise']),
        climb=RegimeClimb(**data['climb']) if data.get('climb') else None,
        descent=RegimeDescent(**data['descent']) if data.get('descent') else None,
    )


@pytest.mark.parametrize('fixture', load_fixtures(), ids=lambda f: f['name'])
def test_fixture(fixture):
    inp = fixture['input']
    expected = fixture['expected']
    regime = build_regime(inp.get('regime'))

    result = compute_leg_segments(
        prev_alt=inp['prevAlt'],
        leg_alt=inp['legAlt'],
        distance_nm=inp['distance'],
        course=inp['course'],
        wind_a_speed=inp['windA']['windSpeed'],
        wind_a_dir=inp['windA']['windDir'],
        wind_b_speed=inp['windB']['windSpeed'],
        wind_b_dir=inp['windB']['windDir'],
        tas=inp['tas'],
        ff=inp['ff'],
        regime=regime,
    )

    assert result['kind'] == expected['kind']

    if result['kind'] == 'level':
        assert math.isclose(result['tas'], expected['tas'], rel_tol=1e-3)
        assert math.isclose(result['ff'], expected['ff'], rel_tol=1e-3)

    if result['kind'] == 'segmented':
        assert result['transition']['phase'] == expected['transition']['phase']
        assert math.isclose(result['transition']['time'], expected['transition']['time'], rel_tol=1e-3)
        assert math.isclose(result['transition']['distance'], expected['transition']['distance'], rel_tol=1e-3)
        assert math.isclose(result['transition']['fuel'], expected['transition']['fuel'], rel_tol=1e-2)
        assert math.isclose(result['cruise']['time'], expected['cruise']['time'], rel_tol=1e-3)
        assert math.isclose(result['cruise']['distance'], expected['cruise']['distance'], rel_tol=1e-3)
        assert math.isclose(result['cruise']['fuel'], expected['cruise']['fuel'], rel_tol=1e-2)

    if result['kind'] == 'warning':
        assert result['reason'] == expected['reason']
        assert math.isclose(result['transition_distance'], expected['transitionDistance'], rel_tol=1e-2)
        assert math.isclose(result['reachable_alt_delta'], expected['reachableAltDelta'], rel_tol=1e-2)
