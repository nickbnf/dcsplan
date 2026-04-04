# Waypoint List Kneeboard Page — Design Spec

## Overview

Add a new kneeboard page that displays a tabular list of all waypoints in the flight plan. This page is the first page of the multi-leg ZIP output, using a monospace "teletype" aesthetic with horizontal separator lines.

## When Generated

- **Multi-leg output only** (ZIP): generated as `0wpts.png`, sorting before leg pages.
- **Single-leg output** (PNG): not generated.

## Page Format

- Resolution: 768 x 1024 px (same as existing kneeboard pages)
- Background: white
- Font: monospace/fixed-width throughout (find or add a suitable TTF monospace font)
- Color scheme: black text and lines on white background (high contrast for readability)

## Table Layout

```
┌──────────────────────────────────────────────────────┐
│                   WAYPOINT LIST                      │
│──────────────────────────────────────────────────────│
│  ●  01  KUTAISI       N42°10.34' E042°28.12'        │
│──────────────────────────────────────────────────────│
│  ●  02  WPT2          N41°58.00' E043°15.67'        │
│──────────────────────────────────────────────────────│
│ PSH 03  HOLD          N41°45.22' E043°30.44'        │
│──────────────────────────────────────────────────────│
│  ◇  04  IP1           N41°30.10' E043°45.89'        │
│──────────────────────────────────────────────────────│
│  △  05  TARGET        N41°20.55' E044°00.12'        │
│──────────────────────────────────────────────────────│
│  ●  06  EGRESS        N41°35.80' E043°50.33'        │
│──────────────────────────────────────────────────────│
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Columns

| Column     | Content                          | Alignment |
|------------|----------------------------------|-----------|
| Icon       | Geometric shape or "PSH" text    | Center    |
| Number     | Zero-padded 2-digit (01, 02...) | Right     |
| Name       | Waypoint name                    | Left      |
| Position   | Lat/Lon in DDM format            | Left      |

### Waypoint Icons (drawn small, inline in table rows)

| Type     | Symbol                                      |
|----------|---------------------------------------------|
| normal   | Small circle (outline)                      |
| push     | Text "PSH" in monospace                     |
| ip       | Small diamond/square (rotated 45°, outline) |
| tgt      | Small triangle (outline)                    |

### Coordinate Format

Degrees/Decimal Minutes (DDM) with full leading zeros:

- Latitude: `N42°02.34'` — hemisphere + 2-digit degrees + ° + 2-digit minutes with 2 decimal places + '
- Longitude: `E042°08.12'` — hemisphere + 3-digit degrees + ° + 2-digit minutes with 2 decimal places + '

Format strings:
- Lat: `{hemisphere}{d:02d}°{m:05.2f}'`
- Lon: `{hemisphere}{d:03d}°{m:05.2f}'`

### Horizontal Lines

- One line below the title
- One line between each waypoint row
- Lines span the full table width
- Thin black lines

## Coordinate Format Consistency Fix

The `_format_coord_ddm` function in `map_annotations.py` currently uses `02d` for both lat and lon degrees. This must be updated to accept a degree width parameter or be split into lat/lon variants so that longitude shows 3-digit degrees (e.g., `E042°` not `E42°`).

The function is also used by the existing info box on map pages — the fix will apply consistently to both the new waypoint list page and the existing map annotations.

Frontend coordinate displays (`FlightPlanZone.tsx`, `TitleZone.tsx`) use `toFixed(2)` without zero-padding. These are out of scope for this change (different display context, interactive UI).

## Integration Points

### kneeboard.py

- New function `generate_waypoint_list_page(flight_plan) -> bytes` that creates the 768x1024 PNG
- Called in the multi-leg ZIP generation path, before leg pages
- Output saved as `0wpts.png` in the ZIP

### map_annotations.py

- Reuse/adapt `_format_coord_ddm` for coordinate formatting (with the longitude fix)
- Reuse waypoint shape drawing logic (circle, diamond, triangle) scaled down for table row height
- New drawing function for the table layout

### Monospace Font

- Use `/packages/backend/config/fonts/fixed.ttf` (already available)
