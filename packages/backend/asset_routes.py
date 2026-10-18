"""Library + profile sync routes (capability: space-asset-sync; AD-6, AD-17).

The signed-in user's Personal space holds one theatre library per theatre and a
flat list of performance profiles. Rows are written one at a time under the
last-write-wins rules in `assets.py` (design D3) and pulled back through a
single change feed. The anonymous tier keeps its library and profile on the
device and never calls these routes (AD-9).

Reached at /api/* through Caddy (the /api prefix is stripped, D6).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

import assets
import spaces
from flight_plan import (
    Aircraft,
    LibraryObject,
    Regime,
    RegimeClimb,
    RegimeCruise,
    RegimeDescent,
    TakeoffPerformance,
)
from space_routes import require_user

router = APIRouter(tags=["assets"])

MAX_BODY_BYTES = 256 * 1024

# --- Payload models ----------------------------------------------------------
# Strict variants of the shared models: the frontend ships with the backend, so
# an unknown field is drift to catch early, not data to store blindly (D5).

_FORBID = ConfigDict(extra="forbid")


class _Cruise(RegimeCruise):
    model_config = _FORBID


class _Climb(RegimeClimb):
    model_config = _FORBID


class _Descent(RegimeDescent):
    model_config = _FORBID


class _Regime(Regime):
    model_config = _FORBID
    cruise: _Cruise
    climb: Optional[_Climb] = None
    descent: Optional[_Descent] = None


class _Takeoff(TakeoffPerformance):
    model_config = _FORBID


class _Aircraft(Aircraft):
    model_config = _FORBID
    takeoff: _Takeoff = Field(default_factory=_Takeoff)
    regimes: List[_Regime] = Field(default_factory=list)


class _LibraryEntry(LibraryObject):
    model_config = _FORBID


class _Profile(BaseModel):
    # No name: a profile is labelled from its aircraft model and take-off
    # configuration (performance-profile).
    model_config = _FORBID
    aircraft: _Aircraft


class WriteEntryRequest(BaseModel):
    model_config = _FORBID
    baseSeq: Optional[int] = None
    entry: _LibraryEntry


class WriteProfileRequest(BaseModel):
    model_config = _FORBID
    baseSeq: Optional[int] = None
    profile: _Profile


# --- Dependencies -------------------------------------------------------------

async def limit_body(request: Request) -> None:
    """Reject request bodies over MAX_BODY_BYTES (D5)."""
    length = request.headers.get("content-length")
    if length is not None and int(length) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large")


async def my_space_id(user: dict = Depends(require_user)) -> str:
    space = await spaces.get_or_create_personal_space(user["id"])
    return space["id"]


# --- Routes -------------------------------------------------------------------

@router.get("/libraries")
async def list_libraries(theatre: str = Query(min_length=1), space_id: str = Depends(my_space_id)):
    """The space's libraries for a theatre (exactly one today, AD-17)."""
    return await assets.libraries_for_theatre(space_id, theatre)


@router.put("/libraries/{library_id}/entries/{entry_id}", dependencies=[Depends(limit_body)])
async def put_entry(
    library_id: str, entry_id: str, body: WriteEntryRequest,
    space_id: str = Depends(my_space_id),
):
    if body.entry.id != entry_id:
        raise HTTPException(status_code=422, detail="Entry id does not match the path")
    data = body.entry.model_dump(exclude_none=True, exclude={"id"})
    try:
        return await assets.write_entry(space_id, library_id, entry_id, body.baseSeq, data)
    except assets.UnknownLibrary:
        raise HTTPException(status_code=404, detail="Library not found")
    except assets.LibraryMismatch:
        raise HTTPException(status_code=409, detail="Entry belongs to another library")


@router.delete("/libraries/{library_id}/entries/{entry_id}")
async def delete_entry(library_id: str, entry_id: str, space_id: str = Depends(my_space_id)):
    try:
        return await assets.delete_entry(space_id, library_id, entry_id)
    except assets.UnknownLibrary:
        raise HTTPException(status_code=404, detail="Library not found")
    except assets.LibraryMismatch:
        raise HTTPException(status_code=409, detail="Entry belongs to another library")


@router.put("/profiles/{profile_id}", dependencies=[Depends(limit_body)])
async def put_profile(
    profile_id: str, body: WriteProfileRequest, space_id: str = Depends(my_space_id),
):
    data = body.profile.model_dump(exclude_none=True)
    return await assets.write_profile(space_id, profile_id, body.baseSeq, data)


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, space_id: str = Depends(my_space_id)):
    return await assets.delete_profile(space_id, profile_id)


@router.get("/changes")
async def get_changes(since: int = Query(default=0, ge=0), space_id: str = Depends(my_space_id)):
    """Rows written after `since`, tombstones included, plus the next cursor."""
    return await assets.changes_since(space_id, since)
