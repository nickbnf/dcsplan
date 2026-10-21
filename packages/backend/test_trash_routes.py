"""Trash and reference routes (add-trash-and-soft-delete tasks 3.1-3.3, 3.5;
spec: soft-delete, space; design D2, D3, D6)."""
import asyncio
import base64

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pycrdt import Array, Doc, Map
from starlette.middleware.sessions import SessionMiddleware

import asset_routes
import space_routes
import sync
import users
from db import connect
from migrations_runner import apply_migrations

P1, P2, P3 = "AAAAAAAAAAA1", "AAAAAAAAAAA2", "AAAAAAAAAAA3"
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
    monkeypatch.setattr(sync.sync_server, "rooms", {})

    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    app.include_router(space_routes.router)
    app.include_router(asset_routes.router)
    client = TestClient(app)

    def login_as(discord_id: str) -> dict:
        user = asyncio.run(users.upsert_user(discord_id))
        app.dependency_overrides[space_routes.require_user] = lambda: user
        client.get("/spaces/me")
        return user

    return client, login_as


def plan_state(profile_id=None, entry_ids=()) -> str:
    doc = Doc()
    y_plan = doc.get("flightPlan", type=Map)
    y_plan["name"] = "Plan"
    if profile_id:
        y_plan["profileId"] = profile_id
    if entry_ids:
        y_plan["libraryRefs"] = Array([Map({"uuid": e}) for e in entry_ids])
    return base64.b64encode(doc.get_update()).decode()


def create_plan(client, plan_id, name="Plan", **refs):
    resp = client.post("/plans", json={
        "id": plan_id, "name": name, "theatre": "caucasus", "initialState": plan_state(**refs),
    })
    assert resp.status_code == 201


def library_id(client) -> str:
    return client.get("/libraries", params={"theatre": "caucasus"}).json()[0]["id"]


def set_role(user_id, role):
    async def go():
        async with connect() as c:
            await c.execute("UPDATE space_members SET role = ? WHERE user_id = ?", (role, user_id))
    asyncio.run(go())


# --- 3.1 DELETE /plans/{id} ----------------------------------------------------

def test_delete_plan_moves_it_out_of_the_list(ctx):
    client, login_as = ctx
    login_as("d-1")
    create_plan(client, P1, "Alpha")
    create_plan(client, P2, "Bravo")
    assert client.delete(f"/plans/{P1}").status_code == 204
    assert [p["id"] for p in client.get("/plans").json()] == [P2]


def test_delete_plan_404_for_unknown_foreign_or_trashed(ctx):
    client, login_as = ctx
    login_as("d-2")
    create_plan(client, P2)
    login_as("d-1")
    create_plan(client, P1)
    assert client.delete(f"/plans/{P3}").status_code == 404      # unknown
    assert client.delete(f"/plans/{P2}").status_code == 404      # another space's
    assert client.delete("/plans/not-a-plan").status_code == 404
    assert client.delete(f"/plans/{P1}").status_code == 204
    assert client.delete(f"/plans/{P1}").status_code == 404      # already trashed


# --- 3.2 GET /trash ------------------------------------------------------------

def test_trash_lists_all_three_kinds(ctx):
    client, login_as = ctx
    login_as("d-1")
    lid = library_id(client)
    create_plan(client, P1, "Alpha")
    client.put(f"/libraries/{lid}/entries/e1", json={"baseSeq": None, "entry": ENTRY})
    client.put("/profiles/pr1", json={"baseSeq": None, "profile": PROFILE})
    client.delete(f"/plans/{P1}")
    client.delete(f"/libraries/{lid}/entries/e1")
    client.delete("/profiles/pr1")
    body = client.get("/trash").json()
    assert [(p["id"], p["name"], p["theatre"]) for p in body["plans"]] == [(P1, "Alpha", "caucasus")]
    assert body["plans"][0]["deletedAt"]
    assert [(e["id"], e["theatre"], e["entry"]["name"]) for e in body["entries"]] == [("e1", "caucasus", "SA-10")]
    assert [(p["id"], p["profile"]["aircraft"]["model"]) for p in body["profiles"]] == [("pr1", "F-15E")]
    assert body["retentionDays"] == 30


def test_trash_excludes_other_spaces(ctx):
    client, login_as = ctx
    login_as("d-2")
    create_plan(client, P2)
    client.delete(f"/plans/{P2}")
    login_as("d-1")
    assert client.get("/trash").json()["plans"] == []


# --- 3.3 Restore -----------------------------------------------------------------

def test_restore_all_three_kinds(ctx):
    client, login_as = ctx
    login_as("d-1")
    lid = library_id(client)
    create_plan(client, P1, "Alpha")
    client.put(f"/libraries/{lid}/entries/e1", json={"baseSeq": None, "entry": ENTRY})
    client.put("/profiles/pr1", json={"baseSeq": None, "profile": PROFILE})
    client.delete(f"/plans/{P1}")
    client.delete(f"/libraries/{lid}/entries/e1")
    client.delete("/profiles/pr1")

    plan = client.post(f"/plans/{P1}/restore")
    assert plan.status_code == 200 and plan.json()["name"] == "Alpha"
    entry = client.post(f"/libraries/{lid}/entries/e1/restore")
    assert entry.status_code == 200 and entry.json()["entry"]["name"] == "SA-10"
    profile = client.post("/profiles/pr1/restore")
    assert profile.status_code == 200 and profile.json()["profile"]["aircraft"]["regimes"][0]["id"] == "r1"

    assert [p["id"] for p in client.get("/plans").json()] == [P1]
    assert client.get("/trash").json() == {"plans": [], "entries": [], "profiles": [], "retentionDays": 30}


def test_restore_404_when_not_trashed(ctx):
    client, login_as = ctx
    login_as("d-1")
    lid = library_id(client)
    create_plan(client, P1)
    client.put("/profiles/pr1", json={"baseSeq": None, "profile": PROFILE})
    assert client.post(f"/plans/{P1}/restore").status_code == 404         # live
    assert client.post(f"/plans/{P3}/restore").status_code == 404         # unknown
    assert client.post("/profiles/pr1/restore").status_code == 404        # live
    assert client.post(f"/libraries/{lid}/entries/nope/restore").status_code == 404
    assert client.post("/libraries/other/entries/e1/restore").status_code == 404


def test_restore_of_another_spaces_plan_is_404(ctx):
    client, login_as = ctx
    login_as("d-2")
    create_plan(client, P2)
    client.delete(f"/plans/{P2}")
    login_as("d-1")
    assert client.post(f"/plans/{P2}/restore").status_code == 404


def test_restore_requires_admin_role(ctx):
    client, login_as = ctx
    user = login_as("d-1")
    lid = library_id(client)
    create_plan(client, P1)
    client.put("/profiles/pr1", json={"baseSeq": None, "profile": PROFILE})
    client.delete(f"/plans/{P1}")
    client.delete("/profiles/pr1")
    set_role(user["id"], "member")
    assert client.get("/spaces/me").json()["role"] == "member"
    assert client.post(f"/plans/{P1}/restore").status_code == 403
    assert client.post("/profiles/pr1/restore").status_code == 403
    assert client.post(f"/libraries/{lid}/entries/e1/restore").status_code == 403
    assert client.get("/trash").status_code == 200  # members may still see the Trash
    set_role(user["id"], "admin")
    assert client.post(f"/plans/{P1}/restore").status_code == 200


# --- 3.5 References --------------------------------------------------------------

def test_reference_counts(ctx):
    client, login_as = ctx
    login_as("d-1")
    create_plan(client, P1, profile_id="pr1", entry_ids=["e1", "e2"])
    create_plan(client, P2, profile_id="pr1", entry_ids=["e1"])
    create_plan(client, P3, profile_id="pr1")
    client.delete(f"/plans/{P3}")  # trashed plans are not counted
    assert client.get("/references/profiles/pr1").json() == {"plans": 2}
    assert client.get("/references/entries/e1").json() == {"plans": 2}
    assert client.get("/references/entries/e2").json() == {"plans": 1}
    assert client.get("/references/profiles/other").json() == {"plans": 0}


def test_routes_require_a_session(ctx):
    client, _ = ctx
    for method, path in [
        ("get", "/trash"), ("delete", f"/plans/{P1}"), ("post", f"/plans/{P1}/restore"),
        ("post", "/profiles/pr1/restore"), ("get", "/references/profiles/pr1"),
    ]:
        assert getattr(client, method)(path).status_code == 401
