# Use the OS trust store for TLS verification. This must run before any HTTPS
# client is created. It lets local dev work behind a TLS-inspecting corporate
# proxy (whose root CA is in the system store but not in certifi), and is
# harmless in production, where the system store holds the normal public CAs.
import truststore
truststore.inject_into_ssl()

from fastapi import FastAPI, HTTPException, Query, Path, WebSocket
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from flight_plan import FlightPlan, ImportFlightPlanRequest, KneeboardRequest
from task_queue import get_task_queue
from migrations_runner import apply_migrations
import asset_routes
import auth_routes
import space_routes
import sync
import theatres
import trash
import version_routes
import os
import secrets
import logging
from contextlib import asynccontextmanager
from typing import Optional

# Set up centralized logging configuration
from logging_config import setup_logging
setup_logging()

# Set up logger
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Apply DB migrations and load auth config before serving requests, then
    run the plan-sync server, the trash purge and the version sweep for the
    app's lifetime."""
    apply_migrations()
    auth_routes.init_auth()
    async with sync.lifespan_server():  # run the plan-sync WebSocket server
        async with trash.lifespan_purge():  # purge expired trash (soft-delete)
            async with sync.lifespan_sweep():  # finalize idle plans (version-history)
                yield


app = FastAPI(lifespan=lifespan)

# Single origin (D6): frontend and backend are served under one host via the
# Caddy proxy (/api/* -> backend, prefix-stripped), so no CORS is needed.

# Session cookie (signed) — this is "who is logged in" (D5). The secret comes
# from the environment; an ephemeral one is generated if unset so the anonymous
# tier (AD-9) still runs when auth is not configured.
session_secret = os.getenv("SESSION_SECRET")
if not session_secret:
    session_secret = secrets.token_urlsafe(32)
    logger.warning(
        "SESSION_SECRET not set — using an ephemeral secret (sessions reset on restart)"
    )
session_https_only = os.getenv("SESSION_HTTPS_ONLY", "true").lower() != "false"
app.add_middleware(
    SessionMiddleware,
    secret_key=session_secret,
    https_only=session_https_only,
    same_site="lax",
)

# Discord OAuth + session routes. Reached at /api/auth/* through Caddy (D6).
app.include_router(auth_routes.router)

# Space + plan-index routes (add-cloud-sync). Reached at /api/spaces/*, /api/plans/*.
app.include_router(space_routes.router)

# Library + profile sync routes (add-library-profile-sync). Reached at
# /api/libraries/*, /api/profiles/*, /api/changes.
app.include_router(asset_routes.router)

# Plan version routes (add-version-history). Reached at /api/plans/{id}/versions,
# /api/plans/{id}/pinned-entries.
app.include_router(version_routes.router)


# Flight-plan sync WebSocket (add-cloud-sync, AD-14). Reached at /api/sync/{planId}.
@app.websocket("/sync/{plan_id}")
async def sync_ws(websocket: WebSocket, plan_id: str):
    await sync.serve_plan_socket(websocket, plan_id)

# Path to the static directory
STATIC_DIR = os.path.join(os.path.dirname(__file__), "config", "static")
TILES_DIR = os.path.join(STATIC_DIR, "tiles")

# Path to the blank tile
BLANK_TILE_PATH = os.path.join(os.path.dirname(__file__), "config", "blank.png")


@app.post("/kneeboard")
async def generate_kneeboard(
    request: KneeboardRequest,
    output: str = Query(default="zip", description="Output type: 'zip' or leg number"),
    details: str = Query(default="", description="Comma-separated list of extra details to show (e.g. 'coords,efr')"),
    map: Optional[str] = Query(default=None, description="Theatre map to draw on; the theatre's default map when omitted")
):
    """Submit a kneeboard generation task and return task ID."""
    flight_plan = request.flightPlan  # aircraft is a sibling on the wire (AD-2)
    logger.info(f"=== /kneeboard endpoint called ===")
    logger.info(f"Flight plan has {len(flight_plan.points)} waypoint(s)")
    details_set = {d.strip() for d in details.split(",") if d.strip()} if details else set()
    logger.info(f"Output: {output}, Details: {details_set}")
    
    # Validate that we have at least 2 points
    if len(flight_plan.points) < 2:
        logger.error("Flight plan has fewer than 2 waypoints")
        raise HTTPException(status_code=400, detail="Flight plan must have at least 2 waypoints")
    
    if output != "zip":
        # Validate leg number
        try:
            leg_num = int(output)
            max_legs = len(flight_plan.points) - 1
            if leg_num < 1 or leg_num > max_legs:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Leg number must be between 1 and {max_legs} (flight plan has {max_legs} leg(s))"
                )
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid leg number: {output}")

    try:
        map_id = theatres.resolve_map_id(flight_plan.theatre, map)
    except theatres.UnknownTheatreError:
        raise HTTPException(status_code=400, detail=f"Unknown theatre: {flight_plan.theatre}")
    except theatres.UnknownMapError:
        raise HTTPException(status_code=400, detail=f"Unknown map for theatre {flight_plan.theatre}: {map}")
    
    # Submit task to queue
    task_queue = get_task_queue()
    task_id = task_queue.submit_task(flight_plan, output, details_set, aircraft=request.aircraft, revision=request.revision, map_id=map_id)
    
    logger.info(f"Task {task_id} submitted to queue")
    return {"task_id": task_id}


@app.get("/kneeboard/{task_id}/status")
async def get_kneeboard_status(task_id: str = Path(..., description="Task ID")):
    """Get the status of a kneeboard generation task."""
    task_queue = get_task_queue()
    status = task_queue.get_task_status(task_id)
    
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return status


@app.get("/kneeboard/{task_id}/download")
async def download_kneeboard(task_id: str = Path(..., description="Task ID")):
    """Download the completed kneeboard file."""
    task_queue = get_task_queue()
    result = task_queue.get_task_result(task_id)
    
    if result is None:
        # Check if task exists but isn't completed
        status = task_queue.get_task_status(task_id)
        if status is None:
            raise HTTPException(status_code=404, detail="Task not found")
        elif status["status"] == "failed":
            raise HTTPException(status_code=500, detail=status.get("error", "Task failed"))
        else:
            raise HTTPException(status_code=202, detail="Task not yet completed")
    
    file_data, media_type = result
    return Response(content=file_data, media_type=media_type)

@app.get("/")
def read_root():
    # Formerly "/api"; under single-origin routing Caddy strips the /api prefix,
    # so the backend serves this at the root (D6).
    return {"message": "Hello from the backend!"}

@app.get("/tiles/{theatre}/{map_id}/{z}/{x}/{y}.png")
async def get_tile(theatre: str, map_id: str, z: int, x: int, y: int):
    try:
        map_id = theatres.resolve_map_id(theatre, map_id)
    except (theatres.UnknownTheatreError, theatres.UnknownMapError):
        raise HTTPException(status_code=404, detail="Map not found")
    # Try to serve the actual tile from static directory first
    tile_path = os.path.join(TILES_DIR, theatre, map_id, str(z), str(x), f"{y}.png")
    
    if os.path.exists(tile_path):
        return FileResponse(tile_path)
    else:
        # Fall back to blank tile if the specific tile doesn't exist
        logger.warning(f"Tile not found at {tile_path}")
        return FileResponse(BLANK_TILE_PATH)

# Theatre and map configs change with releases; make browsers revalidate them
# rather than reuse a heuristically cached copy.
CONFIG_CACHE_HEADERS = {"Cache-Control": "no-cache"}

# Not /theatres/{theatre}.json: that URL served the pre-add-theatre-maps flat
# config, which browsers may still hold in their HTTP cache.
@app.get("/theatres/{theatre}/theatre.json")
async def get_theatre_info(theatre: str):
    """The theatre's name, default map and navigation settings."""
    try:
        return JSONResponse(theatres.load_theatre(theatre), headers=CONFIG_CACHE_HEADERS)
    except theatres.UnknownTheatreError:
        logger.error(f"Theatre not found: {theatre}")
        raise HTTPException(status_code=404, detail="Theatre not found")

@app.get("/theatres/{theatre}/maps/{map_id}.json")
async def get_map_info(theatre: str, map_id: str):
    """A map's georeference (crs, origin, resolution, control points) and tile grid."""
    try:
        return FileResponse(theatres.map_path(theatre, map_id), headers=CONFIG_CACHE_HEADERS)
    except (theatres.UnknownTheatreError, theatres.UnknownMapError):
        logger.error(f"Map not found: {theatre}/{map_id}")
        raise HTTPException(status_code=404, detail="Map not found")

@app.get("/theatres")
async def list_theatres():
    """Every theatre with its name, default map and maps (add-theatre-maps)."""
    try:
        return JSONResponse({"theatres": theatres.catalogue()}, headers=CONFIG_CACHE_HEADERS)
    except Exception as e:
        logger.error(f"Error listing theatres: {e}")
        raise HTTPException(status_code=500, detail="Could not list theatres")

@app.post("/flightplan/import")
async def import_flight_plan(request: ImportFlightPlanRequest):
    """Import and validate a flight plan from JSON."""
    logger.info(f"=== /flightplan/import endpoint called ===")
    logger.info(f"Version: {request.version}")
    logger.info(f"Flight plan has {len(request.flightPlan.points)} waypoint(s)")
    
    # Validate version
    SUPPORTED_VERSIONS = ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"]
    if request.version not in SUPPORTED_VERSIONS:
        logger.error(f"Unsupported version: {request.version}")
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported version: {request.version}. Supported versions: {', '.join(SUPPORTED_VERSIONS)}"
        )
    
    # Pydantic validation is automatic via FastAPI - if we get here, the flight plan is valid
    # Return the validated flight plan and its aircraft (siblings on the wire, AD-2)
    logger.info("Flight plan validated successfully")
    return {"flightPlan": request.flightPlan, "aircraft": request.aircraft}
