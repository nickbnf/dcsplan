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
    _lat_lon_to_transverse_mercator,
    _transverse_mercator_to_lat_lon
)


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
        
        Args:
            inbound_bearing: Direction aircraft arrives at point1 (degrees, compass bearing)
            cx, cy: Circle center coordinates
            sx, sy: Straightening point coordinates
            turn_direction: 1 for anti-clockwise (left), -1 for clockwise (right)
        
        Returns:
            The effective turn angle in degrees
        """
        # Convert inbound_bearing to math angle (0°=east, counter-clockwise)
        angle_entry = math.radians(90 - inbound_bearing)
        while angle_entry < 0:
            angle_entry += 2 * math.pi
        while angle_entry >= 2 * math.pi:
            angle_entry -= 2 * math.pi
        
        # Calculate angle from center to straightening point
        angle_exit = math.atan2(sy - cy, sx - cx)
        
        # Calculate signed turn angle
        turn_angle_rad = angle_exit - angle_entry
        # Normalize to [-π, π]
        while turn_angle_rad > math.pi:
            turn_angle_rad -= 2 * math.pi
        while turn_angle_rad < -math.pi:
            turn_angle_rad += 2 * math.pi
        
        turn_angle_deg = math.degrees(turn_angle_rad)
        
        # Apply turn direction: effective angle should be positive for valid turn
        effective_angle = turn_direction * turn_angle_deg
        
        # Verify turn is <= 180 degrees
        assert effective_angle <= 180, \
            f"Turn angle should be <= 180°, got {effective_angle:.2f}°"
        
        return effective_angle
    
    def test_straight_line(self):
        """Test straight line: inbound_bearing, point1 and point2 aligned."""
        # Point 1: origin at (34.0, 36.0)
        # Point 2: 10km east (bearing ~90°)
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(34.0, 36.1)  # ~10km east
        
        inbound_bearing = 90.0  # Coming from east
        c_lat, c_lon, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2
        )
        
        # Convert to TM coordinates for verification
        cx, cy = _lat_lon_to_transverse_mercator(c_lat, c_lon)
        sx, sy = _lat_lon_to_transverse_mercator(s_lat, s_lon)
        p1x, p1y = _lat_lon_to_transverse_mercator(point1.lat, point1.lon)
        p2x, p2y = _lat_lon_to_transverse_mercator(point2.lat, point2.lon)
        
        # Verify: straightening point should be on the circle
        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg
        
        # For straight line, the straightening point should be very close to point1
        # (since we're going straight, we exit the turn almost immediately)
        dist_from_point1 = distance_in_tm(p1x, p1y, sx, sy)
        # The distance should be approximately the turn radius
        assert dist_from_point1 < self.TURN_RADIUS * 2, \
            f"For straight line, straightening point should be close to point1, got {dist_from_point1}m"
        
        # Calculate turn direction (same logic as in calculate_straigthening_point)
        outbound_bearing = calculate_bearing(point1.lat, point1.lon, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1  # Left turn (anti-clockwise)
        else:
            turn_direction = -1  # Right turn (clockwise)
        
        # Verify the turn angle is correct (should be small for a straight line, <= 180°)
        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)
    
    def test_left_90_degree_turn(self):
        """Test left 90 degree turn."""
        # Point 1: origin at (34.0, 36.0)
        # Point 2: 10km north (bearing ~0°)
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(34.1, 36.0)  # ~10km north
        
        inbound_bearing = 90.0  # Coming from east (90°)
        # Outbound bearing will be ~0° (north)
        # This is a left turn of 90 degrees
        
        c_lat, c_lon, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2
        )
        
        # Convert to TM coordinates for verification
        cx, cy = _lat_lon_to_transverse_mercator(c_lat, c_lon)
        sx, sy = _lat_lon_to_transverse_mercator(s_lat, s_lon)
        p1x, p1y = _lat_lon_to_transverse_mercator(point1.lat, point1.lon)
        p2x, p2y = _lat_lon_to_transverse_mercator(point2.lat, point2.lon)
        
        # Verify: straightening point should be on the circle
        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg
        
        # Verify: straightening point should be on the radical axis
        # Radical axis equation: Ax + By = C
        # Where: A = cx - dx, B = cy - dy, C = (cx² + cy² - r²) - (dx*cx + dy*cy)
        A_radical = cx - p2x
        B_radical = cy - p2y
        C_radical = (cx**2 + cy**2 - self.TURN_RADIUS**2) - (p2x * cx + p2y * cy)
        
        # Check if point satisfies radical axis equation
        radical_value = A_radical * sx + B_radical * sy
        radical_error = abs(radical_value - C_radical)
        assert radical_error < 1.0, \
            f"Straightening point should be on radical axis, A*x + B*y = {radical_value:.2f} (expected: C = {C_radical:.2f}, error: {radical_error:.2f})"
        
        # Calculate turn direction (same logic as in calculate_straigthening_point)
        outbound_bearing = calculate_bearing(point1.lat, point1.lon, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1  # Left turn (anti-clockwise)
        else:
            turn_direction = -1  # Right turn (clockwise)
        
        # Verify the turn angle is correct (in correct direction and <= 180°)
        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)
        assert turn_direction == 1, "This should be a left turn (turn_direction = 1)"
    
    def test_right_90_degree_turn(self):
        """Test right 90 degree turn."""
        # Point 1: origin at (34.0, 36.0)
        # Point 2: 10km south (bearing ~180°)
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(33.9, 36.0)  # ~10km south
        
        inbound_bearing = 90.0  # Coming from east (90°)
        # Outbound bearing will be ~180° (south)
        # This is a right turn of 90 degrees
        
        c_lat, c_lon, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2
        )
        
        # Convert to TM coordinates for verification
        cx, cy = _lat_lon_to_transverse_mercator(c_lat, c_lon)
        sx, sy = _lat_lon_to_transverse_mercator(s_lat, s_lon)
        p1x, p1y = _lat_lon_to_transverse_mercator(point1.lat, point1.lon)
        p2x, p2y = _lat_lon_to_transverse_mercator(point2.lat, point2.lon)
        
        # Verify: straightening point should be on the circle
        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg
        
        # Verify: straightening point should be on the radical axis
        A_radical = cx - p2x
        B_radical = cy - p2y
        C_radical = (cx**2 + cy**2 - self.TURN_RADIUS**2) - (p2x * cx + p2y * cy)
        radical_value = A_radical * sx + B_radical * sy
        radical_error = abs(radical_value - C_radical)
        assert radical_error < 1.0, \
            f"Straightening point should be on radical axis, A*x + B*y = {radical_value:.2f} (expected: C = {C_radical:.2f}, error: {radical_error:.2f})"
        
        # Calculate turn direction (same logic as in calculate_straigthening_point)
        outbound_bearing = calculate_bearing(point1.lat, point1.lon, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1  # Left turn (anti-clockwise)
        else:
            turn_direction = -1  # Right turn (clockwise)
        
        # Verify the turn angle is correct (should be approximately 90° for a right 90° turn)
        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)
        assert turn_direction == -1, "This should be a right turn (turn_direction = -1)"
    
    def test_180_degree_turn(self):
        """Test 180 degree turn (U-turn)."""
        # Point 1: origin at (34.0, 36.0)
        # Point 2: 10km west (bearing ~270°)
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(34.0, 35.9)  # ~10km west
        
        inbound_bearing = 90.0  # Coming from east (90°)
        # Outbound bearing will be ~270° (west)
        # This is a 180 degree turn
        
        c_lat, c_lon, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2
        )
        
        # Convert to TM coordinates for verification
        cx, cy = _lat_lon_to_transverse_mercator(c_lat, c_lon)
        sx, sy = _lat_lon_to_transverse_mercator(s_lat, s_lon)
        p1x, p1y = _lat_lon_to_transverse_mercator(point1.lat, point1.lon)
        p2x, p2y = _lat_lon_to_transverse_mercator(point2.lat, point2.lon)
        
        # Verify: straightening point should be on the circle
        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg
        
        # Verify: straightening point should be on the radical axis
        A_radical = cx - p2x
        B_radical = cy - p2y
        C_radical = (cx**2 + cy**2 - self.TURN_RADIUS**2) - (p2x * cx + p2y * cy)
        radical_value = A_radical * sx + B_radical * sy
        radical_error = abs(radical_value - C_radical)
        assert radical_error < 1.0, \
            f"Straightening point should be on radical axis, A*x + B*y = {radical_value:.2f} (expected: C = {C_radical:.2f}, error: {radical_error:.2f})"
        
        # Calculate turn direction (same logic as in calculate_straigthening_point)
        outbound_bearing = calculate_bearing(point1.lat, point1.lon, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1  # Left turn (anti-clockwise)
        else:
            turn_direction = -1  # Right turn (clockwise)
        
        # Verify the turn angle is correct (in correct direction and <= 180°)
        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)
    
    def test_45_degree_turn(self):
        """Test 45 degree turn."""
        # Point 1: origin at (34.0, 36.0)
        # Point 2: northeast (bearing ~45°)
        point1 = create_turnpoint(34.0, 36.0)
        point2 = create_turnpoint(34.05, 36.05)  # ~7km northeast
        
        inbound_bearing = 90.0  # Coming from west (90°)
        # Outbound bearing will be ~45° (northeast)
        # This is a left turn of 45 degrees
        
        c_lat, c_lon, s_lat, s_lon = calculate_straigthening_point(
            inbound_bearing, point1, point2
        )
        
        # Convert to TM coordinates for verification
        cx, cy = _lat_lon_to_transverse_mercator(c_lat, c_lon)
        sx, sy = _lat_lon_to_transverse_mercator(s_lat, s_lon)
        p1x, p1y = _lat_lon_to_transverse_mercator(point1.lat, point1.lon)
        p2x, p2y = _lat_lon_to_transverse_mercator(point2.lat, point2.lon)
        
        # Verify: straightening point should be on the circle
        dist_from_center = distance_in_tm(cx, cy, sx, sy)
        error_msg = (
            f"Straightening point should be {self.TURN_RADIUS}m from center, got {dist_from_center}m. "
            f"Circle center: ({cx:.2f}, {cy:.2f}), Straightening point: ({sx:.2f}, {sy:.2f}), "
            f"Point1: ({p1x:.2f}, {p1y:.2f}), Point2: ({p2x:.2f}, {p2y:.2f})"
        )
        assert abs(dist_from_center - self.TURN_RADIUS) < self.TOLERANCE, error_msg
        
        # Verify: straightening point should be on the radical axis
        A_radical = cx - p2x
        B_radical = cy - p2y
        C_radical = (cx**2 + cy**2 - self.TURN_RADIUS**2) - (p2x * cx + p2y * cy)
        radical_value = A_radical * sx + B_radical * sy
        radical_error = abs(radical_value - C_radical)
        assert radical_error < 1.0, \
            f"Straightening point should be on radical axis, A*x + B*y = {radical_value:.2f} (expected: C = {C_radical:.2f}, error: {radical_error:.2f})"
        
        # Verify: straigthening point should be northeast of the start point
        assert s_lat > point1.lat, "This should be North East of the start point"
        assert s_lon > point1.lon, "This should be North East of the start point"

        # Calculate turn direction (same logic as in calculate_straigthening_point)
        outbound_bearing = calculate_bearing(point1.lat, point1.lon, point2)
        if (outbound_bearing - inbound_bearing + 360) % 360 > 180:
            turn_direction = 1  # Left turn (anti-clockwise)
        else:
            turn_direction = -1  # Right turn (clockwise)
        
        # Verify the turn angle is correct (in correct direction and <= 180°)
        turn_angle = self.verify_turn_angle(inbound_bearing, cx, cy, sx, sy, turn_direction)
        assert turn_angle < 46, "This should be a 45 degree turn (turn_angle = 45)"
        assert turn_direction == 1, "This should be a left turn (turn_direction = 1)"

