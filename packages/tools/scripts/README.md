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

### Adding a map to a theatre

A theatre can offer several maps (tile sets, possibly with different projections).
The backend reads them from this layout:

```
backend/theatres/<theatre>/
├── theatre.json        # name, default_map, navigation — hand-maintained
└── maps/
    └── <map>.json      # map_name, georeference, control points, zoom_info
backend/config/static/tiles/<theatre>/<map>/{z}/{x}/{y}.png
```

`theatre.json`'s `navigation` block (mode and projection) drives every leg
heading, distance and turn, on every map of the theatre. It is written by hand
and never by these scripts, so generating or georeferencing a map can never
change computed flight plan values.

Adding a map takes four steps: tile, enter control points, fit, check.

**1. Tile.** With the theatre already set up:

```bash
python generate_tiles.py vfr.png --theatre germany --map vfr --max-zoom 8
```

This writes the tiles to `backend/config/static/tiles/germany/vfr/` and merges the
tile grid (`zoom_info`) and the native image size (`image_width_px`,
`image_height_px`) into `backend/theatres/germany/maps/vfr.json`, creating it if
needed and keeping every other field. It never changes the georeference, so a map
can be re-tiled (for instance with another `--max-zoom`) without refitting. It
lists the georeference fields still missing.

**2. Enter the CRS and control points** by hand in the map config:

```jsonc
{
    "map_name": "VFR",
    "crs": "+proj=lcc +lat_0=0 +lon_0=10.5 +lat_1=50 +lat_2=54 +ellps=WGS84 +units=m +no_defs",
    "control_points": [
        { "label": "EDDF ARP", "px": 23011.5, "py": 21877.0, "lat": 50.0333, "lon": 8.5706 }
    ]
}
```

- `crs` is the projection the source image is drawn in, as a full proj string.
  Never use an `EPSG:` code: the backend (PROJ) and the frontend (proj4js) must
  read the exact same definition. Web Mercator is written
  `+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs`.
- Each control point is a feature you can locate both on the image and in a
  reference source: `px`, `py` are its position in the native image, `lat`,
  `lon` its WGS84 position, `label` is free text. Pixel positions are measured
  from the top-left corner of the image: the centre of the top-left pixel is
  (0.5, 0.5), so add 0.5 to the integer pixel index an image viewer shows.
  Once the map is tiled and has a provisional `origin_x`/`origin_y`/`resolution`,
  the planner in a dev build (`pnpm dev`) shows the native pixel under the
  cursor below its lat/lon, already in this convention, and Shift+P copies it
  as `"px": …, "py": …`. Read it at the highest zoom level. The lat/lon shown
  there comes from the provisional georeference: take the control point's
  `lat`/`lon` from the reference source, not from the planner.
- `lat`/`lon` are either JSON numbers in decimal degrees or strings in degrees
  and decimal minutes, as DCS shows them: `"lat": "N 41°55.678'"`,
  `"lon": "E 041°51.234'"`. The hemisphere letter is required (N/S for `lat`,
  E/W for `lon`); the `°` and `'` are optional. Strings are kept as entered.
  Use at least three decimals of minutes (about 2 m).
- Enter at least 3 points, preferably 8–15, spread over the whole image and not
  all on one line. The configuration check rejects a map with fewer than 3 or
  with collinear points.

**3. Fit** the georeference from the control points:

```bash
python georeference.py --theatre germany --map vfr --dry-run
python georeference.py --theatre germany --map vfr
```

This computes `origin_x`, `origin_y` (projected metres of the outer top-left
corner of the image) and `resolution` (projected metres per native pixel), and
writes them into the map config, keeping every other field. The map's extent and
lat/lon bounds are not stored: the planner computes them from these values.
`--dry-run` only prints the report.

The report lists each control point's error (`dx`, `dy`, `error`, in native
pixels), then the RMS and largest error:

- If one point is far off while the others are fine, that point was probably
  mis-measured: fix or remove it and fit again.
- If the errors are large everywhere, look at the rotation/scale diagnostic. It
  fits the same points again, allowing rotation and separate x/y scales. If that
  fit is much better and reports a clear rotation or a scale ratio away from 1,
  the image is not a north-up raster in this CRS: the CRS (projection, central
  meridian, standard parallels) is probably wrong.
- If no CRS fits, warp the source image once into a CRS before tiling, for
  instance with GDAL: `gdal_translate` with `-gcp` options for the control points,
  then `gdalwarp -t_srs "<crs>"`. Then tile the warped image and fit it.

The fit is not written if a point is more than the map's alignment tolerance
off: 2 pixels, unless the map config sets `alignment_tolerance_px`.
`--tolerance` overrides it for one run, and `--force` writes the fit anyway, but
the configuration check (step 4) still fails.

Control points are DCS positions, because plan coordinates are used in DCS. An
image captured from DCS can match them within 2 pixels. An image drawn from
real-world data cannot: DCS terrain differs locally from reality, by a few
hundred metres in places. For such a map, fit it, check that no single point
stands out from the others, and set `alignment_tolerance_px` just above the
largest remaining error, for instance `"alignment_tolerance_px": 12`.

**4. Check.** The backend test suite checks every map in the catalogue: required
fields, at least 3 non-collinear control points, every control point within the
map's alignment tolerance:

```bash
cd packages/backend && .venv/bin/python -m pytest test_map_georeference.py
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
- `--theatre`, `--map`: Write tiles and the map config into the backend for that map (see above)
- `--theatres-dir`: Theatre configs directory (default: `backend/theatres`)

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
