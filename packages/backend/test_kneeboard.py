"""
Unit tests for the kneeboard generation module.

Tests cover validation, error conditions, and PNG generation.
"""

import io
import zipfile
import pytest
import os
import json
from pydantic import ValidationError
from flight_plan import FlightPlan, FlightPlanTurnPoint
from kneeboard import generate_kneeboard_single_png, generate_kneeboard_zip, TILES_DIR, TILES_INFO_PATH


# Test fixtures for valid flight plan data
# Using coordinates within tile bounds (Middle East region: ~30-42°E, 31-38°N)

@pytest.fixture(scope="session")
def mock_tiles_info():
    """
    Create a minimal tiles_info.json file for testing.
    This fixture creates the file before tests run and cleans it up after.
    Only creates the file if it doesn't already exist.
    """
    # Create directory if it doesn't exist
    os.makedirs(TILES_DIR, exist_ok=True)
    
    # Check if file already exists (e.g., in local development)
    file_existed = os.path.exists(TILES_INFO_PATH)
    
    if not file_existed:
        # Create minimal tile info with a few zoom levels
        # This matches the structure expected by the code
        mock_tile_info = {
            "zoom_info": [
                {
                    "zoom": 0,
                    "nb_tiles_w": 1,
                    "nb_tiles_h": 1,
                    "width_px": 156,
                    "height_px": 104
                },
                {
                    "zoom": 1,
                    "nb_tiles_w": 2,
                    "nb_tiles_h": 1,
                    "width_px": 313,
                    "height_px": 208
                },
                {
                    "zoom": 2,
                    "nb_tiles_w": 3,
                    "nb_tiles_h": 2,
                    "width_px": 627,
                    "height_px": 416
                },
                {
                    "zoom": 3,
                    "nb_tiles_w": 5,
                    "nb_tiles_h": 4,
                    "width_px": 1255,
                    "height_px": 832
                },
                {
                    "zoom": 4,
                    "nb_tiles_w": 10,
                    "nb_tiles_h": 7,
                    "width_px": 2511,
                    "height_px": 1665
                },
                {
                    "zoom": 5,
                    "nb_tiles_w": 20,
                    "nb_tiles_h": 14,
                    "width_px": 5022,
                    "height_px": 3331
                },
                {
                    "zoom": 6,
                    "nb_tiles_w": 40,
                    "nb_tiles_h": 27,
                    "width_px": 10044,
                    "height_px": 6662
                },
                {
                    "zoom": 7,
                    "nb_tiles_w": 79,
                    "nb_tiles_h": 53,
                    "width_px": 20089,
                    "height_px": 13324
                }
            ]
        }
        
        # Write the mock file
        with open(TILES_INFO_PATH, 'w') as f:
            json.dump(mock_tile_info, f, indent=4)
    
    yield TILES_INFO_PATH
    
    # Cleanup: only remove the file if we created it
    if not file_existed and os.path.exists(TILES_INFO_PATH):
        try:
            # Double-check it's our mock file before removing
            with open(TILES_INFO_PATH, 'r') as f:
                content = json.load(f)
                # Only remove if it looks like our mock (has exactly 8 zoom levels)
                if len(content.get('zoom_info', [])) == 8:
                    os.remove(TILES_INFO_PATH)
        except (json.JSONDecodeError, IOError):
            # If we can't read it, leave it alone
            pass


@pytest.fixture
def valid_turn_point():
    """Create a valid turn point for testing."""
    return {
        "lat": 34.0,
        "lon": 36.0,
        "tas": 400,
        "alt": 3000,
        "fuelFlow": 6000,
        "windSpeed": 20,
        "windDir": 270
    }


@pytest.fixture
def valid_flight_plan():
    """Create a valid flight plan for testing."""
    return {
        "theatre": "syria",
        "points": [
            {
                "lat": 34.0,
                "lon": 36.0,
                "tas": 400,
                "alt": 3000,
                "fuelFlow": 6000,
                "windSpeed": 20,
                "windDir": 270
            },
            {
                "lat": 35.0,
                "lon": 37.0,
                "tas": 400,
                "alt": 3000,
                "fuelFlow": 6000,
                "windSpeed": 20,
                "windDir": 270
            },
            {
                "lat": 36.0,
                "lon": 38.0,
                "tas": 400,
                "alt": 3000,
                "fuelFlow": 6000,
                "windSpeed": 20,
                "windDir": 270
            }
        ],
        "declination": 12.5,
        "bankAngle": 30.0,
        "initTimeSec": 43200,  # 12:00:00 = 12 * 3600
        "initFob": 12000
    }


@pytest.fixture
def minimal_flight_plan():
    """Create a minimal flight plan with just 2 waypoints."""
    return {
        "theatre": "syria",
        "points": [
            {"lat": 34.0, "lon": 36.0, "tas": 400, "alt": 3000, "fuelFlow": 6000, "windSpeed": 20, "windDir": 270},
            {"lat": 35.0, "lon": 37.0, "tas": 400, "alt": 3000, "fuelFlow": 6000, "windSpeed": 20, "windDir": 270}
        ],
        "declination": 12.5,
        "bankAngle": 30.0,
        "initTimeSec": 43200,  # 12:00:00 = 12 * 3600
        "initFob": 12000
    }


class TestFlightPlanTurnPoint:
    """Test suite for FlightPlanTurnPoint validation."""
    
    def test_valid_turn_point(self, valid_turn_point):
        """Test that a valid turn point is accepted."""
        point = FlightPlanTurnPoint(**valid_turn_point)
        assert point.lat == 34.0
        assert point.lon == 36.0
    
    def test_invalid_latitude_too_high(self, valid_turn_point):
        """Test that latitude > 90 is rejected."""
        valid_turn_point["lat"] = 91.0
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_latitude_too_low(self, valid_turn_point):
        """Test that latitude < -90 is rejected."""
        valid_turn_point["lat"] = -91.0
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_longitude_too_high(self, valid_turn_point):
        """Test that longitude > 180 is rejected."""
        valid_turn_point["lon"] = 181.0
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_longitude_too_low(self, valid_turn_point):
        """Test that longitude < -180 is rejected."""
        valid_turn_point["lon"] = -181.0
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_tas_negative(self, valid_turn_point):
        """Test that negative TAS is rejected."""
        valid_turn_point["tas"] = -100
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_altitude_negative(self, valid_turn_point):
        """Test that negative altitude is rejected."""
        valid_turn_point["alt"] = -1000
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_fuel_flow_negative(self, valid_turn_point):
        """Test that negative fuel flow is rejected."""
        valid_turn_point["fuelFlow"] = -100
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_wind_speed_negative(self, valid_turn_point):
        """Test that negative wind speed is rejected."""
        valid_turn_point["windSpeed"] = -10
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_wind_direction_too_high(self, valid_turn_point):
        """Test that wind direction > 360 is rejected."""
        valid_turn_point["windDir"] = 361
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_invalid_wind_direction_negative(self, valid_turn_point):
        """Test that negative wind direction is rejected."""
        valid_turn_point["windDir"] = -1
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_missing_latitude(self, valid_turn_point):
        """Test that missing latitude is rejected."""
        del valid_turn_point["lat"]
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)
    
    def test_missing_tas(self, valid_turn_point):
        """Test that missing TAS is rejected."""
        del valid_turn_point["tas"]
        with pytest.raises(ValidationError):
            FlightPlanTurnPoint(**valid_turn_point)


class TestFlightPlan:
    """Test suite for FlightPlan validation."""
    
    def test_valid_flight_plan(self, valid_flight_plan):
        """Test that a valid flight plan is accepted."""
        plan = FlightPlan(**valid_flight_plan)
        assert len(plan.points) == 3
        assert plan.declination == 12.5
    
    def test_invalid_init_time_hour_too_high(self, valid_flight_plan):
        """Test that initial time > 86399 seconds is rejected."""
        valid_flight_plan["initTimeSec"] = 86400
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_invalid_init_time_hour_negative(self, valid_flight_plan):
        """Test that negative initial time is rejected."""
        valid_flight_plan["initTimeSec"] = -1
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_invalid_init_time_min_too_high(self, valid_flight_plan):
        """Test that initial time > 86399 seconds is rejected."""
        valid_flight_plan["initTimeSec"] = 86400
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_invalid_init_time_min_negative(self, valid_flight_plan):
        """Test that negative initial time is rejected."""
        valid_flight_plan["initTimeSec"] = -1
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_invalid_init_fob_negative(self, valid_flight_plan):
        """Test that negative initial FOB is rejected."""
        valid_flight_plan["initFob"] = -100
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_empty_points_list(self, valid_flight_plan):
        """Test that an empty points list is accepted (Pydantic allows this)."""
        valid_flight_plan["points"] = []
        plan = FlightPlan(**valid_flight_plan)
        assert len(plan.points) == 0
    
    def test_missing_points(self, valid_flight_plan):
        """Test that missing points field is rejected."""
        del valid_flight_plan["points"]
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_missing_declination(self, valid_flight_plan):
        """Test that missing declination is rejected."""
        del valid_flight_plan["declination"]
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)


class TestCalculateETE:
    """Test suite for ETE calculation."""
    
    @pytest.mark.skip(reason="calculate_ete function not implemented")
    def test_calculate_ete_normal_case(self):
        """Test ETE calculation between two waypoints."""
        origin = FlightPlanTurnPoint(
            lat=34.0, lon=36.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=20, windDir=270
        )
        destination = FlightPlanTurnPoint(
            lat=35.0, lon=37.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=20, windDir=270
        )
        
        ete = calculate_ete(origin, destination)
        
        # ETE should be a positive number
        assert isinstance(ete, float)
        assert ete > 0
    
    @pytest.mark.skip(reason="calculate_ete function not implemented")
    def test_calculate_ete_with_headwind(self):
        """Test ETE calculation with strong headwind."""
        origin = FlightPlanTurnPoint(
            lat=34.0, lon=36.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=100, windDir=90  # Strong headwind
        )
        destination = FlightPlanTurnPoint(
            lat=35.0, lon=37.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=100, windDir=90
        )
        
        ete = calculate_ete(origin, destination)
        
        # Should still be a positive number
        assert isinstance(ete, float)
        assert ete > 0
    
    @pytest.mark.skip(reason="calculate_ete function not implemented")
    def test_calculate_ete_with_tailwind(self):
        """Test ETE calculation with tailwind."""
        origin = FlightPlanTurnPoint(
            lat=34.0, lon=36.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=50, windDir=270  # Tailwind
        )
        destination = FlightPlanTurnPoint(
            lat=35.0, lon=37.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=50, windDir=270
        )
        
        ete = calculate_ete(origin, destination)
        
        # Should be a positive number
        assert isinstance(ete, float)
        assert ete > 0


class TestCalculateTotalDuration:
    """Test suite for total duration calculation."""
    
    @pytest.mark.skip(reason="calculate_total_duration function not implemented")
    def test_calculate_total_duration_valid(self, minimal_flight_plan):
        """Test total duration calculation with valid flight plan."""
        plan = FlightPlan(**minimal_flight_plan)
        duration = calculate_total_duration(plan)
        
        # Duration should be a positive number
        assert isinstance(duration, float)
        assert duration > 0
    
    @pytest.mark.skip(reason="calculate_total_duration function not implemented")
    def test_calculate_total_duration_multiple_legs(self, valid_flight_plan):
        """Test total duration calculation with multiple legs."""
        plan = FlightPlan(**valid_flight_plan)
        duration = calculate_total_duration(plan)
        
        assert isinstance(duration, float)
        assert duration > 0
    
    @pytest.mark.skip(reason="calculate_total_duration function not implemented")
    def test_calculate_total_duration_insufficient_points(self, valid_flight_plan):
        """Test that ValueError is raised for flight plan with only 1 point."""
        valid_flight_plan["points"] = [valid_flight_plan["points"][0]]
        plan = FlightPlan(**valid_flight_plan)
        
        with pytest.raises(ValueError, match="at least 2 waypoints"):
            calculate_total_duration(plan)
    
    @pytest.mark.skip(reason="calculate_total_duration function not implemented")
    def test_calculate_total_duration_empty_points(self, valid_flight_plan):
        """Test that ValueError is raised for empty flight plan."""
        valid_flight_plan["points"] = []
        plan = FlightPlan(**valid_flight_plan)
        
        with pytest.raises(ValueError, match="at least 2 waypoints"):
            calculate_total_duration(plan)


class TestGenerateKneeboardPNG:
    """Test suite for PNG generation."""
    
    def test_generate_png_valid_flight_plan(self, minimal_flight_plan, mock_tiles_info):
        """Test PNG generation with a valid flight plan."""
        plan = FlightPlan(**minimal_flight_plan)
        png_data = generate_kneeboard_single_png(plan, 0)  # leg_index is 0-indexed
        
        assert isinstance(png_data, bytes)
        assert len(png_data) > 0
        
        # Check that it's valid PNG data (starts with PNG signature)
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'
    
    def test_generate_png_multiple_legs(self, valid_flight_plan, mock_tiles_info):
        """Test PNG generation with multiple legs (should use first leg)."""
        plan = FlightPlan(**valid_flight_plan)
        png_data = generate_kneeboard_single_png(plan, 0)  # leg_index is 0-indexed
        
        assert isinstance(png_data, bytes)
        assert len(png_data) > 0
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'
    
    def test_generate_png_insufficient_waypoints(self, valid_flight_plan):
        """Test PNG generation with insufficient waypoints."""
        valid_flight_plan["points"] = [valid_flight_plan["points"][0]]
        plan = FlightPlan(**valid_flight_plan)

        with pytest.raises(ValueError, match="at least 2 waypoints"):
            generate_kneeboard_single_png(plan, 0)

    def test_generate_png_with_destination_comment(self, minimal_flight_plan, mock_tiles_info):
        """Test that PNG generation succeeds when the destination waypoint has a comment."""
        minimal_flight_plan["points"][1]["comment"] = "Check AWACS freq 251.0 before push"
        plan = FlightPlan(**minimal_flight_plan)
        png_data = generate_kneeboard_single_png(plan, 0)
        assert isinstance(png_data, bytes)
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'

    def test_generate_png_without_comment_unchanged(self, minimal_flight_plan, mock_tiles_info):
        """Test that PNG generation succeeds and is unaffected when no comment is set."""
        plan = FlightPlan(**minimal_flight_plan)
        png_data = generate_kneeboard_single_png(plan, 0)
        assert isinstance(png_data, bytes)
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'


class TestIntegration:
    """Integration tests for the full workflow."""
    
    def test_full_workflow(self, minimal_flight_plan, mock_tiles_info):
        """Test the full workflow from flight plan to PNG."""
        # Parse flight plan
        plan = FlightPlan(**minimal_flight_plan)
        
        # Generate PNG (first leg map)
        png_data = generate_kneeboard_single_png(plan, 0)  # leg_index is 0-indexed
        
        # Verify results
        assert isinstance(png_data, bytes)
        assert len(png_data) > 0
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'
    
    def test_malformed_json_handling(self):
        """Test that malformed JSON is properly rejected."""
        # Missing required fields
        malformed_data = {
            "points": [{"lat": 32.0}]  # Missing lon and other fields
        }
        
        with pytest.raises(ValidationError):
            FlightPlan(**malformed_data)
    
    def test_invalid_data_types(self, valid_flight_plan):
        """Test that invalid data types are rejected."""
        valid_flight_plan["initTimeSec"] = "not_a_number"
        
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_edge_case_coordinates(self):
        """Test edge cases for coordinate validation."""
        # Test that boundary values are accepted
        edge_point = {
            "lat": 90.0,  # Maximum
            "lon": 180.0,  # Maximum
            "tas": 400,
            "alt": 3000,
            "fuelFlow": 6000,
            "windSpeed": 0,
            "windDir": 0
        }
        
        # Should be valid
        point = FlightPlanTurnPoint(**edge_point)
        assert point.lat == 90.0
        assert point.lon == 180.0
        
        # Test minimum values
        edge_point["lat"] = -90.0
        edge_point["lon"] = -180.0
        
        point = FlightPlanTurnPoint(**edge_point)
        assert point.lat == -90.0
        assert point.lon == -180.0


def test_zip_contains_waypoint_list_page(mock_tiles_info, valid_flight_plan):
    """Multi-leg ZIP should include 0wpts.png as first entry."""
    flight_plan = FlightPlan(**valid_flight_plan)
    result = generate_kneeboard_zip(flight_plan)
    with zipfile.ZipFile(io.BytesIO(result)) as zf:
        names = zf.namelist()
        assert "0wpts.png" in names
        assert names[0] == "0wpts.png"
        # Verify it's a valid PNG
        wpts_data = zf.read("0wpts.png")
        assert wpts_data[:8] == b'\x89PNG\r\n\x1a\n'


def test_zip_contains_overview_page(mock_tiles_info, valid_flight_plan):
    """Multi-leg ZIP should include 1overview.png as the second entry."""
    flight_plan = FlightPlan(**valid_flight_plan)
    result = generate_kneeboard_zip(flight_plan)
    with zipfile.ZipFile(io.BytesIO(result)) as zf:
        names = zf.namelist()
        assert "1overview.png" in names
        # Should be the second file (after 0wpts.png)
        assert names[1] == "1overview.png"
        # Should be a valid 768x1024 PNG
        overview_data = zf.read("1overview.png")
        assert overview_data[:8] == b'\x89PNG\r\n\x1a\n'
        from PIL import Image
        img = Image.open(io.BytesIO(overview_data))
        assert img.width == 768
        assert img.height == 1024
        # Leg files should still follow after the overview
        assert names[2] == "leg_01.png"


def test_revision_stamps_only_the_waypoint_list_page(mock_tiles_info, valid_flight_plan):
    """add-version-history task 6.1 (spec: only the waypoint list page is stamped)."""
    from flight_plan import KneeboardRevision
    flight_plan = FlightPlan(**valid_flight_plan)
    revision = KneeboardRevision(rev=5, finalizedAt="2026-07-23T14:32:00+00:00", editor="Falcon")
    plain = zipfile.ZipFile(io.BytesIO(generate_kneeboard_zip(flight_plan)))
    stamped = zipfile.ZipFile(io.BytesIO(generate_kneeboard_zip(flight_plan, revision=revision)))
    for name in plain.namelist():
        if name != "0wpts.png":
            assert plain.read(name) == stamped.read(name), name
    assert plain.read("0wpts.png") != stamped.read("0wpts.png")


def test_kneeboard_request_revision_is_optional(valid_flight_plan):
    from flight_plan import KneeboardRequest
    aircraft = {"model": "", "takeoffConfiguration": "", "regimes": []}
    plain = KneeboardRequest(flightPlan=valid_flight_plan, aircraft=aircraft)
    assert plain.revision is None
    stamped = KneeboardRequest(
        flightPlan=valid_flight_plan, aircraft=aircraft,
        revision={"rev": 5, "finalizedAt": "2026-07-23T14:32:00+00:00", "editor": "Falcon +2"},
    )
    assert stamped.revision.rev == 5


# --- add-theatre-maps (D7): the kneeboard draws on the requested map ---

def test_map_info_defaults_to_theatre_default_map():
    from kneeboard import _get_map_info
    map_info = _get_map_info("syria")
    assert map_info.theatre == "syria"
    assert map_info.map_id == "default"


def test_fetch_tile_reads_map_directory(tmp_path, monkeypatch):
    from PIL import Image
    import kneeboard
    tile_dir = tmp_path / "syria" / "alt" / "2" / "1"
    tile_dir.mkdir(parents=True)
    Image.new("RGB", (256, 256), (10, 20, 30)).save(tile_dir / "0.png")
    monkeypatch.setattr(kneeboard, "TILES_DIR", str(tmp_path))
    tile = kneeboard._fetch_tile("syria", "alt", 2, 1, 0)
    assert tile.getpixel((0, 0)) == (10, 20, 30)


# --- georeference-control-points: any proj CRS, Lambert conformal conic included ---

LCC_CRS = "+proj=lcc +lat_0=0 +lon_0=10.5 +lat_1=50 +lat_2=54 +ellps=WGS84 +units=m +no_defs"


@pytest.fixture
def lcc_theatre(tmp_path, monkeypatch):
    """A theatre whose only map is drawn in a Lambert conformal conic projection."""
    from pyproj import Transformer
    import kneeboard
    import theatres

    width, height, resolution = 5120, 4096, 100.0
    origin_x, origin_y = Transformer.from_crs("EPSG:4326", LCC_CRS, always_xy=True).transform(7.0, 52.0)
    inverse = Transformer.from_crs(LCC_CRS, "EPSG:4326", always_xy=True)
    control_points = []
    for px, py in [(512.5, 409.5), (4608.5, 409.5), (2560.5, 2048.5), (512.5, 3686.5), (4608.5, 3686.5)]:
        lon, lat = inverse.transform(origin_x + resolution * px, origin_y - resolution * py)
        control_points.append({"label": f"P{len(control_points)}", "px": px, "py": py, "lat": lat, "lon": lon})
    natural_zoom = 5
    zoom_info = [
        {
            "zoom": z,
            "nb_tiles_w": -(-width // (256 * 2 ** (natural_zoom - z))),
            "nb_tiles_h": -(-height // (256 * 2 ** (natural_zoom - z))),
            "width_px": width // 2 ** (natural_zoom - z),
            "height_px": height // 2 ** (natural_zoom - z),
        }
        for z in range(natural_zoom + 1)
    ]
    map_cfg = {
        "map_name": "LCC", "crs": LCC_CRS, "origin_x": origin_x, "origin_y": origin_y,
        "resolution": resolution, "image_width_px": width, "image_height_px": height,
        "control_points": control_points, "zoom_info": zoom_info,
    }
    theatre_dir = tmp_path / "theatres" / "lccdemo"
    (theatre_dir / "maps").mkdir(parents=True)
    (theatre_dir / "theatre.json").write_text(json.dumps({
        "theatre_name": "LCC demo", "default_map": "default",
        "navigation": {"mode": "projected", "projection": "transverse_mercator", "central_meridian": 10.5},
    }))
    (theatre_dir / "maps" / "default.json").write_text(json.dumps(map_cfg))
    monkeypatch.setattr(theatres, "THEATRES_DIR", str(tmp_path / "theatres"))
    monkeypatch.setattr(kneeboard, "TILES_DIR", str(tmp_path / "tiles"))
    return map_cfg


def test_lcc_map_places_control_points_on_their_pixels(lcc_theatre):
    from kneeboard import _get_map_info, _get_resolution_for_zoom, _transformer_for_projection
    map_info = _get_map_info("lccdemo")
    transformer = _transformer_for_projection(map_info)
    for zoom in (5, 3):
        resolution = _get_resolution_for_zoom(map_info, zoom)
        scale = map_info.image_width_px / next(z.width_px for z in map_info.zoom_info if z.zoom == zoom)
        for cp in lcc_theatre["control_points"]:
            x, y = transformer.transform(cp["lon"], cp["lat"])
            assert (x - map_info.origin_x) / resolution == pytest.approx(cp["px"] / scale, abs=0.01)
            assert (map_info.origin_y - y) / resolution == pytest.approx(cp["py"] / scale, abs=0.01)


def test_kneeboard_renders_on_lcc_map(lcc_theatre):
    from PIL import Image
    points = [
        {"lat": cp["lat"], "lon": cp["lon"], "tas": 400, "alt": 3000, "fuelFlow": 6000,
         "windSpeed": 0, "windDir": 0}
        for cp in lcc_theatre["control_points"][:3]
    ]
    flight_plan = FlightPlan(
        theatre="lccdemo", points=points, declination=0, bankAngle=30, initTimeSec=0, initFob=10000,
    )
    image = Image.open(io.BytesIO(generate_kneeboard_single_png(flight_plan, 0)))
    assert image.size == (768, 1024)


@pytest.fixture
def kneeboard_client():
    from fastapi.testclient import TestClient
    from main import app
    from task_queue import get_task_queue
    return TestClient(app), get_task_queue()


def _kneeboard_body(flight_plan):
    return {"flightPlan": flight_plan, "aircraft": {"model": "", "takeoffConfiguration": "", "regimes": []}}


def test_kneeboard_request_without_map_uses_default(kneeboard_client, valid_flight_plan):
    client, queue = kneeboard_client
    response = client.post("/kneeboard?output=1", json=_kneeboard_body(valid_flight_plan))
    assert response.status_code == 200
    assert queue._tasks[response.json()["task_id"]].map_id == "default"


def test_kneeboard_request_with_unknown_map_is_rejected(kneeboard_client, valid_flight_plan):
    client, queue = kneeboard_client
    tasks_before = set(queue._tasks)
    response = client.post("/kneeboard?output=1&map=nope", json=_kneeboard_body(valid_flight_plan))
    assert response.status_code == 400
    assert "nope" in response.json()["detail"]
    assert set(queue._tasks) == tasks_before


if __name__ == "__main__":
    pytest.main([__file__, "-v"])



def test_control_point_accepts_degrees_decimal_minutes():
    from kneeboard import ControlPoint
    cp = ControlPoint(label="Kutaisi", px=10.5, py=20.5, lat="N 42°10.770'", lon="E 042°28.932'")
    assert cp.lat == pytest.approx(42 + 10.770 / 60)
    assert cp.lon == pytest.approx(42 + 28.932 / 60)
    with pytest.raises(ValueError, match="hemisphere"):
        ControlPoint(px=0, py=0, lat="E 042°28.932'", lon=42.0)
