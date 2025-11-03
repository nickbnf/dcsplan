#!/bin/bash
# Deployment script for DCSPlan backend container

set -e

IMAGE_NAME="dcsplan-backend"
CONTAINER_NAME="dcsplan-backend"
STATIC_DIR="${STATIC_DIR:-/opt/dcsplan/static}"
PORT="${PORT:-8000}"

echo "Building container image..."
podman build -t ${IMAGE_NAME}:latest -f packages/backend/Dockerfile packages/backend

echo "Stopping and removing existing container (if any)..."
podman stop ${CONTAINER_NAME} 2>/dev/null || true
podman rm ${CONTAINER_NAME} 2>/dev/null || true

echo "Starting new container..."
podman run -d \
    --name ${CONTAINER_NAME} \
    -p ${PORT}:8000 \
    -v ${STATIC_DIR}:/app/static:ro \
    -e CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}" \
    --restart=unless-stopped \
    ${IMAGE_NAME}:latest

echo "Container ${CONTAINER_NAME} started successfully!"
echo "View logs with: podman logs -f ${CONTAINER_NAME}"

