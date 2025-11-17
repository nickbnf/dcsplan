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

```
static/
└── tiles/
    ├── tiles_info.json
    ├── 0/
    │   └── ...
    ├── 1/
    │   └── ...
    └── ...
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
  -p 8000:8000 \
  -v /var/lib/dcsplan/config:/app/config:ro \
  -e CORS_ORIGINS="http://localhost:5173,https://yourdomain.com" \
  --restart=unless-stopped \
  ghcr.io/<username>/<repo>/backend:latest
```

### Using the Deployment Script

The `deploy.sh` script automates the build and run process:

```bash
export CONFIG_DIR=/var/lib/dcsplan/config
export PORT=8000
export CORS_ORIGINS="http://localhost:5173,https://yourdomain.com"
./packages/backend/deploy.sh
```

## Configuration

### Environment Variables

- `CORS_ORIGINS`: Comma-separated list of allowed origins (default: `http://localhost:5173`)
  - Example: `CORS_ORIGINS="https://app.example.com,https://www.example.com"`

### Port Mapping

Default mapping is `8000:8000` (host:container). To use a different host port:

```bash
podman run -d \
  --name dcsplan-backend \
  -p 8080:8000 \  # Host port 8080 maps to container port 8000
  ...
```

### Volume Mounts

The static tiles directory must be mounted read-only:

```bash
-v /opt/dcsplan/static:/app/static:ro
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
  -p 8000:8000 \
  -v /opt/dcsplan/static:/app/static:ro \
  -e CORS_ORIGINS="..." \
  --restart=unless-stopped \
  ghcr.io/<username>/<repo>/backend:latest
```

Or use the deployment script which handles this automatically.

## Updating Static Tiles

To update tiles without rebuilding the container:

1. Copy new tiles to the host directory:
   ```bash
   rsync -av /path/to/new/tiles/ /opt/dcsplan/static/tiles/
   ```

2. Restart the container:
   ```bash
   podman restart dcsplan-backend
   ```

No container rebuild is required since tiles are mounted as a volume.

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

For production, consider using a reverse proxy (Nginx, Traefik, etc.) in front of the container:

```nginx
location /api/ {
    proxy_pass http://localhost:8000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

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

### CORS Issues

Verify the `CORS_ORIGINS` environment variable includes your frontend URL:

```bash
podman exec dcsplan-backend env | grep CORS
```

### Health Checks

Check if the container is responding:

```bash
curl http://localhost:8000/api
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

