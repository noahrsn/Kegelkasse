"""Unit tests for CSV import service — parsing, deduplication, matching."""

from datetime import datetime


from app.services.csv_import_service import (
    CSVRow,
    MemberInfo,
    match_rows,
    normalize_name,
    parse_amount,
    parse_csv,
    row_hash,
)

# Minimal Sparkasse-format CSV (Latin-1, semicolons, 15+ columns)
SAMPLE_CSV = (
    b'"Buchungskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";'
    b'"Glaeubiger-ID";"Mandatsreferenz";"Kundenreferenz";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";'
    b'"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Glaeubiger-ID";"Mandatsreferenz"\n'
    b'"DE12345";"01.04.26";"01.04.26";"GUTSCHR. UEBERWEISUNG";"Strafen Maerz";"";"";"";"";"";"";'
    b'"Noah Roosen";"DE81320500000002802569";"SSKMDEMMXXX";"25,00";"";"";\n'
    b'"DE12345";"02.04.26";"02.04.26";"UEBERTRAG (UEBERWEISUNG)";"Bahnmiete";"";"";"";"";"";"";'
    b'"Kegelanlage GmbH";"DE00000000000000000000";"SSKMDEMMXXX";"-50,00";"";"";\n'
)


def _make_row(
    *,
    name: str = "Test User",
    iban: str = "DE00000",
    amount: float = 10.0,
    hash_val: str = "testhash",
) -> CSVRow:
    return CSVRow(
        buchungstag=datetime(2026, 4, 1),
        valutadatum=datetime(2026, 4, 1),
        buchungstext="GUTSCHR. UEBERWEISUNG",
        verwendungszweck="",
        name=name,
        iban=iban,
        bic="SSKMDEMMXXX",
        amount=amount,
        raw_hash=hash_val,
    )


# ── Parsing helpers ───────────────────────────────────────────────────────────


class TestParseAmount:
    def test_positive(self):
        assert parse_amount("25,00") == 25.0

    def test_negative(self):
        assert parse_amount("-305,00") == -305.0

    def test_with_whitespace(self):
        assert parse_amount("  10,50  ") == 10.5


class TestNormalizeName:
    def test_uppercase(self):
        assert normalize_name("NOAH ROOSEN") == "noah roosen"

    def test_extra_whitespace(self):
        assert normalize_name("  Max  Mustermann  ") == "max mustermann"

    def test_already_normalized(self):
        assert normalize_name("hans meier") == "hans meier"


class TestRowHash:
    def test_deterministic(self):
        assert row_hash(b"hello") == row_hash(b"hello")

    def test_different_inputs_differ(self):
        assert row_hash(b"hello") != row_hash(b"world")

    def test_returns_hex_string(self):
        h = row_hash(b"test")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# ── CSV parsing ───────────────────────────────────────────────────────────────


class TestParseCsv:
    def test_parses_income_row(self):
        rows = parse_csv(SAMPLE_CSV)
        income = [r for r in rows if r.amount > 0]
        assert len(income) >= 1
        assert income[0].name == "Noah Roosen"
        assert income[0].iban == "DE81320500000002802569"
        assert income[0].amount == 25.0

    def test_parses_expense_row(self):
        rows = parse_csv(SAMPLE_CSV)
        expenses = [r for r in rows if r.amount < 0]
        assert len(expenses) >= 1
        assert expenses[0].amount == -50.0

    def test_row_hash_populated(self):
        rows = parse_csv(SAMPLE_CSV)
        for row in rows:
            assert row.raw_hash and len(row.raw_hash) == 64


# ── Deduplication ─────────────────────────────────────────────────────────────


class TestDeduplication:
    def test_existing_hash_skipped(self):
        row = _make_row(hash_val="known_hash")
        results = match_rows([row], [], existing_hashes={"known_hash"})
        assert results == []

    def test_new_hash_included(self):
        row = _make_row(hash_val="new_hash")
        results = match_rows([row], [], existing_hashes=set())
        assert len(results) == 1

    def test_mixed_hashes(self):
        rows = [_make_row(hash_val="h1"), _make_row(hash_val="h2"), _make_row(hash_val="h3")]
        results = match_rows(rows, [], existing_hashes={"h1", "h3"})
        assert len(results) == 1
        assert results[0].row.raw_hash == "h2"


# ── Member matching ───────────────────────────────────────────────────────────


class TestMemberMatching:
    def test_iban_match(self):
        members = [MemberInfo(user_id="u1", full_name="Noah Roosen", iban="DE81320500000002802569")]
        row = _make_row(iban="DE81320500000002802569", name="NOAH ROOSEN", amount=25.0, hash_val="h1")
        results = match_rows([row], members, set())
        assert results[0].matched_user_id == "u1"
        assert results[0].match_confidence == "iban"

    def test_iban_with_spaces_normalized(self):
        members = [MemberInfo(user_id="u1", full_name="Noah Roosen", iban="DE81 3205 0000 0002 8025 69")]
        row = _make_row(iban="DE81320500000002802569", amount=25.0, hash_val="h1")
        results = match_rows([row], members, set())
        assert results[0].matched_user_id == "u1"
        assert results[0].match_confidence == "iban"

    def test_name_match_case_insensitive(self):
        members = [MemberInfo(user_id="u2", full_name="Max Mustermann")]
        row = _make_row(iban="", name="MAX MUSTERMANN", amount=25.0, hash_val="h2")
        results = match_rows([row], members, set())
        assert results[0].matched_user_id == "u2"
        assert results[0].match_confidence == "name"

    def test_no_match(self):
        members = [MemberInfo(user_id="u3", full_name="Hans Meier", iban="DE99999")]
        row = _make_row(iban="DE00001", name="Unknown Person", amount=25.0, hash_val="h3")
        results = match_rows([row], members, set())
        assert results[0].matched_user_id is None
        assert results[0].match_confidence == "none"

    def test_expense_flagged(self):
        row = _make_row(amount=-50.0, hash_val="h4")
        results = match_rows([row], [], set())
        assert results[0].is_expense is True

    def test_income_not_flagged_as_expense(self):
        row = _make_row(amount=25.0, hash_val="h5")
        results = match_rows([row], [], set())
        assert results[0].is_expense is False

    def test_iban_preferred_over_name(self):
        """If both IBAN and name match different members, IBAN wins."""
        m_iban = MemberInfo(user_id="iban_user", full_name="Other Person", iban="DE12345")
        m_name = MemberInfo(user_id="name_user", full_name="Noah Roosen")
        row = _make_row(iban="DE12345", name="NOAH ROOSEN", amount=10.0, hash_val="h6")
        results = match_rows([row], [m_iban, m_name], set())
        assert results[0].matched_user_id == "iban_user"
        assert results[0].match_confidence == "iban"
