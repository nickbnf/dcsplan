"""
Golden tests: leg values computed by FlightPlanData for a fixture plan on each
theatre must not change when the theatre/map configuration is reorganized
(add-theatre-maps). Regenerate with UPDATE_GOLDEN=1 only when a change in
computed values is intended.
"""
import json
import math
import os

import pytest

from flight_plan import FlightPlan, FlightPlanData

GOLDEN_DIR = os.path.join(os.path.dirname(__file__), '..', 'shared', 'theatre-golden')
PLANS_PATH = os.path.join(GOLDEN_DIR, 'plans.json')
EXPECTED_PATH = os.path.join(GOLDEN_DIR, 'backend-expected.json')


def load_plans():
    with open(PLANS_PATH) as f:
        return json.load(f)


def compute(plan_data):
    fp_data = FlightPlanData(FlightPlan(**plan_data))
    return [
        {
            'straighteningLat': leg.straigthening_point.lat,
            'straighteningLon': leg.straigthening_point.lon,
            'turnCenterLat': leg.turn_data.center.lat,
            'turnCenterLon': leg.turn_data.center.lon,
            'course': leg.course,
            'heading': leg.heading,
            'distanceNm': leg.distanceNm,
            'eteSec': leg.eteSec,
            'legFuel': leg.legFuel,
        }
        for leg in fp_data.legData
    ]


if os.environ.get('UPDATE_GOLDEN'):
    with open(EXPECTED_PATH, 'w') as f:
        json.dump({p['theatre']: compute(p) for p in load_plans()}, f, indent=2)


@pytest.mark.parametrize('plan', load_plans(), ids=lambda p: p['theatre'])
def test_leg_values_unchanged(plan):
    with open(EXPECTED_PATH) as f:
        expected = json.load(f)[plan['theatre']]
    actual = compute(plan)
    assert len(actual) == len(expected)
    for leg_actual, leg_expected in zip(actual, expected):
        for key, value in leg_expected.items():
            assert math.isclose(leg_actual[key], value, rel_tol=1e-9, abs_tol=1e-9), key
