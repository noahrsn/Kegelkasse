"""Bowling session routes: create, record penalties, submit, approve, guests."""

from fastapi import APIRouter

router = APIRouter(prefix="/group/{group_id}/sessions", tags=["sessions"])


@router.get("/new")
async def new_session_page(group_id: str):
    """GET — Start a new bowling session."""
    ...


@router.post("/new")
async def create_session(group_id: str):
    """POST — Create session (draft status)."""
    ...


@router.get("/{session_id}")
async def session_detail(group_id: str, session_id: str):
    """GET — Live recording view for an active session."""
    ...


@router.post("/{session_id}/penalty")
async def add_penalty(group_id: str, session_id: str):
    """POST — Add penalty to member (HTMX partial, saved immediately)."""
    ...


@router.delete("/{session_id}/penalty")
async def remove_penalty(group_id: str, session_id: str):
    """DELETE — Remove penalty from member."""
    ...


@router.post("/{session_id}/submit")
async def submit_session(group_id: str, session_id: str):
    """POST — Submit session for approval."""
    ...


@router.get("/pending")
async def pending_sessions(group_id: str):
    """GET — List sessions pending approval (Kassenwart/Admin)."""
    ...


@router.post("/{session_id}/approve")
async def approve_session(group_id: str, session_id: str):
    """POST — Approve session, book debts."""
    ...


@router.get("/{session_id}/guests")
async def guests_page(group_id: str, session_id: str):
    """GET — Guest management for a session."""
    ...


@router.post("/{session_id}/guests")
async def add_guest(group_id: str, session_id: str):
    """POST — Add guest to session."""
    ...


@router.post("/{session_id}/guests/{guest_id}/paid")
async def mark_guest_paid(group_id: str, session_id: str, guest_id: str):
    """POST — Mark guest debt as paid."""
    ...
