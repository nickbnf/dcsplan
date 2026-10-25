# Multi-stage build for FastAPI backend
# Build context is packages/ (see packages/.dockerignore)
FROM python:3.13-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  gcc \
  g++ \
  libproj-dev \
  proj-data \
  proj-bin \
  libgeos-dev \
  && rm -rf /var/lib/apt/lists/*

# uv, pinned (keep in sync with astral-sh/setup-uv in .github/workflows/ci.yml)
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv

# Set working directory
WORKDIR /app

# Install the locked runtime dependencies (no dev group) into /app/.venv,
# using the image's Python
ENV UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_PYTHON_DOWNLOADS=never
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-dev --no-install-project

# Production stage
FROM python:3.13-slim-bookworm

# Install runtime dependencies for PIL, pyproj, and cairosvg (SVG pictogram rendering)
RUN apt-get update && apt-get install -y --no-install-recommends \
  libproj25 \
  libgeos-c1v5 \
  libcairo2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user for security; files are owned by it as they are copied
# (a later chown -R would duplicate the venv in another layer)
RUN useradd -m -u 1000 appuser

# Set working directory
WORKDIR /app

# Copy the virtualenv from builder (same path: its scripts use absolute paths)
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH

# Copy application code (excluding static/tiles directory - will be mounted as volume).
# Tests, venvs and local data are excluded by packages/.dockerignore.
COPY --chown=appuser:appuser backend/*.py ./
COPY --chown=appuser:appuser backend/theatres ./theatres

# Runtime data directory (SQLite DB) — mounted as a persistent volume in prod
RUN mkdir -p /app/data && chown appuser:appuser /app /app/data

# Copy shared data files referenced via ../shared/ relative path
COPY --chown=appuser:appuser shared/pictogramCatalog.json /shared/pictogramCatalog.json

# Switch to non-root user
USER appuser

# Persist the SQLite database across container restarts
VOLUME ["/app/data"]

# Expose port
EXPOSE 5001

# Set production environment variables for JSON logging
ENV LOG_FORMAT=json
ENV SERVICE_NAME=dcsplan-backend

# Set production uvicorn settings
# Using 1 worker to enable in-memory task queue with single worker thread
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001", "--workers", "1"]
