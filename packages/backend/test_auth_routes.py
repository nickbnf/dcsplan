"""Tests for the Discord OAuth + session routes (D4/D5).

Discord is mocked; the flow uses a dedicated app with a non-secure session
cookie so the TestClient persists it over http.
"""
import asyncio
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

import auth_routes
import users
from migrations_runner import apply_migrations

FULL_ENV = {
    "DISCORD_CLIENT_ID": "cid",
    "DISCORD_CLIENT_SECRET": "csecret",
    "DISCORD_REDIRECT_URI": "https://dcsplan.bonnefon.org/api/auth/discord/callback",
    "SESSION_SECRET": "s3cret",
}

PROFILE = {"id": "discord-42", "username": "falcon", "global_name": "Falcon", "avatar": "av-hash"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", db)
    apply_migrations(db)
    for key, value in FULL_ENV.items():
        monkeypatch.setenv(key, value)
    assert auth_routes.init_auth() is True

    async def fake_get_access_token(code, redirect_uri, code_verifier=None):
        return {"access_token": "fake-token"}

    async def fake_fetch_profile(access_token):
        return dict(PROFILE)

    monkeypatch.setattr(auth_routes._client, "get_access_token", fake_get_access_token)
    monkeypatch.setattr(auth_routes, "_fetch_discord_profile", fake_fetch_profile)

    app = FastAPI()
    app.add_middleware(
        SessionMiddleware, secret_key="test-secret", https_only=False, same_site="lax"
    )
    app.include_router(auth_routes.router)
    return TestClient(app)


def _login_state(client) -> str:
    resp = client.get("/auth/discord/login", follow_redirects=False)
    assert resp.status_code in (302, 307)
    location = resp.headers["location"]
    assert location.startswith("https://discord.com/")
    return parse_qs(urlparse(location).query)["state"][0]


def test_login_redirects_to_discord_with_state(client):
    state = _login_state(client)
    assert state  # a state value was generated and included


def test_callback_success_creates_account_and_session(client):
    state = _login_state(client)
    resp = client.get(
        f"/auth/discord/callback?code=abc&state={state}", follow_redirects=False
    )
    assert resp.status_code in (302, 307)

    me = client.get("/auth/me").json()
    assert me["authenticated"] is True
    assert me["user"]["display_name"] == "Falcon"
    assert me["user"]["discord_id"] == "discord-42"

    # The account was persisted.
    assert asyncio.run(users.get_user_by_discord_id("discord-42")) is not None


def test_callback_rejects_mismatched_state(client):
    _login_state(client)  # establishes a real state in the session
    resp = client.get(
        "/auth/discord/callback?code=abc&state=WRONG", follow_redirects=False
    )
    assert resp.status_code == 400
    assert client.get("/auth/me").json()["authenticated"] is False


def test_callback_cancelled_stays_anonymous(client):
    _login_state(client)
    resp = client.get(
        "/auth/discord/callback?error=access_denied&state=whatever",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert client.get("/auth/me").json()["authenticated"] is False
    assert asyncio.run(users.get_user_by_discord_id("discord-42")) is None


def test_me_anonymous_by_default(client):
    assert client.get("/auth/me").json() == {"authenticated": False}


def test_logout_clears_session(client):
    state = _login_state(client)
    client.get(f"/auth/discord/callback?code=abc&state={state}", follow_redirects=False)
    assert client.get("/auth/me").json()["authenticated"] is True

    client.post("/auth/logout")
    assert client.get("/auth/me").json()["authenticated"] is False


def test_routes_return_503_when_auth_not_configured(tmp_path, monkeypatch):
    for key in FULL_ENV:
        monkeypatch.delenv(key, raising=False)
    assert auth_routes.init_auth() is False

    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="x", https_only=False)
    app.include_router(auth_routes.router)
    unconfigured = TestClient(app)
    assert unconfigured.get("/auth/discord/login", follow_redirects=False).status_code == 503
