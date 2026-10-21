"""Space + plan-index route tests (tasks 3.1/3.2/3.3; spec: space).

Auth is exercised via the `require_user` dependency: overridden to a seeded user
for authenticated cases, and left in place (with an empty session) for the 401
path.
"""
import asyncio

P1, P2, PD = "AAAAAAAAAAA1", "AAAAAAAAAAA2", "AAAAAAAAAAAD"

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

import space_routes
import users
from db import connect
from migrations_runner import apply_migrations


@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    db = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", db)
    apply_migrations(db)

    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    app.include_router(space_routes.router)
    client = TestClient(app)

    def login_as(discord_id: str) -> dict:
        user = asyncio.run(users.upsert_user(discord_id))
        app.dependency_overrides[space_routes.require_user] = lambda: user
        return user

    return app, client, login_as


# --- 3.1 GET /spaces/me ----------------------------------------------------

def test_spaces_me_creates_personal_space_once(ctx):
    app, client, login_as = ctx
    user = login_as("d-1")

    first = client.get("/spaces/me").json()
    second = client.get("/spaces/me").json()
    assert first["id"] == second["id"]
    assert first["kind"] == "personal"
    assert first["role"] == "owner"  # add-trash-and-soft-delete D6

    async def counts():
        async with connect() as c:
            async with c.execute("SELECT COUNT(*) AS n FROM spaces WHERE kind='personal'") as cur:
                spaces_n = (await cur.fetchone())["n"]
            async with c.execute(
                "SELECT COUNT(*) AS n FROM space_members WHERE user_id=? AND role='owner'",
                (user["id"],),
            ) as cur:
                members_n = (await cur.fetchone())["n"]
            return spaces_n, members_n

    spaces_n, members_n = asyncio.run(counts())
    assert spaces_n == 1 and members_n == 1


def test_spaces_me_anonymous_401(ctx):
    _app, client, _login = ctx  # no dependency override -> empty session -> anonymous
    assert client.get("/spaces/me").status_code == 401


# --- 3.2 GET /plans --------------------------------------------------------

def test_list_returns_only_callers_plans_and_excludes_deleted(ctx):
    app, client, login_as = ctx

    login_as("d-2")
    client.get("/spaces/me")
    client.post("/plans", json={"id": P2, "name": "Other", "theatre": "nevada"})

    login_as("d-1")
    client.get("/spaces/me")
    client.post("/plans", json={"id": P1, "name": "Mine", "theatre": "caucasus"})
    client.post("/plans", json={"id": PD, "name": "Doomed", "theatre": "caucasus"})

    async def soft_delete():
        async with connect() as c:
            await c.execute("UPDATE plans SET deleted_at = 't' WHERE id = 'AAAAAAAAAAAD'")

    asyncio.run(soft_delete())

    listed = client.get("/plans").json()
    assert [p["id"] for p in listed] == [P1]  # not P2 (other user), not PD (deleted)
    assert listed[0]["name"] == "Mine" and listed[0]["theatre"] == "caucasus"


# --- 3.3 POST / PATCH /plans ----------------------------------------------

def test_create_plan_success(ctx):
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    resp = client.post("/plans", json={"id": P1, "name": "Alpha", "theatre": "caucasus"})
    assert resp.status_code == 201
    assert resp.json()["id"] == P1


def test_duplicate_names_are_allowed(ctx):
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    assert client.post("/plans", json={"id": P1, "name": "Alpha", "theatre": "caucasus"}).status_code == 201
    assert client.post("/plans", json={"id": P2, "name": "Alpha", "theatre": "caucasus"}).status_code == 201
    assert [p["name"] for p in client.get("/plans").json()].count("Alpha") == 2


def test_duplicate_id_is_409(ctx):
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    client.post("/plans", json={"id": P1, "name": "Alpha", "theatre": "caucasus"})
    dup = client.post("/plans", json={"id": P1, "name": "Bravo", "theatre": "caucasus"})
    assert dup.status_code == 409


@pytest.mark.parametrize("bad_id", ["p1", "AAAAAAAAAAA", "AAAAAAAAAAA0", "AAAAAAAAAAAl", "a" * 13, "../etc/passwd"])
def test_malformed_id_is_422(ctx, bad_id):
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    resp = client.post("/plans", json={"id": bad_id, "name": "Alpha", "theatre": "caucasus"})
    assert resp.status_code == 422


def test_rename_route_is_gone(ctx):
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    client.post("/plans", json={"id": P1, "name": "Alpha", "theatre": "caucasus"})
    assert client.patch(f"/plans/{P1}", json={"name": "Bravo"}).status_code in (404, 405)


# --- POST /plans with initialState (add-local-data-import D1) ---------------

def _initial_state() -> str:
    import base64
    from pycrdt import Doc, Map
    doc = Doc()
    doc["flightPlan"] = fp = Map()
    fp["name"] = "Imported"
    return base64.b64encode(doc.get_update()).decode()


def test_create_plan_with_initial_state(ctx):
    import plans
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    resp = client.post("/plans", json={"id": P1, "name": "Imported", "theatre": "caucasus", "initialState": _initial_state()})
    assert resp.status_code == 201
    assert asyncio.run(plans.count_updates(P1)) == 1


def test_create_plan_without_initial_state_stores_no_content(ctx):
    import plans
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    assert client.post("/plans", json={"id": P1, "name": "Alpha", "theatre": "caucasus"}).status_code == 201
    assert asyncio.run(plans.count_updates(P1)) == 0


@pytest.mark.parametrize("bad", ["not base64!", "Z2FyYmFnZQ=="])  # the second is base64 of b"garbage"
def test_invalid_initial_state_is_422(ctx, bad):
    import plans
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    resp = client.post("/plans", json={"id": P1, "name": "Alpha", "theatre": "caucasus", "initialState": bad})
    assert resp.status_code == 422
    assert all(p["id"] != P1 for p in client.get("/plans").json())


def test_oversized_create_plan_body_is_413(ctx):
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    huge = "A" * (space_routes.MAX_CREATE_PLAN_BODY_BYTES + 1)
    resp = client.post("/plans", json={"id": P1, "name": "Alpha", "theatre": "caucasus", "initialState": huge})
    assert resp.status_code == 413


def test_duplicate_id_with_initial_state_is_409(ctx):
    app, client, login_as = ctx
    login_as("d-1")
    client.get("/spaces/me")
    body = {"id": P1, "name": "Imported", "theatre": "caucasus", "initialState": _initial_state()}
    assert client.post("/plans", json=body).status_code == 201
    assert client.post("/plans", json=body).status_code == 409
