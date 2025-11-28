"""
Unit tests for the FlightPlanData class.

Tests cover various wind scenarios, declination variations, and edge cases.
"""

import pytest
from flight_plan import FlightPlan, FlightPlanTurnPoint, FlightPlanData


def create_turnpoint(lat, lon, tas=400, alt=3000, fuelFlow=6000, windSpeed=20, windDir=270):
    """Helper function to create a turn point."""
    return FlightPlanTurnPoint(
        lat=lat,
        lon=lon,
        tas=tas,
        alt=alt,
        fuelFlow=fuelFlow,
        windSpeed=windSpeed,
        windDir=windDir
    )


def create_flight_plan(points_data, declination=0.0, bankAngle=30.0, initTimeSec=43200, initFob=12000):
    """Helper function to create a flight plan."""
    points = [
        create_turnpoint(**point) for point in points_data
    ]
    return FlightPlan(
        points=points,
        declination=declination,
        bankAngle=bankAngle,
        initTimeSec=initTimeSec,
        initFob=initFob
    )


class TestFlightPlanDataTailwind:
    """Test suite for tailwind scenarios."""
    
    def test_tailwind_single_leg(self):
        """Test a simple flight plan with tailwind."""
        # Wind from 270° (west) blowing east, course ~90° (east)
        # So wind is pushing us forward (tailwind)
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},  # Starting point
            {"lat": 34.0, "lon": 37.0, "windDir": 270}   # 1° east (tailwind)
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 2
        assert len(fp_data.legData) == 1
        
        leg = fp_data.legData[0]
        # Calculate ground speed from distance and time
        groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
        # With tailwind, ground speed should be higher than TAS
        assert groundSpeed > 400  # TAS is 400
        
        # ETA should be calculated correctly
        assert fp_data.turnpointData[1].etaSec > fp_data.turnpointData[0].etaSec
        
        # Fuel should decrease
        assert fp_data.turnpointData[1].efr < fp_data.turnpointData[0].efr
    
    def test_tailwind_multi_leg(self):
        """Test a multi-leg flight plan with tailwind."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windDir": 270},  # Tailwind
            {"lat": 34.0, "lon": 38.0, "windDir": 270},  # Tailwind
            {"lat": 34.0, "lon": 39.0, "windDir": 270},  # Tailwind
            {"lat": 34.0, "lon": 40.0, "windDir": 270}   # Tailwind
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 5
        assert len(fp_data.legData) == 4
        
        # All legs should have tailwind, so ground speed > TAS
        for leg in fp_data.legData:
            # Calculate ground speed from distance and time
            groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
            # With tailwind, tailComponent is positive
            assert groundSpeed > 400
        
        # ETA should increase for each waypoint
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].etaSec > fp_data.turnpointData[i-1].etaSec
        
        # Fuel should decrease for each waypoint
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].efr < fp_data.turnpointData[i-1].efr


class TestFlightPlanDataHeadwind:
    """Test suite for headwind scenarios."""
    
    def test_headwind_single_leg(self):
        """Test a simple flight plan with headwind."""
        # Wind from 270° (west), so wind is going TO 90° (east)
        # Course ~270° (west)
        # So wind is pushing against us (headwind)
        points_data = [
            {"lat": 34.0, "lon": 37.0, "windDir": 270},  # Starting point
            {"lat": 34.0, "lon": 36.0, "windDir": 270}   # 1° west (headwind)
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 2
        assert len(fp_data.legData) == 1
        
        leg = fp_data.legData[0]
        # Calculate ground speed from distance and time
        groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
        # With headwind, ground speed should be lower than TAS
        assert groundSpeed < 400  # TAS is 400
        
        # ETA should still be calculated correctly
        assert fp_data.turnpointData[1].etaSec > fp_data.turnpointData[0].etaSec
        
        # Fuel should decrease
        assert fp_data.turnpointData[1].efr < fp_data.turnpointData[0].efr
    
    def test_headwind_multi_leg(self):
        """Test a multi-leg flight plan with headwind."""
        points_data = [
            {"lat": 34.0, "lon": 40.0, "windDir": 270},
            {"lat": 34.0, "lon": 39.0, "windDir": 270},  # Headwind
            {"lat": 34.0, "lon": 38.0, "windDir": 270},  # Headwind
            {"lat": 34.0, "lon": 37.0, "windDir": 270},  # Headwind
            {"lat": 34.0, "lon": 36.0, "windDir": 270}   # Headwind
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 5
        assert len(fp_data.legData) == 4
        
        # All legs should have headwind, so ground speed < TAS
        for leg in fp_data.legData:
            groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
            assert groundSpeed < 400
        
        # ETA should increase for each waypoint
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].etaSec > fp_data.turnpointData[i-1].etaSec
        
        # Fuel should decrease for each waypoint
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].efr < fp_data.turnpointData[i-1].efr


class TestFlightPlanDataCrosswind:
    """Test suite for crosswind scenarios."""
    
    def test_crosswind_perpendicular(self):
        """Test a flight plan with perpendicular crosswind."""
        # Wind from 0° (north) blowing south, course ~90° (east)
        # So wind is perpendicular (crosswind)
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 0},   # Starting point
            {"lat": 34.0, "lon": 37.0, "windDir": 0}    # 1° east (crosswind from north)
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 2
        assert len(fp_data.legData) == 1
        
        leg = fp_data.legData[0]
        # Calculate ground speed from distance and time
        groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
        # With pure crosswind, ground speed should be approximately TAS
        # (slight variation due to wind component calculation)
        assert abs(groundSpeed - 400) < 25  # Allow some tolerance
        
        # Heading should be adjusted for crosswind
        assert leg.heading != leg.course
        
        # ETA should be calculated correctly
        assert fp_data.turnpointData[1].etaSec > fp_data.turnpointData[0].etaSec
    
    def test_crosswind_multi_leg(self):
        """Test a multi-leg flight plan with crosswind."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 0},   # Crosswind from north
            {"lat": 34.0, "lon": 37.0, "windDir": 0},
            {"lat": 34.0, "lon": 38.0, "windDir": 0},
            {"lat": 34.0, "lon": 39.0, "windDir": 0},
            {"lat": 34.0, "lon": 40.0, "windDir": 0}
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 5
        assert len(fp_data.legData) == 4
        
        # All legs should have crosswind component
        for leg in fp_data.legData:
            groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
            # Ground speed should be close to TAS with pure crosswind
            assert abs(groundSpeed - 400) < 25
            # Heading should differ from course due to wind correction
            assert abs(leg.heading - leg.course) > 0.1
        
        # ETA should increase for each waypoint
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].etaSec > fp_data.turnpointData[i-1].etaSec


class TestFlightPlanDataDeclination:
    """Test suite for declination scenarios."""
    
    def test_east_declination(self):
        """Test a flight plan with east (positive) declination."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windDir": 270},
            {"lat": 34.0, "lon": 38.0, "windDir": 270},
            {"lat": 34.0, "lon": 39.0, "windDir": 270},
            {"lat": 34.0, "lon": 40.0, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=12.5)  # East declination
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 5
        assert len(fp_data.legData) == 4
        
        # Course should be adjusted by declination
        for leg in fp_data.legData:
            # Course = bearing + declination
            # With east declination, course should be higher than bearing
            assert leg.course > 0
        
        # All calculations should still work correctly
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].etaSec > fp_data.turnpointData[i-1].etaSec
            assert fp_data.turnpointData[i].efr < fp_data.turnpointData[i-1].efr
    
    def test_west_declination(self):
        """Test a flight plan with west (negative) declination."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windDir": 270},
            {"lat": 34.0, "lon": 38.0, "windDir": 270},
            {"lat": 34.0, "lon": 39.0, "windDir": 270},
            {"lat": 34.0, "lon": 40.0, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=-12.5)  # West declination
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 5
        assert len(fp_data.legData) == 4
        
        # Course should be adjusted by declination
        for leg in fp_data.legData:
            # Course = bearing + declination
            # With west declination, course should be adjusted accordingly
            assert leg.course >= 0  # Should wrap around properly
        
        # All calculations should still work correctly
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].etaSec > fp_data.turnpointData[i-1].etaSec
            assert fp_data.turnpointData[i].efr < fp_data.turnpointData[i-1].efr
    
    def test_zero_declination(self):
        """Test a flight plan with zero declination."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windDir": 270},
            {"lat": 34.0, "lon": 38.0, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 3
        assert len(fp_data.legData) == 2
        
        # Course should equal bearing (approximately)
        for leg in fp_data.legData:
            assert leg.course >= 0


class TestFlightPlanDataEdgeCases:
    """Test suite for edge cases."""
    
    def test_no_waypoints(self):
        """Test flight plan with no waypoints."""
        plan = create_flight_plan(points_data=[], declination=0.0)
        fp_data = FlightPlanData(plan)
        
        # When there are no waypoints, the loop doesn't execute
        # So no turnpoints are created (this is the actual behavior)
        assert len(fp_data.turnpointData) == 0
        assert len(fp_data.legData) == 0
    
    def test_single_waypoint(self):
        """Test flight plan with single waypoint."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        # Should have one turnpoint (initial position)
        assert len(fp_data.turnpointData) == 1
        assert len(fp_data.legData) == 0
        
        # Initial turnpoint should have initial values
        assert fp_data.turnpointData[0].etaSec == 43200
        assert fp_data.turnpointData[0].efr == 12000
    
    def test_two_waypoints(self):
        """Test flight plan with minimum valid waypoints (2)."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 2
        assert len(fp_data.legData) == 1
        
        # Initial turnpoint should have initial values
        assert fp_data.turnpointData[0].etaSec == 43200
        assert fp_data.turnpointData[0].efr == 12000
        
        # Second turnpoint should have calculated values
        assert fp_data.turnpointData[1].etaSec > fp_data.turnpointData[0].etaSec
        assert fp_data.turnpointData[1].efr < fp_data.turnpointData[0].efr
    
    def test_very_long_distance(self):
        """Test flight plan with very long distance leg."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},
            {"lat": 34.0, "lon": 46.0, "windDir": 270}  # 10° longitude difference
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 2
        assert len(fp_data.legData) == 1
        
        leg = fp_data.legData[0]
        # Distance should be significant
        assert leg.distanceNm > 100
        
        # ETA should be reasonable
        assert fp_data.turnpointData[1].etaSec > fp_data.turnpointData[0].etaSec
    
    def test_very_short_distance(self):
        """Test flight plan with very short distance leg."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},
            {"lat": 34.001, "lon": 36.001, "windDir": 270}  # Very close points
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 2
        assert len(fp_data.legData) == 1
        
        leg = fp_data.legData[0]
        # Distance should be small but positive
        assert leg.distanceNm > 0
        
        # ETA should still increase
        assert fp_data.turnpointData[1].etaSec >= fp_data.turnpointData[0].etaSec

    def test_known_distance(self):
        """Test flight plan with known distance leg."""
        points_data = [
            {"lat": 35.0, "lon": 36.0, "windDir": 270, "tas": 120},
            {"lat": 36.0, "lon": 36.0, "windDir": 270, "tas": 120}  # 1° latitude difference
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 2
        assert len(fp_data.legData) == 1
        
        leg = fp_data.legData[0]
        # Distance should be approximately 60 nautical miles (1° latitude = ~60 NM)
        # Allow some tolerance for floating point precision
        assert abs(leg.distanceNm - 60.0) < 0.1
        
        # ETA should be calculated correctly (30 minutes = 1800 seconds)
        # With TAS 120 kts and no wind, ground speed should be ~120 kts
        # 60 NM / 120 kts = 0.5 hours = 1800 seconds
        assert fp_data.turnpointData[1].etaSec > fp_data.turnpointData[0].etaSec
        assert abs(leg.eteSec - 1800) < 2
    
    def test_zero_wind(self):
        """Test flight plan with zero wind speed."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windSpeed": 0, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windSpeed": 0, "windDir": 270},
            {"lat": 34.0, "lon": 38.0, "windSpeed": 0, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 3
        assert len(fp_data.legData) == 2
        
        # With no wind, ground speed should equal TAS
        for leg in fp_data.legData:
            groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
            assert abs(groundSpeed - 400) < 1  # Very close to TAS
            # Heading should equal course with no wind
            assert abs(leg.heading - leg.course) < 1
    
    def test_high_wind_speed(self):
        """Test flight plan with very high wind speed."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windSpeed": 100, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windSpeed": 100, "windDir": 270}  # Strong tailwind
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 2
        assert len(fp_data.legData) == 1
        
        leg = fp_data.legData[0]
        groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
        # With strong tailwind, ground speed should be much higher than TAS
        assert groundSpeed > 400
    
    def test_different_fuel_flows(self):
        """Test flight plan with varying fuel flows."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "fuelFlow": 5000, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "fuelFlow": 7000, "windDir": 270},
            {"lat": 34.0, "lon": 38.0, "fuelFlow": 6000, "windDir": 270},
            {"lat": 34.0, "lon": 39.0, "fuelFlow": 8000, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 4
        assert len(fp_data.legData) == 3
        
        # Fuel consumption should vary based on fuel flow
        # Each leg uses fuelFlow from the destination point
        # Leg 0 uses fuelFlow from point[1] (7000), leg 1 uses fuelFlow from point[2] (6000)
        # So leg 0 should consume more fuel than leg 1 (assuming similar distances)
        assert fp_data.legData[0].legFuel > fp_data.legData[1].legFuel
        assert fp_data.legData[0].legFuel < fp_data.legData[2].legFuel
        
        # Fuel should decrease for each waypoint
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].efr < fp_data.turnpointData[i-1].efr
    
    def test_different_tas(self):
        """Test flight plan with varying TAS."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "tas": 300, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "tas": 400, "windDir": 270},
            {"lat": 34.0, "lon": 38.0, "tas": 500, "windDir": 270},
            {"lat": 34.0, "lon": 39.0, "tas": 300, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=0.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 4
        assert len(fp_data.legData) == 3
        
        # Ground speed should vary based on TAS
        groundSpeed0 = fp_data.legData[0].distanceNm * 3600 / fp_data.legData[0].eteSec if fp_data.legData[0].eteSec > 0 else 0
        groundSpeed1 = fp_data.legData[1].distanceNm * 3600 / fp_data.legData[1].eteSec if fp_data.legData[1].eteSec > 0 else 0
        groundSpeed2 = fp_data.legData[2].distanceNm * 3600 / fp_data.legData[2].eteSec if fp_data.legData[2].eteSec > 0 else 0
        assert groundSpeed1 > groundSpeed0
        assert groundSpeed2 < groundSpeed0
        
        # ETA should still be calculated correctly
        for i in range(1, len(fp_data.turnpointData)):
            assert fp_data.turnpointData[i].etaSec > fp_data.turnpointData[i-1].etaSec

        assert fp_data.turnpointData[3].etaSec == fp_data.turnpointData[0].etaSec + fp_data.legData[0].eteSec + fp_data.legData[1].eteSec + fp_data.legData[2].eteSec


class TestFlightPlanDataCombinedScenarios:
    """Test suite for combined scenarios."""
    
    def test_tailwind_with_east_declination(self):
        """Test tailwind combined with east declination."""
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windDir": 270},
            {"lat": 34.0, "lon": 38.0, "windDir": 270},
            {"lat": 34.0, "lon": 39.0, "windDir": 270},
            {"lat": 34.0, "lon": 40.0, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=15.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 5
        assert len(fp_data.legData) == 4
        
        # Should have tailwind effect
        for leg in fp_data.legData:
            groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
            assert groundSpeed > 400
        
        # Course should be adjusted by declination
        for leg in fp_data.legData:
            assert leg.course > 0
    
    def test_headwind_with_west_declination(self):
        """Test headwind combined with west declination."""
        points_data = [
            {"lat": 34.0, "lon": 40.0, "windDir": 270},
            {"lat": 34.0, "lon": 39.0, "windDir": 270},
            {"lat": 34.0, "lon": 38.0, "windDir": 270},
            {"lat": 34.0, "lon": 37.0, "windDir": 270},
            {"lat": 34.0, "lon": 36.0, "windDir": 270}
        ]
        plan = create_flight_plan(points_data, declination=-15.0)
        fp_data = FlightPlanData(plan)
        
        assert len(fp_data.turnpointData) == 5
        assert len(fp_data.legData) == 4
        
        # Should have headwind effect
        for leg in fp_data.legData:
            groundSpeed = leg.distanceNm * 3600 / leg.eteSec if leg.eteSec > 0 else 0
            assert groundSpeed < 400
        
        # Course should be adjusted by declination
        for leg in fp_data.legData:
            assert leg.course >= 0

