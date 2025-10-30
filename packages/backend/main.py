from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from kneeboard import FlightPlan, generate_kneeboard_png, generate_leg_maps, generate_leg_map
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
        logger.info("Generating kneeboard PNG (first leg map)...")
        png_data = generate_kneeboard_png(flight_plan)
        logger.info(f"Kneeboard PNG generated: {len(png_data)} bytes")
        
        # Return as PNG
        return Response(content=png_data, media_type="image/png")
    
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


@app.post("/kneeboard/legs")
async def generate_leg_maps_endpoint(flight_plan: FlightPlan):
    """Generate leg map images for all legs of the flight plan."""
    logger.info(f"=== /kneeboard/legs endpoint called ===")
    logger.info(f"Flight plan has {len(flight_plan.points)} waypoint(s)")
    try:
        # Validate that we have at least 2 points
        if len(flight_plan.points) < 2:
            logger.error("Flight plan has fewer than 2 waypoints")
            raise HTTPException(status_code=400, detail="Flight plan must have at least 2 waypoints")
        
        # Generate leg maps
        logger.info("Starting leg map generation...")
        leg_maps = generate_leg_maps(flight_plan)
        logger.info(f"Leg map generation completed: {len(leg_maps)} map(s) generated")
        
        # Return as ZIP file with individual PNGs
        # For now, return the first leg map as a simple response
        # TODO: Could return a ZIP file with all legs
        if len(leg_maps) == 0:
            logger.error("No leg maps were generated")
            raise HTTPException(status_code=400, detail="No legs to generate")
        
        # For MVP, return the first leg map
        # In the future, we could return a ZIP or JSON with all images
        logger.info(f"Returning first leg map ({len(leg_maps[0])} bytes)")
        return Response(content=leg_maps[0], media_type="image/png")
    
    except ValueError as e:
        logger.error(f"ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error generating leg maps: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating leg maps: {str(e)}")


@app.post("/kneeboard/legs/{leg_index}")
async def generate_single_leg_map(flight_plan: FlightPlan, leg_index: int):
    """Generate a map image for a specific leg of the flight plan."""
    logger.info(f"=== /kneeboard/legs/{leg_index} endpoint called ===")
    logger.info(f"Flight plan has {len(flight_plan.points)} waypoint(s), leg_index={leg_index}")
    try:
        # Validate that we have at least 2 points
        if len(flight_plan.points) < 2:
            logger.error("Flight plan has fewer than 2 waypoints")
            raise HTTPException(status_code=400, detail="Flight plan must have at least 2 waypoints")
        
        if leg_index < 0 or leg_index >= len(flight_plan.points) - 1:
            logger.error(f"Leg index {leg_index} is out of range (0-{len(flight_plan.points) - 2})")
            raise HTTPException(
                status_code=400,
                detail=f"Leg index {leg_index} is out of range. Flight plan has {len(flight_plan.points) - 1} legs (0-{len(flight_plan.points) - 2})"
            )
        
        origin = flight_plan.points[leg_index]
        destination = flight_plan.points[leg_index + 1]
        logger.info(f"Generating map for leg {leg_index}: ({origin.lat}, {origin.lon}) -> ({destination.lat}, {destination.lon})")
        
        # Generate leg map
        leg_map = generate_leg_map(origin, destination)
        logger.info(f"Leg map generated: {len(leg_map)} bytes")
        
        return Response(content=leg_map, media_type="image/png")
    
    except ValueError as e:
        logger.error(f"ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error generating leg map: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating leg map: {str(e)}")