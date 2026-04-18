"""Member management: list, roles, profile, IBAN."""

from fastapi import APIRouter

router = APIRouter(prefix="/group/{group_id}/members", tags=["members"])


@router.get("")
async def list_members(group_id: str):
    """GET /group/{id}/members — List all members with roles."""
    ...


@router.post("/{user_id}/role")
async def change_role(group_id: str, user_id: str):
    """POST — Change member role (admin only)."""
    ...


@router.delete("/{user_id}")
async def remove_member(group_id: str, user_id: str):
    """DELETE — Remove member from group (admin only)."""
    ...


@router.get("/profile")
async def profile():
    """GET /profile — Own profile with active awards."""
    ...
