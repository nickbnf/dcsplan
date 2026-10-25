"""Plan version routes (add-version-history tasks 5.1-5.3; design D5;
spec: version-history)."""
import asyncio
import base64

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pycrdt import Array, Doc, Map
from starlette.middleware.sessions import SessionMiddleware

import asset_routes
import plans
import space_routes
import sync
import users
import version_routes
import versions
from migrations_runner import apply_migrations

P1, P2, P3 = "AAAAAAAAAAA1", "AAAAAAAAAAA2", "AAAAAAAAAAA3"
ENTRY = {"id": "e1", "type": "sam", "lat": 42.0, "lon": 41.0, "name": "SA-10", "range": 25.0}


@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    db = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", db)
    apply_migrations(db)
    monkeypatch.setattr(sync.sync_server, "rooms", {})
    monkeypatch.setattr(sync, "_finalize_locks", {})

    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    app.include_router(space_routes.router)
    app.include_router(asset_routes.router)
    app.include_router(version_routes.router)
    client = TestClient(app)

    def login_as(discord_id: str, name: str = "Falcon") -> dict:
        user = asyncio.run(users.upsert_user(discord_id, display_name=name))
        app.dependency_overrides[space_routes.require_user] = lambda: user
        client.get("/spaces/me")
        return user

    return client, login_as


def b64(update: bytes) -> str:
    return base64.b64encode(update).decode()


def device_doc(plan_id: str) -> Doc:
    """A device's copy of the plan, loaded from the server's log."""
    doc = Doc()
    for u in asyncio.run(plans.load_updates(plan_id)):
        doc.apply_update(u)
    return doc


def create_plan(client, plan_id=P1, name="Alpha", entry_ids=()):
    doc = Doc()
    fp = doc.get("flightPlan", type=Map)
    fp["name"] = name
    if entry_ids:
        fp["libraryRefs"] = Array([Map({"uuid": e}) for e in entry_ids])
    resp = client.post("/plans", json={
        "id": plan_id, "name": name, "theatre": "caucasus", "initialState": b64(doc.get_update()),
    })
    assert resp.status_code == 201


def rename(client, plan_id, name, **extra):
    doc = device_doc(plan_id)
    doc.get("flightPlan", type=Map)["name"] = name
    return client.post(f"/plans/{plan_id}/versions", json={"update": b64(doc.get_update()), **extra})


# --- 5.1 GET /plans/{id}/versions ------------------------------------------------

def test_lists_versions_newest_first_with_editor_names(ctx):
    client, login_as = ctx
    user = login_as("d-1", "Falcon")
    create_plan(client)
    rename(client, P1, "Bravo")
    rename(client, P1, "Charlie")
    body = client.get(f"/plans/{P1}/versions").json()
    assert [v["rev"] for v in body["versions"]] == [2, 1]
    assert body["versions"][0]["editors"] == [{"id": user["id"], "displayName": "Falcon"}]
    assert body["versions"][0]["restoredFrom"] is None
    assert body["pending"] is False


def test_pending_follows_unfinalized_edits(ctx):
    client, login_as = ctx
    login_as("d-1")
    create_plan(client)
    assert client.get(f"/plans/{P1}/versions").json() == {"versions": [], "pending": True}
    rename(client, P1, "Bravo")
    doc = device_doc(P1)
    before = doc.get_state()
    doc.get("flightPlan", type=Map)["name"] = "Unsaved"
    asyncio.run(plans.append_update(P1, doc.get_update(before)))
    assert client.get(f"/plans/{P1}/versions").json()["pending"] is True


def test_foreign_unknown_and_trashed_plans_are_refused(ctx):
    client, login_as = ctx
    login_as("d-2")
    create_plan(client, P2)
    login_as("d-1")
    create_plan(client, P1)
    assert client.get(f"/plans/{P2}/versions").status_code == 404
    assert client.get(f"/plans/{P3}/versions").status_code == 404
    assert client.get("/plans/not-a-plan/versions").status_code == 404
    client.delete(f"/plans/{P1}")
    assert client.get(f"/plans/{P1}/versions").status_code == 410
    assert rename(client, P1, "Late").status_code == 410


# --- 5.2 POST /plans/{id}/versions -------------------------------------------------

def test_posting_new_content_creates_a_version_and_reposting_returns_it(ctx):
    client, login_as = ctx
    user = login_as("d-1", "Falcon")
    create_plan(client)
    doc = device_doc(P1)
    doc.get("flightPlan", type=Map)["name"] = "Bravo"
    first = client.post(f"/plans/{P1}/versions", json={"update": b64(doc.get_update())})
    assert first.status_code == 200
    assert first.json()["rev"] == 1
    assert first.json()["editors"] == [{"id": user["id"], "displayName": "Falcon"}]
    again = client.post(f"/plans/{P1}/versions", json={"update": b64(doc.get_update())})
    assert again.json() == first.json()


def test_restored_from_credits_the_caller(ctx):
    client, login_as = ctx
    login_as("d-1", "Falcon")
    create_plan(client)
    rename(client, P1, "Bravo")
    viper = login_as("d-1", "Viper")  # same account, renamed: names are read at display
    resp = rename(client, P1, "Alpha", restoredFrom=1)
    assert resp.json()["rev"] == 2
    assert resp.json()["restoredFrom"] == 1
    assert resp.json()["editors"] == [{"id": viper["id"], "displayName": "Viper"}]


def test_restoring_an_unknown_rev_is_404(ctx):
    client, login_as = ctx
    login_as("d-1")
    create_plan(client)
    assert rename(client, P1, "Bravo", restoredFrom=9).status_code == 404


@pytest.mark.parametrize("bad", ["not base64!", "Z2FyYmFnZQ=="])  # the second is base64 of b"garbage"
def test_malformed_update_is_422(ctx, bad):
    client, login_as = ctx
    login_as("d-1")
    create_plan(client)
    assert client.post(f"/plans/{P1}/versions", json={"update": bad}).status_code == 422


def test_a_plan_without_content_returns_null(ctx):
    client, login_as = ctx
    login_as("d-1")
    assert client.post("/plans", json={"id": P1, "name": "Draft", "theatre": "caucasus"}).status_code == 201
    resp = client.post(f"/plans/{P1}/versions", json={"update": b64(Doc().get_update())})
    assert resp.status_code == 200
    assert resp.json() is None


# --- 5.3 GET …/versions/{rev}/state and …/pinned-entries ---------------------------

def test_version_state_applies_to_a_fresh_doc(ctx):
    client, login_as = ctx
    login_as("d-1")
    create_plan(client)
    rename(client, P1, "Bravo")
    rename(client, P1, "Charlie")
    body = client.get(f"/plans/{P1}/versions/1/state").json()
    doc = Doc()
    doc.apply_update(base64.b64decode(body["state"]))
    assert doc.get("flightPlan", type=Map)["name"] == "Bravo"
    assert client.get(f"/plans/{P1}/versions/7/state").status_code == 404


def test_pinned_entries_carry_their_theatre(ctx):
    client, login_as = ctx
    login_as("d-1")
    lib = client.get("/libraries", params={"theatre": "caucasus"}).json()[0]["id"]
    assert client.put(f"/libraries/{lib}/entries/e1", json={"entry": ENTRY}).status_code in (200, 201)
    create_plan(client, entry_ids=("e1",))
    rename(client, P1, "Bravo")
    body = client.get(f"/plans/{P1}/pinned-entries").json()
    assert body == {"entries": {"e1": {"theatre": "caucasus", "entry": ENTRY}}}
