"""Space + plan-index REST routes (capability: space; AD-1, AD-15).

The signed-in user's Personal space and the flight plans it holds. All routes
require a session; the anonymous tier stores plans on the device and never calls
these (AD-9). Plan *content* syncs over the WebSocket (plan-sync); these routes
manage the index — materialize the space, list, register (defer-commit). Plans
are renamed only inside their document; the server keeps `plans.name` in step.

Reached at /api/* through Caddy (the /api prefix is stripped, D6).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

import plans
import spaces
from auth_routes import get_current_user

router = APIRouter(tags=["spaces"])


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


@router.post("/plans", status_code=201)
async def create_plan(body: CreatePlanRequest, user: dict = Depends(require_user)):
    """Register a plan in the caller's space (the defer-commit step, AD-15)."""
    space = await spaces.get_or_create_personal_space(user["id"])
    try:
        plan = await plans.create_plan(body.id, space["id"], body.name, body.theatre)
    except plans.DuplicatePlanId:
        raise HTTPException(status_code=409, detail="A plan with that id already exists")
    return _public_plan(plan)

