"""Club rulebook (Vereinsregelwerk) — view and edit."""

from fastapi import APIRouter

router = APIRouter(prefix="/group/{group_id}/rulebook", tags=["rulebook"])


@router.get("")
async def view_rulebook(group_id: str):
    """GET — Rendered rulebook (readable by all members)."""
    ...


@router.get("/edit")
async def edit_rulebook_page(group_id: str):
    """GET — Markdown editor (Präsident/Admin only)."""
    ...


@router.post("/edit")
async def save_rulebook(group_id: str):
    """POST — Save rulebook content."""
    ...
