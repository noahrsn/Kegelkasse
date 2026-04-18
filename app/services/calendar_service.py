"""Calendar service: recurring event generation, next-event lookup, due date calculation."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from app.database.models import (
    Event,
    PaymentDeadline,
    PaymentDeadlineType,
    RecurrencePattern,
)


def nth_weekday_of_month(year: int, month: int, weekday: int, nth: int) -> date:
    """Return the nth occurrence of a weekday in a given month.

    weekday: 0=Monday .. 6=Sunday
    nth: 1-based (1=first, 4=fourth)
    """
    first_day = date(year, month, 1)
    # Days until the target weekday
    days_ahead = (weekday - first_day.weekday()) % 7
    first_occurrence = first_day + timedelta(days=days_ahead)
    return first_occurrence + timedelta(weeks=nth - 1)


def next_recurring_date(event: Event, after: date) -> Optional[date]:
    """Calculate the next occurrence of a recurring event after a given date."""
    if not event.recurrence:
        return None

    rec = event.recurrence

    if rec.pattern == RecurrencePattern.monthly_nth_weekday and rec.nth is not None:
        # e.g. "Every 4th Saturday"
        year, month = after.year, after.month
        for _ in range(13):  # check up to 13 months ahead
            candidate = nth_weekday_of_month(year, month, rec.weekday, rec.nth)
            if candidate > after:
                if rec.until and candidate > rec.until.date():
                    return None
                return candidate
            month += 1
            if month > 12:
                month = 1
                year += 1
        return None

    if rec.pattern == RecurrencePattern.weekly:
        days_ahead = (rec.weekday - after.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        candidate = after + timedelta(days=days_ahead)
        if rec.until and candidate > rec.until.date():
            return None
        return candidate

    return None


def calculate_due_date(
    deadline_config: PaymentDeadline,
    booking_date: date,
    next_event_date: Optional[date] = None,
) -> date:
    """Calculate the payment due date based on the configured deadline type."""
    if (
        deadline_config.type == PaymentDeadlineType.days_before_next_event
        and next_event_date
    ):
        return next_event_date - timedelta(days=deadline_config.days)

    if deadline_config.type == PaymentDeadlineType.days_after_booking:
        return booking_date + timedelta(days=deadline_config.days)

    if (
        deadline_config.type == PaymentDeadlineType.fixed_day_of_month
        and deadline_config.day
    ):
        year, month = booking_date.year, booking_date.month
        due = date(year, month, min(deadline_config.day, 28))
        if due <= booking_date:
            month += 1
            if month > 12:
                month = 1
                year += 1
            due = date(year, month, min(deadline_config.day, 28))
        return due

    # Fallback: 14 days after booking
    return booking_date + timedelta(days=14)
