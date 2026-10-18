"""Tests for coordinate formatting in map_annotations."""

from PIL import Image, ImageDraw
from map_annotations import _format_coord_ddm, draw_comment_strip


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


def _make_draw(width=768, height=1024):
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def test_draw_comment_strip_short():
    img, draw = _make_draw()
    draw_comment_strip(draw, "Freq 251.0 before push", 768, 1024)
    # Should produce at least one non-transparent pixel near the bottom
    pixels = list(img.crop((0, 950, 768, 1024)).getdata())
    assert any(p[3] > 0 for p in pixels)


def test_draw_comment_strip_long_truncates():
    img, draw = _make_draw()
    long_comment = "This is a very long comment that definitely exceeds two lines of text on the kneeboard page and should be truncated with an ellipsis character at the end"
    draw_comment_strip(draw, long_comment, 768, 1024)
    pixels = list(img.crop((0, 950, 768, 1024)).getdata())
    assert any(p[3] > 0 for p in pixels)


def test_draw_comment_strip_empty_does_nothing():
    img, draw = _make_draw()
    draw_comment_strip(draw, "   ", 768, 1024)
    pixels = list(img.getdata())
    assert all(p[3] == 0 for p in pixels)


# --- Unresolved library refs (add-library-profile-sync, task 6.2; map-objects) ---

def _plan_with_refs(refs, snapshot):
    from flight_plan import FlightPlan
    return FlightPlan.model_validate({
        "theatre": "caucasus", "points": [], "declination": 0, "bankAngle": 45,
        "initTimeSec": 0, "initFob": 0, "name": "P",
        "libraryRefs": refs, "librarySnapshot": snapshot,
    })


def _drawn_pixels(plan, draw_fn):
    from map_annotations import draw_plan_objects, draw_threat_rings
    img = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    to_px = lambda lat, lon: (200 + (lon - 41) * 100, 200 - (lat - 42) * 100)
    if draw_fn == "objects":
        draw_plan_objects(img, plan, to_px)
    else:
        draw_threat_rings(ImageDraw.Draw(img), img, plan, to_px)
    return sum(1 for px in img.getdata() if px[3] != 0)


def test_unresolved_ref_is_skipped_on_the_kneeboard():
    """A ref with no snapshot entry draws nothing and raises nothing."""
    sam = {"id": "sam", "type": "sam_site", "lat": 42.0, "lon": 41.0, "name": "SA-10", "range": 1.0}
    only_resolved = _plan_with_refs([{"uuid": "sam"}], [sam])
    with_dangling = _plan_with_refs([{"uuid": "sam"}, {"uuid": "gone"}], [sam])
    for fn in ("objects", "rings"):
        assert _drawn_pixels(only_resolved, fn) > 0
        assert _drawn_pixels(with_dangling, fn) == _drawn_pixels(only_resolved, fn)
    assert _drawn_pixels(_plan_with_refs([{"uuid": "gone"}], []), "objects") == 0
