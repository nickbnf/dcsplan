"""The space's Trash: listing and retention (capability: soft-delete; AD-7;
add-trash-and-soft-delete D1, D7).

Trashing and restoring live with each entity's own module (`plans`, `assets`),
which own their tables and, for assets, the change-feed `seq`. This module
composes them into the one Trash a user sees and applies the retention period.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import assets
import plans

logger = logging.getLogger(__name__)

RETENTION_DAYS = 30
PURGE_INTERVAL_SECONDS = 6 * 60 * 60


async def trash_contents(space_id: str) -> dict:
    """Everything trashed in a space and not yet purged, most recently deleted
    first within each kind (the client merges the kinds)."""
    trashed = await assets.trashed_assets(space_id)
    by_newest = lambda item: item["deletedAt"]  # noqa: E731
    return {
        "plans": sorted(
            (
                {"id": p["id"], "name": p["name"], "theatre": p["theatre"], "deletedAt": p["deleted_at"]}
                for p in await plans.trashed_plans(space_id)
            ),
            key=by_newest,
            reverse=True,
        ),
        "entries": sorted(trashed["entries"], key=by_newest, reverse=True),
        "profiles": sorted(trashed["profiles"], key=by_newest, reverse=True),
        "retentionDays": RETENTION_DAYS,
    }


async def purge_expired(now: Optional[datetime] = None) -> dict:
    """Purge every item trashed more than RETENTION_DAYS before `now`."""
    cutoff = ((now or datetime.now(timezone.utc)) - timedelta(days=RETENTION_DAYS)).isoformat()
    purged_plans = await plans.purge_plans(cutoff)
    purged_assets = await assets.purge_assets(cutoff)
    return {"plans": len(purged_plans), "assets": purged_assets}


async def run_purge_forever(interval: float = PURGE_INTERVAL_SECONDS) -> None:
    """Purge now, then every `interval` seconds, until cancelled. A failed run is
    logged and retried at the next interval: a missed run only delays a purge."""
    while True:
        try:
            result = await purge_expired()
            if result["plans"] or result["assets"]:
                logger.info("Purged expired trash: %s", result)
        except Exception:
            logger.exception("Trash purge failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan_purge(interval: float = PURGE_INTERVAL_SECONDS):
    """Run the periodic purge for the app's lifetime; cancelled on shutdown."""
    task = asyncio.create_task(run_purge_forever(interval))
    try:
        yield task
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
