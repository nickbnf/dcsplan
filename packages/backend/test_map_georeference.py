"""
Configuration check for every map in the catalogue (georeference-control-points
D5), and the pyproj side of the frontend/backend projection parity fixture (D6).

The parity fixture holds each control point projected with pyproj; the frontend
test projects the same points with proj4js. Regenerate it with UPDATE_GOLDEN=1
after adding or changing control points.
"""
import json
import math
import os

import pytest
from pyproj import CRS

import map_georeference as mg
import theatres

PARITY_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'shared', 'map-georeference', 'projected-control-points.json'
)

MAPS = [(theatre, map_id) for theatre in theatres.theatre_ids() for map_id in theatres.map_ids(theatre)]


def map_name(theatre, map_id):
    return f'{theatre}/{map_id}'


def configuration_errors(name, map_cfg):
    """Everything wrong with a map config's georeference, one message per problem."""
    missing = mg.missing_fields(map_cfg)
    if missing:
        return [f'{name}: missing {", ".join(missing)}']
    errors = []
    try:
        CRS.from_user_input(map_cfg['crs'])
    except Exception as e:  # pyproj raises CRSError, kept generic for the message
        return [f'{name}: crs does not parse: {e}']
    if 'bounds' in map_cfg:
        errors.append(f'{name}: stores bounds, which are computed from the georeference')
    try:
        mg.check_control_points(map_cfg)
        tolerance = mg.alignment_tolerance_px(map_cfg)
        residuals = mg.residuals_px(map_cfg)
    except mg.GeoreferenceError as e:
        return errors + [f'{name}: {e}']
    errors += [
        f'{name}: control point {r["label"]!r} is {r["error"]:.2f} px off (tolerance {tolerance:.2f} px)'
        for r in residuals
        if r['error'] > tolerance
    ]
    return errors


def projected_control_points(map_cfg):
    """Each control point in decimal degrees with its pyproj projection."""
    transformer = mg.transformer_for_crs(map_cfg['crs'])
    result = []
    for cp in map_cfg.get('control_points', []):
        lat, lon = mg.control_point_lat_lon(cp)
        x, y = transformer.transform(lon, lat)
        result.append({'label': cp.get('label', ''), 'lat': lat, 'lon': lon, 'x': x, 'y': y})
    return result


def parity_fixture():
    fixture = {}
    for theatre, map_id in MAPS:
        map_cfg = theatres.load_map(theatre, map_id)
        if map_cfg.get('control_points'):
            fixture[map_name(theatre, map_id)] = {
                'crs': map_cfg['crs'],
                'points': projected_control_points(map_cfg),
            }
    return fixture


if os.environ.get('UPDATE_GOLDEN'):
    os.makedirs(os.path.dirname(PARITY_PATH), exist_ok=True)
    with open(PARITY_PATH, 'w', encoding='utf-8') as f:
        json.dump(parity_fixture(), f, indent=2)
        f.write('\n')


@pytest.mark.parametrize('theatre, map_id', MAPS, ids=lambda v: v)
def test_map_georeference_is_consistent(theatre, map_id):
    errors = configuration_errors(map_name(theatre, map_id), theatres.load_map(theatre, map_id))
    assert not errors, '\n'.join(errors)


def test_check_names_map_point_and_error_after_hand_edit():
    theatre, map_id = next((t, m) for t, m in MAPS if theatres.load_map(t, m).get('control_points'))
    map_cfg = theatres.load_map(theatre, map_id)
    # Move each point onto where the georeference places it (0 px error), then
    # nudge the origin by 3 × resolution as a hand edit would.
    for cp, r in zip(map_cfg['control_points'], mg.residuals_px(map_cfg)):
        cp['px'] += r['dx']
        cp['py'] += r['dy']
    assert configuration_errors('scratch/copy', map_cfg) == []
    map_cfg['origin_x'] += 3 * map_cfg['resolution']
    map_cfg['alignment_tolerance_px'] = 2.0
    errors = configuration_errors('scratch/copy', map_cfg)
    label = map_cfg['control_points'][0].get('label', '')
    assert len(errors) == len(map_cfg['control_points'])
    assert any('scratch/copy' in e and repr(label) in e and '3.00 px' in e for e in errors), errors


def test_parity_fixture_is_up_to_date():
    with open(PARITY_PATH, encoding='utf-8') as f:
        stored = json.load(f)
    current = parity_fixture()
    assert sorted(stored) == sorted(current), 'regenerate with UPDATE_GOLDEN=1'
    for name, entry in current.items():
        assert stored[name]['crs'] == entry['crs'], name
        assert len(stored[name]['points']) == len(entry['points']), name
        for got, want in zip(stored[name]['points'], entry['points']):
            assert got['label'] == want['label'], name
            for key in ('lat', 'lon', 'x', 'y'):
                assert math.isclose(got[key], want[key], abs_tol=1e-6), (name, got['label'], key)
