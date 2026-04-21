"""Debt management routes: member view, admin overview, mark paid, manual penalties."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.database.cosmos import CosmosDB, get_db
from app.database.models import Debt, DebtEntry, DebtType, Log, LogVisibility, Role, User
from app.services.auth_service import require_auth

from app.templates_config import templates

router = APIRouter(prefix="/group/{group_id}/debts", tags=["debts"])


def _render(request: Request, template: str, **ctx):
    return templates.TemplateResponse(template, {"request": request, **ctx})


def _get_group_as_member(group_id: str, user: User, db: CosmosDB) -> Optional[dict]:
    doc = db.read_item("groups", group_id, group_id)
    if not doc:
        return None
    if user.id not in [m["user_id"] for m in doc.get("members", [])]:
        return None
    return doc


def _user_role(group_doc: dict, user_id: str) -> Optional[Role]:
    for m in group_doc.get("members", []):
        if m["user_id"] == user_id:
            return Role(m["role"])
    return None


def _can_manage(group_doc: dict, user_id: str) -> bool:
    role = _user_role(group_doc, user_id)
    return role in (Role.admin, Role.kassenwart)


def _get_or_create_debt_doc(user_id: str, group_id: str, db: CosmosDB) -> dict:
    docs = db.query_items(
        "debts",
        "SELECT * FROM c WHERE c.user_id = @uid AND c.group_id = @gid",
        parameters=[{"name": "@uid", "value": user_id}, {"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    if docs:
        return docs[0]
    debt = Debt(user_id=user_id, group_id=group_id)
    db.upsert_item("debts", debt.model_dump(mode="json"))
    return debt.model_dump(mode="json")


def _write_log(db, group_id, actor, action, target_id=None, target_name=None, details="", visible_to=LogVisibility.all):
    log = Log(
        group_id=group_id,
        actor_id=actor.id,
        actor_name=actor.full_name,
        action=action,
        target_id=target_id,
        target_name=target_name,
        details=details,
        visible_to=visible_to,
    )
    db.upsert_item("logs", log.model_dump(mode="json"))


def _open_total(debt_doc: dict) -> float:
    return round(sum(
        e.get("amount", 0)
        for e in debt_doc.get("entries", [])
        if not e.get("paid") and not e.get("cancelled")
    ), 2)


def _breakdown(debt_doc: dict) -> dict[str, float]:
    result: dict[str, float] = {}
    for e in debt_doc.get("entries", []):
        if not e.get("paid") and not e.get("cancelled"):
            t = e.get("type", "penalty")
            result[t] = round(result.get(t, 0.0) + e.get("amount", 0), 2)
    return result


# ── Member: own debts ─────────────────────────────────────────────────────────

@router.get("", response_class=HTMLResponse)
async def my_debts(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)
    debt_doc = _get_or_create_debt_doc(current_user.id, group_id, db)
    entries = sorted(debt_doc.get("entries", []), key=lambda e: e.get("created_at", ""), reverse=True)
    open_total = _open_total(debt_doc)
    breakdown = _breakdown(debt_doc)

    return _render(
        request, "debts.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="debts",
        role=role.value if role else "mitglied",
        can_manage=_can_manage(group_doc, current_user.id),
        debt_doc=debt_doc,
        entries=entries,
        open_total=open_total,
        breakdown=breakdown,
        payment_info=group_doc.get("payment_info", {}),
        current_user=current_user,
        success=request.query_params.get("success"),
    )


# ── Admin: all-members overview ───────────────────────────────────────────────

@router.get("/all", response_class=HTMLResponse)
async def all_debts(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/debts", status_code=302)

    members = group_doc.get("members", [])
    user_names: dict[str, str] = {}
    for m in members:
        doc = db.read_item("users", m["user_id"], m["user_id"])
        if doc:
            user_names[m["user_id"]] = f"{doc.get('first_name','')} {doc.get('last_name','')}".strip()

    all_debt_docs = db.query_items(
        "debts",
        "SELECT * FROM c WHERE c.group_id = @gid",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    debt_by_user = {d["user_id"]: d for d in all_debt_docs}

    member_rows = []
    for m in members:
        uid = m["user_id"]
        debt_doc = debt_by_user.get(uid, {"entries": []})
        open_amount = _open_total(debt_doc)
        total_paid = round(sum(
            e.get("amount", 0) for e in debt_doc.get("entries", [])
            if e.get("paid") and not e.get("cancelled")
        ), 2)
        member_rows.append({
            "user_id": uid,
            "name": user_names.get(uid, uid),
            "role": m["role"],
            "open_amount": open_amount,
            "total_paid": total_paid,
            "status": "danger" if open_amount > 10 else ("warning" if open_amount > 0 else "success"),
        })

    member_rows.sort(key=lambda r: r["open_amount"], reverse=True)

    return _render(
        request, "debts_all.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="debts",
        role=_user_role(group_doc, current_user.id).value,
        member_rows=member_rows,
        current_user=current_user,
    )


# ── Admin: member detail + actions ───────────────────────────────────────────

@router.get("/{target_user_id}", response_class=HTMLResponse)
async def member_debt_detail(
    request: Request,
    group_id: str,
    target_user_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/debts", status_code=302)

    target_doc = db.read_item("users", target_user_id, target_user_id)
    if not target_doc:
        return RedirectResponse(f"/group/{group_id}/debts/all", status_code=302)

    target_name = f"{target_doc.get('first_name','')} {target_doc.get('last_name','')}".strip()
    debt_doc = _get_or_create_debt_doc(target_user_id, group_id, db)
    entries = sorted(debt_doc.get("entries", []), key=lambda e: e.get("created_at", ""), reverse=True)
    catalog = db.query_items(
        "penalties_catalog",
        "SELECT * FROM c WHERE c.group_id = @gid AND c.active = true",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )

    return _render(
        request, "debts_detail.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="debts",
        role=_user_role(group_doc, current_user.id).value,
        target_user_id=target_user_id,
        target_name=target_name,
        debt_doc=debt_doc,
        entries=entries,
        open_total=_open_total(debt_doc),
        breakdown=_breakdown(debt_doc),
        payment_info=group_doc.get("payment_info", {}),
        catalog=catalog,
        current_user=current_user,
        success=request.query_params.get("success"),
    )


@router.post("/{target_user_id}/mark-paid")
async def mark_paid(
    group_id: str,
    target_user_id: str,
    amount: float = Form(...),
    note: str = Form(""),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/debts", status_code=302)

    target_doc = db.read_item("users", target_user_id, target_user_id)
    target_name = ""
    if target_doc:
        target_name = f"{target_doc.get('first_name','')} {target_doc.get('last_name','')}".strip()

    debt_doc = _get_or_create_debt_doc(target_user_id, group_id, db)
    remaining = amount
    today = datetime.now(UTC).date().isoformat()
    marked = 0

    for entry in sorted(debt_doc.get("entries", []), key=lambda e: e.get("created_at", "")):
        if entry.get("paid") or entry.get("cancelled") or remaining <= 0:
            continue
        entry_amount = entry.get("amount", 0)
        if remaining >= entry_amount - 0.001:
            entry["paid"] = True
            entry["paid_at"] = today
            remaining = round(remaining - entry_amount, 2)
            marked += 1
        else:
            remaining = 0

    db.upsert_item("debts", debt_doc)

    if marked > 0:
        detail = f"{amount:.2f} € als bezahlt markiert ({marked} Einträge)"
        if note:
            detail += f". {note}"
        _write_log(db, group_id, current_user, "mark_paid",
                   target_id=target_user_id, target_name=target_name, details=detail)

    return RedirectResponse(f"/group/{group_id}/debts/{target_user_id}?success=paid", status_code=302)


@router.post("/{target_user_id}/manual-penalty")
async def manual_penalty(
    group_id: str,
    target_user_id: str,
    description: str = Form(...),
    amount: float = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/debts", status_code=302)

    target_doc = db.read_item("users", target_user_id, target_user_id)
    target_name = ""
    if target_doc:
        target_name = f"{target_doc.get('first_name','')} {target_doc.get('last_name','')}".strip()

    debt_doc = _get_or_create_debt_doc(target_user_id, group_id, db)
    entry = DebtEntry(
        type=DebtType.correction,
        amount=abs(amount),
        description=description,
        created_by=current_user.id,
    )
    debt_doc.setdefault("entries", []).append(entry.model_dump(mode="json"))
    db.upsert_item("debts", debt_doc)

    _write_log(db, group_id, current_user, "add_penalty",
               target_id=target_user_id, target_name=target_name,
               details=f"Manuelle Strafe: {description} ({amount:.2f} €)")

    return RedirectResponse(f"/group/{group_id}/debts/{target_user_id}?success=added", status_code=302)
