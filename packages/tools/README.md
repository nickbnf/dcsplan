# Tools

This package contains development tools and utilities for the DCS Plan project.

## Usage

Add your development scripts, build tools, and other utilities here.

## Structure

- `scripts/` - Development and build scripts
- `configs/` - Shared configuration files
- `utils/` - Utility functions and helpers

## Theatre maps

`scripts/generate_tiles.py --theatre <theatre> --map <map>` produces a map for a
theatre: tiles plus `backend/theatres/<theatre>/maps/<map>.json`.
`scripts/georeference.py --theatre <theatre> --map <map>` then fits the map's
georeference from the control points recorded in that file. A theatre's
`theatre.json` (including the `navigation` settings used for all leg
calculations) is hand-maintained. See `scripts/README.md`.

