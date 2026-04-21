"""Calendar & event management: create events, RSVP, recurring schedules."""

from __future__ import annotations

import calendar as cal_module
from datetime import UTC, date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates

from app.database.cosmos import CosmosDB, get_db
from app.database.models import (
    Event,
    EventType,
    Log,
    LogVisibility,
    RSVPEntry,
    RSVPStatus,
    Recurrence,
    RecurrencePattern,
    Role,
    User,
)
from app.services.auth_service import require_auth
from app.services.calendar_service import next_occurrence
import app.services.email_service as _es

router = APIRouter(prefix="/group/{group_id}/calendar", tags=["calendar"])
templates = Jinja2Templates(directory="app/templates")

WEEKDAY_NAMES_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
WEEKDAY_NAMES_LONG = [
    "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"
]
MONTH_NAMES = [
    "", "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
]


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
    return role in (Role.admin, Role.praesident)


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


def _parse_dt(s: str) -> Optional[datetime]:
    if not s:
        return None
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _format_date(iso_str) -> str:
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y")
    except Exception:
        return str(iso_str)[:10]


def _format_datetime(iso_str) -> str:
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y, %H:%M Uhr")
    except Exception:
        return str(iso_str)[:16]


def _occurrences_in_month(event_doc: dict, year: int, month: int) -> list[date]:
    month_start = date(year, month, 1)
    month_end = date(year, month, cal_module.monthrange(year, month)[1])
    etype = event_doc.get("type", "single")
    start_str = event_doc.get("start_date", "")
    try:
        start_d = datetime.fromisoformat(str(start_str).replace("Z", "+00:00")).date()
    except Exception:
        return []

    if etype == "single":
        return [start_d] if month_start <= start_d <= month_end else []

    if etype == "multi_day":
        end_str = event_doc.get("end_date") or start_str
        try:
            end_d = datetime.fromisoformat(str(end_str).replace("Z", "+00:00")).date()
        except Exception:
            end_d = start_d
        if start_d <= month_end and end_d >= month_start:
            return [max(start_d, month_start)]
        return []

    if etype == "recurring":
        occurrences: list[date] = []
        check = month_start - timedelta(days=1)
        for _ in range(60):
            occ = next_occurrence(event_doc, check)
            if occ is None or occ > month_end:
                break
            if occ >= month_start:
                occurrences.append(occ)
            check = occ
        return occurrences

    return []


def _enrich_event(event_doc: dict, current_user_id: str) -> dict:
    event_doc["_date_display"] = _format_date(event_doc.get("start_date"))
    rsvp_entries = event_doc.get("rsvp_entries", [])
    event_doc["_rsvp_attending"] = sum(1 for r in rsvp_entries if r.get("status") == "attending")
    event_doc["_rsvp_declined"] = sum(1 for r in rsvp_entries if r.get("status") == "declined")
    event_doc["_rsvp_pending"] = sum(1 for r in rsvp_entries if r.get("status") == "pending")
    event_doc["_user_rsvp"] = next(
        (r for r in rsvp_entries if r.get("user_id") == current_user_id), None
    )
    try:
        start_d = datetime.fromisoformat(
            str(event_doc.get("start_date", "")).replace("Z", "+00:00")
        ).date()
        event_doc["_is_past"] = start_d < date.today()
    except Exception:
        event_doc["_is_past"] = False
    return event_doc


def _get_member_names(group_doc: dict, db: CosmosDB) -> dict[str, str]:
    names: dict[str, str] = {}
    for m in group_doc.get("members", []):
        uid = m["user_id"]
        doc = db.read_item("users", uid, uid)
        if doc:
            names[uid] = (
                f"{doc.get('first_name', '')} {doc.get('last_name', '')}".strip() or uid
            )
        else:
            names[uid] = uid
    return names


def _rsvp_deadline_dt(event_doc: dict) -> Optional[datetime]:
    hours = event_doc.get("rsvp_deadline_hours", 0)
    if not hours:
        return None
    try:
        start_dt = datetime.fromisoformat(
            str(event_doc["start_date"]).replace("Z", "+00:00")
        )
        return start_dt - timedelta(hours=hours)
    except Exception:
        return None


def _recurrence_label(event_doc: dict) -> str:
    rec = event_doc.get("recurrence")
    if not rec:
        return ""
    pattern = rec.get("pattern", "")
    weekday = rec.get("weekday", 0)
    nth = rec.get("nth")
    wday = WEEKDAY_NAMES_LONG[weekday] if 0 <= weekday <= 6 else "?"
    nth_labels = {1: "Ersten", 2: "Zweiten", 3: "Dritten", 4: "Vierten"}
    if pattern == "weekly":
        return f"Jeden {wday}"
    if pattern == "monthly_nth_weekday" and nth:
        return f"Jeden {nth_labels.get(nth, str(nth))} {wday} im Monat"
    return pattern


# ── Calendar view ─────────────────────────────────────────────────────────────

@router.get("")
async def calendar_view(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    today = date.today()
    try:
        year = int(request.query_params.get("year", today.year))
        month = int(request.query_params.get("month", today.month))
        if not (1 <= month <= 12):
            raise ValueError
    except (ValueError, TypeError):
        year, month = today.year, today.month

    view = request.query_params.get("view", "month")

    events = db.query_items(
        "events",
        "SELECT * FROM c WHERE c.group_id = @gid",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    for ev in events:
        _enrich_event(ev, current_user.id)
        ev["_recurrence_label"] = _recurrence_label(ev)

    # Month grid
    cal_weeks = cal_module.monthcalendar(year, month)
    events_by_day: dict[str, list] = {}
    for ev in events:
        for occ in _occurrences_in_month(ev, year, month):
            events_by_day.setdefault(occ.isoformat(), []).append(ev)

    # Upcoming list (±7 days past, 90 days ahead)
    upcoming: list[dict] = []
    cutoff = today + timedelta(days=90)
    look_back = today - timedelta(days=7)
    for ev in events:
        etype = ev.get("type", "single")
        if etype == "recurring":
            occ = next_occurrence(ev, look_back - timedelta(days=1))
            if occ and occ <= cutoff:
                ev["_sort_date"] = occ.isoformat()
                ev["_next_occ_display"] = occ.strftime("%d.%m.%Y")
                upcoming.append(ev)
        else:
            start_str = ev.get("start_date", "")
            try:
                start_d = datetime.fromisoformat(
                    str(start_str).replace("Z", "+00:00")
                ).date()
                if look_back <= start_d <= cutoff:
                    ev["_sort_date"] = start_d.isoformat()
                    upcoming.append(ev)
            except Exception:
                pass
    upcoming.sort(key=lambda e: e.get("_sort_date", ""))

    prev_year = year if month > 1 else year - 1
    prev_month = month - 1 if month > 1 else 12
    next_year = year if month < 12 else year + 1
    next_month = month + 1 if month < 12 else 1

    return _render(
        request, "calendar.html",
        group_id=group_id,
        group_name=group_doc["name"],
        current_user=current_user,
        role=_user_role(group_doc, current_user.id),
        can_manage=_can_manage(group_doc, current_user.id),
        active="calendar",
        today=today.isoformat(),
        year=year,
        month=month,
        month_name=MONTH_NAMES[month],
        cal_weeks=cal_weeks,
        events_by_day=events_by_day,
        upcoming=upcoming,
        view=view,
        prev_year=prev_year,
        prev_month=prev_month,
        next_year=next_year,
        next_month=next_month,
        weekday_names=WEEKDAY_NAMES_SHORT,
    )


# ── New event ─────────────────────────────────────────────────────────────────

@router.get("/new")
async def new_event_page(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/calendar", status_code=302)

    today_dt = datetime.now(tz=UTC).strftime("%Y-%m-%dT%H:%M")

    return _render(
        request, "calendar_new.html",
        group_id=group_id,
        group_name=group_doc["name"],
        current_user=current_user,
        role=_user_role(group_doc, current_user.id),
        can_manage=True,
        active="calendar",
        today_dt=today_dt,
        weekday_names_long=WEEKDAY_NAMES_LONG,
        edit_mode=False,
        event=None,
    )


@router.post("/new")
async def create_event(
    group_id: str,
    title: str = Form(...),
    description: str = Form(""),
    event_type: str = Form("single"),
    start_date: str = Form(...),
    end_date: str = Form(""),
    rsvp_deadline_hours: int = Form(48),
    recurrence_pattern: str = Form("monthly_nth_weekday"),
    recurrence_weekday: int = Form(5),
    recurrence_nth: int = Form(4),
    recurrence_until: str = Form(""),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/calendar", status_code=302)

    try:
        etype = EventType(event_type)
    except ValueError:
        etype = EventType.single

    start_dt = _parse_dt(start_date) or datetime.now(tz=UTC)
    end_dt = _parse_dt(end_date) if etype == EventType.multi_day else None

    recurrence = None
    if etype == EventType.recurring:
        try:
            pattern = RecurrencePattern(recurrence_pattern)
        except ValueError:
            pattern = RecurrencePattern.monthly_nth_weekday
        until_dt = _parse_dt(recurrence_until) if recurrence_until else None
        nth = recurrence_nth if pattern == RecurrencePattern.monthly_nth_weekday else None
        recurrence = Recurrence(
            pattern=pattern,
            weekday=max(0, min(6, recurrence_weekday)),
            nth=nth,
            until=until_dt,
        )

    member_ids = [m["user_id"] for m in group_doc.get("members", [])]
    rsvp_entries = [RSVPEntry(user_id=uid).model_dump(mode="json") for uid in member_ids]

    event = Event(
        group_id=group_id,
        title=title.strip(),
        description=description.strip(),
        type=etype,
        start_date=start_dt,
        end_date=end_dt,
        recurrence=recurrence,
        rsvp_deadline_hours=rsvp_deadline_hours,
        created_by=current_user.id,
        rsvp_entries=rsvp_entries,
    )
    db.upsert_item("events", event.model_dump(mode="json"))

    _write_log(
        db, group_id, current_user, "create_event",
        target_id=event.id,
        target_name=title.strip(),
        details=f"Event '{title.strip()}' ({etype.value}) angelegt",
    )

    try:
        date_display = _format_date(start_dt.isoformat())
        for member in group_doc.get("members", []):
            uid = member["user_id"]
            if uid == current_user.id:
                continue
            user_doc = db.read_item("users", uid, uid)
            if not user_doc:
                continue
            s, h = _es.build_event_invitation(
                user_doc.get("first_name", ""),
                group_doc.get("name", ""),
                title.strip(), date_display, group_id, event.id,
            )
            _es.notify_member(db, uid, group_id, "event_invitation", s, h)
    except Exception:
        pass

    return RedirectResponse(f"/group/{group_id}/calendar/{event.id}", status_code=302)


# ── Event detail ──────────────────────────────────────────────────────────────

@router.get("/{event_id}")
async def event_detail(
    request: Request,
    group_id: str,
    event_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    event_doc = db.read_item("events", event_id, group_id)
    if not event_doc or event_doc.get("group_id") != group_id:
        return RedirectResponse(f"/group/{group_id}/calendar", status_code=302)

    _enrich_event(event_doc, current_user.id)
    event_doc["_recurrence_label"] = _recurrence_label(event_doc)

    member_names = _get_member_names(group_doc, db)
    rsvp_deadline = _rsvp_deadline_dt(event_doc)

    linked_session = None
    if event_doc.get("linked_session_id"):
        linked_session = db.read_item("sessions", event_doc["linked_session_id"], group_id)

    next_occ_display = None
    if event_doc.get("type") == "recurring":
        occ = next_occurrence(event_doc, date.today() - timedelta(days=1))
        if occ:
            next_occ_display = occ.strftime("%d.%m.%Y")

    return _render(
        request, "calendar_event.html",
        group_id=group_id,
        group_name=group_doc["name"],
        current_user=current_user,
        role=_user_role(group_doc, current_user.id),
        can_manage=_can_manage(group_doc, current_user.id),
        active="calendar",
        event=event_doc,
        event_id=event_id,
        member_names=member_names,
        rsvp_deadline=rsvp_deadline,
        rsvp_deadline_display=_format_datetime(rsvp_deadline.isoformat() if rsvp_deadline else None),
        linked_session=linked_session,
        next_occ_display=next_occ_display,
        late_response=False,
    )


# ── Edit event ────────────────────────────────────────────────────────────────

@router.get("/{event_id}/edit")
async def edit_event_page(
    request: Request,
    group_id: str,
    event_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/calendar/{event_id}", status_code=302)

    event_doc = db.read_item("events", event_id, group_id)
    if not event_doc or event_doc.get("group_id") != group_id:
        return RedirectResponse(f"/group/{group_id}/calendar", status_code=302)

    def _to_input_dt(iso_str) -> str:
        if not iso_str:
            return ""
        try:
            dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%dT%H:%M")
        except Exception:
            return ""

    def _to_input_date(iso_str) -> str:
        if not iso_str:
            return ""
        try:
            dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return ""

    rec = event_doc.get("recurrence") or {}
    event_doc["_start_input"] = _to_input_dt(event_doc.get("start_date"))
    event_doc["_end_input"] = _to_input_dt(event_doc.get("end_date"))
    event_doc["_rec_until_input"] = _to_input_date(rec.get("until"))

    return _render(
        request, "calendar_new.html",
        group_id=group_id,
        group_name=group_doc["name"],
        current_user=current_user,
        role=_user_role(group_doc, current_user.id),
        can_manage=True,
        active="calendar",
        weekday_names_long=WEEKDAY_NAMES_LONG,
        edit_mode=True,
        event=event_doc,
        event_id=event_id,
    )


@router.post("/{event_id}/edit")
async def update_event(
    group_id: str,
    event_id: str,
    title: str = Form(...),
    description: str = Form(""),
    event_type: str = Form("single"),
    start_date: str = Form(...),
    end_date: str = Form(""),
    rsvp_deadline_hours: int = Form(48),
    recurrence_pattern: str = Form("monthly_nth_weekday"),
    recurrence_weekday: int = Form(5),
    recurrence_nth: int = Form(4),
    recurrence_until: str = Form(""),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/calendar/{event_id}", status_code=302)

    event_doc = db.read_item("events", event_id, group_id)
    if not event_doc or event_doc.get("group_id") != group_id:
        return RedirectResponse(f"/group/{group_id}/calendar", status_code=302)

    try:
        etype = EventType(event_type)
    except ValueError:
        etype = EventType.single

    start_dt = _parse_dt(start_date) or datetime.now(tz=UTC)
    end_dt = _parse_dt(end_date) if etype == EventType.multi_day else None

    recurrence = None
    if etype == EventType.recurring:
        try:
            pattern = RecurrencePattern(recurrence_pattern)
        except ValueError:
            pattern = RecurrencePattern.monthly_nth_weekday
        until_dt = _parse_dt(recurrence_until) if recurrence_until else None
        nth = recurrence_nth if pattern == RecurrencePattern.monthly_nth_weekday else None
        recurrence = Recurrence(
            pattern=pattern,
            weekday=max(0, min(6, recurrence_weekday)),
            nth=nth,
            until=until_dt,
        ).model_dump(mode="json")

    event_doc["title"] = title.strip()
    event_doc["description"] = description.strip()
    event_doc["type"] = etype.value
    event_doc["start_date"] = start_dt.isoformat()
    event_doc["end_date"] = end_dt.isoformat() if end_dt else None
    event_doc["recurrence"] = recurrence
    event_doc["rsvp_deadline_hours"] = rsvp_deadline_hours

    db.upsert_item("events", event_doc)

    _write_log(
        db, group_id, current_user, "update_event",
        target_id=event_id,
        target_name=title.strip(),
        details=f"Event '{title.strip()}' bearbeitet",
    )

    return RedirectResponse(f"/group/{group_id}/calendar/{event_id}", status_code=302)


# ── RSVP (HTMX) ───────────────────────────────────────────────────────────────

@router.post("/{event_id}/rsvp")
async def rsvp(
    request: Request,
    group_id: str,
    event_id: str,
    status: str = Form(...),
    note: str = Form(""),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    event_doc = db.read_item("events", event_id, group_id)
    if not event_doc or event_doc.get("group_id") != group_id:
        return HTMLResponse("", status_code=404)

    try:
        rsvp_status = RSVPStatus(status)
    except ValueError:
        return HTMLResponse("", status_code=400)

    # Late response check
    late_response = False
    rsvp_deadline = _rsvp_deadline_dt(event_doc)
    if rsvp_deadline and rsvp_status == RSVPStatus.declined:
        if datetime.now(tz=UTC) > rsvp_deadline:
            late_response = True

    rsvp_entries = event_doc.setdefault("rsvp_entries", [])
    existing = next((r for r in rsvp_entries if r.get("user_id") == current_user.id), None)
    entry = RSVPEntry(
        user_id=current_user.id,
        status=rsvp_status,
        note=note.strip(),
        responded_at=datetime.now(tz=UTC),
        late_response=late_response,
    ).model_dump(mode="json")

    if existing:
        rsvp_entries[rsvp_entries.index(existing)] = entry
    else:
        rsvp_entries.append(entry)

    db.upsert_item("events", event_doc)

    action = "late_rsvp_penalty" if late_response else "rsvp_response"
    details = (
        f"{current_user.full_name} hat nach Fristablauf abgesagt"
        if late_response
        else f"{current_user.full_name}: {rsvp_status.value}"
    )
    _write_log(db, group_id, current_user, action,
               target_id=event_id, target_name=event_doc.get("title", ""), details=details)

    if late_response:
        try:
            s, h = _es.build_late_rsvp_kassenwart(
                group_doc.get("name", ""), current_user.full_name,
                event_doc.get("title", ""), group_id, event_id,
            )
            _es.notify_group_members(
                db, group_doc, "late_rsvp_kassenwart", s, h,
                role_filter=["admin", "kassenwart"],
            )
        except Exception:
            pass

    _enrich_event(event_doc, current_user.id)
    member_names = _get_member_names(group_doc, db)

    return _render(
        request, "calendar_rsvp_partial.html",
        group_id=group_id,
        event=event_doc,
        event_id=event_id,
        member_names=member_names,
        rsvp_deadline=rsvp_deadline,
        rsvp_deadline_display=_format_datetime(rsvp_deadline.isoformat() if rsvp_deadline else None),
        current_user=current_user,
        late_response=late_response,
        can_manage=_can_manage(group_doc, current_user.id),
    )


# ── Delete event ──────────────────────────────────────────────────────────────

@router.delete("/{event_id}")
async def delete_event(
    group_id: str,
    event_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return HTMLResponse("", status_code=403)

    event_doc = db.read_item("events", event_id, group_id)
    if not event_doc or event_doc.get("group_id") != group_id:
        return HTMLResponse("", status_code=404)

    title = event_doc.get("title", "")
    db.delete_item("events", event_id, group_id)

    _write_log(
        db, group_id, current_user, "delete_event",
        target_id=event_id,
        target_name=title,
        details=f"Event '{title}' gelöscht",
    )

    response = Response(status_code=200)
    response.headers["HX-Redirect"] = f"/group/{group_id}/calendar"
    return response
