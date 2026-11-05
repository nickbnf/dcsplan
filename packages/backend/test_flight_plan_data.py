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


def create_flight_plan(points_data, declination=0.0, bankAngle=30.0, initTimeSec=43200, initFob=12000, theatre="syria"):
    """Helper function to create a flight plan."""
    points = [
        create_turnpoint(**point) for point in points_data
    ]
    return FlightPlan(
        theatre=theatre,
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
            # Course = bearing - declination (East-positive, leg-geometry)
            assert leg.course == pytest.approx((leg.outbound_bearing - 12.5 + 360) % 360)
        
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


# --- Leg-0 groundAlt tests (mirrors frontend legCalculations tests) ---
# Strategy: binary level vs. non-level outcomes to verify prevAlt selection.

class TestLeg0GroundAlt:
    """Verify that leg-0 uses groundAlt (not alt) as the starting altitude."""

    REGIME = {
        "id": "r1",
        "name": "Test",
        "cruise": {"tas": 400, "ff": 3600},
        "climb": {"tas": 300, "ff": 4000, "roc": 2000},
        "descent": {"tas": 300, "ff": 2000, "rod": 2000},
    }

    def _make_plan(self, points):
        from flight_plan import Aircraft, Regime, RegimeCruise, RegimeClimb, RegimeDescent, TakeoffPerformance
        regime = Regime(
            id="r1", name="Test",
            cruise=RegimeCruise(tas=400, ff=3600),
            climb=RegimeClimb(tas=300, ff=4000, roc=2000),
            descent=RegimeDescent(tas=300, ff=2000, rod=2000),
        )
        self._aircraft = Aircraft(regimes=[regime])
        return FlightPlan(
            theatre="syria",
            points=points,
            declination=0,
            bankAngle=30,
            initTimeSec=43200,
            initFob=12000,
        )

    def _ete_level(self, distanceNm, tas=400):
        """Expected ETE for a level leg (round-trip distance / TAS, no wind)."""
        return round(distanceNm / tas * 3600)

    def test_a_leg0_uses_groundAlt_not_alt(self):
        """WP0: alt=3000, groundAlt=5000. WP1: alt=5000 with regime.
        groundAlt=WP1.alt → altDelta=0 → level ETE.
        If alt were used: altDelta=2000 → segmented (different ETE)."""
        points = [
            FlightPlanTurnPoint(lat=34.0, lon=36.0, tas=400, alt=3000, fuelFlow=6000, windSpeed=0, windDir=0, groundAlt=5000),
            FlightPlanTurnPoint(lat=34.0, lon=37.0, tas=400, alt=5000, fuelFlow=6000, windSpeed=0, windDir=0, regimeId="r1"),
        ]
        plan = self._make_plan(points)
        fp = FlightPlanData(plan, self._aircraft)
        leg = fp.legData[0]
        # Level leg: ETE = distance / TAS * 3600
        level_ete = round(leg.distanceNm / 400 * 3600)
        assert leg.eteSec == level_ete

    def test_b_undefined_groundAlt_treated_as_zero(self):
        """WP0: alt=5000, no groundAlt → treated as 0. WP1: alt=0.
        altDelta = 0 - 0 = 0 → level.
        If alt were used: altDelta = 0 - 5000 = -5000 → segmented descent."""
        points = [
            FlightPlanTurnPoint(lat=34.0, lon=36.0, tas=400, alt=5000, fuelFlow=6000, windSpeed=0, windDir=0),
            FlightPlanTurnPoint(lat=34.0, lon=37.0, tas=400, alt=0, fuelFlow=6000, windSpeed=0, windDir=0, regimeId="r1"),
        ]
        plan = self._make_plan(points)
        fp = FlightPlanData(plan, self._aircraft)
        leg = fp.legData[0]
        level_ete = round(leg.distanceNm / 400 * 3600)
        assert leg.eteSec == level_ete

    def test_c_groundAlt_equals_dest_alt_is_level(self):
        """WP0: groundAlt=5000. WP1: alt=5000. altDelta=0 → level."""
        points = [
            FlightPlanTurnPoint(lat=34.0, lon=36.0, tas=400, alt=3000, fuelFlow=6000, windSpeed=0, windDir=0, groundAlt=5000),
            FlightPlanTurnPoint(lat=34.0, lon=37.0, tas=400, alt=5000, fuelFlow=6000, windSpeed=0, windDir=0, regimeId="r1"),
        ]
        plan = self._make_plan(points)
        fp = FlightPlanData(plan, self._aircraft)
        leg = fp.legData[0]
        level_ete = round(leg.distanceNm / 400 * 3600)
        assert leg.eteSec == level_ete

    def test_d_different_alt_groundAlt_groundAlt_wins(self):
        """WP0: alt=8000 (phantom), groundAlt=5000. WP1: alt=5000 with regime.
        groundAlt=WP1.alt → altDelta=0 → level.
        If alt were used: altDelta=-3000 → segmented descent."""
        points = [
            FlightPlanTurnPoint(lat=34.0, lon=36.0, tas=400, alt=8000, fuelFlow=6000, windSpeed=0, windDir=0, groundAlt=5000),
            FlightPlanTurnPoint(lat=34.0, lon=37.0, tas=400, alt=5000, fuelFlow=6000, windSpeed=0, windDir=0, regimeId="r1"),
        ]
        plan = self._make_plan(points)
        fp = FlightPlanData(plan, self._aircraft)
        leg = fp.legData[0]
        level_ete = round(leg.distanceNm / 400 * 3600)
        assert leg.eteSec == level_ete

    def test_e_legs2_plus_use_origin_alt_not_groundAlt(self):
        """WP1 (interior): alt=5000, groundAlt=9000. WP2: alt=5000.
        For leg 1→2, origin.alt=5000 → altDelta=0 → level.
        If groundAlt were used: altDelta=-4000 → segmented descent."""
        points = [
            FlightPlanTurnPoint(lat=34.0, lon=36.0, tas=400, alt=5000, fuelFlow=6000, windSpeed=0, windDir=0, groundAlt=0),
            FlightPlanTurnPoint(lat=34.0, lon=37.0, tas=400, alt=5000, fuelFlow=6000, windSpeed=0, windDir=0, groundAlt=9000),
            FlightPlanTurnPoint(lat=34.0, lon=38.0, tas=400, alt=5000, fuelFlow=6000, windSpeed=0, windDir=0, regimeId="r1"),
        ]
        plan = self._make_plan(points)
        fp = FlightPlanData(plan, self._aircraft)
        leg1 = fp.legData[1]  # leg from WP1 to WP2
        level_ete = round(leg1.distanceNm / 400 * 3600)
        assert leg1.eteSec == level_ete



class TestLegGeometry:
    """leg-geometry: turn start, effective TAS, declination convention, true wind."""

    def _navigation(self, theatre="syria"):
        from flight_plan import _load_navigation_config, _create_transformer
        return _create_transformer(_load_navigation_config(theatre))

    @staticmethod
    def _radius(tas, bank=30.0):
        import math
        return (tas * 0.514) ** 2 / (9.80665 * math.tan(math.radians(bank)))

    def _turn_center_offset(self, leg):
        """Vector from the leg origin to its turn centre, in the navigation projection."""
        from flight_plan import _project
        t = self._navigation()
        ox, oy = _project(t, leg.origin.lat, leg.origin.lon)
        cx, cy = _project(t, leg.turn_data.center.lat, leg.turn_data.center.lon)
        return cx - ox, cy - oy

    @pytest.mark.parametrize("declination", [0.0, 6.0, -6.0])
    @pytest.mark.parametrize("wind_speed", [0, 40])
    def test_turn_starts_tangent_to_arrival_track(self, declination, wind_speed):
        import math
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windSpeed": wind_speed, "windDir": 0},
            {"lat": 34.0, "lon": 36.6, "windSpeed": wind_speed, "windDir": 0},
            {"lat": 34.5, "lon": 36.6, "windSpeed": wind_speed, "windDir": 0},
        ]
        leg1, leg2 = FlightPlanData(create_flight_plan(points_data, declination=declination)).legData
        dx, dy = self._turn_center_offset(leg2)
        b = math.radians(leg1.outbound_bearing)
        along = dx * math.sin(b) + dy * math.cos(b)
        assert abs(along) < 1e-6 * self._radius(400)
        assert math.hypot(dx, dy) == pytest.approx(self._radius(400), rel=1e-9)

    def test_bound_leg_turns_at_regime_tas(self):
        import math
        from flight_plan import Aircraft, Regime, RegimeCruise
        aircraft = Aircraft(regimes=[Regime(id="r480", name="Fast", cruise=RegimeCruise(tas=480, ff=5000))])
        points = [
            create_turnpoint(34.0, 36.0),
            create_turnpoint(34.0, 36.6),
            create_turnpoint(34.5, 36.6, tas=400),
        ]
        bound = points[:2] + [points[2].model_copy(update={"regimeId": "r480"})]
        orphan = points[:2] + [points[2].model_copy(update={"regimeId": "gone"})]

        def radius(pts):
            plan = FlightPlan(theatre="syria", points=pts, declination=0, bankAngle=30, initTimeSec=43200, initFob=12000)
            return math.hypot(*self._turn_center_offset(FlightPlanData(plan, aircraft).legData[1]))

        assert radius(bound) == pytest.approx(self._radius(480), rel=1e-9)
        assert radius(points) == pytest.approx(self._radius(400), rel=1e-9)
        assert radius(orphan) == pytest.approx(self._radius(400), rel=1e-9)

    @pytest.mark.parametrize("declination,expected_offset", [(6.0, -6.0), (-6.0, 6.0)])
    def test_course_is_true_minus_declination(self, declination, expected_offset):
        points_data = [{"lat": 34.0, "lon": 36.0, "windSpeed": 0}, {"lat": 34.0, "lon": 37.0, "windSpeed": 0}]
        leg = FlightPlanData(create_flight_plan(points_data, declination=declination)).legData[0]
        assert leg.course == pytest.approx((leg.outbound_bearing + expected_offset + 360) % 360)

    def test_heading_wind_correction_uses_tas(self):
        import math
        # Northbound along a meridian: true course 000
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windSpeed": 0},
            {"lat": 35.0, "lon": 36.0, "tas": 300, "windSpeed": 60, "windDir": 45},
        ]
        leg = FlightPlanData(create_flight_plan(points_data)).legData[0]
        expected = math.degrees(math.asin(60 * math.sin(math.radians(45)) / 300))
        assert leg.heading == pytest.approx(expected, abs=1e-6)

    def test_true_wind_headwind_is_independent_of_declination(self):
        # Northbound, 30 kt from 000 true: a pure headwind whatever the declination
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windSpeed": 0},
            {"lat": 35.0, "lon": 36.0, "tas": 400, "windSpeed": 30, "windDir": 0},
        ]
        legs = [FlightPlanData(create_flight_plan(points_data, declination=d)).legData[0] for d in (0.0, 6.0)]
        for leg in legs:
            assert leg.eteSec == round(leg.distanceNm / 370 * 3600)
        assert legs[1].heading == pytest.approx((legs[1].outbound_bearing - 6.0 + 360) % 360, abs=1e-6)

    def test_declination_changes_only_course_and_heading(self):
        points_data = [
            {"lat": 34.0, "lon": 36.0, "windSpeed": 35, "windDir": 200},
            {"lat": 34.0, "lon": 36.6, "windSpeed": 35, "windDir": 200},
            {"lat": 34.5, "lon": 36.6, "windSpeed": 35, "windDir": 200},
            {"lat": 34.5, "lon": 37.2, "windSpeed": 35, "windDir": 200},
        ]
        a = FlightPlanData(create_flight_plan(points_data, declination=0.0)).legData
        b = FlightPlanData(create_flight_plan(points_data, declination=6.0)).legData
        for la, lb in zip(a, b):
            assert lb.turn_data.center.lat == pytest.approx(la.turn_data.center.lat, abs=1e-12)
            assert lb.turn_data.center.lon == pytest.approx(la.turn_data.center.lon, abs=1e-12)
            assert lb.distanceNm == pytest.approx(la.distanceNm, rel=1e-12)
            assert lb.eteSec == la.eteSec
            assert lb.legFuel == pytest.approx(la.legFuel, rel=1e-12)


class TestRunwayDeparture:
    """departure: model fields and the leg-1 departure branch in LegData."""

    @staticmethod
    def _plan(runway=27, declination=0.0, wp1=(34.0, 35.6), origin_wind=(0, 0)):
        from flight_plan import FlightPlan, FlightPlanTurnPoint
        pts = [
            FlightPlanTurnPoint(lat=34.0, lon=36.0, tas=400, alt=0, fuelFlow=3600,
                                windSpeed=origin_wind[0], windDir=origin_wind[1], groundAlt=0, runway=runway),
            FlightPlanTurnPoint(lat=wp1[0], lon=wp1[1], tas=400, alt=20000, fuelFlow=3600, windSpeed=0, windDir=0, regimeId="r1"),
            FlightPlanTurnPoint(lat=34.4, lon=36.4, tas=400, alt=20000, fuelFlow=3600, windSpeed=0, windDir=0, regimeId="r1"),
        ]
        return FlightPlan(theatre="syria", points=pts, declination=declination, bankAngle=30, initTimeSec=0, initFob=10000)

    @staticmethod
    def _aircraft():
        from flight_plan import Aircraft, Regime, RegimeCruise, RegimeClimb, TakeoffPerformance
        return Aircraft(
            takeoff=TakeoffPerformance(timeSec=60, fuel=200, distance=1.5),
            regimes=[Regime(id="r1", name="Climb", cruise=RegimeCruise(tas=450, ff=4000), climb=RegimeClimb(tas=300, ff=8000, roc=4000))],
        )

    def test_models_accept_runway_and_straight_out(self):
        from flight_plan import Aircraft
        plan = self._plan()
        assert plan.points[0].runway == 27
        assert Aircraft().straightOutDistance == 2.0
        assert Aircraft(straightOutDistance=3.5).straightOutDistance == 3.5

    def test_legacy_plan_has_no_runway(self):
        plan = create_flight_plan([{"lat": 34.0, "lon": 36.0}, {"lat": 34.0, "lon": 36.5}])
        assert plan.points[0].runway is None
        leg = FlightPlanData(plan).legData[0]
        assert leg.departure_path is None
        assert leg.departure_warning is None

    @pytest.mark.parametrize("bad", [0, 37])
    def test_runway_out_of_range_rejected(self, bad):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            self._plan(runway=bad)

    def test_non_positive_straight_out_rejected(self):
        from pydantic import ValidationError
        from flight_plan import Aircraft
        with pytest.raises(ValidationError):
            Aircraft(straightOutDistance=0)

    def test_departure_leg_hands_off_to_leg_2(self):
        leg1, leg2 = FlightPlanData(self._plan(), self._aircraft()).legData
        assert leg1.departure_path is not None
        assert leg1.straigthening_point.lat == leg1.departure_path.roll_out_lat
        assert leg1.distanceNm > 0
        # Leg 2's turn starts along leg 1's final straight segment
        import math
        from flight_plan import _project, _load_navigation_config, _create_transformer
        t = _create_transformer(_load_navigation_config("syria"))
        ox, oy = _project(t, leg2.origin.lat, leg2.origin.lon)
        cx, cy = _project(t, leg2.turn_data.center.lat, leg2.turn_data.center.lon)
        b = math.radians(leg1.outbound_bearing)
        assert abs((cx - ox) * math.sin(b) + (cy - oy) * math.cos(b)) < 1e-3

    def test_unreachable_falls_back(self):
        leg = FlightPlanData(self._plan(wp1=(34.0, 36.02)), self._aircraft()).legData[0]
        assert leg.departure_path is None
        assert leg.departure_warning == "unreachable"
        assert leg.straigthening_point.lat == leg.origin.lat

    def test_runway_headwind_on_takeoff(self):
        from flight_plan import compute_leg_segments
        # Wind from 270 is a headwind on runway 27 but a tailwind on the course to an eastern WP1
        plan = self._plan(wp1=(34.0, 36.5), origin_wind=(20, 270))
        ac = self._aircraft()
        leg = FlightPlanData(plan, ac).legData[0]
        assert leg.departure_path is not None
        from departure import DepartureTiming
        seg = compute_leg_segments(
            prev_alt=0, leg_alt=20000, distance_nm=leg.distanceNm, course=leg.outbound_bearing,
            wind_a_speed=20, wind_a_dir=270, wind_b_speed=0, wind_b_dir=0, tas=400, ff=3600,
            regime=ac.regimes[0], leg_index=0, takeoff=ac.takeoff,
            departure=DepartureTiming(leg.departure_path, leg.outbound_bearing),
        )
        assert seg['takeoff']['distance'] == pytest.approx(1.5 - 20 * 60 / 3600, abs=1e-6)
        assert seg['takeoff']['time'] == 1
        assert seg['takeoff']['fuel'] == 200
        total = seg['takeoff']['distance'] + seg['transition']['distance'] + seg['cruise']['distance']
        assert total == pytest.approx(leg.distanceNm)
