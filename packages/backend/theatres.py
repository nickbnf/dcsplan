"""Theatre and map catalogue (add-theatre-maps).

Static configuration, one directory per theatre:

    theatres/<theatre>/theatre.json       name, default map, navigation settings
    theatres/<theatre>/maps/<map>.json    georeference (crs, origin, resolution,
                                          control points) and tile grid

The theatre owns the navigation settings used for leg calculations; a map only
describes how the theatre is drawn (see map_georeference). Ids are checked
against the catalogue before they are used to build any path.
"""
import json
import os
import re
from typing import Optional

THEATRES_DIR = os.path.join(os.path.dirname(__file__), "theatres")

_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


class UnknownTheatreError(ValueError):
    """The theatre id is not in the catalogue."""


class UnknownMapError(ValueError):
    """The map id is not offered by the theatre."""


def _valid_id(value: str) -> bool:
    return bool(_ID_PATTERN.match(value))


def _theatre_dir(theatre: str) -> str:
    if not _valid_id(theatre) or not os.path.isfile(os.path.join(THEATRES_DIR, theatre, "theatre.json")):
        raise UnknownTheatreError(theatre)
    return os.path.join(THEATRES_DIR, theatre)


def theatre_ids() -> list[str]:
    """Ids of every configured theatre, sorted."""
    if not os.path.isdir(THEATRES_DIR):
        return []
    return sorted(
        name for name in os.listdir(THEATRES_DIR)
        if _valid_id(name) and os.path.isfile(os.path.join(THEATRES_DIR, name, "theatre.json"))
    )


def load_theatre(theatre: str) -> dict:
    """The theatre config: `theatre_name`, `default_map`, `navigation`."""
    with open(os.path.join(_theatre_dir(theatre), "theatre.json"), encoding="utf-8") as f:
        return json.load(f)


def map_ids(theatre: str) -> list[str]:
    """Ids of the maps offered by a theatre, sorted."""
    maps_dir = os.path.join(_theatre_dir(theatre), "maps")
    if not os.path.isdir(maps_dir):
        return []
    return sorted(
        name[:-5] for name in os.listdir(maps_dir)
        if name.endswith(".json") and _valid_id(name[:-5])
    )


def resolve_map_id(theatre: str, map_id: Optional[str] = None) -> str:
    """The map to use: `map_id` if the theatre offers it, the default if None."""
    if map_id is None:
        map_id = load_theatre(theatre)["default_map"]
    if not _valid_id(map_id) or map_id not in map_ids(theatre):
        raise UnknownMapError(map_id)
    return map_id


def map_path(theatre: str, map_id: Optional[str] = None) -> str:
    """Path of a map config file, after validating both ids."""
    return os.path.join(_theatre_dir(theatre), "maps", f"{resolve_map_id(theatre, map_id)}.json")


def load_map(theatre: str, map_id: Optional[str] = None) -> dict:
    """A map config; the theatre's default map when `map_id` is None."""
    with open(map_path(theatre, map_id), encoding="utf-8") as f:
        return json.load(f)


def catalogue() -> list[dict]:
    """Every theatre with its name, default map and maps."""
    result = []
    for theatre in theatre_ids():
        config = load_theatre(theatre)
        maps = [{"id": m, "name": load_map(theatre, m).get("map_name", m)} for m in map_ids(theatre)]
        result.append({
            "id": theatre,
            "name": config.get("theatre_name", theatre),
            "default_map": config["default_map"],
            "maps": maps,
        })
    return result
