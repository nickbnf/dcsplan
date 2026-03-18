"""
Unit tests for the calculate_straigthening_point function.

Tests cover various turn scenarios: straight, left 90°, right 90°, 180° turn.

These tests verify that:
1. The straightening point lies exactly on the turning circle (distance from center = radius)
2. The straightening point lies on the radical axis (A*x + B*y = C, where A, B, C are calculated from circle center and destination)
3. The turn direction is correct (left vs right)

Note: These tests are designed to verify mathematical correctness. If they fail,
it indicates that the circle-line intersection calculation has bugs that need to be fixed.
"""

import pytest
import math
from flight_plan import (
    FlightPlanTurnPoint,
    calculate_straigthening_point,
    calculate_bearing,
    _project,
    _unproject,
    _create_transformer,
)


# Create a default transformer for Syria (transverse mercator, central meridian 39)
SYRIA_CONFIG = {
    "projection": "transverse_mercator",
    "central_meridian": 39,
    "navigation_mode": "projected",
}
DEFAULT_TRANSFORMER = _create_transformer(SYRIA_CONFIG)


def create_turnpoint(lat, lon):
    """Helper function to create a turn point with default values."""
    return FlightPlanTurnPoint(
        lat=lat,
        lon=lon,
        tas=400,
        alt=3000,
        fuelFlow=6000,
        windSpeed=20,
        windDir=270
    )


def distance_between_points(lat1, lon1, lat2, lon2):
    """Calculate distance between two lat/lon points in meters."""
    R = 6371000  # Earth's radius in meters
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    d_lat = lat2_rad - lat1_rad
    d_lon = lon2_rad - lon1_rad
    a = math.sin(d_lat/2) * math.sin(d_lat/2) + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lon/2) * math.sin(d_lon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def distance_in_tm(x1, y1, x2, y2):
    """Calculate distance in Transverse Mercator coordinates (meters)."""
    return math.sqrt((x2 - x1)**2 + (y2 - y1)**2)


class TestStraighteningPoint:
    """Test suite for calculate_straigthening_point function."""

    TURN_RADIUS = 2500  # meters
    TOLERANCE = 10  # meters tolerance for floating point errors

    def verify_turn_angle(self, inbound_bearing, cx, cy, sx, sy, turn_direction):
        """
        Verify that the turn angle from entry to straightening point is correct.
        """
        angle_entry = math.radians(90 - inbound_bearing)
        while angle_entry < 0:
            angle_entry += 2 * math.pi
        while angle_entry >= 2 * math.pi:
            angle_entry -= 2 * math.pi

        angle_exit = math.atan2(sy - cy, sx - cx)

        turn_angle_rad = angle_exit - angle_entry
        while turn_angle_rad > math.pi:
            turn_angle_rad -= 2 * math.pi
        while turn_angle_rad < -math.pi:
            turn_angle_rad += 2 * math.pi

        turn_angle_deg = math.degrees(turn_angle_rad)
        effective_angle = turn_direction * turn_angle_deg

        assert effective_angle <= 180, \
            f"Turn angle should be <= 180°, got {effective_angle:.2f}°"

        return effective_angle

    def test_straight_line(self):
        """Test straight line: inbound_bearing, point1 and point2 aligned."""
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(34.0, 36.1)

        inbound_bearing = 90.0
        turn_data, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2, self.TURN_RADIUS, DEFAULT_TRANSFORMER
        )

        cx, cy = _project(DEFAULT_TRANSFORMER, turn_data.center.lat, turn_data.center.lon)
        sx, sy = _project(DEFAULT_TRANSFORMER, s_lat, s_lon)
        p1x, p1y = _project(DEFAULT_TRANSFORMER, point1.lat, point1.lon)
        p2x, p2y = _project(DEFAULT_TRANSFORMER, point2.lat, point2.lon)

        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg

        dist_from_point1 = distance_in_tm(p1x, p1y, sx, sy)
        assert dist_from_point1 < self.TURN_RADIUS * 2, \
            f"For straight line, straightening point should be close to point1, got {dist_from_point1}m"

        outbound_bearing = calculate_bearing(turn_data.center, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1
        else:
            turn_direction = -1

        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)

    def test_left_90_degree_turn(self):
        """Test left 90 degree turn."""
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(34.1, 36.0)

        inbound_bearing = 90.0

        turn_data, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2, self.TURN_RADIUS, DEFAULT_TRANSFORMER
        )

        cx, cy = _project(DEFAULT_TRANSFORMER, turn_data.center.lat, turn_data.center.lon)
        sx, sy = _project(DEFAULT_TRANSFORMER, s_lat, s_lon)
        p1x, p1y = _project(DEFAULT_TRANSFORMER, point1.lat, point1.lon)
        p2x, p2y = _project(DEFAULT_TRANSFORMER, point2.lat, point2.lon)

        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg

        A_radical = cx - p2x
        B_radical = cy - p2y
        C_radical = (cx**2 + cy**2 - self.TURN_RADIUS**2) - (p2x * cx + p2y * cy)
        radical_value = A_radical * sx + B_radical * sy
        radical_error = abs(radical_value - C_radical)
        assert radical_error < 1.0, \
            f"Straightening point should be on radical axis, A*x + B*y = {radical_value:.2f} (expected: C = {C_radical:.2f}, error: {radical_error:.2f})"

        outbound_bearing = calculate_bearing(turn_data.center, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1
        else:
            turn_direction = -1

        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)
        assert turn_direction == 1, "This should be a left turn (turn_direction = 1)"

    def test_right_90_degree_turn(self):
        """Test right 90 degree turn."""
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(33.9, 36.0)

        inbound_bearing = 90.0

        turn_data, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2, self.TURN_RADIUS, DEFAULT_TRANSFORMER
        )

        cx, cy = _project(DEFAULT_TRANSFORMER, turn_data.center.lat, turn_data.center.lon)
        sx, sy = _project(DEFAULT_TRANSFORMER, s_lat, s_lon)
        p1x, p1y = _project(DEFAULT_TRANSFORMER, point1.lat, point1.lon)
        p2x, p2y = _project(DEFAULT_TRANSFORMER, point2.lat, point2.lon)

        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg

        A_radical = cx - p2x
        B_radical = cy - p2y
        C_radical = (cx**2 + cy**2 - self.TURN_RADIUS**2) - (p2x * cx + p2y * cy)
        radical_value = A_radical * sx + B_radical * sy
        radical_error = abs(radical_value - C_radical)
        assert radical_error < 1.0, \
            f"Straightening point should be on radical axis, A*x + B*y = {radical_value:.2f} (expected: C = {C_radical:.2f}, error: {radical_error:.2f})"

        outbound_bearing = calculate_bearing(turn_data.center, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1
        else:
            turn_direction = -1

        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)
        assert turn_direction == -1, "This should be a right turn (turn_direction = -1)"

    def test_180_degree_turn(self):
        """Test 180 degree turn (U-turn)."""
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(34.0, 35.9)

        inbound_bearing = 90.0

        turn_data, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2, self.TURN_RADIUS, DEFAULT_TRANSFORMER
        )

        cx, cy = _project(DEFAULT_TRANSFORMER, turn_data.center.lat, turn_data.center.lon)
        sx, sy = _project(DEFAULT_TRANSFORMER, s_lat, s_lon)
        p1x, p1y = _project(DEFAULT_TRANSFORMER, point1.lat, point1.lon)
        p2x, p2y = _project(DEFAULT_TRANSFORMER, point2.lat, point2.lon)

        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg

        A_radical = cx - p2x
        B_radical = cy - p2y
        C_radical = (cx**2 + cy**2 - self.TURN_RADIUS**2) - (p2x * cx + p2y * cy)
        radical_value = A_radical * sx + B_radical * sy
        radical_error = abs(radical_value - C_radical)
        assert radical_error < 1.0, \
            f"Straightening point should be on radical axis, A*x + B*y = {radical_value:.2f} (expected: C = {C_radical:.2f}, error: {radical_error:.2f})"

        outbound_bearing = calculate_bearing(turn_data.center, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1
        else:
            turn_direction = -1

        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)

    def test_45_degree_turn(self):
        """Test 45 degree turn."""
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(34.05, 36.05)

        inbound_bearing = 90.0

        turn_data, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2, self.TURN_RADIUS, DEFAULT_TRANSFORMER
        )

        cx, cy = _project(DEFAULT_TRANSFORMER, turn_data.center.lat, turn_data.center.lon)
        sx, sy = _project(DEFAULT_TRANSFORMER, s_lat, s_lon)
        p1x, p1y = _project(DEFAULT_TRANSFORMER, point1.lat, point1.lon)
        p2x, p2y = _project(DEFAULT_TRANSFORMER, point2.lat, point2.lon)

        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg

        A_radical = cx - p2x
        B_radical = cy - p2y
        C_radical = (cx**2 + cy**2 - self.TURN_RADIUS**2) - (p2x * cx + p2y * cy)
        radical_value = A_radical * sx + B_radical * sy
        radical_error = abs(radical_value - C_radical)
        assert radical_error < 1.0, \
            f"Straightening point should be on radical axis, A*x + B*y = {radical_value:.2f} (expected: C = {C_radical:.2f}, error: {radical_error:.2f})"

        assert s_lat > point1.lat, "This should be North East of the start point"
        assert s_lon > point1.lon, "This should be North East of the start point"

        outbound_bearing = calculate_bearing(turn_data.center, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1
        else:
            turn_direction = -1

        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)
        assert turn_angle < 46, "This should be a 45 degree turn (turn_angle = 45)"
        assert turn_direction == 1, "This should be a left turn (turn_direction = 1)"
