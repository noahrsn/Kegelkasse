"""Awards, statistics, and all-time ranking."""

from fastapi import APIRouter

router = APIRouter(prefix="/group/{group_id}", tags=["awards"])


@router.get("/stats")
async def stats(group_id: str):
    """GET — Monthly stats & awards."""
    ...


@router.get("/stats/alltime")
async def alltime_ranking(group_id: str):
    """GET — All-time leaderboard."""
    ...
