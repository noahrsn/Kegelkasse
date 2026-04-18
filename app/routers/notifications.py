"""Notification settings management."""

from fastapi import APIRouter

router = APIRouter(tags=["notifications"])


@router.get("/profile/notifications")
async def notification_settings():
    """GET — Per-group notification toggle page."""
    ...


@router.post("/profile/notifications/{group_id}")
async def update_notification_settings(group_id: str):
    """POST — Update notification toggles for a specific group."""
    ...
