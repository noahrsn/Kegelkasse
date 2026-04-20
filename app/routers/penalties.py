"""Penalties catalog management — HTMX-friendly CRUD."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.database.cosmos import CosmosDB, get_db
from app.database.models import PenaltyCatalog, Role, User
from app.services.auth_service import require_auth

router = APIRouter(prefix="/group/{group_id}", tags=["penalties"])
templates = Jinja2Templates(directory="app/templates")


def _user_role(group_doc: dict, user_id: str):
    for m in group_doc.get("members", []):
        if m["user_id"] == user_id:
            return Role(m["role"])
    return None


def _can_edit_catalog(group_doc: dict, user_id: str) -> bool:
    role = _user_role(group_doc, user_id)
    return role in (Role.admin, Role.kassenwart)


def _get_group_as_member(group_id: str, user: User, db: CosmosDB):
    doc = db.read_item("groups", group_id, group_id)
    if not doc:
        return None
    if user.id not in [m["user_id"] for m in doc.get("members", [])]:
        return None
    return doc


def _catalog_row_html(item: dict) -> str:
    active = item.get("active", True)
    row_style = "" if active else "opacity: 0.45;"
    return f"""<div class="card" id="catalog-row-{item['id']}"
     style="padding: 0.75rem 1rem; display: grid; grid-template-columns: 2.5rem 1fr auto auto auto; gap: 0.75rem; align-items: center; {row_style}">
    <form method="post" action="/group/{item['group_id']}/penalties/catalog/{item['id']}/edit"
          hx-post="/group/{item['group_id']}/penalties/catalog/{item['id']}/edit"
          hx-target="#catalog-row-{item['id']}" hx-swap="outerHTML"
          style="display: contents;">
        <input class="input" type="text" name="icon" value="{item['icon']}" style="padding: 0.375rem; text-align: center;">
        <input class="input" type="text" name="name" value="{item['name']}" required>
        <div style="display: flex; align-items: center; gap: 0.25rem;">
            <input class="input" type="text" name="amount" value="{item['amount']:.2f}" style="width: 5rem; text-align: right;" required>
            <span class="text-secondary" style="font-size: 0.75rem;">€</span>
        </div>
        <button type="submit" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.375rem 0.75rem; min-height: auto;">OK</button>
    </form>
    <form method="post"
          action="/group/{item['group_id']}/penalties/catalog/{item['id']}/{'activate' if not active else 'deactivate'}"
          hx-post="/group/{item['group_id']}/penalties/catalog/{item['id']}/{'activate' if not active else 'deactivate'}"
          hx-target="#catalog-row-{item['id']}" hx-swap="outerHTML">
        <button type="submit" title="{'Reaktivieren' if not active else 'Deaktivieren'}"
                style="background: none; border: none; cursor: pointer; font-size: 1rem; color: {'var(--color-success)' if not active else 'var(--color-danger)'};">
            {'▶' if not active else '⏸'}
        </button>
    </form>
</div>"""


# ── List / page (redirect to settings#catalog) ────────────────────────────────

@router.get("/penalties/catalog")
async def catalog_redirect(group_id: str):
    return RedirectResponse(f"/group/{group_id}/settings?section=catalog", status_code=302)


# ── Add new item (HTMX) ───────────────────────────────────────────────────────

@router.post("/penalties/catalog/add")
async def add_catalog_item(
    request: Request,
    group_id: str,
    name: str = Form(...),
    amount: str = Form("0.10"),
    icon: str = Form("🎳"),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_edit_catalog(group_doc, current_user.id):
        return HTMLResponse("", status_code=403)

    try:
        amt = float(amount.replace(",", "."))
    except ValueError:
        amt = 0.10

    item = PenaltyCatalog(group_id=group_id, name=name.strip(), amount=amt, icon=icon.strip() or "🎳")
    db.upsert_item("penalties_catalog", item.model_dump(mode="json"))

    return HTMLResponse(_catalog_row_html(item.model_dump(mode="json")))


# ── Edit item (HTMX) ──────────────────────────────────────────────────────────

@router.post("/penalties/catalog/{item_id}/edit")
async def edit_catalog_item(
    request: Request,
    group_id: str,
    item_id: str,
    name: str = Form(...),
    amount: str = Form("0.10"),
    icon: str = Form("🎳"),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_edit_catalog(group_doc, current_user.id):
        return HTMLResponse("", status_code=403)

    doc = db.read_item("penalties_catalog", item_id, group_id)
    if not doc or doc.get("group_id") != group_id:
        return HTMLResponse("", status_code=404)

    try:
        doc["amount"] = float(amount.replace(",", "."))
    except ValueError:
        doc["amount"] = 0.10
    doc["name"] = name.strip()
    doc["icon"] = icon.strip() or "🎳"
    db.upsert_item("penalties_catalog", doc)

    return HTMLResponse(_catalog_row_html(doc))


# ── Deactivate item (HTMX) ────────────────────────────────────────────────────

@router.post("/penalties/catalog/{item_id}/deactivate")
async def deactivate_catalog_item(
    group_id: str,
    item_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_edit_catalog(group_doc, current_user.id):
        return HTMLResponse("", status_code=403)

    doc = db.read_item("penalties_catalog", item_id, group_id)
    if not doc or doc.get("group_id") != group_id:
        return HTMLResponse("", status_code=404)

    doc["active"] = False
    db.upsert_item("penalties_catalog", doc)
    return HTMLResponse(_catalog_row_html(doc))


# ── Activate item (HTMX) ──────────────────────────────────────────────────────

@router.post("/penalties/catalog/{item_id}/activate")
async def activate_catalog_item(
    group_id: str,
    item_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_edit_catalog(group_doc, current_user.id):
        return HTMLResponse("", status_code=403)

    doc = db.read_item("penalties_catalog", item_id, group_id)
    if not doc or doc.get("group_id") != group_id:
        return HTMLResponse("", status_code=404)

    doc["active"] = True
    db.upsert_item("penalties_catalog", doc)
    return HTMLResponse(_catalog_row_html(doc))
