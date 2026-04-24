"""Bowling session routes: create, record penalties, submit, approve, guests."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.database.cosmos import CosmosDB, get_db
from app.database.models import (
    Award,
    AwardPeriod,
    Debt,
    DebtEntry,
    DebtType,
    GuestEntry,
    Log,
    LogVisibility,
    PaymentDeadline,
    PaymentDeadlineType,
    PenaltyEntry,
    Role,
    Session,
    SessionEntry,
    SessionStatus,
    User,
)
from app.services.auth_service import require_auth
from app.services.calendar_service import calculate_due_date, next_occurrence
import app.services.email_service as _es
from app.services.awards_service import calculate_session_awards

from app.templates_config import templates

router = APIRouter(prefix="/group/{group_id}/sessions", tags=["sessions"])


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _can_approve(group_doc: dict, user_id: str) -> bool:
    role = _user_role(group_doc, user_id)
    return role in (Role.admin, Role.kassenwart)


def _get_user_names(user_ids: list[str], db: CosmosDB) -> dict[str, str]:
    names: dict[str, str] = {}
    for uid in user_ids:
        doc = db.read_item("users", uid, uid)
        if doc:
            full = f"{doc.get('first_name', '')} {doc.get('last_name', '')}".strip()
            names[uid] = full or uid
        else:
            names[uid] = uid
    return names


def _entry_penalty_total(entry: dict) -> float:
    return sum(p.get("amount", 0) * p.get("count", 1) for p in entry.get("penalties", []))


def _get_active_catalog(group_id: str, db: CosmosDB) -> list[dict]:
    return db.query_items(
        "penalties_catalog",
        "SELECT * FROM c WHERE c.group_id = @gid AND c.active = true",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )


def _format_date(iso_str: str) -> tuple[str, str]:
    """Return (display DD.MM.YYYY, iso YYYY-MM-DD) from an ISO datetime string."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y"), dt.date().isoformat()
    except (ValueError, AttributeError):
        return iso_str[:10], iso_str[:10]


def _calculate_due_date(group_doc: dict, booking_date: date, db: CosmosDB) -> date:
    treasury = group_doc.get("treasury", {})
    dl = treasury.get("payment_deadline", {})
    try:
        dl_type = PaymentDeadlineType(dl.get("type", "days_before_next_event"))
    except ValueError:
        dl_type = PaymentDeadlineType.days_before_next_event

    deadline_cfg = PaymentDeadline(type=dl_type, days=dl.get("days", 2), day=dl.get("day"))
    next_event_date: Optional[date] = None

    if deadline_cfg.type == PaymentDeadlineType.days_before_next_event:
        events = db.query_items(
            "events",
            "SELECT * FROM c WHERE c.group_id = @gid",
            parameters=[{"name": "@gid", "value": group_doc["id"]}],
            partition_key=group_doc["id"],
        )
        for ev in events:
            occ = next_occurrence(ev, booking_date)
            if occ and (next_event_date is None or occ < next_event_date):
                next_event_date = occ

    return calculate_due_date(deadline_cfg, booking_date, next_event_date)


def _write_log(
    db: CosmosDB,
    group_id: str,
    actor: User,
    action: str,
    target_id: Optional[str] = None,
    target_name: Optional[str] = None,
    details: str = "",
    visible_to: LogVisibility = LogVisibility.all,
) -> None:
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


def _get_or_create_debt_doc(user_id: str, group_id: str, db: CosmosDB) -> dict:
    docs = db.query_items(
        "debts",
        "SELECT * FROM c WHERE c.user_id = @uid AND c.group_id = @gid",
        parameters=[
            {"name": "@uid", "value": user_id},
            {"name": "@gid", "value": group_id},
        ],
        partition_key=group_id,
    )
    if docs:
        return docs[0]
    return Debt(user_id=user_id, group_id=group_id).model_dump(mode="json")


def _enrich_entry(entry: dict, catalog_by_id: dict, user_names: dict) -> dict:
    entry["_total"] = round(_entry_penalty_total(entry), 2)
    entry["_name"] = user_names.get(entry["user_id"], entry["user_id"])
    for p in entry.get("penalties", []):
        cat = catalog_by_id.get(p.get("catalog_id"), {})
        p["_name"] = cat.get("name", "?")
        p["_icon"] = cat.get("icon", "🎳")
    return entry


def _enrich_guest(guest: dict, catalog_by_id: dict) -> dict:
    guest["_total"] = round(guest.get("debt_total", 0), 2)
    for p in guest.get("penalties", []):
        cat = catalog_by_id.get(p.get("catalog_id"), {})
        p["_name"] = cat.get("name", "?")
        p["_icon"] = cat.get("icon", "🎳")
    return guest


# ── Pending sessions (must come before /{session_id}) ────────────────────────

@router.get("/pending")
async def pending_sessions(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_approve(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/dashboard", status_code=302)

    submitted = db.query_items(
        "sessions",
        "SELECT * FROM c WHERE c.group_id = @gid AND c.status = 'submitted'",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )

    recorder_ids = list({s.get("recorded_by") for s in submitted if s.get("recorded_by")})
    recorder_names = _get_user_names(recorder_ids, db)

    for sess in submitted:
        sess["_total"] = round(sum(_entry_penalty_total(e) for e in sess.get("entries", [])), 2)
        sess["_present_count"] = sum(1 for e in sess.get("entries", []) if not e.get("absent"))
        sess["_member_count"] = len(sess.get("entries", []))
        sess["_guest_count"] = len(sess.get("guest_entries", []))
        sess["_date_display"], _ = _format_date(sess.get("date", ""))

    return _render(
        request, "sessions_pending.html",
        group_id=group_id,
        group_name=group_doc["name"],
        sessions=submitted,
        recorder_names=recorder_names,
        current_user=current_user,
        active="session",
        role=_user_role(group_doc, current_user.id),
    )


# ── New session ───────────────────────────────────────────────────────────────

@router.get("/new")
async def new_session_page(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    member_ids = [m["user_id"] for m in group_doc.get("members", [])]
    user_names = _get_user_names(member_ids, db)
    today = datetime.now(tz=UTC).date().isoformat()

    members_display = [
        {"user_id": m["user_id"], "name": user_names.get(m["user_id"], m["user_id"])}
        for m in group_doc.get("members", [])
    ]

    # Upcoming unlinked events for optional session–event linking
    all_events = db.query_items(
        "events",
        "SELECT * FROM c WHERE c.group_id = @gid",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    from datetime import timedelta
    from app.services.calendar_service import next_occurrence as _next_occ
    today_d = datetime.now(tz=UTC).date()
    upcoming_events = []
    for ev in all_events:
        if ev.get("linked_session_id"):
            continue
        etype = ev.get("type", "single")
        start_str = ev.get("start_date", "")
        try:
            start_d = datetime.fromisoformat(start_str.replace("Z", "+00:00")).date()
        except Exception:
            continue
        if etype == "recurring":
            occ = _next_occ(ev, today_d - timedelta(days=1))
            if occ and occ <= today_d + timedelta(days=60):
                ev["_date_display"] = occ.strftime("%d.%m.%Y")
                upcoming_events.append(ev)
        elif today_d - timedelta(days=1) <= start_d <= today_d + timedelta(days=60):
            ev["_date_display"] = start_d.strftime("%d.%m.%Y")
            upcoming_events.append(ev)
    upcoming_events.sort(key=lambda e: e.get("_date_display", ""))

    return _render(
        request, "session_new.html",
        group_id=group_id,
        group_name=group_doc["name"],
        members=members_display,
        today=today,
        active="session",
        role=_user_role(group_doc, current_user.id),
        upcoming_events=upcoming_events,
    )


@router.post("/new")
async def create_session(
    group_id: str,
    session_date: str = Form(...),
    event_id: Optional[str] = Form(None),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    try:
        date_parsed = datetime.fromisoformat(session_date).replace(tzinfo=UTC)
    except ValueError:
        date_parsed = datetime.now(tz=UTC)

    entries = [
        SessionEntry(user_id=m["user_id"]).model_dump(mode="json")
        for m in group_doc.get("members", [])
    ]
    linked_event_id = event_id if event_id else None
    session = Session(
        group_id=group_id,
        event_id=linked_event_id,
        date=date_parsed,
        status=SessionStatus.draft,
        recorded_by=current_user.id,
        entries=entries,
    )
    db.upsert_item("sessions", session.model_dump(mode="json"))

    if linked_event_id:
        event_doc = db.read_item("events", linked_event_id, group_id)
        if event_doc and event_doc.get("group_id") == group_id:
            event_doc["linked_session_id"] = session.id
            db.upsert_item("events", event_doc)

    return RedirectResponse(f"/group/{group_id}/sessions/{session.id}", status_code=302)


# ── Session detail / recording view ──────────────────────────────────────────

@router.get("/{session_id}")
async def session_detail(
    request: Request,
    group_id: str,
    session_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("group_id") != group_id:
        return RedirectResponse(f"/group/{group_id}/dashboard", status_code=302)

    catalog = _get_active_catalog(group_id, db)
    catalog_by_id = {c["id"]: c for c in catalog}
    user_ids = [e["user_id"] for e in session_doc.get("entries", [])]
    user_names = _get_user_names(user_ids, db)

    entries = [_enrich_entry(e, catalog_by_id, user_names) for e in session_doc.get("entries", [])]
    present_count = sum(1 for e in entries if not e.get("absent"))
    date_display, date_iso = _format_date(session_doc.get("date", ""))

    return _render(
        request, "session_recording.html",
        group_id=group_id,
        group_name=group_doc["name"],
        session=session_doc,
        session_id=session_id,
        entries=entries,
        catalog=catalog,
        present_count=present_count,
        total_count=len(entries),
        date_display=date_display,
        date_iso=date_iso,
        current_user=current_user,
        active="session",
        role=_user_role(group_doc, current_user.id),
        can_approve=_can_approve(group_doc, current_user.id),
    )


# ── HTMX: add penalty ────────────────────────────────────────────────────────

@router.post("/{session_id}/penalty")
async def add_penalty(
    request: Request,
    group_id: str,
    session_id: str,
    user_id: str = Form(...),
    catalog_id: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") != SessionStatus.draft:
        return HTMLResponse("", status_code=400)

    cat = db.read_item("penalties_catalog", catalog_id, group_id)
    if not cat or cat.get("group_id") != group_id:
        return HTMLResponse("", status_code=404)

    entry = next((e for e in session_doc.get("entries", []) if e["user_id"] == user_id), None)
    if not entry:
        return HTMLResponse("", status_code=404)

    existing = next((p for p in entry.get("penalties", []) if p["catalog_id"] == catalog_id), None)
    if existing:
        existing["count"] += 1
    else:
        entry.setdefault("penalties", []).append(
            PenaltyEntry(catalog_id=catalog_id, count=1, amount=cat["amount"]).model_dump(mode="json")
        )

    db.upsert_item("sessions", session_doc)
    return _member_card_response(request, group_id, session_id, entry, db)


# ── HTMX: remove penalty ─────────────────────────────────────────────────────

@router.delete("/{session_id}/penalty")
async def remove_penalty(
    request: Request,
    group_id: str,
    session_id: str,
    user_id: str = Form(...),
    catalog_id: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") != SessionStatus.draft:
        return HTMLResponse("", status_code=400)

    entry = next((e for e in session_doc.get("entries", []) if e["user_id"] == user_id), None)
    if not entry:
        return HTMLResponse("", status_code=404)

    penalties = entry.get("penalties", [])
    existing = next((p for p in penalties if p["catalog_id"] == catalog_id), None)
    if existing:
        if existing["count"] > 1:
            existing["count"] -= 1
        else:
            entry["penalties"] = [p for p in penalties if p["catalog_id"] != catalog_id]

    db.upsert_item("sessions", session_doc)
    return _member_card_response(request, group_id, session_id, entry, db)


# ── HTMX: toggle absent ───────────────────────────────────────────────────────

@router.post("/{session_id}/mark-absent")
async def mark_absent(
    request: Request,
    group_id: str,
    session_id: str,
    user_id: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") != SessionStatus.draft:
        return HTMLResponse("", status_code=400)

    entry = next((e for e in session_doc.get("entries", []) if e["user_id"] == user_id), None)
    if not entry:
        return HTMLResponse("", status_code=404)

    entry["absent"] = not entry.get("absent", False)
    db.upsert_item("sessions", session_doc)
    return _member_card_response(request, group_id, session_id, entry, db)


# ── HTMX: toggle late arrival ─────────────────────────────────────────────────

@router.post("/{session_id}/mark-late")
async def mark_late(
    request: Request,
    group_id: str,
    session_id: str,
    user_id: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") != SessionStatus.draft:
        return HTMLResponse("", status_code=400)

    entry = next((e for e in session_doc.get("entries", []) if e["user_id"] == user_id), None)
    if not entry:
        return HTMLResponse("", status_code=404)

    entry["late_arrival"] = not entry.get("late_arrival", False)
    db.upsert_item("sessions", session_doc)
    return _member_card_response(request, group_id, session_id, entry, db)


# ── Submit session ────────────────────────────────────────────────────────────

@router.post("/{session_id}/submit")
async def submit_session(
    group_id: str,
    session_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") != SessionStatus.draft:
        return RedirectResponse(f"/group/{group_id}/dashboard", status_code=302)

    session_doc["status"] = SessionStatus.submitted
    session_doc["submitted_at"] = datetime.now(tz=UTC).isoformat()
    db.upsert_item("sessions", session_doc)

    date_display, _ = _format_date(session_doc.get("date", ""))
    _write_log(
        db, group_id, current_user, "submit_session",
        target_id=session_id,
        target_name=f"Kegelabend {date_display}",
        details=f"Kegelabend vom {date_display} zur Freigabe eingereicht",
    )

    try:
        subj, html = _es.build_pending_session(
            group_doc.get("name", ""), current_user.full_name,
            date_display, group_id, session_id,
        )
        _es.notify_group_members(
            db, group_doc, "pending_session", subj, html,
            role_filter=["admin", "kassenwart"],
        )
    except Exception:
        pass

    return RedirectResponse(f"/group/{group_id}/dashboard", status_code=302)


# ── Approve session ───────────────────────────────────────────────────────────

@router.post("/{session_id}/approve")
async def approve_session(
    group_id: str,
    session_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_approve(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/sessions/pending", status_code=302)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") != SessionStatus.submitted:
        return RedirectResponse(f"/group/{group_id}/sessions/pending", status_code=302)

    entries = session_doc.get("entries", [])
    today = datetime.now(tz=UTC).date()
    due_date = _calculate_due_date(group_doc, today, db)
    due_dt = datetime(due_date.year, due_date.month, due_date.day, tzinfo=UTC)

    present_totals = [_entry_penalty_total(e) for e in entries if not e.get("absent")]
    avg = round(sum(present_totals) / len(present_totals), 2) if present_totals else 0.0

    for entry in entries:
        if entry.get("late_arrival") and not entry.get("absent"):
            entry["late_arrival_avg"] = avg

    session_doc["status"] = SessionStatus.approved
    session_doc["approved_by"] = current_user.id
    session_doc["approved_at"] = datetime.now(tz=UTC).isoformat()
    db.upsert_item("sessions", session_doc)

    date_display, _ = _format_date(session_doc.get("date", ""))

    for entry in entries:
        uid = entry["user_id"]
        if entry.get("absent"):
            debt_amount = avg
            desc = f"Kegelabend {date_display} — Fehlen (Durchschnitt {avg:.2f} €)"
        elif entry.get("late_arrival"):
            own = round(_entry_penalty_total(entry), 2)
            late_avg = entry.get("late_arrival_avg", 0)
            debt_amount = round(own + late_avg, 2)
            desc = f"Kegelabend {date_display} — Strafen + Verspätungsausgleich"
        else:
            debt_amount = round(_entry_penalty_total(entry), 2)
            desc = f"Kegelabend {date_display}"

        if debt_amount <= 0:
            continue

        debt_doc = _get_or_create_debt_doc(uid, group_id, db)
        debt_entry = DebtEntry(
            type=DebtType.penalty,
            amount=debt_amount,
            description=desc,
            session_id=session_id,
            due_date=due_dt,
            created_by=current_user.id,
        ).model_dump(mode="json")
        debt_doc.setdefault("entries", []).append(debt_entry)
        db.upsert_item("debts", debt_doc)

    _write_log(
        db, group_id, current_user, "approve_session",
        target_id=session_id,
        target_name=f"Kegelabend {date_display}",
        details=f"Kegelabend vom {date_display} genehmigt — Schulden für {len(entries)} Mitglieder eingebucht",
    )

    # Persist session awards to awards container
    try:
        session_obj = Session(**session_doc)
        session_award_entries = calculate_session_awards(session_obj)
        if session_award_entries:
            award_doc = Award(
                group_id=group_id,
                period=AwardPeriod.session,
                period_ref=session_id,
                awards=session_award_entries,
            )
            db.upsert_item("awards", award_doc.model_dump(mode="json"))
    except Exception:
        pass

    try:
        group_name = group_doc.get("name", "")
        # session_approved to all members
        subj_all, html_all = _es.build_session_approved("", group_name, date_display, group_id)
        for member in group_doc.get("members", []):
            uid = member["user_id"]
            user_doc = db.read_item("users", uid, uid)
            if not user_doc:
                continue
            s, h = _es.build_session_approved(
                user_doc.get("first_name", ""), group_name, date_display, group_id,
            )
            _es.notify_member(db, uid, group_id, "session_approved", s, h)

        # new_penalty to each member with debt
        for entry in entries:
            uid = entry["user_id"]
            if entry.get("absent"):
                debt_amount = avg
                desc = f"Kegelabend {date_display} — Fehlen (Durchschnitt)"
            elif entry.get("late_arrival"):
                own = round(_entry_penalty_total(entry), 2)
                debt_amount = round(own + entry.get("late_arrival_avg", 0), 2)
                desc = f"Kegelabend {date_display} — Strafen + Verspätungsausgleich"
            else:
                debt_amount = round(_entry_penalty_total(entry), 2)
                desc = f"Kegelabend {date_display}"
            if debt_amount <= 0:
                continue
            user_doc = db.read_item("users", uid, uid)
            if not user_doc:
                continue
            s, h = _es.build_new_penalty(
                user_doc.get("first_name", ""), group_name, desc, debt_amount, group_id,
            )
            _es.notify_member(db, uid, group_id, "new_penalty", s, h)
    except Exception:
        pass

    return RedirectResponse(f"/group/{group_id}/sessions/pending", status_code=302)


# ── Guest management ──────────────────────────────────────────────────────────

@router.get("/{session_id}/guests")
async def guests_page(
    request: Request,
    group_id: str,
    session_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("group_id") != group_id:
        return RedirectResponse(f"/group/{group_id}/dashboard", status_code=302)

    catalog = _get_active_catalog(group_id, db)
    catalog_by_id = {c["id"]: c for c in catalog}
    guest_entries = [_enrich_guest(g, catalog_by_id) for g in session_doc.get("guest_entries", [])]
    date_display, _ = _format_date(session_doc.get("date", ""))

    return _render(
        request, "session_guests.html",
        group_id=group_id,
        group_name=group_doc["name"],
        session=session_doc,
        session_id=session_id,
        date_display=date_display,
        guest_entries=guest_entries,
        catalog=catalog,
        current_user=current_user,
        active="session",
        role=_user_role(group_doc, current_user.id),
        can_approve=_can_approve(group_doc, current_user.id),
    )


@router.post("/{session_id}/guests")
async def add_guest(
    request: Request,
    group_id: str,
    session_id: str,
    guest_name: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") == SessionStatus.approved:
        return HTMLResponse("", status_code=400)

    guest = GuestEntry(name=guest_name.strip()).model_dump(mode="json")
    session_doc.setdefault("guest_entries", []).append(guest)
    db.upsert_item("sessions", session_doc)

    catalog = _get_active_catalog(group_id, db)
    guest["_total"] = 0.0

    return _render(
        request, "session_guest_card.html",
        group_id=group_id,
        session_id=session_id,
        guest=guest,
        catalog=catalog,
        can_approve=_can_approve(group_doc, current_user.id),
        is_draft=session_doc.get("status") != SessionStatus.approved,
    )


@router.post("/{session_id}/guests/{guest_id}/penalty")
async def add_guest_penalty(
    request: Request,
    group_id: str,
    session_id: str,
    guest_id: str,
    catalog_id: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") == SessionStatus.approved:
        return HTMLResponse("", status_code=400)

    cat = db.read_item("penalties_catalog", catalog_id, group_id)
    if not cat:
        return HTMLResponse("", status_code=404)

    guest = next((g for g in session_doc.get("guest_entries", []) if g["guest_id"] == guest_id), None)
    if not guest:
        return HTMLResponse("", status_code=404)

    existing = next((p for p in guest.get("penalties", []) if p["catalog_id"] == catalog_id), None)
    if existing:
        existing["count"] += 1
    else:
        guest.setdefault("penalties", []).append(
            PenaltyEntry(catalog_id=catalog_id, count=1, amount=cat["amount"]).model_dump(mode="json")
        )

    guest["debt_total"] = round(
        sum(p.get("amount", 0) * p.get("count", 1) for p in guest["penalties"]), 2
    )
    db.upsert_item("sessions", session_doc)

    catalog = _get_active_catalog(group_id, db)
    catalog_by_id = {c["id"]: c for c in catalog}
    guest = _enrich_guest(guest, catalog_by_id)

    return _render(
        request, "session_guest_card.html",
        group_id=group_id,
        session_id=session_id,
        guest=guest,
        catalog=catalog,
        can_approve=_can_approve(group_doc, current_user.id),
        is_draft=True,
    )


@router.delete("/{session_id}/guests/{guest_id}/penalty")
async def remove_guest_penalty(
    request: Request,
    group_id: str,
    session_id: str,
    guest_id: str,
    catalog_id: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc or session_doc.get("status") == SessionStatus.approved:
        return HTMLResponse("", status_code=400)

    guest = next((g for g in session_doc.get("guest_entries", []) if g["guest_id"] == guest_id), None)
    if not guest:
        return HTMLResponse("", status_code=404)

    penalties = guest.get("penalties", [])
    existing = next((p for p in penalties if p["catalog_id"] == catalog_id), None)
    if existing:
        if existing["count"] > 1:
            existing["count"] -= 1
        else:
            guest["penalties"] = [p for p in penalties if p["catalog_id"] != catalog_id]

    guest["debt_total"] = round(
        sum(p.get("amount", 0) * p.get("count", 1) for p in guest.get("penalties", [])), 2
    )
    db.upsert_item("sessions", session_doc)

    catalog = _get_active_catalog(group_id, db)
    catalog_by_id = {c["id"]: c for c in catalog}
    guest = _enrich_guest(guest, catalog_by_id)

    return _render(
        request, "session_guest_card.html",
        group_id=group_id,
        session_id=session_id,
        guest=guest,
        catalog=catalog,
        can_approve=_can_approve(group_doc, current_user.id),
        is_draft=True,
    )


@router.post("/{session_id}/guests/{guest_id}/paid")
async def mark_guest_paid(
    request: Request,
    group_id: str,
    session_id: str,
    guest_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_approve(group_doc, current_user.id):
        return HTMLResponse("", status_code=403)

    session_doc = db.read_item("sessions", session_id, group_id)
    if not session_doc:
        return HTMLResponse("", status_code=404)

    guest = next((g for g in session_doc.get("guest_entries", []) if g["guest_id"] == guest_id), None)
    if not guest:
        return HTMLResponse("", status_code=404)

    guest["paid"] = not guest.get("paid", False)
    guest["paid_at"] = datetime.now(tz=UTC).isoformat() if guest["paid"] else None
    db.upsert_item("sessions", session_doc)

    catalog = _get_active_catalog(group_id, db)
    catalog_by_id = {c["id"]: c for c in catalog}
    guest = _enrich_guest(guest, catalog_by_id)

    return _render(
        request, "session_guest_card.html",
        group_id=group_id,
        session_id=session_id,
        guest=guest,
        catalog=catalog,
        can_approve=True,
        is_draft=session_doc.get("status") != SessionStatus.approved,
    )


# ── Private HTMX helper ───────────────────────────────────────────────────────

def _member_card_response(
    request: Request,
    group_id: str,
    session_id: str,
    entry: dict,
    db: CosmosDB,
):
    catalog = _get_active_catalog(group_id, db)
    catalog_by_id = {c["id"]: c for c in catalog}
    user_doc = db.read_item("users", entry["user_id"], entry["user_id"])
    user_names = {}
    if user_doc:
        full = f"{user_doc.get('first_name', '')} {user_doc.get('last_name', '')}".strip()
        user_names[entry["user_id"]] = full or entry["user_id"]
    else:
        user_names[entry["user_id"]] = entry["user_id"]

    entry = _enrich_entry(entry, catalog_by_id, user_names)

    return templates.TemplateResponse(
        "session_member_card.html",
        {
            "request": request,
            "group_id": group_id,
            "session_id": session_id,
            "entry": entry,
            "catalog": catalog,
        },
    )
