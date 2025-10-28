from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from kneeboard import FlightPlan, calculate_total_duration, generate_kneeboard_png
import os

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
    """Generate a kneeboard PNG from a flight plan."""
    try:
        # Validate that we have at least 2 points
        if len(flight_plan.points) < 2:
            raise HTTPException(status_code=400, detail="Flight plan must have at least 2 waypoints")
        
        # Calculate total duration
        total_duration = calculate_total_duration(flight_plan)
        
        # Generate PNG
        png_data = generate_kneeboard_png(total_duration)
        
        # Return as PNG
        return Response(content=png_data, media_type="image/png")
    
    except Exception as e:
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