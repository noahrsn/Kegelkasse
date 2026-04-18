"""Sparkasse CSV import service.

Parses the Sparkasse export format (semicolon-separated, Latin-1 encoded)
and provides matching logic against club members.
"""

from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class CSVRow:
    """Parsed row from a Sparkasse CSV export."""

    buchungstag: datetime
    valutadatum: datetime
    buchungstext: str
    verwendungszweck: str
    name: str  # Beguenstigter/Zahlungspflichtiger
    iban: str
    bic: str
    amount: float  # positive = income, negative = expense
    raw_hash: str  # SHA-256 of the original CSV row bytes


@dataclass
class MatchResult:
    """Result of matching a CSV row to a club member."""

    row: CSVRow
    matched_user_id: Optional[str] = None
    match_confidence: str = "none"  # "iban" | "name" | "none"
    is_expense: bool = False
    category_suggestion: str = ""


# Sparkasse CSV column indices
COL_BUCHUNGSTAG = 1
COL_VALUTADATUM = 2
COL_BUCHUNGSTEXT = 3
COL_VERWENDUNGSZWECK = 4
COL_NAME = 11
COL_IBAN = 12
COL_BIC = 13
COL_BETRAG = 14


# Buchungstext types that are bank statements, not member payments
BANK_STATEMENT_TYPES = {"ABSCHLUSS"}


def parse_date(date_str: str) -> datetime:
    """Parse Sparkasse date format DD.MM.YY."""
    return datetime.strptime(date_str.strip(), "%d.%m.%y")


def parse_amount(amount_str: str) -> float:
    """Parse German decimal format: '25,00' → 25.0, '-305,00' → -305.0."""
    return float(amount_str.strip().replace(",", "."))


def row_hash(raw_line: bytes) -> str:
    """SHA-256 hash of the raw CSV row for deduplication."""
    return hashlib.sha256(raw_line).hexdigest()


def normalize_name(name: str) -> str:
    """Normalize a name for fuzzy matching: lowercase, strip whitespace."""
    return " ".join(name.lower().split())


def parse_csv(file_content: bytes) -> list[CSVRow]:
    """Parse a Sparkasse CSV file and return structured rows.

    The file is expected to be Latin-1 encoded with semicolon separators.
    """
    text = file_content.decode("iso-8859-1")
    rows: list[CSVRow] = []

    reader = csv.reader(io.StringIO(text), delimiter=";", quotechar='"')
    raw_lines = file_content.split(b"\n")

    for i, fields in enumerate(reader):
        if i == 0:
            continue  # skip header

        if len(fields) < 15:
            continue

        buchungstext = fields[COL_BUCHUNGSTEXT].strip()
        if buchungstext in BANK_STATEMENT_TYPES:
            # Bank quarterly statements — handled as bank_interest category
            pass  # still include, but flag differently

        try:
            amount = parse_amount(fields[COL_BETRAG])
        except ValueError:
            continue

        raw = raw_lines[i] if i < len(raw_lines) else b""
        rows.append(
            CSVRow(
                buchungstag=parse_date(fields[COL_BUCHUNGSTAG]),
                valutadatum=parse_date(fields[COL_VALUTADATUM]),
                buchungstext=buchungstext,
                verwendungszweck=fields[COL_VERWENDUNGSZWECK].strip(),
                name=fields[COL_NAME].strip(),
                iban=fields[COL_IBAN].strip(),
                bic=fields[COL_BIC].strip(),
                amount=amount,
                raw_hash=row_hash(raw),
            )
        )

    return rows


@dataclass
class MemberInfo:
    """Minimal member info needed for matching."""

    user_id: str
    full_name: str
    iban: Optional[str] = None


def match_rows(
    rows: list[CSVRow],
    members: list[MemberInfo],
    existing_hashes: set[str],
) -> list[MatchResult]:
    """Match parsed CSV rows to club members.

    Skips rows that already exist in the database (by hash).
    Priority: IBAN match > name match > no match.
    """
    # Build lookup indexes
    iban_index: dict[str, str] = {}
    name_index: dict[str, str] = {}
    for m in members:
        if m.iban:
            iban_index[m.iban.replace(" ", "")] = m.user_id
        name_index[normalize_name(m.full_name)] = m.user_id

    results: list[MatchResult] = []
    for row in rows:
        if row.raw_hash in existing_hashes:
            continue  # already imported

        result = MatchResult(row=row)

        if row.amount < 0:
            result.is_expense = True
            result.category_suggestion = "event_expense"
        elif row.buchungstext in BANK_STATEMENT_TYPES:
            result.category_suggestion = "bank_interest"
        else:
            # Try IBAN match first
            clean_iban = row.iban.replace(" ", "")
            if clean_iban in iban_index:
                result.matched_user_id = iban_index[clean_iban]
                result.match_confidence = "iban"
            else:
                # Try name match
                normalized = normalize_name(row.name)
                if normalized in name_index:
                    result.matched_user_id = name_index[normalized]
                    result.match_confidence = "name"

        results.append(result)

    return results
