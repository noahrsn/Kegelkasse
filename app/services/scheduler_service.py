"""APScheduler service: monthly fee booking, email reminders, poll deadlines."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def start_scheduler() -> None:
    """Start the background scheduler with all configured jobs."""
    scheduler.add_job(
        book_monthly_fees,
        "cron",
        day="1-28",
        hour=2,
        minute=0,
        id="monthly_fees",
        replace_existing=True,
    )

    scheduler.add_job(
        send_debt_reminders,
        "cron",
        day_of_week="mon",
        hour=9,
        minute=0,
        id="debt_reminders",
        replace_existing=True,
    )

    scheduler.add_job(
        send_monthly_summary,
        "cron",
        day=1,
        hour=8,
        minute=0,
        id="monthly_summary",
        replace_existing=True,
    )

    scheduler.add_job(
        send_rsvp_reminders,
        "cron",
        hour=10,
        minute=0,
        id="rsvp_reminders",
        replace_existing=True,
    )

    scheduler.add_job(
        send_poll_closing_soon,
        "cron",
        hour=10,
        minute=30,
        id="poll_closing_soon",
        replace_existing=True,
    )

    scheduler.add_job(
        close_expired_polls,
        "interval",
        minutes=15,
        id="close_polls",
        replace_existing=True,
    )

    scheduler.add_job(
        send_deadline_warnings,
        "cron",
        hour="8,14,19",
        minute=0,
        id="deadline_warnings",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with %d jobs", len(scheduler.get_jobs()))


def stop_scheduler() -> None:
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


# ── Monthly fees ───────────────────────────────────────────────────────────────

def book_monthly_fees() -> None:
    """Book monthly membership fees for all groups whose fee_day matches today."""
    from app.database.cosmos import CosmosDB
    from app.database.models import Debt, DebtEntry, DebtType, Log, LogVisibility
    import app.services.email_service as es

    today = datetime.now(tz=UTC)
    db = CosmosDB.get()

    try:
        groups = db.query_items("groups", "SELECT * FROM c")
    except Exception as exc:
        logger.warning("book_monthly_fees: could not query groups: %s", exc)
        return

    period = today.strftime("%Y-%m")

    for group in groups:
        fee = group.get("monthly_fee", 0.0)
        fee_day = group.get("fee_day", 1)
        group_id = group["id"]

        if fee <= 0:
            continue
        if today.day != fee_day:
            continue

        members = group.get("members", [])
        booked = 0
        for member in members:
            user_id = member["user_id"]

            existing = db.query_items(
                "debts",
                "SELECT * FROM c WHERE c.user_id = @u AND c.group_id = @g",
                [{"name": "@u", "value": user_id}, {"name": "@g", "value": group_id}],
                partition_key=group_id,
            )
            already_booked = False
            if existing:
                debt_doc = existing[0]
                for entry in debt_doc.get("entries", []):
                    if (
                        entry.get("type") == DebtType.monthly_fee
                        and entry.get("description", "").endswith(period)
                        and not entry.get("cancelled")
                    ):
                        already_booked = True
                        break
            if already_booked:
                continue

            due_date = _calculate_due_date(group, today, db)
            new_entry = DebtEntry(
                type=DebtType.monthly_fee,
                amount=fee,
                description=f"Monatsbeitrag {period}",
                due_date=due_date,
                created_by="system",
            )

            if existing:
                debt_doc = existing[0]
                debt_doc.setdefault("entries", []).append(new_entry.model_dump(mode="json"))
                db.upsert_item("debts", debt_doc)
            else:
                debt = Debt(user_id=user_id, group_id=group_id, entries=[new_entry])
                db.upsert_item("debts", debt.model_dump(mode="json"))

            booked += 1

            # Notify member
            subj, html = es.build_monthly_fee("", group.get("name", ""), fee, period, group_id)
            user_doc = db.read_item("users", user_id, user_id)
            if user_doc:
                subj2, html2 = es.build_monthly_fee(
                    user_doc.get("first_name", ""),
                    group.get("name", ""),
                    fee, period, group_id,
                )
                es.notify_member(db, user_id, group_id, "monthly_fee", subj2, html2)

        log = Log(
            group_id=group_id,
            actor_id=None,
            actor_name="System",
            action="add_monthly_fee",
            details=f"Monatsbeitrag {period} für {booked} Mitglieder gebucht ({fee:.2f} €)",
            visible_to=LogVisibility.all,
        )
        db.create_item("logs", log.model_dump(mode="json"))
        logger.info("Booked monthly fees for group %s (%s)", group_id, period)


# ── Debt reminders ─────────────────────────────────────────────────────────────

def send_debt_reminders() -> None:
    """Send weekly debt reminder emails to members with open balances."""
    from app.database.cosmos import CosmosDB
    import app.services.email_service as es

    db = CosmosDB.get()
    try:
        groups = db.query_items("groups", "SELECT * FROM c")
    except Exception as exc:
        logger.warning("send_debt_reminders: could not query groups: %s", exc)
        return

    for group in groups:
        group_id = group["id"]
        for member in group.get("members", []):
            user_id = member["user_id"]
            debts = db.query_items(
                "debts",
                "SELECT * FROM c WHERE c.user_id = @u AND c.group_id = @g",
                [{"name": "@u", "value": user_id}, {"name": "@g", "value": group_id}],
                partition_key=group_id,
            )
            if not debts:
                continue
            total = 0.0
            for e in debts[0].get("entries", []):
                if e.get("paid") or e.get("cancelled"):
                    continue
                total += -e.get("amount", 0) if e.get("type") == "credit" else e.get("amount", 0)
            if total <= 0:
                continue
            user_doc = db.read_item("users", user_id, user_id)
            if not user_doc:
                continue
            subj, html = es.build_debt_reminder(
                user_doc.get("first_name", ""),
                group.get("name", ""),
                total, group_id,
            )
            es.notify_member(db, user_id, group_id, "debt_reminder", subj, html)


# ── Monthly summary ────────────────────────────────────────────────────────────

def send_monthly_summary() -> None:
    """Send monthly summary email to all group members on the 1st of each month."""
    from app.database.cosmos import CosmosDB
    import app.services.email_service as es

    db = CosmosDB.get()
    now = datetime.now(tz=UTC)
    # Period = previous month
    if now.month == 1:
        period = f"{now.year - 1}-12"
    else:
        period = f"{now.year}-{now.month - 1:02d}"

    try:
        groups = db.query_items("groups", "SELECT * FROM c")
    except Exception as exc:
        logger.warning("send_monthly_summary: could not query groups: %s", exc)
        return

    for group in groups:
        group_id = group["id"]
        sessions_count = len(db.query_items(
            "sessions",
            "SELECT * FROM c WHERE c.group_id = @g AND c.status = 'approved'",
            [{"name": "@g", "value": group_id}],
            partition_key=group_id,
        ))
        for member in group.get("members", []):
            user_id = member["user_id"]
            user_doc = db.read_item("users", user_id, user_id)
            if not user_doc:
                continue
            debts = db.query_items(
                "debts",
                "SELECT * FROM c WHERE c.user_id = @u AND c.group_id = @g",
                [{"name": "@u", "value": user_id}, {"name": "@g", "value": group_id}],
                partition_key=group_id,
            )
            open_debt = 0.0
            if debts:
                for e in debts[0].get("entries", []):
                    if e.get("paid") or e.get("cancelled"):
                        continue
                    open_debt += -e.get("amount", 0) if e.get("type") == "credit" else e.get("amount", 0)
            subj, html = es.build_monthly_summary(
                user_doc.get("first_name", ""),
                group.get("name", ""),
                period, open_debt, sessions_count, group_id,
            )
            es.notify_member(db, user_id, group_id, "monthly_summary", subj, html)


# ── RSVP reminders ────────────────────────────────────────────────────────────

def send_rsvp_reminders() -> None:
    """Send RSVP reminders to members who haven't responded to upcoming events."""
    from app.database.cosmos import CosmosDB
    import app.services.email_service as es

    db = CosmosDB.get()
    now = datetime.now(tz=UTC)
    window_end = now + timedelta(hours=48)

    try:
        events = db.query_items(
            "events",
            "SELECT * FROM c WHERE c.rsvp_deadline_hours > 0",
        )
    except Exception as exc:
        logger.warning("send_rsvp_reminders: query failed: %s", exc)
        return

    for event in events:
        deadline_hours = event.get("rsvp_deadline_hours", 0)
        try:
            start_dt = datetime.fromisoformat(str(event["start_date"]).replace("Z", "+00:00"))
            deadline_dt = start_dt - timedelta(hours=deadline_hours)
        except Exception:
            continue

        # Only send reminder if deadline is within the next 24-48 hours
        if not (now <= deadline_dt <= window_end):
            continue

        group_id = event.get("group_id", "")
        group_doc = db.read_item("groups", group_id, group_id)
        if not group_doc:
            continue

        deadline_display = deadline_dt.strftime("%d.%m.%Y, %H:%M Uhr")
        pending_uids = {
            r["user_id"] for r in event.get("rsvp_entries", [])
            if r.get("status") == "pending"
        }

        for uid in pending_uids:
            user_doc = db.read_item("users", uid, uid)
            if not user_doc:
                continue
            subj, html = es.build_rsvp_reminder(
                user_doc.get("first_name", ""),
                group_doc.get("name", ""),
                event.get("title", ""),
                deadline_display,
                group_id,
                event["id"],
            )
            es.notify_member(db, uid, group_id, "rsvp_reminder", subj, html)


# ── Deadline warnings (final notice before RSVP deadline) ─────────────────────

def send_deadline_warnings() -> None:
    """Send a final warning to members whose RSVP deadline expires within 6 hours."""
    from app.database.cosmos import CosmosDB
    import app.services.email_service as es

    db = CosmosDB.get()
    now = datetime.now(tz=UTC)
    window_end = now + timedelta(hours=6)

    try:
        events = db.query_items(
            "events",
            "SELECT * FROM c WHERE c.rsvp_deadline_hours > 0",
        )
    except Exception as exc:
        logger.warning("send_deadline_warnings: query failed: %s", exc)
        return

    for event in events:
        deadline_hours = event.get("rsvp_deadline_hours", 0)
        try:
            start_dt = datetime.fromisoformat(str(event["start_date"]).replace("Z", "+00:00"))
            deadline_dt = start_dt - timedelta(hours=deadline_hours)
        except Exception:
            continue

        # Only send if deadline falls within the next 6 hours (but not already passed)
        if not (now <= deadline_dt <= window_end):
            continue

        group_id = event.get("group_id", "")
        group_doc = db.read_item("groups", group_id, group_id)
        if not group_doc:
            continue

        deadline_display = deadline_dt.strftime("%d.%m.%Y, %H:%M Uhr")
        pending_uids = {
            r["user_id"] for r in event.get("rsvp_entries", [])
            if r.get("status") == "pending"
        }

        for uid in pending_uids:
            user_doc = db.read_item("users", uid, uid)
            if not user_doc:
                continue
            subj, html = es.build_deadline_warning(
                user_doc.get("first_name", ""),
                group_doc.get("name", ""),
                event.get("title", ""),
                deadline_display,
                group_id,
                event["id"],
            )
            es.notify_member(db, uid, group_id, "deadline_warning", subj, html)


# ── Poll closing soon ──────────────────────────────────────────────────────────

def send_poll_closing_soon() -> None:
    """Notify members who haven't voted in polls closing within 24 hours."""
    from app.database.cosmos import CosmosDB
    import app.services.email_service as es

    db = CosmosDB.get()
    now = datetime.now(tz=UTC)
    window_end = now + timedelta(hours=24)

    try:
        polls = db.query_items(
            "polls",
            "SELECT * FROM c WHERE c.closed = false AND c.deadline != null",
        )
    except Exception as exc:
        logger.warning("send_poll_closing_soon: query failed: %s", exc)
        return

    for poll in polls:
        try:
            deadline_dt = datetime.fromisoformat(str(poll["deadline"]).replace("Z", "+00:00"))
        except Exception:
            continue

        if not (now <= deadline_dt <= window_end):
            continue

        group_id = poll.get("group_id", "")
        group_doc = db.read_item("groups", group_id, group_id)
        if not group_doc:
            continue

        deadline_display = deadline_dt.strftime("%d.%m.%Y, %H:%M Uhr")
        voted_uids = {v["user_id"] for v in poll.get("votes", [])}

        for member in group_doc.get("members", []):
            uid = member["user_id"]
            if uid in voted_uids:
                continue
            user_doc = db.read_item("users", uid, uid)
            if not user_doc:
                continue
            subj, html = es.build_poll_closing_soon(
                user_doc.get("first_name", ""),
                group_doc.get("name", ""),
                poll.get("title", ""),
                deadline_display,
                group_id,
                poll["id"],
            )
            es.notify_member(db, uid, group_id, "poll_closing_soon", subj, html)


# ── Close expired polls ────────────────────────────────────────────────────────

def close_expired_polls() -> None:
    """Close polls that have passed their deadline."""
    from app.database.cosmos import CosmosDB

    db = CosmosDB.get()
    now = datetime.now(tz=UTC).isoformat()
    try:
        open_polls = db.query_items(
            "polls",
            "SELECT * FROM c WHERE c.closed = false AND c.deadline != null AND c.deadline < @now",
            [{"name": "@now", "value": now}],
        )
    except Exception as exc:
        logger.warning("close_expired_polls: query failed: %s", exc)
        return

    for poll in open_polls:
        poll["closed"] = True
        poll["closed_at"] = now
        db.upsert_item("polls", poll)
        logger.info("Closed expired poll %s", poll["id"])


# ── Due date helper ────────────────────────────────────────────────────────────

def _calculate_due_date(group: dict, booking_date: datetime, db) -> datetime | None:
    """Calculate debt due date based on group's payment_deadline config."""
    from app.database.models import PaymentDeadlineType

    treasury = group.get("treasury", {})
    deadline = treasury.get("payment_deadline", {})
    dtype = deadline.get("type", PaymentDeadlineType.days_before_next_event)
    days = deadline.get("days", 2)

    if dtype == PaymentDeadlineType.days_after_booking:
        return booking_date + timedelta(days=days)

    if dtype == PaymentDeadlineType.fixed_day_of_month:
        fixed_day = deadline.get("day", 15)
        if booking_date.day < fixed_day:
            try:
                return booking_date.replace(day=fixed_day)
            except ValueError:
                pass
        if booking_date.month == 12:
            return booking_date.replace(year=booking_date.year + 1, month=1, day=fixed_day)
        try:
            return booking_date.replace(month=booking_date.month + 1, day=fixed_day)
        except ValueError:
            return None

    # days_before_next_event
    try:
        events = db.query_items(
            "events",
            (
                "SELECT * FROM c WHERE c.group_id = @g"
                " AND c.type = 'recurring'"
                " AND (c.recurrence.until = null OR c.recurrence.until > @now)"
            ),
            [
                {"name": "@g", "value": group["id"]},
                {"name": "@now", "value": booking_date.isoformat()},
            ],
            partition_key=group["id"],
        )
        from app.services.calendar_service import next_occurrence
        earliest = None
        for ev in events:
            nxt = next_occurrence(ev, after=booking_date)
            if nxt and (earliest is None or nxt < earliest):
                earliest = nxt
        if earliest:
            return earliest - timedelta(days=days)
    except Exception:
        pass

    return booking_date + timedelta(days=days)
