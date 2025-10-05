# Tile Generation Script

## generate_tiles.py

A Python script that takes a large PNG image and divides it into 256x256 tiles using the XYZ tile server naming convention.

### Features

- **XYZ Tile Format**: Generates tiles in the standard `z/x/y.png` format
- **Automatic Zoom Calculation**: Automatically calculates appropriate zoom levels based on image size
- **Custom Zoom Levels**: Option to specify exact zoom levels to generate
- **High Quality**: Uses LANCZOS resampling for high-quality tile resizing
- **Progress Tracking**: Shows progress during tile generation

### Installation

Install the required dependencies:

```bash
pip install -r requirements.txt
```

### Usage

#### Basic Usage
```bash
python generate_tiles.py map.png ./tiles
```

#### Specify Zoom Levels
```bash
python generate_tiles.py map.png ./tiles --zoom-levels 0,1,2,3,4,5
```

#### Set Maximum Zoom Level
```bash
python generate_tiles.py map.png ./tiles --max-zoom 6
```

#### Custom Tile Size
```bash
python generate_tiles.py map.png ./tiles --tile-size 512
```

### Output Structure

The script generates tiles in the following structure:
```
tiles/
├── 0/
│   ├── 0/
│   │   ├── 0.png
│   │   └── 1.png
│   └── 1/
│       ├── 0.png
│       └── 1.png
├── 1/
│   ├── 0/
│   │   ├── 0.png
│   │   ├── 1.png
│   │   ├── 2.png
│   │   └── 3.png
│   └── 1/
│       ├── 0.png
│       ├── 1.png
│       ├── 2.png
│       └── 3.png
└── ...
```

### Command Line Options

- `input_image`: Path to the input PNG image (required)
- `output_directory`: Directory to save the generated tiles (required)
- `--zoom-levels`: Comma-separated list of zoom levels (e.g., 0,1,2,3,4,5)
- `--max-zoom`: Maximum zoom level to generate (default: 5)
- `--tile-size`: Size of each tile in pixels (default: 256)

### Examples

1. **Generate tiles for a 4096x4096 map**:
   ```bash
   python generate_tiles.py large_map.png ./map_tiles
   ```

2. **Generate only specific zoom levels**:
   ```bash
   python generate_tiles.py map.png ./tiles --zoom-levels 2,3,4,5
   ```

3. **Generate high-resolution tiles**:
   ```bash
   python generate_tiles.py map.png ./tiles --tile-size 512 --max-zoom 7
   ```

### Integration with Tile Servers

The generated tiles are compatible with:
- **Leaflet**: Use with `L.tileLayer('tiles/{z}/{x}/{y}.png')`
- **OpenLayers**: Use with XYZ source
- **Mapbox**: Use with custom tile source
- **Any XYZ-compatible tile server**

### Performance Notes

- Large images (4096x4096+) may take several minutes to process
- Higher zoom levels generate exponentially more tiles
- Consider using SSD storage for better performance
- Monitor disk space usage for large tile sets
