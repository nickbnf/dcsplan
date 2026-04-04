# Waypoint List Kneeboard Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a waypoint list page as the first page of multi-leg kneeboard ZIP output, displaying all waypoints in a monospace teletype table.

**Architecture:** New `generate_waypoint_list_page()` function in `waypoint_list_page.py` draws a 768x1024 PNG table using PIL. It reuses the existing `_format_coord_ddm` function (after fixing longitude degree padding) from `map_annotations.py`. The ZIP generation in `kneeboard.py` calls it and prepends the result.

**Tech Stack:** Python, PIL/Pillow, existing flight_plan models

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/backend/waypoint_list_page.py` | Create | New module: `generate_waypoint_list_page()` function |
| `packages/backend/map_annotations.py` | Modify | Fix `_format_coord_ddm` for lat vs lon degree width |
| `packages/backend/kneeboard.py` | Modify | Call waypoint list page generation in ZIP path |
| `packages/backend/test_waypoint_list_page.py` | Create | Tests for the new module |
| `packages/backend/test_map_annotations.py` | Create | Tests for coordinate formatting fix |

---

### Task 1: Fix `_format_coord_ddm` for longitude degree width

**Files:**
- Modify: `packages/backend/map_annotations.py:1120-1126`
- Create: `packages/backend/test_map_annotations.py`

- [ ] **Step 1: Write failing tests for coordinate formatting**

Create `packages/backend/test_map_annotations.py`:

```python
"""Tests for coordinate formatting in map_annotations."""

import pytest
from map_annotations import _format_coord_ddm


def test_format_lat_north():
    # 42 degrees, 10.34 minutes North
    result = _format_coord_ddm(42.172333, "N", "S", deg_width=2)
    assert result == "N42°10.34'"


def test_format_lat_south():
    result = _format_coord_ddm(-12.5683, "N", "S", deg_width=2)
    assert result == "S12°34.10'"


def test_format_lat_leading_zero():
    # 2 degrees, 5.00 minutes
    result = _format_coord_ddm(2.083333, "N", "S", deg_width=2)
    assert result == "N02°05.00'"


def test_format_lon_three_digit():
    result = _format_coord_ddm(42.4687, "E", "W", deg_width=3)
    assert result == "E042°28.12'"


def test_format_lon_west():
    result = _format_coord_ddm(-5.75, "E", "W", deg_width=3)
    assert result == "W005°45.00'"


def test_format_lon_large():
    result = _format_coord_ddm(120.756667, "E", "W", deg_width=3)
    assert result == "E120°45.40'"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/backend && python -m pytest test_map_annotations.py -v`
Expected: FAIL — `_format_coord_ddm` does not accept `deg_width` parameter

- [ ] **Step 3: Update `_format_coord_ddm` to accept `deg_width`**

In `packages/backend/map_annotations.py`, replace lines 1120-1126:

```python
def _format_coord_ddm(deg: float, pos_char: str, neg_char: str, deg_width: int = 2) -> str:
    """Format a coordinate in degrees/decimal minutes (e.g. N34°12.55').

    Args:
        deg: Decimal degrees value
        pos_char: Character for positive hemisphere (N or E)
        neg_char: Character for negative hemisphere (S or W)
        deg_width: Number of digits for degrees (2 for lat, 3 for lon)
    """
    hemisphere = pos_char if deg >= 0 else neg_char
    deg = abs(deg)
    d = int(deg)
    m = (deg - d) * 60
    return f"{hemisphere}{d:0{deg_width}d}\u00b0{m:05.2f}'"
```

- [ ] **Step 4: Update existing callers to pass `deg_width`**

In `packages/backend/map_annotations.py`, find the two calls in `draw_info_box` (around lines 1152-1153) and update:

```python
        rows.append(_format_coord_ddm(dest_point.lat, "N", "S", deg_width=2))
        rows.append(_format_coord_ddm(dest_point.lon, "E", "W", deg_width=3))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/backend && python -m pytest test_map_annotations.py -v`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/backend/map_annotations.py packages/backend/test_map_annotations.py
git commit -m "fix: _format_coord_ddm supports variable degree width for lat vs lon"
```

---

### Task 2: Create `generate_waypoint_list_page` function

**Files:**
- Create: `packages/backend/waypoint_list_page.py`
- Create: `packages/backend/test_waypoint_list_page.py`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/test_waypoint_list_page.py`:

```python
"""Tests for waypoint list page generation."""

import pytest
import io
from PIL import Image
from flight_plan import FlightPlan, FlightPlanTurnPoint
from waypoint_list_page import generate_waypoint_list_page


def _make_point(lat, lon, name=None, wpt_type=None):
    return FlightPlanTurnPoint(
        lat=lat, lon=lon, tas=250, alt=20000,
        fuelFlow=2000, windSpeed=10, windDir=270,
        name=name, waypointType=wpt_type,
    )


@pytest.fixture
def sample_flight_plan():
    return FlightPlan(
        theatre="syria",
        points=[
            _make_point(42.1723, 42.4687, "KUTAISI", "normal"),
            _make_point(41.9667, 43.2611, "WPT2", "normal"),
            _make_point(41.7537, 43.5073, "HOLD", "push"),
            _make_point(41.5017, 43.7648, "IP1", "ip"),
            _make_point(41.3425, 44.002, "TARGET", "tgt"),
            _make_point(41.5967, 43.8389, "EGRESS", "normal"),
        ],
    )


def test_returns_valid_png(sample_flight_plan):
    result = generate_waypoint_list_page(sample_flight_plan)
    assert isinstance(result, bytes)
    # Check PNG magic bytes
    assert result[:8] == b'\x89PNG\r\n\x1a\n'


def test_image_dimensions(sample_flight_plan):
    result = generate_waypoint_list_page(sample_flight_plan)
    img = Image.open(io.BytesIO(result))
    assert img.size == (768, 1024)


def test_single_waypoint():
    plan = FlightPlan(
        theatre="syria",
        points=[_make_point(42.0, 42.0, "ONLY", "normal")],
    )
    result = generate_waypoint_list_page(plan)
    img = Image.open(io.BytesIO(result))
    assert img.size == (768, 1024)


def test_no_name_waypoint():
    plan = FlightPlan(
        theatre="syria",
        points=[
            _make_point(42.0, 42.0, None, "normal"),
            _make_point(41.0, 43.0, None, "tgt"),
        ],
    )
    result = generate_waypoint_list_page(plan)
    assert isinstance(result, bytes)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/backend && python -m pytest test_waypoint_list_page.py -v`
Expected: FAIL — `waypoint_list_page` module does not exist

- [ ] **Step 3: Create the waypoint list page module**

Create `packages/backend/waypoint_list_page.py`:

```python
"""
Waypoint list page generator for kneeboard output.

Generates a 768x1024 PNG table listing all waypoints with their
type icon, number, name, and coordinates in a monospace teletype style.
"""

import io
import os
import math
import logging
from PIL import Image, ImageDraw, ImageFont
from flight_plan import FlightPlan, FlightPlanTurnPoint
from map_annotations import _format_coord_ddm

logger = logging.getLogger(__name__)

# Page dimensions (same as kneeboard map pages)
PAGE_WIDTH = 768
PAGE_HEIGHT = 1024

# Colors
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)

# Layout constants
MARGIN_LEFT = 40
MARGIN_RIGHT = 40
MARGIN_TOP = 40
TITLE_FONT_SIZE = 32
ROW_FONT_SIZE = 22
ROW_HEIGHT = 42
LINE_WIDTH = 1

# Column x-offsets (from left margin)
COL_ICON_CENTER = 30    # center of the icon column
COL_NUMBER = 65         # start of waypoint number
COL_NAME = 115          # start of waypoint name
COL_POSITION = 380      # start of lat/lon

# Icon sizing
ICON_RADIUS = 8
ICON_STROKE = 2

FONTS_DIR = os.path.join(os.path.dirname(__file__), "config", "fonts")


def _load_fixed_font(size: int) -> ImageFont.FreeTypeFont:
    """Load the fixed-width font at the given size."""
    font_path = os.path.join(FONTS_DIR, "fixed.ttf")
    try:
        return ImageFont.truetype(font_path, size)
    except (IOError, OSError):
        logger.warning(f"Could not load fixed.ttf, falling back to default")
        return ImageFont.load_default()


def _draw_waypoint_icon(draw: ImageDraw.ImageDraw, cx: float, cy: float,
                        wpt_type: str, font: ImageFont.FreeTypeFont) -> None:
    """Draw a small waypoint type icon centered at (cx, cy).

    - normal: small circle outline
    - push: text "PSH"
    - ip: small diamond (rotated square) outline
    - tgt: small triangle outline
    """
    r = ICON_RADIUS
    stroke = ICON_STROKE

    if wpt_type == 'push':
        # Draw "PSH" text centered
        bbox = font.getbbox("PSH")
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text((cx - tw / 2, cy - th / 2), "PSH", fill=BLACK, font=font)

    elif wpt_type == 'ip':
        # Diamond (square rotated 45 degrees)
        diamond = [
            (cx, cy - r),       # top
            (cx + r, cy),       # right
            (cx, cy + r),       # bottom
            (cx - r, cy),       # left
        ]
        draw.polygon(diamond, outline=BLACK, fill=None)
        for j in range(4):
            draw.line([diamond[j], diamond[(j + 1) % 4]], fill=BLACK, width=stroke)

    elif wpt_type == 'tgt':
        # Triangle (point up)
        h = r * math.sqrt(3)
        triangle = [
            (cx, cy - r),                 # top
            (cx + h / 2, cy + r / 2),     # bottom right
            (cx - h / 2, cy + r / 2),     # bottom left
        ]
        draw.polygon(triangle, outline=BLACK, fill=None)
        for j in range(3):
            draw.line([triangle[j], triangle[(j + 1) % 3]], fill=BLACK, width=stroke)

    else:
        # Normal: circle outline
        draw.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            outline=BLACK,
            width=stroke,
        )


def generate_waypoint_list_page(flight_plan: FlightPlan) -> bytes:
    """Generate a 768x1024 PNG image with a waypoint list table.

    Args:
        flight_plan: The flight plan containing waypoints.

    Returns:
        PNG image data as bytes.
    """
    img = Image.new("RGBA", (PAGE_WIDTH, PAGE_HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)

    title_font = _load_fixed_font(TITLE_FONT_SIZE)
    row_font = _load_fixed_font(ROW_FONT_SIZE)

    table_left = MARGIN_LEFT
    table_right = PAGE_WIDTH - MARGIN_RIGHT

    # Draw title
    title = "WAYPOINT LIST"
    title_bbox = title_font.getbbox(title)
    title_w = title_bbox[2] - title_bbox[0]
    title_x = (PAGE_WIDTH - title_w) / 2
    title_y = MARGIN_TOP
    draw.text((title_x, title_y), title, fill=BLACK, font=title_font)

    # Horizontal line below title
    title_bottom = title_y + (title_bbox[3] - title_bbox[1]) + 10
    draw.line([(table_left, title_bottom), (table_right, title_bottom)],
              fill=BLACK, width=LINE_WIDTH)

    # Draw waypoint rows
    current_y = title_bottom + 5

    for i, point in enumerate(flight_plan.points):
        row_center_y = current_y + ROW_HEIGHT / 2
        wpt_type = point.waypointType or 'normal'

        # Icon
        _draw_waypoint_icon(draw, table_left + COL_ICON_CENTER, row_center_y,
                            wpt_type, row_font)

        # Waypoint number (1-indexed, zero-padded)
        num_str = f"{i + 1:02d}"
        num_bbox = row_font.getbbox(num_str)
        num_h = num_bbox[3] - num_bbox[1]
        draw.text((table_left + COL_NUMBER, row_center_y - num_h / 2),
                  num_str, fill=BLACK, font=row_font)

        # Waypoint name
        name = point.name or ""
        name_bbox = row_font.getbbox(name) if name else row_font.getbbox("X")
        name_h = name_bbox[3] - name_bbox[1]
        draw.text((table_left + COL_NAME, row_center_y - name_h / 2),
                  name, fill=BLACK, font=row_font)

        # Position (lat/lon)
        lat_str = _format_coord_ddm(point.lat, "N", "S", deg_width=2)
        lon_str = _format_coord_ddm(point.lon, "E", "W", deg_width=3)
        pos_str = f"{lat_str} {lon_str}"
        pos_bbox = row_font.getbbox(pos_str)
        pos_h = pos_bbox[3] - pos_bbox[1]
        draw.text((table_left + COL_POSITION, row_center_y - pos_h / 2),
                  pos_str, fill=BLACK, font=row_font)

        # Horizontal separator line below this row
        line_y = current_y + ROW_HEIGHT
        draw.line([(table_left, line_y), (table_right, line_y)],
                  fill=BLACK, width=LINE_WIDTH)

        current_y = line_y

    # Convert to RGB (kneeboard pages are RGB PNGs) and save
    img_rgb = img.convert("RGB")
    buf = io.BytesIO()
    img_rgb.save(buf, format="PNG")
    return buf.getvalue()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/backend && python -m pytest test_waypoint_list_page.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/waypoint_list_page.py packages/backend/test_waypoint_list_page.py
git commit -m "feat: add waypoint list page generator for kneeboard"
```

---

### Task 3: Integrate into ZIP generation

**Files:**
- Modify: `packages/backend/kneeboard.py:87-122`

- [ ] **Step 1: Write a failing test for ZIP containing waypoint list page**

Add to `packages/backend/test_kneeboard.py`:

```python
import zipfile
from kneeboard import generate_kneeboard_zip

def test_zip_contains_waypoint_list_page(mock_tiles_info, valid_three_point_plan):
    """Multi-leg ZIP should include 0wpts.png as first entry."""
    result = generate_kneeboard_zip(valid_three_point_plan)
    with zipfile.ZipFile(io.BytesIO(result)) as zf:
        names = zf.namelist()
        assert "0wpts.png" in names
        assert names[0] == "0wpts.png"
        # Verify it's a valid PNG
        wpts_data = zf.read("0wpts.png")
        assert wpts_data[:8] == b'\x89PNG\r\n\x1a\n'
```

Note: `valid_three_point_plan` is an existing fixture in test_kneeboard.py (or create one with 3+ points if it doesn't exist). Also add `import io` at the top of the file if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && python -m pytest test_kneeboard.py::test_zip_contains_waypoint_list_page -v`
Expected: FAIL — `0wpts.png` not in ZIP

- [ ] **Step 3: Modify `generate_kneeboard_zip` to include waypoint list page**

In `packages/backend/kneeboard.py`, add import at the top of the file:

```python
from waypoint_list_page import generate_waypoint_list_page
```

Then modify the `generate_kneeboard_zip` function. Replace the ZIP creation block (lines 115-122):

```python
    # Generate waypoint list page
    if progress_callback:
        progress_callback("Generating waypoint list page...")
    wpts_page = generate_waypoint_list_page(flight_plan)
    logger.info(f"Waypoint list page generated: {len(wpts_page)} bytes")

    # Create ZIP file
    zip_data = io.BytesIO()
    with zipfile.ZipFile(zip_data, 'w', compression=zipfile.ZIP_STORED) as zipf:
        zipf.writestr("0wpts.png", wpts_page)
        for i, leg_map in enumerate(leg_maps):
            filename = f"leg_{i+1:02d}.png"
            logger.info(f"Adding {filename} to ZIP file")
            zipf.writestr(filename, leg_map)
    return zip_data.getvalue()
```

- [ ] **Step 4: Run all kneeboard tests to verify nothing is broken**

Run: `cd packages/backend && python -m pytest test_kneeboard.py -v`
Expected: All tests PASS (including the new one)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/kneeboard.py packages/backend/test_kneeboard.py
git commit -m "feat: include waypoint list page as first entry in kneeboard ZIP"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Run all tests**

Run: `cd packages/backend && python -m pytest test_map_annotations.py test_waypoint_list_page.py test_kneeboard.py -v`
Expected: All tests PASS

- [ ] **Step 2: Generate a test kneeboard and visually inspect**

Start the backend server and generate a multi-leg kneeboard via the API or frontend. Extract the ZIP and open `0wpts.png` to verify:
- Title "WAYPOINT LIST" centered at top
- Each waypoint row shows icon, number, name, lat/lon
- Horizontal separator lines between all rows
- Monospace font throughout
- Black on white color scheme
- Coordinate format has correct leading zeros (e.g., `N42°10.34' E042°28.12'`)
- PUSH waypoints show "PSH" text instead of a shape
- IP waypoints show diamond, TGT shows triangle

- [ ] **Step 3: Verify existing map pages still show correct coordinates**

Check that the info box on leg map pages now correctly shows 3-digit longitude degrees (e.g., `E042°28.12'` instead of `E42°28.12'`).
