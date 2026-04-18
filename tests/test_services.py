"""Unit tests for service layer — no database needed."""

from datetime import date, datetime

from app.database.models import (
    Debt,
    DebtEntry,
    DebtType,
    Event,
    EventType,
    PaymentDeadline,
    PaymentDeadlineType,
    PenaltyEntry,
    Recurrence,
    RecurrencePattern,
    Session,
    SessionEntry,
)
from app.services.calendar_service import (
    calculate_due_date,
    next_recurring_date,
    nth_weekday_of_month,
)
from app.services.penalty_service import (
    calculate_absent_average,
    calculate_entry_total,
    calculate_session_total,
)
from app.services.treasury_service import check_late_payment, match_payment_to_debts


# ── Calendar Service ──────────────────────────────────────────────────────────


class TestNthWeekday:
    def test_fourth_saturday_april_2026(self):
        # 4th Saturday of April 2026 = 25.04.2026
        result = nth_weekday_of_month(2026, 4, 5, 4)  # 5=Saturday
        assert result == date(2026, 4, 25)

    def test_first_monday(self):
        result = nth_weekday_of_month(2026, 1, 0, 1)  # 0=Monday
        assert result == date(2026, 1, 5)


class TestNextRecurringDate:
    def test_monthly_nth_weekday(self):
        event = Event(
            group_id="g1",
            title="Kegelabend",
            type=EventType.recurring,
            recurrence=Recurrence(
                pattern=RecurrencePattern.monthly_nth_weekday,
                weekday=5,  # Saturday
                nth=4,
            ),
        )
        # After April 20, next 4th Saturday is April 25
        result = next_recurring_date(event, date(2026, 4, 20))
        assert result == date(2026, 4, 25)

        # After April 25, next 4th Saturday is in May
        result = next_recurring_date(event, date(2026, 4, 25))
        assert result == date(2026, 5, 23)


class TestDueDate:
    def test_days_before_next_event(self):
        cfg = PaymentDeadline(
            type=PaymentDeadlineType.days_before_next_event, days=2
        )
        # Next event: Saturday April 25 → due: Thursday April 23
        result = calculate_due_date(cfg, date(2026, 4, 1), date(2026, 4, 25))
        assert result == date(2026, 4, 23)

    def test_days_after_booking(self):
        cfg = PaymentDeadline(
            type=PaymentDeadlineType.days_after_booking, days=14
        )
        result = calculate_due_date(cfg, date(2026, 4, 1))
        assert result == date(2026, 4, 15)

    def test_fixed_day_of_month(self):
        cfg = PaymentDeadline(
            type=PaymentDeadlineType.fixed_day_of_month, days=0, day=15
        )
        result = calculate_due_date(cfg, date(2026, 4, 1))
        assert result == date(2026, 4, 15)

        # Booking after the 15th → rolls to next month
        result = calculate_due_date(cfg, date(2026, 4, 20))
        assert result == date(2026, 5, 15)


# ── Penalty Service ───────────────────────────────────────────────────────────


class TestPenaltyService:
    def _make_session(self):
        return Session(
            group_id="g1",
            entries=[
                SessionEntry(
                    user_id="u1",
                    penalties=[
                        PenaltyEntry(catalog_id="p1", count=3, amount=0.30),
                        PenaltyEntry(catalog_id="p2", count=1, amount=0.50),
                    ],
                ),
                SessionEntry(
                    user_id="u2",
                    penalties=[
                        PenaltyEntry(catalog_id="p1", count=1, amount=0.10),
                    ],
                ),
                SessionEntry(user_id="u3", absent=True),
            ],
        )

    def test_entry_total(self):
        session = self._make_session()
        assert calculate_entry_total(session.entries[0]) == 0.80

    def test_session_total(self):
        session = self._make_session()
        assert calculate_session_total(session) == 0.90

    def test_absent_average(self):
        session = self._make_session()
        avg = calculate_absent_average(session)
        # (0.80 + 0.10) / 2 present = 0.45
        assert avg == 0.45


# ── Treasury Service ──────────────────────────────────────────────────────────


class TestPaymentMatching:
    def test_full_payment(self):
        debt = Debt(
            user_id="u1",
            group_id="g1",
            entries=[
                DebtEntry(type=DebtType.penalty, amount=5.00),
                DebtEntry(type=DebtType.monthly_fee, amount=20.00),
            ],
        )
        remaining = match_payment_to_debts(debt, 25.00, "tx1", date(2026, 4, 1))
        assert remaining == 0.0
        assert all(e.paid for e in debt.entries)

    def test_partial_payment(self):
        debt = Debt(
            user_id="u1",
            group_id="g1",
            entries=[
                DebtEntry(type=DebtType.penalty, amount=5.00),
                DebtEntry(type=DebtType.monthly_fee, amount=20.00),
            ],
        )
        remaining = match_payment_to_debts(debt, 10.00, "tx1", date(2026, 4, 1))
        assert remaining == 0.0  # 5€ covers first, 5€ partial on second
        assert debt.entries[0].paid is True
        assert debt.entries[1].paid is False

    def test_overpayment(self):
        debt = Debt(
            user_id="u1",
            group_id="g1",
            entries=[
                DebtEntry(type=DebtType.penalty, amount=5.00),
            ],
        )
        remaining = match_payment_to_debts(debt, 10.00, "tx1", date(2026, 4, 1))
        assert remaining == 5.0


class TestLateFee:
    def test_late_payment_generates_fee(self):
        entry = DebtEntry(
            type=DebtType.monthly_fee,
            amount=20.00,
            due_date=datetime(2026, 4, 23),
        )
        fee = check_late_payment(entry, date(2026, 4, 25), 2.00)
        assert fee is not None
        assert fee.type == DebtType.late_payment_fee
        assert fee.amount == 2.00

    def test_on_time_payment_no_fee(self):
        entry = DebtEntry(
            type=DebtType.monthly_fee,
            amount=20.00,
            due_date=datetime(2026, 4, 23),
        )
        fee = check_late_payment(entry, date(2026, 4, 22), 2.00)
        assert fee is None
