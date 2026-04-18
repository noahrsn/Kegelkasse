"""Penalty service: calculate totals, absent-member averages, session debts."""

from __future__ import annotations

from app.database.models import Session, SessionEntry


def calculate_entry_total(entry: SessionEntry) -> float:
    """Sum all penalty amounts for a single session entry."""
    return sum(p.amount for p in entry.penalties)


def calculate_session_total(session: Session) -> float:
    """Sum all penalties across all members in a session."""
    return sum(calculate_entry_total(e) for e in session.entries)


def calculate_absent_average(session: Session) -> float:
    """Calculate average penalty amount for present members."""
    present = [e for e in session.entries if not e.absent]
    if not present:
        return 0.0
    total = sum(calculate_entry_total(e) for e in present)
    return round(total / len(present), 2)


def apply_absent_averages(session: Session) -> Session:
    """Set the late_arrival_avg for absent members to the present-members average."""
    avg = calculate_absent_average(session)
    for entry in session.entries:
        if entry.absent:
            entry.late_arrival_avg = avg
    return session
