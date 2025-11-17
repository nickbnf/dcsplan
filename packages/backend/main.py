from fastapi import FastAPI, HTTPException, Query, Path
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from flight_plan import FlightPlan
from task_queue import get_task_queue
import os
import logging
import time
from typing import Optional

# Set up logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

app = FastAPI()

# Get CORS origins from environment variable
# Defaults to localhost for development if not set
cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5173")
# Support comma-separated list of origins
cors_origins = [origin.strip() for origin in cors_origins_env.split(",")]

logger.info(f"CORS allowed origins: {cors_origins}")

# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Path to the static directory
STATIC_DIR = os.path.join(os.path.dirname(__file__), "config", "static")
TILES_DIR = os.path.join(STATIC_DIR, "tiles")

# Path to the blank tile
BLANK_TILE_PATH = os.path.join(os.path.dirname(__file__), "config", "blank.png")


@app.post("/kneeboard")
async def generate_kneeboard(
    flight_plan: FlightPlan,
    output: str = Query(default="zip", description="Output type: 'zip' or leg number"),
    include_fuel: bool = Query(default=False, description="Include fuel calculations")
):
    """Submit a kneeboard generation task and return task ID."""
    logger.info(f"=== /kneeboard endpoint called ===")
    logger.info(f"Flight plan has {len(flight_plan.points)} waypoint(s)")
    logger.info(f"Output: {output}, Include fuel: {include_fuel}")
    
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
    
    # Submit task to queue
    task_queue = get_task_queue()
    task_id = task_queue.submit_task(flight_plan, output, include_fuel)
    
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

@app.get("/api")
def read_root():
    return {"message": "Hello from the backend!"}

@app.get("/tiles/{z}/{x}/{y}.png")
async def get_tile(z: int, x: int, y: int):
    # Try to serve the actual tile from static directory first
    tile_path = os.path.join(TILES_DIR, str(z), str(x), f"{y}.png")
    
    if os.path.exists(tile_path):
        return FileResponse(tile_path)
    else:
        # Fall back to blank tile if the specific tile doesn't exist
        return FileResponse(BLANK_TILE_PATH)

@app.get("/tiles/tiles_info.json")
async def get_tiles_info():
    # Try to serve the tiles info from static directory first
    tiles_info_path = os.path.join(TILES_DIR, "tiles_info.json")
    
    if os.path.exists(tiles_info_path):
        return FileResponse(tiles_info_path)
    else:
        # Fall back to blank tile if the tiles info doesn't exist
        return FileResponse(BLANK_TILE_PATH)
