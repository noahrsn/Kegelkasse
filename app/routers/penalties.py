"""Penalties catalog management."""

from fastapi import APIRouter

router = APIRouter(prefix="/group/{group_id}/penalties", tags=["penalties"])


@router.get("")
async def list_catalog(group_id: str):
    """GET — List all penalty types for this group."""
    ...


@router.post("")
async def create_penalty_type(group_id: str):
    """POST — Add new penalty type to catalog."""
    ...


@router.put("/{penalty_id}")
async def update_penalty_type(group_id: str, penalty_id: str):
    """PUT — Edit penalty type (name, amount, icon)."""
    ...


@router.post("/{penalty_id}/deactivate")
async def deactivate_penalty_type(group_id: str, penalty_id: str):
    """POST — Deactivate penalty type (no hard delete for audit trail)."""
    ...
