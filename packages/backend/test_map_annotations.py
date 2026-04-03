"""Tests for coordinate formatting in map_annotations."""

import pytest
from map_annotations import _format_coord_ddm


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
