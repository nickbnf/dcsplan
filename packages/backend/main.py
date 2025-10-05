from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI()

# Path to the static directory
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
TILES_DIR = os.path.join(STATIC_DIR, "tiles")

# Path to the blank tile
BLANK_TILE_PATH = os.path.join(os.path.dirname(__file__), "tiles", "blank.png")


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
