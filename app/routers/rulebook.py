"""Club rulebook — view and edit."""

from __future__ import annotations

from datetime import UTC, datetime

import mistune
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from app.database.cosmos import CosmosDB, get_db
from app.database.models import Log, LogVisibility, Role, User
from app.services.auth_service import require_auth

router = APIRouter(prefix="/group/{group_id}/rulebook", tags=["rulebook"])
templates = Jinja2Templates(directory="app/templates")


def _render(request: Request, template: str, **ctx):
    return templates.TemplateResponse(template, {"request": request, **ctx})


def _user_role(group_doc: dict, user_id: str):
    for m in group_doc.get("members", []):
        if m["user_id"] == user_id:
            return Role(m["role"])
    return None


def _get_group_as_member(group_id: str, user: User, db: CosmosDB):
    doc = db.read_item("groups", group_id, group_id)
    if not doc:
        return None
    if user.id not in [m["user_id"] for m in doc.get("members", [])]:
        return None
    return doc


@router.get("")
async def view_rulebook(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)
    rulebook = group_doc.get("rulebook", {})
    content_md = rulebook.get("content", "")
    content_html = mistune.html(content_md) if content_md else ""
    can_edit = role in (Role.admin, Role.praesident)

    return _render(
        request,
        "rulebook.html",
        user=current_user,
        group=group_doc,
        group_id=group_id,
        group_name=group_doc["name"],
        role=role,
        content_html=content_html,
        content_md=content_md,
        last_edited_by=rulebook.get("last_edited_by"),
        last_edited_at=rulebook.get("last_edited_at"),
        can_edit=can_edit,
        active="rulebook",
    )


@router.get("/edit")
async def edit_rulebook_page(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)
    if role not in (Role.admin, Role.praesident):
        return RedirectResponse(f"/group/{group_id}/rulebook", status_code=302)

    content_md = group_doc.get("rulebook", {}).get("content", "")
    return _render(
        request,
        "rulebook_edit.html",
        user=current_user,
        group=group_doc,
        group_id=group_id,
        group_name=group_doc["name"],
        role=role,
        content_md=content_md,
        active="rulebook",
    )


@router.post("/edit")
async def save_rulebook(
    request: Request,
    group_id: str,
    content: str = Form(""),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)
    if role not in (Role.admin, Role.praesident):
        return RedirectResponse(f"/group/{group_id}/rulebook", status_code=302)

    group_doc.setdefault("rulebook", {})
    group_doc["rulebook"]["content"] = content.strip()
    group_doc["rulebook"]["last_edited_by"] = current_user.id
    group_doc["rulebook"]["last_edited_at"] = datetime.now(tz=UTC).isoformat()
    db.upsert_item("groups", group_doc)

    log = Log(
        group_id=group_id,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        action="edit_rulebook",
        details="Vereinsregelwerk aktualisiert",
        visible_to=LogVisibility.all,
    )
    db.create_item("logs", log.model_dump())

    return RedirectResponse(f"/group/{group_id}/rulebook", status_code=303)
