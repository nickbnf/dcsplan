"""Space + plan-index REST routes (capability: space; AD-1, AD-15).

The signed-in user's Personal space and the flight plans it holds. All routes
require a session; the anonymous tier stores plans on the device and never calls
these (AD-9). Plan *content* syncs over the WebSocket (plan-sync); these routes
manage the index — materialize the space, list, register (defer-commit). Plans
are renamed only inside their document; the server keeps `plans.name` in step.

Reached at /api/* through Caddy (the /api prefix is stripped, D6).
"""
import base64
import binascii
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pycrdt import Doc
from pydantic import BaseModel, Field

import plans
import spaces
from auth_routes import get_current_user

router = APIRouter(tags=["spaces"])

# A plan created with its content carries it as base64 (add-local-data-import
# D1). Plans are small; this bounds a pathological upload, not a real plan.
MAX_CREATE_PLAN_BODY_BYTES = 512 * 1024


async def require_user(request: Request) -> dict:
    """Dependency: the signed-in user, or 401. The anonymous tier never reaches
    these routes (AD-9)."""
    user = await get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


class CreatePlanRequest(BaseModel):
    # Client-generated (draft -> committed, AD-15), 12 base58 characters (AD-16).
    id: str = Field(pattern=plans.PLAN_ID_PATTERN)
    name: str
    theatre: str
    # The plan's content as a base64-encoded Yjs update, stored as its first
    # update so the plan is created with its content (add-local-data-import D1).
    initialState: Optional[str] = None


async def limit_create_plan_body(request: Request) -> None:
    """Reject plan-creation bodies over MAX_CREATE_PLAN_BODY_BYTES."""
    length = request.headers.get("content-length")
    if length is not None and int(length) > MAX_CREATE_PLAN_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large")


def _decode_initial_state(value: str) -> bytes:
    """The decoded Yjs update, or 422 if it is not base64 or not a Yjs update.
    An undecodable update would break every later sync of the plan."""
    try:
        update = base64.b64decode(value, validate=True)
        Doc().apply_update(update)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="initialState is not a valid Yjs update")
    return update


def _public_plan(plan: dict) -> dict:
    return {
        "id": plan["id"],
        "name": plan["name"],
        "theatre": plan["theatre"],
        "updatedAt": plan["updated_at"],
        # Editor attribution arrives with version-history; null until then.
        "lastEditor": None,
    }


@router.get("/spaces/me")
async def get_my_space(user: dict = Depends(require_user)):
    """The caller's Personal space, materialized on first access (AD-1)."""
    space = await spaces.get_or_create_personal_space(user["id"])
    return {"id": space["id"], "kind": space["kind"]}


@router.get("/plans")
async def list_my_plans(user: dict = Depends(require_user)):
    """Plans in the caller's Personal space (excludes soft-deleted)."""
    space = await spaces.get_or_create_personal_space(user["id"])
    rows = await plans.list_plans(space["id"])
    return [_public_plan(p) for p in rows]


@router.post("/plans", status_code=201, dependencies=[Depends(limit_create_plan_body)])
async def create_plan(body: CreatePlanRequest, user: dict = Depends(require_user)):
    """Register a plan in the caller's space: the defer-commit step (AD-15), or
    an import that brings the plan's content along (add-local-data-import D1)."""
    initial_update = (
        _decode_initial_state(body.initialState) if body.initialState is not None else None
    )
    space = await spaces.get_or_create_personal_space(user["id"])
    try:
        plan = await plans.create_plan(
            body.id, space["id"], body.name, body.theatre, initial_update=initial_update
        )
    except plans.DuplicatePlanId:
        raise HTTPException(status_code=409, detail="A plan with that id already exists")
    return _public_plan(plan)

