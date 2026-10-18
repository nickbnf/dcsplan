"""Contract: the request bodies the frontend builds (shared fixture, pinned by
frontend/src/utils/wireFormat.test.ts) validate against the backend's request
models (AD-2 wire format: aircraft is a sibling of flightPlan)."""
import json
import os

from flight_plan import ImportFlightPlanRequest, KneeboardRequest

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "shared", "wire-format-fixtures", "requests.json"
)


def load():
    with open(FIXTURE_PATH) as f:
        return json.load(f)


def test_kneeboard_body_validates():
    req = KneeboardRequest.model_validate(load()["kneeboard"]["body"])
    assert req.aircraft.model == "F-15E"
    assert [e.id for e in req.flightPlan.librarySnapshot] == ["sam"]
    assert [r.uuid for r in req.flightPlan.libraryRefs] == ["sam", "gone"]


def test_import_body_validates():
    req = ImportFlightPlanRequest.model_validate(load()["import"]["body"])
    assert req.version == "1.6" and req.aircraft.model == "A-10C"
