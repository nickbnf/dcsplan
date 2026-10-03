"""Auth configuration from the environment (D3).

Loads the Discord OAuth + session settings. `load_auth_config` fails fast with a
clear message naming every missing variable, so a misconfigured auth setup is
obvious rather than a confusing runtime crash. The rest of the backend (kneeboard
generation, tiles) keeps working without these set — the anonymous tier does not
depend on auth (AD-9); `main` catches the error and runs with auth disabled.
"""
import os
from dataclasses import dataclass
from typing import Mapping, Optional

from dotenv import load_dotenv

# Load a local .env if present (no-op in prod where real env vars are set).
load_dotenv()

REQUIRED_VARS = (
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_REDIRECT_URI",
    "SESSION_SECRET",
)


class AuthConfigError(RuntimeError):
    """Raised when required auth environment variables are missing."""


@dataclass(frozen=True)
class AuthConfig:
    discord_client_id: str
    discord_client_secret: str
    discord_redirect_uri: str
    session_secret: str
    post_login_redirect: str


def load_auth_config(env: Optional[Mapping[str, str]] = None) -> AuthConfig:
    """Build the AuthConfig, or raise AuthConfigError naming every missing var."""
    env = env if env is not None else os.environ
    missing = [name for name in REQUIRED_VARS if not env.get(name)]
    if missing:
        raise AuthConfigError(
            "Missing required auth environment variable(s): " + ", ".join(missing)
        )
    return AuthConfig(
        discord_client_id=env["DISCORD_CLIENT_ID"],
        discord_client_secret=env["DISCORD_CLIENT_SECRET"],
        discord_redirect_uri=env["DISCORD_REDIRECT_URI"],
        session_secret=env["SESSION_SECRET"],
        post_login_redirect=env.get("POST_LOGIN_REDIRECT", "/"),
    )
