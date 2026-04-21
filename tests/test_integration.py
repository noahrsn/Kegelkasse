"""Integration tests — HTTP-level flow tests, no real database needed."""

from datetime import date

import pytest

from app.database.models import (
    Event,
    EventType,
    PenaltyEntry,
    Recurrence,
    RecurrencePattern,
    Session,
    SessionEntry,
    Transaction,
    TransactionType,
)
from app.services.calendar_service import next_recurring_date
from app.services.penalty_service import calculate_absent_average, calculate_entry_total
from app.services.treasury_service import calculate_balance


# ── Health & routing ──────────────────────────────────────────────────────────


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_redirects_to_login(client):
    response = client.get("/", follow_redirects=False)
    assert response.status_code in (302, 303, 307, 308)
    assert "/login" in response.headers["location"]


def test_openapi_accessible(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200


# ── Auth pages render ─────────────────────────────────────────────────────────


def test_login_page_renders(client):
    response = client.get("/login")
    assert response.status_code == 200
    assert b"login" in response.content.lower() or b"Login" in response.content


def test_register_page_renders(client):
    response = client.get("/register")
    assert response.status_code == 200


def test_forgot_password_page_renders(client):
    response = client.get("/forgot-password")
    assert response.status_code == 200


# ── Unauthenticated access redirects ─────────────────────────────────────────


@pytest.mark.parametrize("path", [
    "/dashboard",
    "/profile",
])
def test_protected_routes_redirect_without_auth(client, path):
    response = client.get(path, follow_redirects=False)
    assert response.status_code in (302, 303, 307, 308)


# ── Security headers ──────────────────────────────────────────────────────────


def test_security_headers_present(client):
    response = client.get("/login")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "Referrer-Policy" in response.headers
    assert "Content-Security-Policy" in response.headers


def test_csp_blocks_framing(client):
    response = client.get("/login")
    csp = response.headers.get("Content-Security-Policy", "")
    assert "frame-ancestors 'none'" in csp


# ── RSVP deadline logic (calendar_service) ────────────────────────────────────


class TestRsvpDeadlineIntegration:
    """Tests that combine models + service layer to verify deadline calculation."""

    def test_weekly_event_next_occurrence(self):
        event = Event(
            group_id="g1",
            title="Wöchentlicher Kegelabend",
            type=EventType.recurring,
            recurrence=Recurrence(
                pattern=RecurrencePattern.weekly,
                weekday=3,  # Thursday
            ),
        )
        # After Wednesday April 22, next Thursday is April 23
        result = next_recurring_date(event, date(2026, 4, 22))
        assert result == date(2026, 4, 23)

    def test_recurring_event_skips_past_occurrence(self):
        event = Event(
            group_id="g1",
            title="Regulärer Abend",
            type=EventType.recurring,
            recurrence=Recurrence(
                pattern=RecurrencePattern.monthly_nth_weekday,
                weekday=5,  # Saturday
                nth=4,
            ),
        )
        # April 25 is the 4th Saturday; after that date next is May 23
        after_occurrence = next_recurring_date(event, date(2026, 4, 25))
        assert after_occurrence.month == 5


# ── Awards service calculation ────────────────────────────────────────────────


class TestAwardsCalculation:
    def test_entry_total_zero_when_no_penalties(self):
        entry = SessionEntry(user_id="u1")
        assert calculate_entry_total(entry) == 0.0

    def test_absent_average_excludes_absent_members(self):
        session = Session(
            group_id="g1",
            entries=[
                SessionEntry(user_id="u1", penalties=[PenaltyEntry(catalog_id="p1", count=2, amount=0.20)]),
                SessionEntry(user_id="u2", penalties=[PenaltyEntry(catalog_id="p1", count=1, amount=0.10)]),
                SessionEntry(user_id="u3", absent=True),
                SessionEntry(user_id="u4", absent=True),
            ],
        )
        avg = calculate_absent_average(session)
        # (0.20 + 0.10) / 2 present = 0.15
        assert avg == pytest.approx(0.15, abs=0.001)

    def test_absent_average_is_zero_if_no_present_members(self):
        session = Session(
            group_id="g1",
            entries=[
                SessionEntry(user_id="u1", absent=True),
                SessionEntry(user_id="u2", absent=True),
            ],
        )
        avg = calculate_absent_average(session)
        assert avg == 0.0


# ── Treasury balance calculation ──────────────────────────────────────────────


class TestTreasuryBalance:
    def test_opening_balance_only(self):
        assert calculate_balance(100.0, []) == 100.0

    def test_income_adds(self):
        tx = Transaction(
            group_id="g1",
            type=TransactionType.income,
            amount=50.0,
            description="Payment",
            created_by="u1",
        )
        assert calculate_balance(100.0, [tx]) == 150.0

    def test_expense_subtracts(self):
        tx = Transaction(
            group_id="g1",
            type=TransactionType.expense,
            amount=30.0,
            description="Bahnmiete",
            created_by="u1",
        )
        assert calculate_balance(100.0, [tx]) == 70.0

    def test_mixed_transactions(self):
        txs = [
            Transaction(group_id="g1", type=TransactionType.income, amount=200.0, description="a", created_by="u1"),
            Transaction(group_id="g1", type=TransactionType.expense, amount=50.0, description="b", created_by="u1"),
            Transaction(group_id="g1", type=TransactionType.income, amount=25.0, description="c", created_by="u1"),
        ]
        assert calculate_balance(0.0, txs) == pytest.approx(175.0, abs=0.01)
