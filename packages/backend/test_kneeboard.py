"""
Unit tests for the kneeboard generation module.

Tests cover validation, error conditions, and PNG generation.
"""

import pytest
from pydantic import ValidationError
from kneeboard import (
    FlightPlan, 
    FlightPlanTurnPoint,
    calculate_ete,
    calculate_total_duration,
    generate_kneeboard_png
)


# Test fixtures for valid flight plan data
@pytest.fixture
def valid_turn_point():
    """Create a valid turn point for testing."""
    return {
        "lat": 32.0,
        "lon": -110.0,
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
        "points": [
            {
                "lat": 32.0,
                "lon": -110.0,
                "tas": 400,
                "alt": 3000,
                "fuelFlow": 6000,
                "windSpeed": 20,
                "windDir": 270
            },
            {
                "lat": 33.0,
                "lon": -111.0,
                "tas": 400,
                "alt": 3000,
                "fuelFlow": 6000,
                "windSpeed": 20,
                "windDir": 270
            },
            {
                "lat": 34.0,
                "lon": -112.0,
                "tas": 400,
                "alt": 3000,
                "fuelFlow": 6000,
                "windSpeed": 20,
                "windDir": 270
            }
        ],
        "declination": 12.5,
        "initTimeHour": 12,
        "initTimeMin": 0,
        "initFob": 12000
    }


@pytest.fixture
def minimal_flight_plan():
    """Create a minimal flight plan with just 2 waypoints."""
    return {
        "points": [
            {"lat": 32.0, "lon": -110.0, "tas": 400, "alt": 3000, "fuelFlow": 6000, "windSpeed": 20, "windDir": 270},
            {"lat": 33.0, "lon": -111.0, "tas": 400, "alt": 3000, "fuelFlow": 6000, "windSpeed": 20, "windDir": 270}
        ],
        "declination": 12.5,
        "initTimeHour": 12,
        "initTimeMin": 0,
        "initFob": 12000
    }


class TestFlightPlanTurnPoint:
    """Test suite for FlightPlanTurnPoint validation."""
    
    def test_valid_turn_point(self, valid_turn_point):
        """Test that a valid turn point is accepted."""
        point = FlightPlanTurnPoint(**valid_turn_point)
        assert point.lat == 32.0
        assert point.lon == -110.0
    
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
        """Test that initial hour > 23 is rejected."""
        valid_flight_plan["initTimeHour"] = 24
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_invalid_init_time_hour_negative(self, valid_flight_plan):
        """Test that negative initial hour is rejected."""
        valid_flight_plan["initTimeHour"] = -1
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_invalid_init_time_min_too_high(self, valid_flight_plan):
        """Test that initial minute > 59 is rejected."""
        valid_flight_plan["initTimeMin"] = 60
        with pytest.raises(ValidationError):
            FlightPlan(**valid_flight_plan)
    
    def test_invalid_init_time_min_negative(self, valid_flight_plan):
        """Test that negative initial minute is rejected."""
        valid_flight_plan["initTimeMin"] = -1
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
    
    def test_calculate_ete_normal_case(self):
        """Test ETE calculation between two waypoints."""
        origin = FlightPlanTurnPoint(
            lat=32.0, lon=-110.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=20, windDir=270
        )
        destination = FlightPlanTurnPoint(
            lat=33.0, lon=-111.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=20, windDir=270
        )
        
        ete = calculate_ete(origin, destination)
        
        # ETE should be a positive number
        assert isinstance(ete, float)
        assert ete > 0
    
    def test_calculate_ete_with_headwind(self):
        """Test ETE calculation with strong headwind."""
        origin = FlightPlanTurnPoint(
            lat=32.0, lon=-110.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=100, windDir=90  # Strong headwind
        )
        destination = FlightPlanTurnPoint(
            lat=33.0, lon=-111.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=100, windDir=90
        )
        
        ete = calculate_ete(origin, destination)
        
        # Should still be a positive number
        assert isinstance(ete, float)
        assert ete > 0
    
    def test_calculate_ete_with_tailwind(self):
        """Test ETE calculation with tailwind."""
        origin = FlightPlanTurnPoint(
            lat=32.0, lon=-110.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=50, windDir=270  # Tailwind
        )
        destination = FlightPlanTurnPoint(
            lat=33.0, lon=-111.0, tas=400, alt=3000,
            fuelFlow=6000, windSpeed=50, windDir=270
        )
        
        ete = calculate_ete(origin, destination)
        
        # Should be a positive number
        assert isinstance(ete, float)
        assert ete > 0


class TestCalculateTotalDuration:
    """Test suite for total duration calculation."""
    
    def test_calculate_total_duration_valid(self, minimal_flight_plan):
        """Test total duration calculation with valid flight plan."""
        plan = FlightPlan(**minimal_flight_plan)
        duration = calculate_total_duration(plan)
        
        # Duration should be a positive number
        assert isinstance(duration, float)
        assert duration > 0
    
    def test_calculate_total_duration_multiple_legs(self, valid_flight_plan):
        """Test total duration calculation with multiple legs."""
        plan = FlightPlan(**valid_flight_plan)
        duration = calculate_total_duration(plan)
        
        assert isinstance(duration, float)
        assert duration > 0
    
    def test_calculate_total_duration_insufficient_points(self, valid_flight_plan):
        """Test that ValueError is raised for flight plan with only 1 point."""
        valid_flight_plan["points"] = [valid_flight_plan["points"][0]]
        plan = FlightPlan(**valid_flight_plan)
        
        with pytest.raises(ValueError, match="at least 2 waypoints"):
            calculate_total_duration(plan)
    
    def test_calculate_total_duration_empty_points(self, valid_flight_plan):
        """Test that ValueError is raised for empty flight plan."""
        valid_flight_plan["points"] = []
        plan = FlightPlan(**valid_flight_plan)
        
        with pytest.raises(ValueError, match="at least 2 waypoints"):
            calculate_total_duration(plan)


class TestGenerateKneeboardPNG:
    """Test suite for PNG generation."""
    
    def test_generate_png_valid_duration(self):
        """Test PNG generation with a valid duration."""
        duration = 125.5  # minutes
        png_data = generate_kneeboard_png(duration)
        
        assert isinstance(png_data, bytes)
        assert len(png_data) > 0
        
        # Check that it's valid PNG data (starts with PNG signature)
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'
    
    def test_generate_png_zero_duration(self):
        """Test PNG generation with zero duration."""
        duration = 0
        png_data = generate_kneeboard_png(duration)
        
        assert isinstance(png_data, bytes)
        assert len(png_data) > 0
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'
    
    def test_generate_png_large_duration(self):
        """Test PNG generation with a large duration."""
        duration = 1440  # 24 hours in minutes
        png_data = generate_kneeboard_png(duration)
        
        assert isinstance(png_data, bytes)
        assert len(png_data) > 0
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'
    
    def test_generate_png_fractional_minutes(self):
        """Test PNG generation with fractional minutes."""
        duration = 45.7  # minutes
        png_data = generate_kneeboard_png(duration)
        
        assert isinstance(png_data, bytes)
        assert len(png_data) > 0
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'


class TestIntegration:
    """Integration tests for the full workflow."""
    
    def test_full_workflow(self, minimal_flight_plan):
        """Test the full workflow from flight plan to PNG."""
        # Parse flight plan
        plan = FlightPlan(**minimal_flight_plan)
        
        # Calculate total duration
        duration = calculate_total_duration(plan)
        
        # Generate PNG
        png_data = generate_kneeboard_png(duration)
        
        # Verify results
        assert duration > 0
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
        valid_flight_plan["initTimeHour"] = "not_a_number"
        
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

