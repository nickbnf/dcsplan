#!/usr/bin/env python3
"""
One-off migration (add-theatre-maps): split each flat theatre config
`backend/theatres/<id>.json` into the theatre -> map layout:

    backend/theatres/<id>/theatre.json        name, default map, navigation settings
    backend/theatres/<id>/maps/default.json   display projection, tile grid, bounds

The navigation block copies the old projection fields, so computed leg values
are unchanged. The old flat file is removed once its split has been checked.

Usage:
    python split_theatre_config.py [theatres_dir]
"""

import json
import os
import sys

NAVIGATION_PROJECTION_FIELDS = ("projection", "central_meridian", "std_parallel1", "std_parallel2")
THEATRE_ONLY_FIELDS = ("theatre_name", "navigation_mode")
DEFAULT_MAP_ID = "default"


def split(config: dict) -> tuple[dict, dict]:
    navigation = {"mode": config.get("navigation_mode", "geographic")}
    for field in NAVIGATION_PROJECTION_FIELDS:
        if field in config:
            navigation[field] = config[field]

    theatre = {
        "theatre_name": config["theatre_name"],
        "default_map": DEFAULT_MAP_ID,
        "navigation": navigation,
    }
    map_config = {"map_name": "Default"}
    map_config.update({k: v for k, v in config.items() if k not in THEATRE_ONLY_FIELDS})
    return theatre, map_config


def check(config: dict, theatre: dict, map_config: dict) -> None:
    """Every old field must survive the split, unchanged."""
    for key, value in config.items():
        if key == "navigation_mode":
            found = theatre["navigation"]["mode"]
        elif key == "theatre_name":
            found = theatre["theatre_name"]
        else:
            found = map_config.get(key)
        if found != value:
            raise SystemExit(f"Field {key!r} lost or changed in the split")
    for field in NAVIGATION_PROJECTION_FIELDS:
        if theatre["navigation"].get(field) != config.get(field):
            raise SystemExit(f"Navigation field {field!r} differs from the old config")


def main() -> None:
    theatres_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "..", "..", "backend", "theatres"
    )
    for filename in sorted(os.listdir(theatres_dir)):
        if not filename.endswith(".json"):
            continue
        theatre_id = filename[:-5]
        old_path = os.path.join(theatres_dir, filename)
        with open(old_path) as f:
            config = json.load(f)

        theatre, map_config = split(config)
        check(config, theatre, map_config)

        maps_dir = os.path.join(theatres_dir, theatre_id, "maps")
        os.makedirs(maps_dir, exist_ok=True)
        with open(os.path.join(theatres_dir, theatre_id, "theatre.json"), "w") as f:
            json.dump(theatre, f, indent=4)
            f.write("\n")
        with open(os.path.join(maps_dir, f"{DEFAULT_MAP_ID}.json"), "w") as f:
            json.dump(map_config, f, indent=4)
            f.write("\n")
        os.remove(old_path)
        print(f"{theatre_id}: split into theatre.json + maps/{DEFAULT_MAP_ID}.json")


if __name__ == "__main__":
    main()
