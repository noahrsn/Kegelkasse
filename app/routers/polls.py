"""Polls & voting (Abstimmungen & Umfragen)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.database.cosmos import CosmosDB, get_db
from app.database.models import (
    Log,
    LogVisibility,
    Poll,
    PollOption,
    PollType,
    PollVote,
    Role,
    User,
)
from app.services.auth_service import require_auth
import app.services.email_service as _es

from app.templates_config import templates

router = APIRouter(prefix="/group/{group_id}/polls", tags=["polls"])


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


def _enrich_poll(poll_doc: dict, current_user_id: str) -> dict:
    """Add computed display fields to a poll document."""
    votes = poll_doc.get("votes", [])
    poll_doc["_vote_count"] = len(votes)
    poll_doc["_user_voted"] = any(v.get("user_id") == current_user_id for v in votes)

    # Per-option vote counts
    option_counts: dict[str, int] = {}
    for v in votes:
        for oid in v.get("option_ids", []):
            option_counts[oid] = option_counts.get(oid, 0) + 1
    poll_doc["_option_counts"] = option_counts
    poll_doc["_max_count"] = max(option_counts.values(), default=0)

    # Find which options the current user voted for
    user_vote = next((v for v in votes if v.get("user_id") == current_user_id), None)
    poll_doc["_user_option_ids"] = user_vote.get("option_ids", []) if user_vote else []

    # Deadline
    deadline = poll_doc.get("deadline")
    if deadline:
        try:
            dt = datetime.fromisoformat(str(deadline).replace("Z", "+00:00"))
            poll_doc["_deadline_display"] = dt.strftime("%d.%m.%Y, %H:%M Uhr")
            poll_doc["_is_expired"] = datetime.now(tz=UTC) > dt
        except Exception:
            poll_doc["_deadline_display"] = ""
            poll_doc["_is_expired"] = False
    else:
        poll_doc["_deadline_display"] = ""
        poll_doc["_is_expired"] = False

    # Created display
    try:
        dt2 = datetime.fromisoformat(str(poll_doc.get("created_at", "")).replace("Z", "+00:00"))
        poll_doc["_created_display"] = dt2.strftime("%d.%m.%Y")
    except Exception:
        poll_doc["_created_display"] = ""

    return poll_doc


# ── List polls ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_polls(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    polls = db.query_items(
        "polls",
        "SELECT * FROM c WHERE c.group_id = @gid",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    for poll in polls:
        _enrich_poll(poll, current_user.id)

    polls.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    open_polls = [p for p in polls if not p.get("closed")]
    closed_polls = [p for p in polls if p.get("closed")]

    return _render(
        request, "polls.html",
        group_id=group_id,
        group_name=group_doc["name"],
        current_user=current_user,
        role=_user_role(group_doc, current_user.id),
        can_manage=_can_manage(group_doc, current_user.id),
        active="polls",
        open_polls=open_polls,
        closed_polls=closed_polls,
    )


# ── New poll ───────────────────────────────────────────────────────────────────

@router.get("/new")
async def new_poll_page(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/polls", status_code=302)

    return _render(
        request, "polls_new.html",
        group_id=group_id,
        group_name=group_doc["name"],
        current_user=current_user,
        role=_user_role(group_doc, current_user.id),
        can_manage=True,
        active="polls",
    )


@router.post("/new")
async def create_poll(
    request: Request,
    group_id: str,
    title: str = Form(...),
    description: str = Form(""),
    poll_type: str = Form("single_choice"),
    anonymous: str = Form(""),
    results_visible_before_close: str = Form("on"),
    deadline: str = Form(""),
    max_choices: int = Form(2),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/polls", status_code=302)

    form_data = await request.form()

    try:
        ptype = PollType(poll_type)
    except ValueError:
        ptype = PollType.single_choice

    options: list[PollOption]
    if ptype == PollType.yes_no:
        options = [
            PollOption(label="Ja"),
            PollOption(label="Nein"),
            PollOption(label="Enthaltung"),
        ]
    else:
        options = []
        for i in range(1, 7):
            label = str(form_data.get(f"option_{i}", "")).strip()
            if label:
                options.append(PollOption(label=label))
        if len(options) < 2:
            return RedirectResponse(f"/group/{group_id}/polls/new", status_code=302)

    if ptype == PollType.multi_choice:
        max_c = max(2, min(max_choices, len(options)))
    else:
        max_c = 1

    deadline_dt: Optional[datetime] = None
    if deadline:
        for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d"):
            try:
                deadline_dt = datetime.strptime(deadline, fmt).replace(tzinfo=UTC)
                break
            except ValueError:
                continue

    poll = Poll(
        group_id=group_id,
        title=title.strip(),
        description=description.strip(),
        type=ptype,
        max_choices=max_c,
        options=[o.model_dump() for o in options],
        anonymous=bool(anonymous),
        results_visible_before_close=bool(results_visible_before_close),
        deadline=deadline_dt,
        created_by=current_user.id,
    )
    db.upsert_item("polls", poll.model_dump(mode="json"))

    _write_log(
        db, group_id, current_user, "create_poll",
        target_id=poll.id,
        target_name=title.strip(),
        details=f"Abstimmung '{title.strip()}' erstellt ({ptype.value})",
    )

    try:
        for member in group_doc.get("members", []):
            uid = member["user_id"]
            if uid == current_user.id:
                continue
            user_doc = db.read_item("users", uid, uid)
            if not user_doc:
                continue
            s, h = _es.build_new_poll(
                user_doc.get("first_name", ""),
                group_doc.get("name", ""),
                title.strip(), group_id, poll.id,
            )
            _es.notify_member(db, uid, group_id, "new_poll", s, h)
    except Exception:
        pass

    return RedirectResponse(f"/group/{group_id}/polls/{poll.id}", status_code=302)


# ── Poll detail ────────────────────────────────────────────────────────────────

@router.get("/{poll_id}")
async def poll_detail(
    request: Request,
    group_id: str,
    poll_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    poll_doc = db.read_item("polls", poll_id, group_id)
    if not poll_doc or poll_doc.get("group_id") != group_id:
        return RedirectResponse(f"/group/{group_id}/polls", status_code=302)

    _enrich_poll(poll_doc, current_user.id)
    can_manage = _can_manage(group_doc, current_user.id)

    can_see_results = (
        poll_doc.get("closed")
        or poll_doc.get("results_visible_before_close")
        or can_manage
    )

    # Build voter name map for non-anonymous polls (admin/praesident only)
    voter_names: dict[str, str] = {}
    if not poll_doc.get("anonymous") and can_manage:
        for v in poll_doc.get("votes", []):
            uid = v.get("user_id", "")
            if uid and uid not in voter_names:
                user_doc = db.read_item("users", uid, uid)
                if user_doc:
                    voter_names[uid] = (
                        f"{user_doc.get('first_name', '')} {user_doc.get('last_name', '')}".strip()
                        or uid
                    )
                else:
                    voter_names[uid] = uid

    option_map = {o["id"]: o["label"] for o in poll_doc.get("options", [])}

    return _render(
        request, "polls_detail.html",
        group_id=group_id,
        group_name=group_doc["name"],
        current_user=current_user,
        role=_user_role(group_doc, current_user.id),
        can_manage=can_manage,
        active="polls",
        poll=poll_doc,
        poll_id=poll_id,
        can_see_results=can_see_results,
        voter_names=voter_names,
        option_map=option_map,
    )


# ── Vote (HTMX) ────────────────────────────────────────────────────────────────

@router.post("/{poll_id}/vote")
async def vote(
    request: Request,
    group_id: str,
    poll_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return HTMLResponse("", status_code=403)

    poll_doc = db.read_item("polls", poll_id, group_id)
    if not poll_doc or poll_doc.get("group_id") != group_id:
        return HTMLResponse("", status_code=404)

    if poll_doc.get("closed"):
        return HTMLResponse(
            "<p style='color:var(--red);text-align:center;padding:1rem;'>Diese Abstimmung ist bereits geschlossen.</p>",
            status_code=200,
        )

    if any(v.get("user_id") == current_user.id for v in poll_doc.get("votes", [])):
        return HTMLResponse(
            "<p style='color:var(--text2);text-align:center;padding:1rem;'>Du hast bereits abgestimmt.</p>",
            status_code=200,
        )

    form_data = await request.form()
    valid_option_ids = {o["id"] for o in poll_doc.get("options", [])}
    poll_type = poll_doc.get("type", "single_choice")

    if poll_type in ("single_choice", "yes_no"):
        raw = str(form_data.get("option_id", ""))
        selected = [raw] if raw in valid_option_ids else []
    else:
        selected = [oid for oid in form_data.getlist("option_ids") if oid in valid_option_ids]
        max_c = poll_doc.get("max_choices", len(valid_option_ids))
        selected = selected[:max_c]

    if not selected:
        return HTMLResponse(
            "<p style='color:var(--red);text-align:center;padding:1rem;'>Bitte eine Option auswählen.</p>",
            status_code=200,
        )

    poll_doc.setdefault("votes", []).append(
        PollVote(user_id=current_user.id, option_ids=selected).model_dump(mode="json")
    )
    db.upsert_item("polls", poll_doc)

    _enrich_poll(poll_doc, current_user.id)
    can_manage = _can_manage(group_doc, current_user.id)
    can_see_results = (
        poll_doc.get("closed")
        or poll_doc.get("results_visible_before_close")
        or can_manage
    )

    return _render(
        request, "polls_vote_partial.html",
        group_id=group_id,
        poll=poll_doc,
        poll_id=poll_id,
        can_see_results=can_see_results,
        can_manage=can_manage,
        current_user=current_user,
    )


# ── Close poll ─────────────────────────────────────────────────────────────────

@router.post("/{poll_id}/close")
async def close_poll(
    group_id: str,
    poll_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/polls/{poll_id}", status_code=302)

    poll_doc = db.read_item("polls", poll_id, group_id)
    if not poll_doc or poll_doc.get("group_id") != group_id:
        return RedirectResponse(f"/group/{group_id}/polls", status_code=302)

    poll_doc["closed"] = True
    poll_doc["closed_at"] = datetime.now(tz=UTC).isoformat()
    db.upsert_item("polls", poll_doc)

    votes = poll_doc.get("votes", [])
    vote_count = len(votes)
    poll_title = poll_doc.get("title", "")
    _write_log(
        db, group_id, current_user, "close_poll",
        target_id=poll_id,
        target_name=poll_title,
        details=f"Abstimmung '{poll_title}' geschlossen ({vote_count} Stimmen)",
    )

    try:
        # Build result summary for email
        option_counts: dict[str, int] = {}
        for v in votes:
            for oid in v.get("option_ids", []):
                option_counts[oid] = option_counts.get(oid, 0) + 1
        result_lines = []
        for opt in poll_doc.get("options", []):
            cnt = option_counts.get(opt["id"], 0)
            pct = round(cnt / vote_count * 100) if vote_count > 0 else 0
            result_lines.append(f"{opt['label']}: {cnt} ({pct}%)")
        result_summary = " &nbsp;·&nbsp; ".join(result_lines)

        for member in group_doc.get("members", []):
            uid = member["user_id"]
            user_doc = db.read_item("users", uid, uid)
            if not user_doc:
                continue
            s, h = _es.build_poll_closed(
                user_doc.get("first_name", ""),
                group_doc.get("name", ""),
                poll_title, result_summary, group_id, poll_id,
            )
            _es.notify_member(db, uid, group_id, "poll_closed", s, h)
    except Exception:
        pass

    return RedirectResponse(f"/group/{group_id}/polls/{poll_id}", status_code=302)
