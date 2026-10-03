"""Tests for auth config loading (D3)."""
import pytest

from auth_config import AuthConfig, AuthConfigError, load_auth_config

FULL_ENV = {
    "DISCORD_CLIENT_ID": "cid",
    "DISCORD_CLIENT_SECRET": "csecret",
    "DISCORD_REDIRECT_URI": "https://dcsplan.bonnefon.org/api/auth/discord/callback",
    "SESSION_SECRET": "s3cret",
}


def test_loads_when_all_present():
    config = load_auth_config(FULL_ENV)
    assert isinstance(config, AuthConfig)
    assert config.discord_client_id == "cid"
    assert config.post_login_redirect == "/"  # default


def test_missing_all_vars_raises_with_clear_message():
    with pytest.raises(AuthConfigError) as exc:
        load_auth_config({})
    message = str(exc.value)
    for name in FULL_ENV:
        assert name in message


def test_missing_single_var_named_in_message():
    partial = dict(FULL_ENV)
    del partial["SESSION_SECRET"]
    with pytest.raises(AuthConfigError) as exc:
        load_auth_config(partial)
    assert "SESSION_SECRET" in str(exc.value)
    assert "DISCORD_CLIENT_ID" not in str(exc.value)
