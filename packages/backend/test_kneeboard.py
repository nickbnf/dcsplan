"""
Unit tests for the kneeboard generation module.

Tests cover validation, error conditions, and PNG generation.
"""

import pytest
import os
import json
from pydantic import ValidationError
from flight_plan import FlightPlan, FlightPlanTurnPoint
from kneeboard import generate_kneeboard_single_png, TILES_DIR, TILES_INFO_PATH


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
        "theatre": "syria_old",
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
        "theatre": "syria_old",
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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

