"""Calendar & event management: create events, RSVP, recurring schedules."""

from fastapi import APIRouter

router = APIRouter(prefix="/group/{group_id}/calendar", tags=["calendar"])


@router.get("")
async def calendar_view(group_id: str):
    """GET — Calendar view (month/list)."""
    ...


@router.get("/new")
async def new_event_page(group_id: str):
    """GET — Create event form."""
    ...


@router.post("/new")
async def create_event(group_id: str):
    """POST — Create single, recurring, or multi-day event."""
    ...


@router.get("/{event_id}")
async def event_detail(group_id: str, event_id: str):
    """GET — Event detail & RSVP view."""
    ...


@router.get("/{event_id}/edit")
async def edit_event_page(group_id: str, event_id: str):
    """GET — Edit event form."""
    ...


@router.post("/{event_id}/edit")
async def update_event(group_id: str, event_id: str):
    """POST — Update event."""
    ...


@router.post("/{event_id}/rsvp")
async def rsvp(group_id: str, event_id: str):
    """POST — Submit RSVP (attending/declined)."""
    ...


@router.delete("/{event_id}")
async def delete_event(group_id: str, event_id: str):
    """DELETE — Delete event."""
    ...
