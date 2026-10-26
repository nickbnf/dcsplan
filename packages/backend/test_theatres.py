"""Tests for the theatre and map catalogue (add-theatre-maps)."""
import pytest

import theatres


def test_catalogue_lists_existing_theatres_with_default_map():
    catalogue = {t["id"]: t for t in theatres.catalogue()}
    assert set(catalogue) == {"caucasus", "germany", "syria"}
    for theatre in catalogue.values():
        assert theatre["default_map"] == "default"
        assert [m["id"] for m in theatre["maps"]] == ["default"]
    assert catalogue["germany"]["name"] == "Germany"


def test_none_resolves_to_default_map():
    assert theatres.resolve_map_id("syria", None) == "default"
    assert "zoom_info" in theatres.load_map("syria")


def test_navigation_block_present():
    navigation = theatres.load_theatre("germany")["navigation"]
    assert navigation["mode"] == "projected"
    assert navigation["projection"] == "transverse_mercator"


def test_unknown_map_raises():
    with pytest.raises(theatres.UnknownMapError):
        theatres.resolve_map_id("syria", "nope")


def test_unknown_theatre_raises():
    with pytest.raises(theatres.UnknownTheatreError):
        theatres.load_theatre("atlantis")


@pytest.mark.parametrize("bad", ["../syria", "syria/..", "..", "a/b", ""])
def test_path_like_ids_rejected(bad):
    with pytest.raises(theatres.UnknownTheatreError):
        theatres.load_theatre(bad)
    with pytest.raises(theatres.UnknownMapError):
        theatres.resolve_map_id("syria", bad)


def test_catalogue_with_two_maps(tmp_path, monkeypatch):
    theatre_dir = tmp_path / "demo"
    (theatre_dir / "maps").mkdir(parents=True)
    (theatre_dir / "theatre.json").write_text(
        '{"theatre_name": "Demo", "default_map": "a", "navigation": {"mode": "geographic"}}'
    )
    (theatre_dir / "maps" / "a.json").write_text('{"map_name": "Alpha"}')
    (theatre_dir / "maps" / "b.json").write_text('{"map_name": "Bravo"}')
    monkeypatch.setattr(theatres, "THEATRES_DIR", str(tmp_path))

    [demo] = theatres.catalogue()
    assert demo == {
        "id": "demo",
        "name": "Demo",
        "default_map": "a",
        "maps": [{"id": "a", "name": "Alpha"}, {"id": "b", "name": "Bravo"}],
    }
    assert theatres.resolve_map_id("demo", "b") == "b"
