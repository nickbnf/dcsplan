"""
Comprehensive tests for the flight plan import endpoint.

Tests cover valid imports, version validation, structure validation,
field validation, turn point validation, and edge cases.
"""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

@pytest.fixture
def valid_flight_plan_data():
    """Create a valid flight plan data structure."""
    return {
        "points": [
            {
                "lat": 34.0,
                "lon": 36.0,
                "tas": 400,
                "alt": 3000,
                "fuelFlow": 6000,
                "windSpeed": 20,
                "windDir": 270,
                "name": "WP1"
            },
            {
                "lat": 35.0,
                "lon": 37.0,
                "tas": 400,
                "alt": 3000,
                "fuelFlow": 6000,
                "windSpeed": 20,
                "windDir": 270,
                "name": "WP2"
            }
        ],
        "declination": 12.5,
        "bankAngle": 30.0,
        "initTimeSec": 43200,
        "initFob": 12000
    }


@pytest.fixture
def valid_import_request(valid_flight_plan_data):
    """Create a valid import request."""
    return {
        "version": "1.0",
        "flightPlan": valid_flight_plan_data
    }


class TestValidImports:
    """Test valid import scenarios."""
    
    def test_valid_import_with_version_1_0(self, valid_import_request):
        """Test importing a valid flight plan with version 1.0."""
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
        data = response.json()
        assert "flightPlan" in data
        assert data["flightPlan"]["declination"] == 12.5
        assert len(data["flightPlan"]["points"]) == 2
    
    def test_valid_import_with_optional_name_field(self, valid_import_request):
        """Test importing a valid flight plan with optional name fields."""
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
        data = response.json()
        assert data["flightPlan"]["points"][0]["name"] == "WP1"
    
    def test_valid_import_without_name_field(self, valid_import_request):
        """Test importing a valid flight plan without name fields."""
        # Remove name fields
        for point in valid_import_request["flightPlan"]["points"]:
            point.pop("name", None)
        
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
        data = response.json()
        assert data["flightPlan"]["points"][0].get("name") is None
    
    def test_valid_import_with_flight_plan_name(self, valid_import_request):
        """Test importing a valid flight plan with a flight plan name."""
        valid_import_request["flightPlan"]["name"] = "Test Flight Plan"
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
        data = response.json()
        assert data["flightPlan"]["name"] == "Test Flight Plan"
    
    def test_valid_import_without_flight_plan_name(self, valid_import_request):
        """Test importing a valid flight plan without a flight plan name."""
        # Ensure name is not present
        valid_import_request["flightPlan"].pop("name", None)
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
        data = response.json()
        assert data["flightPlan"].get("name") is None
    
    def test_valid_import_single_waypoint(self):
        """Test importing a flight plan with a single waypoint (minimal valid case)."""
        request = {
            "version": "1.0",
            "flightPlan": {
                "points": [
                    {
                        "lat": 34.0,
                        "lon": 36.0,
                        "tas": 400,
                        "alt": 3000,
                        "fuelFlow": 6000,
                        "windSpeed": 20,
                        "windDir": 270
                    }
                ],
                "declination": 12.5,
                "bankAngle": 30.0,
                "initTimeSec": 43200,
                "initFob": 12000
            }
        }
        response = client.post("/flightplan/import", json=request)
        assert response.status_code == 200
        data = response.json()
        assert len(data["flightPlan"]["points"]) == 1
    
    def test_valid_import_many_waypoints(self):
        """Test importing a flight plan with many waypoints."""
        request = {
            "version": "1.0",
            "flightPlan": {
                "points": [
                    {
                        "lat": 34.0 + i * 0.1,
                        "lon": 36.0 + i * 0.1,
                        "tas": 400,
                        "alt": 3000,
                        "fuelFlow": 6000,
                        "windSpeed": 20,
                        "windDir": 270
                    }
                    for i in range(10)
                ],
                "declination": 12.5,
                "bankAngle": 30.0,
                "initTimeSec": 43200,
                "initFob": 12000
            }
        }
        response = client.post("/flightplan/import", json=request)
        assert response.status_code == 200
        data = response.json()
        assert len(data["flightPlan"]["points"]) == 10


class TestVersionValidation:
    """Test version validation."""
    
    def test_missing_version_field(self, valid_import_request):
        """Test that missing version field is rejected."""
        del valid_import_request["version"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_unsupported_version_2_0(self, valid_import_request):
        """Test that unsupported version 2.0 is rejected."""
        valid_import_request["version"] = "2.0"
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 400
        assert "Unsupported version" in response.json()["detail"]
        assert "2.0" in response.json()["detail"]
    
    def test_unsupported_version_0_9(self, valid_import_request):
        """Test that unsupported version 0.9 is rejected."""
        valid_import_request["version"] = "0.9"
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 400
        assert "Unsupported version" in response.json()["detail"]
    
    def test_invalid_version_type_number(self, valid_import_request):
        """Test that version as number (not string) is rejected."""
        valid_import_request["version"] = 1.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_invalid_version_type_null(self, valid_import_request):
        """Test that null version is rejected."""
        valid_import_request["version"] = None
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error


class TestStructureValidation:
    """Test structure validation."""
    
    def test_missing_flightplan_field(self, valid_import_request):
        """Test that missing flightPlan field is rejected."""
        del valid_import_request["flightPlan"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_invalid_flightplan_type_string(self, valid_import_request):
        """Test that flightPlan as string is rejected."""
        valid_import_request["flightPlan"] = "invalid"
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_invalid_flightplan_type_array(self, valid_import_request):
        """Test that flightPlan as array is rejected."""
        valid_import_request["flightPlan"] = []
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_empty_request_body(self):
        """Test that empty request body is rejected."""
        response = client.post("/flightplan/import", json={})
        assert response.status_code == 422  # Validation error
    
    def test_invalid_json(self):
        """Test that invalid JSON is rejected."""
        response = client.post(
            "/flightplan/import",
            data="not json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422  # Validation error


class TestFlightPlanFieldValidation:
    """Test flight plan field validation."""
    
    def test_missing_points_field(self, valid_import_request):
        """Test that missing points field is rejected."""
        del valid_import_request["flightPlan"]["points"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_declination_field(self, valid_import_request):
        """Test that missing declination field is rejected."""
        del valid_import_request["flightPlan"]["declination"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_bankangle_field(self, valid_import_request):
        """Test that missing bankAngle field is rejected."""
        del valid_import_request["flightPlan"]["bankAngle"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_inittimesec_field(self, valid_import_request):
        """Test that missing initTimeSec field is rejected."""
        del valid_import_request["flightPlan"]["initTimeSec"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_initfob_field(self, valid_import_request):
        """Test that missing initFob field is rejected."""
        del valid_import_request["flightPlan"]["initFob"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_empty_points_array(self, valid_import_request):
        """Test that empty points array is valid (but minimal)."""
        valid_import_request["flightPlan"]["points"] = []
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200  # Empty array is valid structure-wise
        assert len(response.json()["flightPlan"]["points"]) == 0
    
    def test_invalid_points_type_string(self, valid_import_request):
        """Test that points as string is rejected."""
        valid_import_request["flightPlan"]["points"] = "invalid"
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_invalid_declination_type_string(self, valid_import_request):
        """Test that declination as string is accepted (Pydantic coerces to float)."""
        valid_import_request["flightPlan"]["declination"] = "12.5"
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200  # Pydantic coerces string to float
        assert isinstance(response.json()["flightPlan"]["declination"], float)
    
    def test_invalid_bankangle_type_string(self, valid_import_request):
        """Test that bankAngle as string is accepted (Pydantic coerces to float)."""
        valid_import_request["flightPlan"]["bankAngle"] = "30.0"
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200  # Pydantic coerces string to float
        assert isinstance(response.json()["flightPlan"]["bankAngle"], float)


class TestTurnPointValidation:
    """Test turn point validation."""
    
    def test_missing_lat_field(self, valid_import_request):
        """Test that missing lat field is rejected."""
        del valid_import_request["flightPlan"]["points"][0]["lat"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_lon_field(self, valid_import_request):
        """Test that missing lon field is rejected."""
        del valid_import_request["flightPlan"]["points"][0]["lon"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_tas_field(self, valid_import_request):
        """Test that missing tas field is rejected."""
        del valid_import_request["flightPlan"]["points"][0]["tas"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_alt_field(self, valid_import_request):
        """Test that missing alt field is rejected."""
        del valid_import_request["flightPlan"]["points"][0]["alt"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_fuelflow_field(self, valid_import_request):
        """Test that missing fuelFlow field is rejected."""
        del valid_import_request["flightPlan"]["points"][0]["fuelFlow"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_windspeed_field(self, valid_import_request):
        """Test that missing windSpeed field is rejected."""
        del valid_import_request["flightPlan"]["points"][0]["windSpeed"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_missing_winddir_field(self, valid_import_request):
        """Test that missing windDir field is rejected."""
        del valid_import_request["flightPlan"]["points"][0]["windDir"]
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_lat_out_of_range_above(self, valid_import_request):
        """Test that lat > 90 is rejected."""
        valid_import_request["flightPlan"]["points"][0]["lat"] = 91.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_lat_out_of_range_below(self, valid_import_request):
        """Test that lat < -90 is rejected."""
        valid_import_request["flightPlan"]["points"][0]["lat"] = -91.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_lon_out_of_range_above(self, valid_import_request):
        """Test that lon > 180 is rejected."""
        valid_import_request["flightPlan"]["points"][0]["lon"] = 181.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_lon_out_of_range_below(self, valid_import_request):
        """Test that lon < -180 is rejected."""
        valid_import_request["flightPlan"]["points"][0]["lon"] = -181.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_declination_out_of_range_above(self, valid_import_request):
        """Test that declination > 25 is rejected."""
        valid_import_request["flightPlan"]["declination"] = 26.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_declination_out_of_range_below(self, valid_import_request):
        """Test that declination < -25 is rejected."""
        valid_import_request["flightPlan"]["declination"] = -26.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_bankangle_out_of_range_above(self, valid_import_request):
        """Test that bankAngle > 85 is rejected."""
        valid_import_request["flightPlan"]["bankAngle"] = 86.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_bankangle_out_of_range_below(self, valid_import_request):
        """Test that bankAngle < 5 is rejected."""
        valid_import_request["flightPlan"]["bankAngle"] = 4.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_inittimesec_out_of_range_above(self, valid_import_request):
        """Test that initTimeSec > 86399 is rejected."""
        valid_import_request["flightPlan"]["initTimeSec"] = 86400
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_inittimesec_out_of_range_below(self, valid_import_request):
        """Test that initTimeSec < 0 is rejected."""
        valid_import_request["flightPlan"]["initTimeSec"] = -1
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_winddir_out_of_range_above(self, valid_import_request):
        """Test that windDir > 360 is rejected."""
        valid_import_request["flightPlan"]["points"][0]["windDir"] = 361.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_winddir_out_of_range_below(self, valid_import_request):
        """Test that windDir < 0 is rejected."""
        valid_import_request["flightPlan"]["points"][0]["windDir"] = -1.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_negative_tas(self, valid_import_request):
        """Test that negative tas is rejected."""
        valid_import_request["flightPlan"]["points"][0]["tas"] = -1.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_negative_alt(self, valid_import_request):
        """Test that negative alt is rejected."""
        valid_import_request["flightPlan"]["points"][0]["alt"] = -1.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_negative_fuelflow(self, valid_import_request):
        """Test that negative fuelFlow is rejected."""
        valid_import_request["flightPlan"]["points"][0]["fuelFlow"] = -1.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_negative_windspeed(self, valid_import_request):
        """Test that negative windSpeed is rejected."""
        valid_import_request["flightPlan"]["points"][0]["windSpeed"] = -1.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error
    
    def test_negative_initfob(self, valid_import_request):
        """Test that negative initFob is rejected."""
        valid_import_request["flightPlan"]["initFob"] = -1.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 422  # Validation error


class TestEdgeCases:
    """Test edge cases and boundary values."""
    
    def test_boundary_lat_90(self, valid_import_request):
        """Test that lat = 90 (boundary) is accepted."""
        valid_import_request["flightPlan"]["points"][0]["lat"] = 90.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_lat_minus_90(self, valid_import_request):
        """Test that lat = -90 (boundary) is accepted."""
        valid_import_request["flightPlan"]["points"][0]["lat"] = -90.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_lon_180(self, valid_import_request):
        """Test that lon = 180 (boundary) is accepted."""
        valid_import_request["flightPlan"]["points"][0]["lon"] = 180.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_lon_minus_180(self, valid_import_request):
        """Test that lon = -180 (boundary) is accepted."""
        valid_import_request["flightPlan"]["points"][0]["lon"] = -180.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_declination_25(self, valid_import_request):
        """Test that declination = 25 (boundary) is accepted."""
        valid_import_request["flightPlan"]["declination"] = 25.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_declination_minus_25(self, valid_import_request):
        """Test that declination = -25 (boundary) is accepted."""
        valid_import_request["flightPlan"]["declination"] = -25.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_bankangle_85(self, valid_import_request):
        """Test that bankAngle = 85 (boundary) is accepted."""
        valid_import_request["flightPlan"]["bankAngle"] = 85.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_bankangle_5(self, valid_import_request):
        """Test that bankAngle = 5 (boundary) is accepted."""
        valid_import_request["flightPlan"]["bankAngle"] = 5.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_inittimesec_86399(self, valid_import_request):
        """Test that initTimeSec = 86399 (boundary) is accepted."""
        valid_import_request["flightPlan"]["initTimeSec"] = 86399
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_inittimesec_0(self, valid_import_request):
        """Test that initTimeSec = 0 (boundary) is accepted."""
        valid_import_request["flightPlan"]["initTimeSec"] = 0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_winddir_360(self, valid_import_request):
        """Test that windDir = 360 (boundary) is accepted."""
        valid_import_request["flightPlan"]["points"][0]["windDir"] = 360.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_boundary_winddir_0(self, valid_import_request):
        """Test that windDir = 0 (boundary) is accepted."""
        valid_import_request["flightPlan"]["points"][0]["windDir"] = 0.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_zero_tas(self, valid_import_request):
        """Test that tas = 0 (boundary) is accepted."""
        valid_import_request["flightPlan"]["points"][0]["tas"] = 0.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_zero_alt(self, valid_import_request):
        """Test that alt = 0 (boundary) is accepted."""
        valid_import_request["flightPlan"]["points"][0]["alt"] = 0.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
    
    def test_zero_initfob(self, valid_import_request):
        """Test that initFob = 0 (boundary) is accepted."""
        valid_import_request["flightPlan"]["initFob"] = 0.0
        response = client.post("/flightplan/import", json=valid_import_request)
        assert response.status_code == 200
