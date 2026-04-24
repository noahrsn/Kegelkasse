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


def open_debt_total(entries: list) -> float:
    """Calculate net open debt across a list of debt entry dicts or DebtEntry objects.

    Credit entries (overpayments) are subtracted from the total.
    """
    total = 0.0
    for e in entries:
        if isinstance(e, dict):
            paid = e.get("paid", False)
            cancelled = e.get("cancelled", False)
            amount = e.get("amount", 0)
            dtype = e.get("type", "")
        else:
            paid = e.paid
            cancelled = e.cancelled
            amount = e.amount
            dtype = e.type.value if hasattr(e.type, "value") else str(e.type)

        if paid or cancelled:
            continue
        if dtype == DebtType.credit:
            total -= amount
        else:
            total += amount
    return round(total, 2)


def match_payment_to_debts(
    debt: Debt, payment_amount: float, transaction_id: str, payment_date: date
) -> float:
    """Match a payment against the oldest open debt entries (FIFO).

    Returns the remaining unmatched amount (overpayment). If overpayment > 0,
    a credit entry is added to the debt object so future debts are offset.
    """
    remaining = payment_amount
    for entry in sorted(debt.entries, key=lambda e: e.created_at):
        if entry.paid or entry.cancelled or entry.type == DebtType.credit or remaining <= 0:
            continue
        if remaining >= entry.amount:
            entry.paid = True
            entry.paid_at = payment_date  # type: ignore[assignment]
            entry.transaction_id = transaction_id
            remaining -= entry.amount
        else:
            # Partial payment — don't mark as paid, remaining goes to 0
            remaining = 0

    overpayment = round(remaining, 2)
    if overpayment > 0:
        credit_entry = DebtEntry(
            type=DebtType.credit,
            amount=overpayment,
            description=f"Guthaben aus Überzahlung ({payment_date})",
            transaction_id=transaction_id,
        )
        debt.entries.append(credit_entry)

    return overpayment


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
