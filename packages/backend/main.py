from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from flight_plan import FlightPlan
from kneeboard import generate_kneeboard_single_png, generate_kneeboard_zip
import os
import logging

# Set up logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

app = FastAPI()

# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Allow requests from your frontend
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Path to the static directory
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
TILES_DIR = os.path.join(STATIC_DIR, "tiles")

# Path to the blank tile
BLANK_TILE_PATH = os.path.join(os.path.dirname(__file__), "tiles", "blank.png")


@app.post("/kneeboard")
async def generate_kneeboard(flight_plan: FlightPlan):
    """Generate a kneeboard PNG from a flight plan (first leg map)."""
    logger.info(f"=== /kneeboard endpoint called ===")
    logger.info(f"Flight plan has {len(flight_plan.points)} waypoint(s)")
    try:
        # Validate that we have at least 2 points
        if len(flight_plan.points) < 2:
            logger.error("Flight plan has fewer than 2 waypoints")
            raise HTTPException(status_code=400, detail="Flight plan must have at least 2 waypoints")
        
        # Generate PNG (first leg map)
        logger.info("Generating kneeboard PNG (single leg map)...")
        png_data = generate_kneeboard_single_png(flight_plan, 1)
        logger.info(f"Kneeboard PNG generated: {len(png_data)} bytes")
        
        # Return as PNG
        return Response(content=png_data, media_type="image/png")
    
        # Generate all legs maps (ZIP)
        logger.info("Generating all legs maps (ZIP)...")
        zip_data = generate_kneeboard_zip(flight_plan)
        logger.info(f"All legs maps (ZIP) generated: {len(zip_data)} bytes")
        
        # Return as ZIP
        return Response(content=zip_data, media_type="application/zip")
        
    except ValueError as e:
        logger.error(f"ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error generating kneeboard: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating kneeboard: {str(e)}")

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
