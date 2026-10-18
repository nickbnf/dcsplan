"""Library + profile route tests (add-library-profile-sync, tasks 2.1/2.2;
spec: space-asset-sync; design D3-D5).

Auth goes through `space_routes.require_user`, overridden to a seeded user for
authenticated cases and left in place (no session) for the 401 path.
"""
import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

import asset_routes
import space_routes
import users
from migrations_runner import apply_migrations

ENTRY = {"id": "e1", "type": "sam", "lat": 42.0, "lon": 41.0, "name": "SA-10", "range": 25.0}
PROFILE = {
    "aircraft": {
        "model": "F-15E", "takeoffConfiguration": "", "taxiFuel": 0,
        "takeoff": {"timeSec": 0, "fuel": 0, "distance": 0},
        "regimes": [{"id": "r1", "name": "Cruise", "cruise": {"tas": 450, "ff": 9000}}],
    },
}


@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    db = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", db)
    apply_migrations(db)

    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    app.include_router(asset_routes.router)
    client = TestClient(app)

    def login_as(discord_id: str) -> dict:
        user = asyncio.run(users.upsert_user(discord_id))
        app.dependency_overrides[space_routes.require_user] = lambda: user
        return user

    return client, login_as


def library_id(client, theatre="caucasus") -> str:
    libs = client.get("/libraries", params={"theatre": theatre}).json()
    assert len(libs) == 1
    return libs[0]["id"]


def put_entry(client, lid, entry=ENTRY, base_seq=None):
    return client.put(f"/libraries/{lid}/entries/{entry['id']}", json={"baseSeq": base_seq, "entry": entry})


# --- 2.1 -------------------------------------------------------------------------

def test_anonymous_gets_401(ctx):
    client, _ = ctx
    assert client.get("/libraries", params={"theatre": "caucasus"}).status_code == 401
    assert client.get("/changes").status_code == 401
    assert client.put("/profiles/p1", json={"profile": PROFILE}).status_code == 401


def test_another_spaces_library_is_404(ctx):
    client, login_as = ctx
    login_as("d-1")
    foreign = library_id(client)
    login_as("d-2")
    assert put_entry(client, foreign).status_code == 404
    assert client.delete(f"/libraries/{foreign}/entries/e1").status_code == 404


def test_entry_in_another_library_is_409(ctx):
    client, login_as = ctx
    login_as("d-1")
    assert put_entry(client, library_id(client, "caucasus")).status_code == 200
    assert put_entry(client, library_id(client, "syria")).status_code == 409


@pytest.mark.parametrize("body_patch", [
    {"entry": {**ENTRY, "colour": "red"}},                    # unknown entry field
    {"entry": ENTRY, "extra": 1},                             # unknown top-level field
    {"entry": {**ENTRY, "id": "other"}},                      # path id != body id
])
def test_entry_validation_is_422(ctx, body_patch):
    client, login_as = ctx
    login_as("d-1")
    lid = library_id(client)
    body = {"baseSeq": None, **body_patch}
    assert client.put(f"/libraries/{lid}/entries/e1", json=body).status_code == 422


@pytest.mark.parametrize("profile", [
    {**PROFILE, "name": "F-15E"},                                            # names are gone
    {**PROFILE, "aircraft": {**PROFILE["aircraft"], "fuelBurn": 1}},         # unknown aircraft field
    {**PROFILE, "aircraft": {**PROFILE["aircraft"], "regimes": [
        {"id": "r1", "name": "x", "cruise": {"tas": 1, "ff": 1, "mach": 0.8}}]}},  # nested unknown
])
def test_profile_validation_is_422(ctx, profile):
    client, login_as = ctx
    login_as("d-1")
    assert client.put("/profiles/p1", json={"profile": profile}).status_code == 422


def test_oversized_body_is_413(ctx):
    client, login_as = ctx
    login_as("d-1")
    lid = library_id(client)
    big = {**ENTRY, "defaultComment": "x" * (asset_routes.MAX_BODY_BYTES + 1)}
    assert put_entry(client, lid, big).status_code == 413


def test_response_shapes_for_each_write_rule(ctx):
    client, login_as = ctx
    login_as("d-1")
    lid = library_id(client)

    created = put_entry(client, lid).json()
    assert created == {"applied": True, "seq": created["seq"], "entry": ENTRY}

    ignored = put_entry(client, lid, {**ENTRY, "lat": 1.0}).json()            # create over live
    assert ignored["applied"] is False and ignored["entry"]["lat"] == 42.0

    edited = put_entry(client, lid, {**ENTRY, "name": "SA-11"}, created["seq"]).json()
    assert edited["applied"] is True and edited["entry"]["name"] == "SA-11"

    deleted = client.delete(f"/libraries/{lid}/entries/e1").json()
    assert deleted["applied"] is True

    stale = put_entry(client, lid, ENTRY, edited["seq"]).json()             # edit over tombstone
    assert stale == {"applied": False, "seq": deleted["seq"], "entry": None}

    revived = put_entry(client, lid).json()                                  # create over tombstone
    assert revived["applied"] is True and revived["entry"] == ENTRY

    profile = client.put("/profiles/p1", json={"profile": PROFILE}).json()
    assert profile["applied"] is True and profile["profile"]["id"] == "p1"
    assert profile["profile"]["aircraft"]["model"] == "F-15E"


# --- 2.2 -------------------------------------------------------------------------

def test_libraries_list_has_one_element(ctx):
    client, login_as = ctx
    login_as("d-1")
    first = client.get("/libraries", params={"theatre": "caucasus"}).json()
    second = client.get("/libraries", params={"theatre": "caucasus"}).json()
    assert len(first) == 1 and first == second


def test_changes_initial_and_incremental(ctx):
    client, login_as = ctx
    login_as("d-1")
    lid = library_id(client)
    put_entry(client, lid)
    put_entry(client, lid, {**ENTRY, "id": "e2"})
    client.put("/profiles/p1", json={"profile": PROFILE})
    client.delete(f"/libraries/{lid}/entries/e2")

    initial = client.get("/changes", params={"since": 0}).json()
    assert [l["id"] for l in initial["libraries"]] == [lid]
    assert {(e["id"], e["deleted"]) for e in initial["entries"]} == {("e1", False), ("e2", True)}
    assert [p["id"] for p in initial["profiles"]] == ["p1"]

    client.put("/profiles/p2", json={"profile": {"aircraft": {**PROFILE["aircraft"], "model": "A-10C"}}})
    later = client.get("/changes", params={"since": initial["cursor"]}).json()
    assert later["libraries"] == [] and later["entries"] == []
    assert [p["profile"]["aircraft"]["model"] for p in later["profiles"]] == ["A-10C"]
    assert later["cursor"] > initial["cursor"]
