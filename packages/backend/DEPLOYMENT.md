# DCSPlan Backend Deployment Guide

This guide covers deploying the DCSPlan FastAPI backend using Podman.

## Prerequisites

- Podman installed on your server
- Static tiles directory prepared on the host
- GitHub Container Registry access (if pulling pre-built images)

## Static Directory Setup

The static tiles directory must be managed separately and mounted as a volume.

### Recommended Directory Structure

Store the static directory at one of these locations:
- `/opt/dcsplan/static` (recommended)
- `/var/lib/dcsplan/static`

### Directory Structure Requirements

Tiles are stored per theatre, then per map (`tiles/<theatre>/<map>/{z}/{x}/{y}.png`).
The theatre and map ids match the configs in `backend/theatres/<theatre>/maps/<map>.json`,
which ship inside the image.

```
static/
└── tiles/
    ├── caucasus/
    │   └── default/
    │       ├── 0/
    │       │   └── ...
    │       └── ...
    ├── germany/
    │   └── default/
    │       └── ...
    └── syria/
        └── default/
            └── ...
```

### Migrating to per-map tiles (add-theatre-maps)

Releases before add-theatre-maps stored tiles directly under `tiles/<theatre>/{z}/`.
Before deploying a release with theatre maps, move each theatre's zoom levels into
its `default` map:

```bash
cd /opt/dcsplan/static/tiles
for theatre in caucasus germany syria; do
  mkdir "$theatre/default"
  find "$theatre" -mindepth 1 -maxdepth 1 ! -name default -exec mv {} "$theatre/default/" \;
done
```

To roll back to an earlier release, move them back:

```bash
cd /opt/dcsplan/static/tiles
for theatre in caucasus germany syria; do
  mv "$theatre"/default/* "$theatre"/ && rmdir "$theatre/default"
done
```

### Permissions

Ensure the directory is readable by the container user:
```bash
sudo chown -R 1000:1000 /opt/dcsplan/static
sudo chmod -R 755 /opt/dcsplan/static
```

## Image Sources

### Option 1: Pull from GitHub Container Registry (Recommended)

Images are automatically built and pushed to GitHub Container Registry on each commit to main and on version tags.

```bash
# Pull the latest image
podman pull ghcr.io/<username>/<repo>/backend:latest

# Or pull a specific version
podman pull ghcr.io/<username>/<repo>/backend:v1.0.0
```

### Option 2: Build Locally

If you prefer to build locally:

```bash
cd packages/backend
podman build -t dcsplan-backend:latest .
```

## Running the Container

### Basic Run Command

```bash
podman run -d \
  --name dcsplan-backend \
  -p 5001:5001 \
  -v /var/lib/dcsplan/config:/app/config:ro \
  -v /var/lib/dcsplan/data:/app/data \
  -e DISCORD_CLIENT_ID="..." \
  -e DISCORD_CLIENT_SECRET="..." \
  -e DISCORD_REDIRECT_URI="https://dcsplan.bonnefon.org/api/auth/discord/callback" \
  -e SESSION_SECRET="<long-random-string>" \
  --restart=unless-stopped \
  ghcr.io/<username>/<repo>/backend:latest
```

The container listens on port **5001** (see `Dockerfile`), which Caddy proxies
under a single origin (see [auth-and-single-origin.md](../../docs/auth-and-single-origin.md)).

## Configuration

### Environment Variables

Auth (Discord OAuth + session). If unset, the backend still runs but `/auth/*`
returns `503` and the anonymous tier keeps working (AD-9):

- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`: from the Discord application
- `DISCORD_REDIRECT_URI`: must match the Discord app, e.g. `https://dcsplan.bonnefon.org/api/auth/discord/callback`
- `SESSION_SECRET`: signing key for the session cookie
- `SESSION_HTTPS_ONLY` (default `true`): set `false` only for plain-http local dev
- `DCSPLAN_DB_PATH` (optional): SQLite path (default `/app/data/dcsplan.db` in the container)

See [auth-and-single-origin.md](../../docs/auth-and-single-origin.md) for the full list.

> CORS was removed — the frontend and backend are served under one origin (D6),
> so there is no `CORS_ORIGINS` variable anymore.

### Port Mapping

Default mapping is `5001:5001` (host:container); the container listens on 5001
and Caddy proxies to `localhost:5001`. To use a different host port:

```bash
podman run -d \
  --name dcsplan-backend \
  -p 8080:5001 \  # Host port 8080 maps to container port 5001
  ...
```

### Volume Mounts

The static tiles directory must be mounted read-only:

```bash
-v /opt/dcsplan/static:/app/static:ro
```

The runtime data directory (SQLite database) must be mounted read-write so it
persists across container restarts:

```bash
-v /var/lib/dcsplan/data:/app/data
```

## Systemd Service (Optional)

For automatic startup on boot:

1. Copy the service file:
   ```bash
   sudo cp packages/backend/dcsplan-backend.service /etc/systemd/system/
   ```

2. Reload systemd:
   ```bash
   sudo systemctl daemon-reload
   ```

3. Enable and start the service:
   ```bash
   sudo systemctl enable dcsplan-backend.service
   sudo systemctl start dcsplan-backend.service
   ```

4. Check status:
   ```bash
   sudo systemctl status dcsplan-backend.service
   ```

## Updating Containers

When new images are available:

```bash
# Pull the latest image
podman pull ghcr.io/<username>/<repo>/backend:latest

# Stop and remove the running container
podman stop dcsplan-backend
podman rm dcsplan-backend

# Start a new container with the updated image
podman run -d \
  --name dcsplan-backend \
  -p 5001:5001 \
  -v /var/lib/dcsplan/config:/app/config:ro \
  -v /var/lib/dcsplan/data:/app/data \
  -e DISCORD_CLIENT_ID="..." \
  -e DISCORD_CLIENT_SECRET="..." \
  -e DISCORD_REDIRECT_URI="https://dcsplan.bonnefon.org/api/auth/discord/callback" \
  -e SESSION_SECRET="<long-random-string>" \
  --restart=unless-stopped \
  ghcr.io/<username>/<repo>/backend:latest
```

The `data` volume is preserved across updates, so accounts survive a redeploy.

## Updating Static Tiles

To update tiles without rebuilding the container:

1. Copy new tiles to the host directory:
   ```bash
   rsync -av /path/to/new/tiles/ /opt/dcsplan/static/tiles/<theatre>/<map>/
   ```

2. Restart the container:
   ```bash
   podman restart dcsplan-backend
   ```

No container rebuild is required since tiles are mounted as a volume. A new map also
needs its `backend/theatres/<theatre>/maps/<map>.json` config, which does require a new
image.

## Networking Setup

### Container Network

If running multiple containers, you can create a podman network:

```bash
podman network create dcsplan-network

podman run -d \
  --name dcsplan-backend \
  --network dcsplan-network \
  ...
```

### Reverse Proxy

Production runs behind Caddy under a single origin: `/api/*` is proxied to the
backend on `localhost:5001` (with the `/api` prefix stripped) and everything else
to the frontend. The exact Caddy block is in
[auth-and-single-origin.md](../../docs/auth-and-single-origin.md).

## Troubleshooting

### Container Won't Start

1. Check logs:
   ```bash
   podman logs dcsplan-backend
   ```

2. Verify static directory exists and has correct permissions:
   ```bash
   ls -la /opt/dcsplan/static
   ```

### Permission Errors

If you see permission errors, ensure the static directory is readable:

```bash
sudo chown -R 1000:1000 /opt/dcsplan/static
sudo chmod -R 755 /opt/dcsplan/static
```

### Auth Not Working

Check that the Discord/session variables are set in the container:

```bash
podman exec dcsplan-backend env | grep -E "DISCORD|SESSION"
```

If they are missing, `/auth/*` returns `503` and the startup log warns that auth
is disabled (the anonymous tier still works).

### Health Checks

Check if the container is responding:

```bash
curl http://localhost:5001/
```

Should return: `{"message":"Hello from the backend!"}`

## Resource Limits

For production deployments, consider setting resource limits:

```bash
podman run -d \
  --name dcsplan-backend \
  --memory=512m \
  --cpus=1.0 \
  ...
```

