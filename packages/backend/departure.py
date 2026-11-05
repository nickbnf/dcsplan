"""
Runway departure for leg 1 (departure capability).

Mirror of packages/frontend/src/utils/departure.ts, function by function: the
speed schedule from brake release, the departure path integrated in projected
coordinates, and the wind-along-track timing used by compute_leg_segments.
"""

import math
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Tuple

from pyproj import Transformer

DEFAULT_STRAIGHT_OUT_NM = 2.0


def straight_out_distance_nm(aircraft) -> float:
    """Along-track distance from brake release to the departure turn, in NM."""
    value = getattr(aircraft, 'straightOutDistance', None)
    return value if value is not None else DEFAULT_STRAIGHT_OUT_NM


# --- Phase predicates, shared by compute_leg_segments and the departure schedule ---

def is_takeoff_active(leg_index: Optional[int], regime, takeoff) -> bool:
    """Whether leg 1 gets a take-off segment (aircraft-performance, "Take-off segment on leg 1")."""
    return (
        leg_index == 0 and
        regime is not None and
        takeoff is not None and
        takeoff.timeSec > 0 and
        takeoff.distance > 0
    )


@dataclass
class TransitionPhase:
    phase: str   # 'climb' | 'descent'
    tas: float
    ff: float
    rate: float  # fpm


def transition_phase(alt_delta: float, regime) -> Optional[TransitionPhase]:
    """The climb or descent flown at the start of a leg, if the regime has matching data."""
    if regime is None or alt_delta == 0:
        return None
    if alt_delta > 0:
        c = regime.climb
        return TransitionPhase('climb', c.tas, c.ff, c.roc) if c is not None else None
    d = regime.descent
    return TransitionPhase('descent', d.tas, d.ff, d.rod) if d is not None else None


# --- Speed schedule (design D1) ---

@dataclass
class SchedulePiece:
    t0: float  # seconds from brake release
    t1: float
    tas_at: Callable[[float], float]       # knots
    distance_to: Callable[[float], float]  # NM flown from t0 to t


@dataclass
class DepartureSchedule:
    takeoff_end_sec: float     # 0 when there is no take-off phase
    transition_end_sec: float  # equals takeoff_end_sec when there is no climb or descent
    pieces: List[SchedulePiece]  # the last piece is open-ended (cruise)


def _constant_piece(t0: float, t1: float, tas: float) -> SchedulePiece:
    return SchedulePiece(t0, t1, lambda t: tas, lambda t: tas * (t - t0) / 3600)


def _takeoff_piece(time_sec: float, distance_nm: float, vc: float) -> SchedulePiece:
    """v(t) = Vc·(t/T)^p with p = Vc·T/D − 1; constant D/T when D ≥ Vc·T."""
    vc_t = vc * time_sec / 3600
    if distance_nm >= vc_t:
        return _constant_piece(0, time_sec, distance_nm * 3600 / time_sec)
    p = vc_t / distance_nm - 1
    return SchedulePiece(
        0, time_sec,
        lambda t: vc * (t / time_sec) ** p,
        lambda t: distance_nm * (t / time_sec) ** (p + 1),
    )


def departure_schedule(flight_plan, aircraft) -> DepartureSchedule:
    origin = flight_plan.points[0]
    destination = flight_plan.points[1]
    regime = next((r for r in aircraft.regimes if r.id == destination.regimeId), None) if destination.regimeId else None
    alt_delta = destination.alt - (origin.groundAlt or 0)
    transition = transition_phase(alt_delta, regime)
    cruise_tas = regime.cruise.tas if regime else destination.tas
    vc = transition.tas if transition else cruise_tas

    pieces: List[SchedulePiece] = []
    t = 0.0
    if is_takeoff_active(0, regime, aircraft.takeoff):
        pieces.append(_takeoff_piece(aircraft.takeoff.timeSec, aircraft.takeoff.distance, vc))
        t = aircraft.takeoff.timeSec
    takeoff_end_sec = t
    if transition:
        duration_sec = abs(alt_delta) / transition.rate * 60
        pieces.append(_constant_piece(t, t + duration_sec, transition.tas))
        t += duration_sec
    pieces.append(_constant_piece(t, math.inf, cruise_tas))
    return DepartureSchedule(takeoff_end_sec, t, pieces)


def schedule_tas_at(schedule: DepartureSchedule, t: float) -> float:
    piece = next((p for p in schedule.pieces if t < p.t1), schedule.pieces[-1])
    return piece.tas_at(t)


def schedule_air_distance_nm(schedule: DepartureSchedule, t0: float, t1: float) -> float:
    """Air distance (NM) flown between t0 and t1, exact for every piece."""
    total = 0.0
    for p in schedule.pieces:
        a = max(t0, p.t0)
        b = min(t1, p.t1)
        if b > a:
            total += p.distance_to(b) - p.distance_to(a)
    return total


def _time_at_air_distance(schedule: DepartureSchedule, distance_nm: float) -> float:
    hi = 1.0
    while schedule_air_distance_nm(schedule, 0, hi) < distance_nm:
        hi *= 2
    lo = 0.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if schedule_air_distance_nm(schedule, 0, mid) < distance_nm:
            lo = mid
        else:
            hi = mid
    return hi


# --- Departure path (design D2) ---

STEP_SEC = 1
MAX_TIME_SEC = 3 * 3600


@dataclass
class DepartureSample:
    t: float      # seconds from brake release
    s: float      # NM of air distance
    track: float  # unwrapped degrees


@dataclass
class DeparturePath:
    points: List[Tuple[float, float]]  # (lat, lon), WP0 → roll-out point
    samples: List[DepartureSample]
    roll_out_t: float
    roll_out_s: float
    roll_out_lat: float
    roll_out_lon: float
    turn_start_t: float
    turn_start_s: float
    turn_angle_rad: float  # signed, CCW positive
    turn_direction: int    # 1 = left (CCW), -1 = right
    schedule: DepartureSchedule = field(repr=False)


def _norm180(deg: float) -> float:
    a = ((deg % 360) + 360) % 360
    return a - 360 if a > 180 else a


def _grid_bearing(x: float, y: float, tx: float, ty: float) -> float:
    return (math.degrees(math.atan2(tx - x, ty - y)) + 360) % 360


def _turn_radius_m(tas: float, bank_angle_deg: float) -> float:
    """Same constants as the leg turn radius."""
    return (tas * 0.514) ** 2 / (9.80665 * math.tan(math.radians(bank_angle_deg)))


@dataclass
class _TurnState:
    x: float
    y: float
    track: float
    turned: float


def _turn_step(state: _TurnState, schedule: DepartureSchedule, t0: float, t1: float, bank: float, sign: int) -> _TurnState:
    """One turning step: its exact air distance on an arc at the step's average speed."""
    ds_nm = schedule_air_distance_nm(schedule, t0, t1)
    ds_m = ds_nm * 1852
    if ds_m <= 0:
        return state
    v_avg = ds_nm / ((t1 - t0) / 3600)
    r = _turn_radius_m(v_avg, bank)
    d_psi = ds_m / r
    chord = ds_m if d_psi < 1e-12 else 2 * r * math.sin(d_psi / 2)
    chord_dir = math.radians(state.track + sign * math.degrees(d_psi) / 2)
    return _TurnState(
        state.x + chord * math.sin(chord_dir),
        state.y + chord * math.cos(chord_dir),
        state.track + sign * math.degrees(d_psi),
        state.turned + d_psi,
    )


def build_departure_path(
    origin, destination, runway_true: float, straight_out_nm: float,
    schedule: DepartureSchedule, bank_angle: float, transformer: Transformer,
) -> Optional[DeparturePath]:
    """Leg 1's departure path, integrated in projected coordinates like every other
    turn. Returns None when WP1 cannot be reached (closer than the straight-out
    distance, or the turn passes 360° without pointing at WP1)."""
    inverse = Transformer.from_crs(transformer.target_crs, transformer.source_crs, always_xy=True)

    def to_lat_lon(x: float, y: float) -> Tuple[float, float]:
        lon, lat = inverse.transform(x, y)
        return lat, lon

    x0, y0 = transformer.transform(origin.lon, origin.lat)
    tx, ty = transformer.transform(destination.lon, destination.lat)

    straight_out_m = straight_out_nm * 1852
    if math.hypot(tx - x0, ty - y0) < straight_out_m:
        return None

    # 1. Straight out along the runway
    t_s = _time_at_air_distance(schedule, straight_out_nm)
    rwy = math.radians(runway_true)
    state = _TurnState(x0 + straight_out_m * math.sin(rwy), y0 + straight_out_m * math.cos(rwy), runway_true, 0.0)
    points = [(origin.lat, origin.lon), to_lat_lon(state.x, state.y)]
    samples = [DepartureSample(0, 0, runway_true), DepartureSample(t_s, straight_out_nm, runway_true)]

    # 2. Turn towards the side of the runway heading on which WP1 lies
    offset = _norm180(_grid_bearing(state.x, state.y, tx, ty) - state.track)
    sign = 1 if offset >= 0 else -1  # +1 = right (track increases)
    turn_direction = -1 if sign == 1 else 1

    def finish(roll_t: float) -> DeparturePath:
        lat, lon = to_lat_lon(state.x, state.y)
        if roll_t > samples[-1].t:
            samples.append(DepartureSample(roll_t, schedule_air_distance_nm(schedule, 0, roll_t), state.track))
            points.append((lat, lon))
        return DeparturePath(
            points=points,
            samples=samples,
            roll_out_t=roll_t,
            roll_out_s=schedule_air_distance_nm(schedule, 0, roll_t),
            roll_out_lat=lat,
            roll_out_lon=lon,
            turn_start_t=t_s,
            turn_start_s=straight_out_nm,
            turn_angle_rad=-sign * state.turned,
            turn_direction=turn_direction,
            schedule=schedule,
        )

    if abs(offset) < 1e-9:
        return finish(t_s)

    # Step boundaries: whole seconds plus every phase boundary after the turn start
    breaks = [b for b in (schedule.takeoff_end_sec, schedule.transition_end_sec) if b > t_s]
    t = t_s
    while t < MAX_TIME_SEC:
        t_next = math.floor(t / STEP_SEC + 1e-9) * STEP_SEC + STEP_SEC
        for b in breaks:
            if t + 1e-9 < b < t_next:
                t_next = b

        nxt = _turn_step(state, schedule, t, t_next, bank_angle, sign)
        if nxt.turned > 2 * math.pi:
            return None
        after = _norm180(_grid_bearing(nxt.x, nxt.y, tx, ty) - nxt.track) * sign
        if -90 < after <= 0:
            # Roll-out inside this step: bisect on the step end time
            start = state
            lo, hi = t, t_next
            for _ in range(50):
                mid = (lo + hi) / 2
                s = _turn_step(start, schedule, t, mid, bank_angle, sign)
                if _norm180(_grid_bearing(s.x, s.y, tx, ty) - s.track) * sign > 0:
                    lo = mid
                else:
                    hi = mid
            state = _turn_step(start, schedule, t, hi, bank_angle, sign)
            return finish(hi)
        state = nxt
        t = t_next
        samples.append(DepartureSample(t, schedule_air_distance_nm(schedule, 0, t), state.track))
        points.append(to_lat_lon(state.x, state.y))
    return None


# --- Wind along the track (design D4) ---

def _interpolate_track(samples: List[DepartureSample], key: str, value: float, after: float) -> float:
    last = samples[-1]
    if value >= getattr(last, key):
        return after
    i = 1
    while i < len(samples) and getattr(samples[i], key) < value:
        i += 1
    a, b = samples[i - 1], samples[i]
    av, bv = getattr(a, key), getattr(b, key)
    f = (value - av) / (bv - av) if bv > av else 0
    return a.track + f * (b.track - a.track)


def _wind_along(wind_speed: float, wind_dir: float, track: float) -> float:
    """Wind component along `track` (knots, positive = tailwind); same formula as apply_wind."""
    wind_angle_rad = ((((wind_dir + 180) % 360) - track + 360) % 360) * (math.pi / 180)
    return wind_speed * math.cos(wind_angle_rad)


class DepartureTiming:
    """Ground-distance and time integrals of leg 1 along the departure track.

    Time-defined phases read the track from the still-air schedule (track at time t);
    the distance-defined cruise reads it by path position. With wind the aircraft is
    not exactly at its still-air position at time t; like every drawn path, the
    geometry is in the air frame and wind only changes time and fuel.
    """
    SUB_SEC = 0.25
    SUB_NM = 0.01

    def __init__(self, path: DeparturePath, outbound_bearing: float):
        self.path = path
        self.outbound_bearing = outbound_bearing

    def ground_distance(self, t0: float, t1: float, wind_speed: float, wind_dir: float) -> float:
        """NM over ground between t0 and t1 seconds from brake release, at the scheduled TAS."""
        if t1 <= t0:
            return 0.0
        n = max(1, math.ceil((t1 - t0) / self.SUB_SEC))
        h = (t1 - t0) / n
        wind_nm = 0.0
        for i in range(n):
            tm = t0 + (i + 0.5) * h
            wind_nm += _wind_along(wind_speed, wind_dir, _interpolate_track(self.path.samples, 't', tm, self.outbound_bearing)) * h / 3600
        return schedule_air_distance_nm(self.path.schedule, t0, t1) + wind_nm

    def time_over(self, s0: float, s1: float, tas: float, wind_speed: float, wind_dir: float) -> float:
        """Minutes to fly from path distance s0 to s1 (NM) at a constant TAS."""
        if s1 <= s0:
            return 0.0
        roll_s = self.path.roll_out_s
        minutes = 0.0
        turn_end = min(s1, roll_s)
        if turn_end > s0:
            n = max(1, math.ceil((turn_end - s0) / self.SUB_NM))
            h = (turn_end - s0) / n
            for i in range(n):
                sm = s0 + (i + 0.5) * h
                track = _interpolate_track(self.path.samples, 's', sm, self.outbound_bearing)
                minutes += h / (tas + _wind_along(wind_speed, wind_dir, track)) * 60
        straight_start = max(s0, roll_s)
        if s1 > straight_start:
            minutes += (s1 - straight_start) / (tas + _wind_along(wind_speed, wind_dir, self.outbound_bearing)) * 60
        return minutes
