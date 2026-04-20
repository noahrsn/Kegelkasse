"""APScheduler service: monthly fee booking, email reminders, poll deadlines."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def start_scheduler() -> None:
    """Start the background scheduler with all configured jobs."""
    scheduler.add_job(
        book_monthly_fees,
        "cron",
        day="1-28",  # runs daily; the job itself checks fee_day
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
        close_expired_polls,
        "interval",
        minutes=15,
        id="close_polls",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with %d jobs", len(scheduler.get_jobs()))


def stop_scheduler() -> None:
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def book_monthly_fees() -> None:
    """Book monthly membership fees for all groups whose fee_day matches today."""
    from app.database.cosmos import CosmosDB
    from app.database.models import Debt, DebtEntry, DebtType, Log, LogVisibility

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
        for member in members:
            user_id = member["user_id"]

            # Skip if already booked this month
            existing = db.query_items(
                "debts",
                (
                    "SELECT * FROM c WHERE c.user_id = @u AND c.group_id = @g"
                ),
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

            # Calculate due_date
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

        log = Log(
            group_id=group_id,
            actor_id=None,
            actor_name="System",
            action="add_monthly_fee",
            details=f"Monatsbeitrag {period} für {len(members)} Mitglieder gebucht ({fee:.2f} €)",
            visible_to=LogVisibility.all,
        )
        db.create_item("logs", log.model_dump(mode="json"))
        logger.info("Booked monthly fees for group %s (%s)", group_id, period)


def _calculate_due_date(group: dict, booking_date: datetime, db) -> datetime | None:
    """Calculate debt due date based on group's payment_deadline config."""
    from app.database.models import PaymentDeadlineType
    from datetime import timedelta

    treasury = group.get("treasury", {})
    deadline = treasury.get("payment_deadline", {})
    dtype = deadline.get("type", PaymentDeadlineType.days_before_next_event)
    days = deadline.get("days", 2)

    if dtype == PaymentDeadlineType.days_after_booking:
        return booking_date + timedelta(days=days)

    if dtype == PaymentDeadlineType.fixed_day_of_month:
        fixed_day = deadline.get("day", 15)
        # Next occurrence of that day
        if booking_date.day < fixed_day:
            try:
                return booking_date.replace(day=fixed_day)
            except ValueError:
                pass
        # Next month
        if booking_date.month == 12:
            return booking_date.replace(year=booking_date.year + 1, month=1, day=fixed_day)
        try:
            return booking_date.replace(month=booking_date.month + 1, day=fixed_day)
        except ValueError:
            return None

    # days_before_next_event: find next recurring event and subtract N days
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


def send_debt_reminders() -> None:
    """Send weekly debt reminder emails to members with open balances."""
    logger.info("Sending debt reminders...")
    # Implemented in Phase 8 (Benachrichtigungen)


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
