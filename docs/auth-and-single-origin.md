# User accounts (Discord OAuth) + single-origin setup

Reference for configuring the `add-user-accounts` feature. Decisions behind this
live in `docs/architecture/centralized-flightplans.md` (AD-9, AD-11, AD-13) and
`openspec/changes/add-user-accounts/design.md`.

## Backend environment variables

Set these for the backend (`packages/backend`). A local `.env` is loaded
automatically (see `.env.example`); in production set real environment variables.

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_CLIENT_ID` | yes (for auth) | Discord application client id |
| `DISCORD_CLIENT_SECRET` | yes (for auth) | Discord application client secret |
| `DISCORD_REDIRECT_URI` | yes (for auth) | OAuth callback URL (must match the Discord app exactly) |
| `SESSION_SECRET` | yes (for auth) | Signing key for the session cookie |
| `POST_LOGIN_REDIRECT` | no (default `/`) | Where to send the browser after login |
| `SESSION_HTTPS_ONLY` | no (default `true`) | Set `false` for plain-http local dev without HTTPS |
| `DCSPLAN_DB_PATH` | no | SQLite file path (default: `packages/backend/data/dcsplan.db`) |

If the Discord/session variables are missing the backend still runs — the
anonymous tier does not depend on auth (AD-9) — but the `/auth/*` routes return
`503 Authentication is not configured` and a warning is logged at startup.

## TLS behind a corporate proxy (local dev)

The backend calls Discord over HTTPS during login. On a network with a
TLS-inspecting proxy (a custom root CA), the default `certifi` bundle does not
trust that root and the token exchange fails with
`CERTIFICATE_VERIFY_FAILED: self-signed certificate in certificate chain`.

`main.py` calls `truststore.inject_into_ssl()` at startup, which makes Python use
the **OS trust store** (macOS Keychain / Windows store / Linux `ca-certificates`).
The corporate root is normally already installed there, so login works with no
per-developer certificate setup. It is harmless in production, where the system
store holds the usual public CAs.

## Persistent data in production

The SQLite database lives in a dedicated `data/` directory
(`packages/backend/data/`) so it can be mounted as a persistent volume:

- **Container** (`Dockerfile`): the DB defaults to `/app/data/dcsplan.db` and
  `/app/data` is declared as a `VOLUME`.
- **Deploy** (manual `podman run` — see `packages/backend/DEPLOYMENT.md`): mount a
  host directory (e.g. `/var/lib/dcsplan/data`) at `/app/data`, and pass the
  Discord + session env vars to the container.

The directory is created automatically at startup if it does not exist. Only its
contents are gitignored; the `data/` directory itself is kept (via `.gitkeep`)
as a mount point.

## Registering the Discord application (task 3.2)

1. Go to the Discord Developer Portal → **Applications** → **New Application**.
2. Under **OAuth2**, copy the **Client ID** and **Client Secret** into the env vars above.
3. Add **Redirects** matching `DISCORD_REDIRECT_URI`:
   - Dev: `http://localhost:5173/api/auth/discord/callback` (through the Vite proxy)
   - Prod: `https://dcsplan.bonnefon.org/api/auth/discord/callback`
4. Scope used is `identify` (no email requested).
5. Verify: visiting `/api/auth/discord/login` redirects to the Discord consent screen for your client id.

## Single-origin routing via Caddy (task 5.3)

Both services run as separate processes; Caddy fronts them under **one origin**,
routing `/api/*` to the backend (prefix stripped) and everything else to the
frontend. This removes CORS and lets the session cookie be a plain
`SameSite=Lax` first-party cookie (D6).

```caddy
dcsplan.bonnefon.org {
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy localhost:5001
    }
    handle {
        reverse_proxy localhost:5000
    }
    log {
        output stdout
        format json
    }
}
```

The previous `api.dcsplan.bonnefon.org` host is no longer needed and can be retired.

In development the same shape is provided by the Vite dev proxy (see
`packages/frontend/vite.config.ts`): requests to `/api` are proxied to the
backend dev server, so the frontend always talks to a relative `/api` base.
