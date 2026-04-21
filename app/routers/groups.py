"""Group management: create, setup wizard, settings, invite, join."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.database.cosmos import CosmosDB, get_db
from app.database.models import (
    Group,
    GroupMember,
    PenaltyCatalog,
    Role,
    Transaction,
    User,
)
from app.services.auth_service import require_auth
from app.services.treasury_service import calculate_balance

from app.templates_config import templates

router = APIRouter(tags=["groups"])


def _render(request: Request, template: str, **ctx):
    return templates.TemplateResponse(template, {"request": request, **ctx})


def _get_group_as_member(group_id: str, user: User, db: CosmosDB) -> Optional[dict]:
    """Return group doc if user is a member, else None."""
    doc = db.read_item("groups", group_id, group_id)
    if not doc:
        return None
    member_ids = [m["user_id"] for m in doc.get("members", [])]
    if user.id not in member_ids:
        return None
    return doc


def _user_role(group_doc: dict, user_id: str) -> Optional[Role]:
    for m in group_doc.get("members", []):
        if m["user_id"] == user_id:
            return Role(m["role"])
    return None


def _is_admin_or(group_doc: dict, user_id: str, *extra_roles: Role) -> bool:
    role = _user_role(group_doc, user_id)
    return role in (Role.admin, *extra_roles)


def _default_penalty_catalog(group_id: str) -> list[dict]:
    items = [
        ("Pudel", 0.10, "🎳"),
        ("Rinnenwurf", 0.10, "🚫"),
        ("Verspätung", 0.50, "⏰"),
        ("Frühzeitiges Verlassen", 0.50, "🏃"),
        ("Fehlen", 1.00, "❌"),
    ]
    return [
        PenaltyCatalog(group_id=group_id, name=name, amount=amount, icon=icon).model_dump(mode="json")
        for name, amount, icon in items
    ]


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard(
    request: Request,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    if not current_user.group_ids:
        return _render(request, "dashboard.html", user=current_user, groups=[])

    groups = []
    for gid in current_user.group_ids:
        doc = db.read_item("groups", gid, gid)
        if doc:
            role = _user_role(doc, current_user.id)
            groups.append({"id": doc["id"], "name": doc["name"], "role": role})

    if len(groups) == 1:
        return RedirectResponse(f"/group/{groups[0]['id']}/dashboard", status_code=302)

    return _render(request, "dashboard.html", user=current_user, groups=groups)


# ── Group dashboard ───────────────────────────────────────────────────────────

@router.get("/group/{group_id}/dashboard")
async def group_dashboard(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)
    member_count = len(group_doc.get("members", []))
    can_manage = role in (Role.admin, Role.kassenwart)

    # My open debt total
    debt_docs = db.query_items(
        "debts",
        "SELECT * FROM c WHERE c.user_id = @uid AND c.group_id = @gid",
        parameters=[{"name": "@uid", "value": current_user.id}, {"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    my_open_debt = 0.0
    if debt_docs:
        my_open_debt = round(sum(
            e.get("amount", 0)
            for e in debt_docs[0].get("entries", [])
            if not e.get("paid") and not e.get("cancelled")
        ), 2)

    # Next upcoming event
    now = datetime.now(UTC)
    upcoming_events = db.query_items(
        "events",
        "SELECT * FROM c WHERE c.group_id = @gid",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    next_event = None
    for ev in upcoming_events:
        try:
            start = datetime.fromisoformat(ev["start_date"].replace("Z", "+00:00"))
            if start >= now and (next_event is None or start < datetime.fromisoformat(next_event["start_date"].replace("Z", "+00:00"))):
                next_event = ev
        except (KeyError, ValueError):
            pass

    # Live Kassenbuch balance
    transactions = db.query_items(
        "transactions",
        "SELECT * FROM c WHERE c.group_id = @gid",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    opening_balance = group_doc.get("treasury", {}).get("opening_balance", 0.0)
    try:
        tx_objects = [Transaction(**t) for t in transactions]
    except Exception:
        tx_objects = []
    balance = calculate_balance(opening_balance, tx_objects)

    # Pending sessions (for kassenwart/admin)
    pending_sessions = []
    if can_manage:
        pending_sessions = db.query_items(
            "sessions",
            "SELECT * FROM c WHERE c.group_id = @gid AND c.status = 'submitted'",
            parameters=[{"name": "@gid", "value": group_id}],
            partition_key=group_id,
        )

    # Recent log entries (visible to current role)
    log_query = (
        "SELECT TOP 10 * FROM c WHERE c.group_id = @gid ORDER BY c.timestamp DESC"
        if can_manage
        else "SELECT TOP 10 * FROM c WHERE c.group_id = @gid AND c.visible_to = 'all' ORDER BY c.timestamp DESC"
    )
    recent_logs = db.query_items(
        "logs",
        log_query,
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )

    return _render(
        request,
        "group_dashboard.html",
        user=current_user,
        group=group_doc,
        group_id=group_id,
        group_name=group_doc["name"],
        role=role,
        member_count=member_count,
        active="dashboard",
        my_open_debt=my_open_debt,
        next_event=next_event,
        balance=balance,
        can_manage=can_manage,
        pending_sessions=pending_sessions,
        recent_logs=recent_logs,
        current_user=current_user,
    )


# ── Activity log ──────────────────────────────────────────────────────────────

@router.get("/group/{group_id}/log", response_class=HTMLResponse)
async def activity_log(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)
    can_manage = role in (Role.admin, Role.kassenwart)

    log_query = (
        "SELECT * FROM c WHERE c.group_id = @gid ORDER BY c.timestamp DESC"
        if can_manage
        else "SELECT * FROM c WHERE c.group_id = @gid AND c.visible_to = 'all' ORDER BY c.timestamp DESC"
    )
    logs = db.query_items(
        "logs",
        log_query,
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )

    return _render(
        request, "log.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="log",
        role=role.value if role else "mitglied",
        can_manage=can_manage,
        logs=logs,
        current_user=current_user,
    )


# ── Create group ──────────────────────────────────────────────────────────────

@router.get("/groups/new")
async def create_group_page(request: Request, current_user: User = Depends(require_auth)):
    return _render(request, "group_new.html", user=current_user)


@router.post("/groups/new")
async def create_group(
    request: Request,
    name: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    name = name.strip()
    if not name:
        return _render(request, "group_new.html", user=current_user, error="Bitte gib einen Clubnamen ein.")

    group = Group(name=name, setup_step=1)
    group.members.append(GroupMember(user_id=current_user.id, role=Role.admin))
    db.create_item("groups", group.model_dump(mode="json"))

    user_doc = db.read_item("users", current_user.id, current_user.id)
    if user_doc:
        user_doc.setdefault("group_ids", []).append(group.id)
        db.upsert_item("users", user_doc)

    return RedirectResponse(f"/groups/setup/2?group_id={group.id}", status_code=303)


# ── Setup Wizard ──────────────────────────────────────────────────────────────

WIZARD_STEPS = {
    1: "Clubname",
    2: "Finanzen",
    3: "Strafenkatalog",
    4: "Regeltermine",
    5: "Vereinsregelwerk",
    6: "Mitglieder einladen",
}


@router.get("/groups/setup/{step}")
async def setup_wizard(
    request: Request,
    step: int,
    group_id: str = "",
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    if step < 1 or step > 6:
        return RedirectResponse("/dashboard", status_code=302)

    group_doc = None
    if group_id:
        group_doc = _get_group_as_member(group_id, current_user, db)

    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    if not _is_admin_or(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/dashboard", status_code=302)

    catalog_items = []
    if step == 3:
        catalog_items = db.query_items(
            "penalties_catalog",
            "SELECT * FROM c WHERE c.group_id = @g",
            [{"name": "@g", "value": group_id}],
            partition_key=group_id,
        )
        if not catalog_items:
            for item in _default_penalty_catalog(group_id):
                db.upsert_item("penalties_catalog", item)
            catalog_items = db.query_items(
                "penalties_catalog",
                "SELECT * FROM c WHERE c.group_id = @g",
                [{"name": "@g", "value": group_id}],
                partition_key=group_id,
            )

    return _render(
        request,
        "setup_wizard.html",
        user=current_user,
        group=group_doc,
        group_id=group_id,
        step=step,
        steps=WIZARD_STEPS,
        catalog_items=catalog_items,
    )


@router.post("/groups/setup/{step}")
async def save_setup_step(
    request: Request,
    step: int,
    group_id: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _is_admin_or(group_doc, current_user.id):
        return RedirectResponse("/dashboard", status_code=302)

    form = await request.form()

    if step == 1:
        new_name = str(form.get("name", "")).strip()
        if new_name:
            group_doc["name"] = new_name
        group_doc["setup_step"] = max(group_doc.get("setup_step", 1), 2)
        db.upsert_item("groups", group_doc)

    elif step == 2:
        try:
            group_doc["monthly_fee"] = float(str(form.get("monthly_fee", "0")).replace(",", "."))
        except ValueError:
            group_doc["monthly_fee"] = 0.0
        try:
            group_doc["fee_day"] = int(form.get("fee_day", 1))
        except ValueError:
            group_doc["fee_day"] = 1
        group_doc.setdefault("payment_info", {})["iban"] = str(form.get("iban", "")).strip()
        group_doc["payment_info"]["paypal"] = str(form.get("paypal", "")).strip()
        group_doc.setdefault("treasury", {})
        try:
            group_doc["treasury"]["opening_balance"] = float(str(form.get("opening_balance", "0")).replace(",", "."))
        except ValueError:
            group_doc["treasury"]["opening_balance"] = 0.0
        try:
            group_doc["treasury"]["late_payment_fee"] = float(str(form.get("late_payment_fee", "2")).replace(",", "."))
        except ValueError:
            group_doc["treasury"]["late_payment_fee"] = 2.0
        deadline_type = str(form.get("deadline_type", "days_before_next_event"))
        try:
            deadline_days = int(form.get("deadline_days", 2))
        except ValueError:
            deadline_days = 2
        group_doc["treasury"]["payment_deadline"] = {"type": deadline_type, "days": deadline_days}
        group_doc["setup_step"] = max(group_doc.get("setup_step", 1), 3)
        db.upsert_item("groups", group_doc)

    elif step == 3:
        names = form.getlist("name[]")
        amounts = form.getlist("amount[]")
        icons = form.getlist("icon[]")
        active_flags = form.getlist("active[]")
        for i, name in enumerate(names):
            name = name.strip()
            if not name:
                continue
            try:
                amount = float(str(amounts[i] if i < len(amounts) else "0.10").replace(",", "."))
            except (ValueError, IndexError):
                amount = 0.10
            icon = icons[i] if i < len(icons) else "🎳"
            active = (active_flags[i] if i < len(active_flags) else "on") == "on"
            item = PenaltyCatalog(group_id=group_id, name=name, amount=amount, icon=icon, active=active)
            db.upsert_item("penalties_catalog", item.model_dump(mode="json"))
        group_doc["setup_step"] = max(group_doc.get("setup_step", 1), 4)
        db.upsert_item("groups", group_doc)

    elif step == 4:
        # Recurring event patterns stored as group setting - basic text description for now
        # Full calendar event creation is Phase 5; here we just save a note
        group_doc["setup_step"] = max(group_doc.get("setup_step", 1), 5)
        db.upsert_item("groups", group_doc)

    elif step == 5:
        content = str(form.get("rulebook_content", "")).strip()
        group_doc.setdefault("rulebook", {})["content"] = content
        group_doc["rulebook"]["last_edited_by"] = current_user.id
        from datetime import UTC, datetime
        group_doc["rulebook"]["last_edited_at"] = datetime.now(tz=UTC).isoformat()
        group_doc["setup_step"] = max(group_doc.get("setup_step", 1), 6)
        db.upsert_item("groups", group_doc)

    elif step == 6:
        group_doc["setup_step"] = 0
        db.upsert_item("groups", group_doc)
        return RedirectResponse(f"/group/{group_id}/dashboard", status_code=303)

    if step < 6:
        return RedirectResponse(f"/groups/setup/{step + 1}?group_id={group_id}", status_code=303)
    return RedirectResponse(f"/group/{group_id}/dashboard", status_code=303)


# ── Skip wizard ───────────────────────────────────────────────────────────────

@router.post("/groups/setup/skip")
async def skip_wizard(
    group_id: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if group_doc and _is_admin_or(group_doc, current_user.id):
        group_doc["setup_step"] = 0
        db.upsert_item("groups", group_doc)
    return RedirectResponse(f"/group/{group_id}/dashboard", status_code=303)


# ── Join group ────────────────────────────────────────────────────────────────

@router.get("/join/{token}")
async def join_group(
    request: Request,
    token: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    groups = db.query_items(
        "groups",
        "SELECT * FROM c WHERE c.invite_token = @t",
        [{"name": "@t", "value": token}],
    )
    if not groups:
        return _render(request, "join.html", user=current_user, error="Ungültiger Einladungslink.", group=None)

    group_doc = groups[0]
    member_ids = [m["user_id"] for m in group_doc.get("members", [])]

    if current_user.id in member_ids:
        return RedirectResponse(f"/group/{group_doc['id']}/dashboard", status_code=302)

    return _render(request, "join.html", user=current_user, group=group_doc, token=token, error=None)


@router.post("/join/{token}")
async def join_group_confirm(
    token: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    groups = db.query_items(
        "groups",
        "SELECT * FROM c WHERE c.invite_token = @t",
        [{"name": "@t", "value": token}],
    )
    if not groups:
        return RedirectResponse("/dashboard", status_code=302)

    group_doc = groups[0]
    member_ids = [m["user_id"] for m in group_doc.get("members", [])]

    if current_user.id not in member_ids:
        new_member = GroupMember(user_id=current_user.id, role=Role.mitglied)
        group_doc.setdefault("members", []).append(new_member.model_dump(mode="json"))
        db.upsert_item("groups", group_doc)

        user_doc = db.read_item("users", current_user.id, current_user.id)
        if user_doc and group_doc["id"] not in user_doc.get("group_ids", []):
            user_doc.setdefault("group_ids", []).append(group_doc["id"])
            db.upsert_item("users", user_doc)

    return RedirectResponse(f"/group/{group_doc['id']}/dashboard", status_code=303)


# ── Settings Hub ──────────────────────────────────────────────────────────────

@router.get("/group/{group_id}/settings")
async def settings_hub(
    request: Request,
    group_id: str,
    section: Optional[str] = None,
    success: Optional[str] = None,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)

    catalog_items = db.query_items(
        "penalties_catalog",
        "SELECT * FROM c WHERE c.group_id = @g",
        [{"name": "@g", "value": group_id}],
        partition_key=group_id,
    )

    members_with_users = []
    for m in group_doc.get("members", []):
        user_doc = db.read_item("users", m["user_id"], m["user_id"])
        members_with_users.append({
            "user_id": m["user_id"],
            "role": m["role"],
            "iban": m.get("iban", ""),
            "name": f"{user_doc['first_name']} {user_doc['last_name']}" if user_doc else m["user_id"],
            "email": user_doc["email"] if user_doc else "",
        })

    return _render(
        request,
        "settings.html",
        user=current_user,
        group=group_doc,
        group_id=group_id,
        group_name=group_doc["name"],
        role=role,
        catalog_items=catalog_items,
        members=members_with_users,
        active_section=section or "general",
        success=success,
        active="settings",
    )


@router.post("/group/{group_id}/settings/{section}")
async def update_settings(
    request: Request,
    group_id: str,
    section: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)
    form = await request.form()

    if section == "general" and role in (Role.admin, Role.praesident):
        name = str(form.get("name", "")).strip()
        if name:
            group_doc["name"] = name
        db.upsert_item("groups", group_doc)

    elif section == "finances" and role in (Role.admin, Role.kassenwart):
        try:
            group_doc["monthly_fee"] = float(str(form.get("monthly_fee", "0")).replace(",", "."))
        except ValueError:
            pass
        try:
            group_doc["fee_day"] = int(form.get("fee_day", 1))
        except ValueError:
            pass
        group_doc.setdefault("payment_info", {})["iban"] = str(form.get("iban", "")).strip()
        group_doc["payment_info"]["paypal"] = str(form.get("paypal", "")).strip()
        group_doc.setdefault("treasury", {})
        try:
            group_doc["treasury"]["opening_balance"] = float(str(form.get("opening_balance", "0")).replace(",", "."))
        except ValueError:
            pass
        try:
            group_doc["treasury"]["late_payment_fee"] = float(str(form.get("late_payment_fee", "2")).replace(",", "."))
        except ValueError:
            pass
        deadline_type = str(form.get("deadline_type", "days_before_next_event"))
        try:
            deadline_days = int(form.get("deadline_days", 2))
        except ValueError:
            deadline_days = 2
        group_doc["treasury"]["payment_deadline"] = {"type": deadline_type, "days": deadline_days}
        db.upsert_item("groups", group_doc)

    elif section == "catalog" and role in (Role.admin, Role.kassenwart):
        names = form.getlist("name[]")
        amounts = form.getlist("amount[]")
        icons = form.getlist("icon[]")
        catalog_ids = form.getlist("catalog_id[]")
        for i, name in enumerate(names):
            name = name.strip()
            if not name:
                continue
            try:
                amount = float(str(amounts[i] if i < len(amounts) else "0.10").replace(",", "."))
            except (ValueError, IndexError):
                amount = 0.10
            icon = icons[i] if i < len(icons) else "🎳"
            item_id = catalog_ids[i] if i < len(catalog_ids) else str(uuid.uuid4())
            item = PenaltyCatalog(id=item_id, group_id=group_id, name=name, amount=amount, icon=icon)
            db.upsert_item("penalties_catalog", item.model_dump(mode="json"))

    elif section == "rulebook" and role in (Role.admin, Role.praesident):
        from datetime import UTC, datetime
        content = str(form.get("content", "")).strip()
        group_doc.setdefault("rulebook", {})["content"] = content
        group_doc["rulebook"]["last_edited_by"] = current_user.id
        group_doc["rulebook"]["last_edited_at"] = datetime.now(tz=UTC).isoformat()
        db.upsert_item("groups", group_doc)

    elif section == "members" and role == Role.admin:
        target_user_id = str(form.get("user_id", ""))
        action = str(form.get("action", ""))
        new_role_str = str(form.get("role", ""))

        members = group_doc.get("members", [])
        if action == "change_role" and new_role_str:
            for m in members:
                if m["user_id"] == target_user_id and m["user_id"] != current_user.id:
                    m["role"] = new_role_str
        elif action == "remove" and target_user_id != current_user.id:
            group_doc["members"] = [m for m in members if m["user_id"] != target_user_id]
            user_doc = db.read_item("users", target_user_id, target_user_id)
            if user_doc:
                user_doc["group_ids"] = [g for g in user_doc.get("group_ids", []) if g != group_id]
                db.upsert_item("users", user_doc)
        db.upsert_item("groups", group_doc)

    elif section == "invite" and role in (Role.admin, Role.praesident):
        action = str(form.get("action", ""))
        if action == "reset_token":
            group_doc["invite_token"] = uuid.uuid4().hex[:12]
            db.upsert_item("groups", group_doc)

    return RedirectResponse(f"/group/{group_id}/settings?section={section}&success=saved", status_code=303)
