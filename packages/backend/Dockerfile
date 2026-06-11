# Multi-stage build for FastAPI backend
FROM python:3.12-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  gcc \
  g++ \
  libproj-dev \
  proj-data \
  proj-bin \
  libgeos-dev \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY backend/requirements-lock.txt .
RUN pip install --no-cache-dir --user -r requirements-lock.txt

# Production stage
FROM python:3.12-slim

# Install runtime dependencies for PIL, pyproj, and cairosvg (SVG pictogram rendering)
RUN apt-get update && apt-get install -y --no-install-recommends \
  libproj25 \
  libgeos-c1v5 \
  libcairo2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH
# Make sure Python can find modules installed in .local
ENV PYTHONPATH=/root/.local/lib/python3.12/site-packages:$PYTHONPATH

# Set working directory
WORKDIR /app

# Copy application code (excluding static/tiles directory - will be mounted as volume)
COPY backend/flight_plan.py .
COPY backend/kneeboard.py .
COPY backend/map_annotations.py .
COPY backend/task_queue.py .
COPY backend/main.py .
COPY backend/logging_config.py .
COPY backend/waypoint_list_page.py .
COPY backend/overview_map_page.py .
COPY backend/theatres ./theatres

# Copy shared data files referenced via ../shared/ relative path
COPY shared/pictogramCatalog.json /shared/pictogramCatalog.json

# Create non-root user for security
RUN useradd -m -u 1000 appuser && \
  chown -R appuser:appuser /app && \
  chown -R appuser:appuser /root && \
  chown -R appuser:appuser /shared

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5001

# Set production environment variables for JSON logging
ENV LOG_FORMAT=json
ENV SERVICE_NAME=dcsplan-backend

# Set production uvicorn settings
# Using 1 worker to enable in-memory task queue with single worker thread
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001", "--workers", "1"]

