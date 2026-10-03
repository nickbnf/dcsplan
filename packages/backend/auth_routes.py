"""Discord OAuth + session routes (D3/D4/D5).

- login  : generate a CSRF `state`, stash it in the signed session, redirect to Discord.
- callback: verify `state`, exchange the code, fetch the profile, upsert the user,
            set the session, redirect back to the app.
- me     : report the current signed-in user, or anonymous.
- logout : clear the session.

The OAuth handshake uses httpx-oauth's DiscordOAuth2; "who is logged in" is the
signed session cookie (Starlette SessionMiddleware), not the OAuth library.
"""
import logging
import secrets
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from httpx_oauth.clients.discord import DiscordOAuth2

import users
from auth_config import AuthConfig, AuthConfigError, load_auth_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

DISCORD_ME_URL = "https://discord.com/api/users/@me"

_config: Optional[AuthConfig] = None
_client: Optional[DiscordOAuth2] = None


def init_auth() -> bool:
    """Load config + build the Discord client. Returns True if auth is configured."""
    global _config, _client
    try:
        _config = load_auth_config()
    except AuthConfigError as exc:
        logger.warning("Auth disabled — %s", exc)
        _config = None
        _client = None
        return False
    _client = DiscordOAuth2(_config.discord_client_id, _config.discord_client_secret)
    logger.info("Discord auth configured")
    return True


def _require_auth() -> tuple[AuthConfig, DiscordOAuth2]:
    if _config is None or _client is None:
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    return _config, _client


async def _fetch_discord_profile(access_token: str) -> dict:
    """Fetch the signed-in Discord user's profile (identify scope)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            DISCORD_ME_URL, headers={"Authorization": f"Bearer {access_token}"}
        )
        resp.raise_for_status()
        return resp.json()


async def get_current_user(request: Request) -> Optional[dict]:
    """Dependency: the current signed-in user row, or None if anonymous."""
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    return await users.get_user_by_id(user_id)


@router.get("/discord/login")
async def discord_login(request: Request):
    config, client = _require_auth()
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    url = await client.get_authorization_url(
        config.discord_redirect_uri, state=state, scope=["identify"]
    )
    return RedirectResponse(url)


@router.get("/discord/callback")
async def discord_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    config, client = _require_auth()
    expected_state = request.session.pop("oauth_state", None)

    # User cancelled or Discord denied — remain anonymous, no account change.
    if error:
        logger.info("Discord authorization failed or cancelled: %s", error)
        return RedirectResponse(config.post_login_redirect)

    # Reject any callback that does not match a sign-in this app initiated.
    if (
        not code
        or not state
        or not expected_state
        or not secrets.compare_digest(state, expected_state)
    ):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    token = await client.get_access_token(code, config.discord_redirect_uri)
    profile = await _fetch_discord_profile(token["access_token"])

    user = await users.upsert_user(
        discord_id=str(profile["id"]),
        display_name=profile.get("global_name") or profile.get("username"),
        avatar=profile.get("avatar"),
    )
    request.session["user_id"] = user["id"]
    return RedirectResponse(config.post_login_redirect)


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "discord_id": user["discord_id"],
        "display_name": user["display_name"],
        "avatar": user["avatar"],
    }


@router.get("/me")
async def me(request: Request):
    user = await get_current_user(request)
    if user is None:
        # Session referenced a deleted user, or no session at all.
        request.session.pop("user_id", None)
        return {"authenticated": False}
    return {"authenticated": True, "user": _public_user(user)}


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"authenticated": False}
