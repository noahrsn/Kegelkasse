"""Polls & voting (Abstimmungen & Umfragen)."""

from fastapi import APIRouter

router = APIRouter(prefix="/group/{group_id}/polls", tags=["polls"])


@router.get("")
async def list_polls(group_id: str):
    """GET — List open and closed polls."""
    ...


@router.get("/new")
async def new_poll_page(group_id: str):
    """GET — Create poll form."""
    ...


@router.post("/new")
async def create_poll(group_id: str):
    """POST — Create poll (Präsident/Admin only)."""
    ...


@router.get("/{poll_id}")
async def poll_detail(group_id: str, poll_id: str):
    """GET — View poll & cast vote."""
    ...


@router.post("/{poll_id}/vote")
async def vote(group_id: str, poll_id: str):
    """POST — Submit vote."""
    ...


@router.post("/{poll_id}/close")
async def close_poll(group_id: str, poll_id: str):
    """POST — Manually close poll (Admin/Präsident)."""
    ...
