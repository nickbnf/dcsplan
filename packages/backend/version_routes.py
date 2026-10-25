"""Plan version routes (capability: version-history; add-version-history D5).

Versions are finalized by the server (`sync.finalize_plan`); these routes list
them, let a device finalize what it shows (before a kneeboard, a profile switch
or a restore), and serve what a restore and a recovery need. Access follows the
plan routes: a plan outside the caller's space is 404, a trashed one 410.
"""
import base64
import binascii
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pycrdt import Doc
from pydantic import BaseModel

import plans
import sync
import versions
from space_routes import limit_create_plan_body, my_space, require_user

router = APIRouter(tags=["versions"])


async def _live_plan(plan_id: str, space: dict) -> dict:
    """The caller's live plan, or 404 (unknown or another space's) or 410 (trashed)."""
    plan = await plans.get_plan(plan_id) if plans.is_plan_id(plan_id) else None
    if plan is None or plan["space_id"] != space["id"]:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not plans.is_live(plan):
        raise HTTPException(status_code=410, detail="Plan is in the Trash")
    return plan


async def _public_versions(rows: list[dict]) -> list[dict]:
    """Versions as the client sees them, with editors' current display names."""
    names = await versions.display_names(sorted({u for v in rows for u in v["editors"]}))
    return [
        {
            "rev": v["rev"],
            "finalizedAt": v["finalized_at"],
            "editors": [{"id": u, "displayName": names.get(u)} for u in v["editors"]],
            "restoredFrom": v["restored_from"],
        }
        for v in rows
    ]


class FinalizeRequest(BaseModel):
    # The device's whole document state, a base64-encoded Yjs update (D5).
    update: str
    # Set when the device has just restored that rev's content (D6).
    restoredFrom: Optional[int] = None


def _decode_update(value: str) -> bytes:
    """The decoded Yjs update, or 422 if it is not base64 or not a Yjs update."""
    try:
        update = base64.b64decode(value, validate=True)
        Doc().apply_update(update)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="update is not a valid Yjs update")
    return update


@router.get("/plans/{plan_id}/versions")
async def list_plan_versions(plan_id: str, space: dict = Depends(my_space)):
    """The plan's versions, newest first, and whether it has unfinalized edits."""
    await _live_plan(plan_id, space)
    return {
        "versions": await _public_versions(await versions.list_versions(plan_id)),
        "pending": await sync.has_unfinalized_edits(plan_id),
    }


@router.post("/plans/{plan_id}/versions", dependencies=[Depends(limit_create_plan_body)])
async def finalize_plan_version(
    plan_id: str, body: FinalizeRequest, user: dict = Depends(require_user),
    space: dict = Depends(my_space),
):
    """Merge the device's state and finalize any unfinalized edits; returns the
    plan's latest version, or null for a plan that has no content yet."""
    await _live_plan(plan_id, space)
    update = _decode_update(body.update)
    if body.restoredFrom is not None and await versions.get_version_state(plan_id, body.restoredFrom) is None:
        raise HTTPException(status_code=404, detail="Version not found")
    version = await sync.finalize_plan(
        plan_id, update=update, restored_from=body.restoredFrom, actor=user["id"]
    )
    return (await _public_versions([version]))[0] if version is not None else None


@router.get("/plans/{plan_id}/versions/{rev}/state")
async def get_plan_version_state(plan_id: str, rev: int, space: dict = Depends(my_space)):
    """One version's full document state, base64-encoded, for a restore (D6)."""
    await _live_plan(plan_id, space)
    state = await versions.get_version_state(plan_id, rev)
    if state is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"rev": rev, "state": base64.b64encode(state).decode()}


@router.get("/plans/{plan_id}/pinned-entries")
async def get_pinned_entries(plan_id: str, space: dict = Depends(my_space)):
    """Every library entry a version of the plan pinned, from the newest version
    holding it, shaped as a library entry for recovery (D7)."""
    await _live_plan(plan_id, space)
    return {
        "entries": {
            entry_id: {"theatre": copy["theatre"], "entry": {"id": entry_id, **copy["data"]}}
            for entry_id, copy in (await versions.pinned_entries(plan_id)).items()
        }
    }
