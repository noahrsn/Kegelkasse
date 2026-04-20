"""Awards, statistics, and all-time ranking."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.database.cosmos import CosmosDB, get_db
from app.database.models import Role, SessionStatus, User
from app.services.auth_service import require_auth
from app.services.awards_service import calculate_session_awards

router = APIRouter(prefix="/group/{group_id}", tags=["awards"])
templates = Jinja2Templates(directory="app/templates")


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


def _get_user_names(user_ids: list[str], db: CosmosDB) -> dict[str, str]:
    names: dict[str, str] = {}
    for uid in set(user_ids):
        doc = db.read_item("users", uid, uid)
        if doc:
            names[uid] = f"{doc.get('first_name','')} {doc.get('last_name','')}".strip()
    return names


# ── Stats & Awards ────────────────────────────────────────────────────────────

@router.get("/stats", response_class=HTMLResponse)
async def stats(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)

    # All approved sessions
    sessions = db.query_items(
        "sessions",
        "SELECT * FROM c WHERE c.group_id = @gid AND c.status = 'approved'",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )

    now = datetime.now(UTC)
    current_month = now.strftime("%Y-%m")

    # Filter sessions by current month
    month_sessions = [
        s for s in sessions
        if (s.get("date") or s.get("approved_at") or "")[:7] == current_month
    ]

    # Aggregate stats across all time
    member_ids = [m["user_id"] for m in group_doc.get("members", [])]
    user_names = _get_user_names(member_ids, db)

    # Per-member counters (all-time)
    penalty_counts: Counter[str] = Counter()
    penalty_amounts: dict[str, float] = defaultdict(float)
    sessions_attended: Counter[str] = Counter()
    sessions_total: Counter[str] = Counter()
    late_arrivals: Counter[str] = Counter()

    for s in sessions:
        for entry in s.get("entries", []):
            uid = entry.get("user_id", "")
            sessions_total[uid] += 1
            if not entry.get("absent"):
                sessions_attended[uid] += 1
            if entry.get("late_arrival"):
                late_arrivals[uid] += 1
            for p in entry.get("penalties", []):
                penalty_counts[uid] += p.get("count", 0)
                penalty_amounts[uid] += p.get("amount", 0) * p.get("count", 1)

    # Current month awards
    from app.database.models import Session as SModel
    month_award_entries: list[dict] = []
    for s in month_sessions:
        try:
            sobj = SModel(**s)
            for award in calculate_session_awards(sobj):
                month_award_entries.append({
                    "type": award.type.value,
                    "user_id": award.user_id,
                    "user_name": user_names.get(award.user_id, award.user_id),
                    "label": award.label,
                })
        except Exception:
            pass

    # Monthly aggregates for charts (last 6 months)
    monthly_data: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for s in sessions:
        month = (s.get("date") or s.get("approved_at") or "")[:7]
        if not month:
            continue
        for entry in s.get("entries", []):
            uid = entry.get("user_id", "")
            for p in entry.get("penalties", []):
                monthly_data[month][uid] += p.get("amount", 0) * p.get("count", 1)

    sorted_months = sorted(monthly_data.keys())[-6:]
    monthly_totals = [
        {"month": m, "total": round(sum(monthly_data[m].values()), 2)}
        for m in sorted_months
    ]

    # Top penalty causers this month
    month_penalty_sums: dict[str, float] = defaultdict(float)
    for s in month_sessions:
        for entry in s.get("entries", []):
            uid = entry.get("user_id", "")
            for p in entry.get("penalties", []):
                month_penalty_sums[uid] += p.get("amount", 0) * p.get("count", 1)

    top_this_month = sorted(
        [{"user_id": uid, "name": user_names.get(uid, uid), "amount": round(amt, 2)}
         for uid, amt in month_penalty_sums.items() if amt > 0],
        key=lambda x: x["amount"],
        reverse=True,
    )[:5]

    # Attendance rates
    attendance = []
    for uid in member_ids:
        total = sessions_total.get(uid, 0)
        attended = sessions_attended.get(uid, 0)
        rate = round(attended / total * 100) if total > 0 else None
        attendance.append({
            "user_id": uid,
            "name": user_names.get(uid, uid),
            "attended": attended,
            "total": total,
            "rate": rate,
            "is_me": uid == current_user.id,
        })
    attendance.sort(key=lambda x: (x["rate"] or -1), reverse=True)

    # Saved awards for current month
    saved_awards = db.query_items(
        "awards",
        "SELECT * FROM c WHERE c.group_id = @gid AND c.period_ref = @ref",
        parameters=[
            {"name": "@gid", "value": group_id},
            {"name": "@ref", "value": current_month},
        ],
        partition_key=group_id,
    )
    saved_award_entries: list[dict] = []
    for doc in saved_awards:
        for ae in doc.get("awards", []):
            saved_award_entries.append({
                "type": ae.get("type", ""),
                "user_name": user_names.get(ae.get("user_id", ""), ae.get("user_id", "")),
                "label": ae.get("label", ""),
            })

    return _render(
        request, "stats.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="stats",
        role=role.value if role else "mitglied",
        current_month=current_month,
        month_award_entries=month_award_entries,
        saved_award_entries=saved_award_entries,
        top_this_month=top_this_month,
        monthly_totals=monthly_totals,
        attendance=attendance,
        session_count=len(sessions),
        month_session_count=len(month_sessions),
        current_user=current_user,
    )


# ── All-time leaderboard ──────────────────────────────────────────────────────

@router.get("/stats/alltime", response_class=HTMLResponse)
async def alltime_ranking(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    role = _user_role(group_doc, current_user.id)
    member_ids = [m["user_id"] for m in group_doc.get("members", [])]
    user_names = _get_user_names(member_ids, db)

    sessions = db.query_items(
        "sessions",
        "SELECT * FROM c WHERE c.group_id = @gid AND c.status = 'approved'",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )

    # Aggregate all-time per member
    penalty_counts: Counter[str] = Counter()
    penalty_amounts: dict[str, float] = defaultdict(float)
    sessions_attended: Counter[str] = Counter()
    sessions_total: Counter[str] = Counter()
    late_arrivals: Counter[str] = Counter()

    for s in sessions:
        for entry in s.get("entries", []):
            uid = entry.get("user_id", "")
            sessions_total[uid] += 1
            if not entry.get("absent"):
                sessions_attended[uid] += 1
            if entry.get("late_arrival"):
                late_arrivals[uid] += 1
            for p in entry.get("penalties", []):
                penalty_counts[uid] += p.get("count", 0)
                penalty_amounts[uid] += p.get("amount", 0) * p.get("count", 1)

    # Total paid per member from debts
    all_debts = db.query_items(
        "debts",
        "SELECT * FROM c WHERE c.group_id = @gid",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    total_paid: dict[str, float] = defaultdict(float)
    for debt_doc in all_debts:
        uid = debt_doc.get("user_id", "")
        for entry in debt_doc.get("entries", []):
            if entry.get("paid") and not entry.get("cancelled"):
                total_paid[uid] += entry.get("amount", 0)

    # Build leaderboard rows
    rows = []
    for uid in member_ids:
        total = sessions_total.get(uid, 0)
        attended = sessions_attended.get(uid, 0)
        rows.append({
            "user_id": uid,
            "name": user_names.get(uid, uid),
            "penalty_count": penalty_counts.get(uid, 0),
            "penalty_amount": round(penalty_amounts.get(uid, 0), 2),
            "sessions_attended": attended,
            "sessions_total": total,
            "attendance_rate": round(attended / total * 100) if total > 0 else None,
            "late_arrivals": late_arrivals.get(uid, 0),
            "total_paid": round(total_paid.get(uid, 0), 2),
            "is_me": uid == current_user.id,
        })

    # Sort options
    sort_by = request.query_params.get("sort", "penalty_amount")
    valid_sorts = {"penalty_amount", "penalty_count", "sessions_attended", "attendance_rate", "total_paid"}
    if sort_by not in valid_sorts:
        sort_by = "penalty_amount"
    rows.sort(key=lambda r: (r[sort_by] or 0), reverse=True)

    return _render(
        request, "stats_alltime.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="stats",
        role=role.value if role else "mitglied",
        rows=rows,
        sort_by=sort_by,
        session_count=len(sessions),
        current_user=current_user,
    )
