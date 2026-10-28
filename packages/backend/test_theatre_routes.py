"""Theatre, map and tile routes (add-theatre-maps D2)."""
import pytest
from fastapi.testclient import TestClient

import main
from main import app

client = TestClient(app)


def test_catalogue_shape():
    response = client.get("/theatres")
    assert response.status_code == 200
    catalogue = {t["id"]: t for t in response.json()["theatres"]}
    assert set(catalogue) == {"caucasus", "germany", "syria"}
    assert catalogue["syria"] == {
        "id": "syria",
        "name": "Syria",
        "default_map": "default",
        "maps": [{"id": "default", "name": "Default"}],
    }


def test_theatre_file_served():
    response = client.get("/theatres/germany/theatre.json")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    body = response.json()
    assert body["default_map"] == "default"
    assert body["navigation"]["mode"] == "projected"


def test_map_file_served():
    response = client.get("/theatres/syria/maps/default.json")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    assert "zoom_info" in response.json()


@pytest.mark.parametrize("path", [
    "/theatres/atlantis/theatre.json",
    "/theatres/syria.json",  # the pre-add-theatre-maps URL is gone
    "/theatres/atlantis/maps/default.json",
    "/theatres/syria/maps/nope.json",
    "/tiles/atlantis/default/0/0/0.png",
    "/tiles/syria/nope/0/0/0.png",
])
def test_unknown_theatre_or_map_is_404(path):
    assert client.get(path).status_code == 404


def test_tile_served_from_map_directory(tmp_path, monkeypatch):
    tile_dir = tmp_path / "syria" / "default" / "3" / "2"
    tile_dir.mkdir(parents=True)
    (tile_dir / "1.png").write_bytes(b"tile-bytes")
    monkeypatch.setattr(main, "TILES_DIR", str(tmp_path))

    response = client.get("/tiles/syria/default/3/2/1.png")
    assert response.status_code == 200
    assert response.content == b"tile-bytes"


def test_missing_tile_falls_back_to_blank(tmp_path, monkeypatch):
    # config/ is not in the repo (it is mounted in deployments), so bring our own blank tile
    blank = tmp_path / "blank.png"
    blank.write_bytes(b"blank-bytes")
    monkeypatch.setattr(main, "BLANK_TILE_PATH", str(blank))
    monkeypatch.setattr(main, "TILES_DIR", str(tmp_path / "tiles"))
    response = client.get("/tiles/syria/default/3/2/1.png")
    assert response.status_code == 200
    assert response.content == b"blank-bytes"
