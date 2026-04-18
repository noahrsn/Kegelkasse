"""Treasury service: balance calculation, payment matching, late fee checks."""

from __future__ import annotations

from datetime import date
from typing import Optional

from app.database.models import (
    Debt,
    DebtEntry,
    DebtType,
    Transaction,
    TransactionType,
)


def calculate_balance(
    opening_balance: float, transactions: list[Transaction]
) -> float:
    """Calculate current balance: opening + sum(income) - sum(expense)."""
    total = opening_balance
    for t in transactions:
        if t.type == TransactionType.income:
            total += t.amount
        else:
            total -= abs(t.amount)
    return round(total, 2)


def match_payment_to_debts(
    debt: Debt, payment_amount: float, transaction_id: str, payment_date: date
) -> float:
    """Match a payment against the oldest open debt entries (FIFO).

    Returns the remaining unmatched amount (overpayment).
    """
    remaining = payment_amount
    for entry in sorted(debt.entries, key=lambda e: e.created_at):
        if entry.paid or entry.cancelled or remaining <= 0:
            continue
        if remaining >= entry.amount:
            entry.paid = True
            entry.paid_at = payment_date  # type: ignore[assignment]
            entry.transaction_id = transaction_id
            remaining -= entry.amount
        else:
            # Partial payment — don't mark as paid, remaining goes to 0
            remaining = 0
    return round(remaining, 2)


def check_late_payment(
    entry: DebtEntry,
    payment_date: date,
    late_fee_amount: float,
) -> Optional[DebtEntry]:
    """Check if a payment was late and return a late fee entry if so."""
    if not entry.due_date:
        return None
    due = entry.due_date.date() if hasattr(entry.due_date, "date") else entry.due_date
    if payment_date > due and late_fee_amount > 0:
        return DebtEntry(
            type=DebtType.late_payment_fee,
            amount=late_fee_amount,
            description=f"Verspätungsstrafe — Zahlung am {payment_date}, Frist war {due}",
        )
    return None
