"""Treasury routes: ledger, CSV import, manual transactions, payment matching."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.database.cosmos import CosmosDB, get_db
from app.database.models import (
    Debt,
    DebtEntry,
    DebtType,
    Log,
    LogVisibility,
    Role,
    Transaction,
    TransactionCategory,
    TransactionSource,
    TransactionType,
    User,
)
from app.services.auth_service import require_auth
from app.services.csv_import_service import MemberInfo, match_rows, parse_csv
from app.services.treasury_service import calculate_balance, check_late_payment, match_payment_to_debts

router = APIRouter(prefix="/group/{group_id}/treasury", tags=["treasury"])
templates = Jinja2Templates(directory="app/templates")


def _render(request: Request, template: str, **ctx):
    return templates.TemplateResponse(template, {"request": request, **ctx})


def _get_group_as_member(group_id: str, user: User, db: CosmosDB) -> Optional[dict]:
    doc = db.read_item("groups", group_id, group_id)
    if not doc:
        return None
    if user.id not in [m["user_id"] for m in doc.get("members", [])]:
        return None
    return doc


def _user_role(group_doc: dict, user_id: str) -> Optional[Role]:
    for m in group_doc.get("members", []):
        if m["user_id"] == user_id:
            return Role(m["role"])
    return None


def _can_manage(group_doc: dict, user_id: str) -> bool:
    role = _user_role(group_doc, user_id)
    return role in (Role.admin, Role.kassenwart)


def _write_log(db, group_id, actor, action, target_id=None, target_name=None, details="", visible_to=LogVisibility.kassenwart_admin):
    log = Log(
        group_id=group_id,
        actor_id=actor.id,
        actor_name=actor.full_name,
        action=action,
        target_id=target_id,
        target_name=target_name,
        details=details,
        visible_to=visible_to,
    )
    db.upsert_item("logs", log.model_dump(mode="json"))


def _get_or_create_debt_doc(user_id: str, group_id: str, db: CosmosDB) -> dict:
    docs = db.query_items(
        "debts",
        "SELECT * FROM c WHERE c.user_id = @uid AND c.group_id = @gid",
        parameters=[{"name": "@uid", "value": user_id}, {"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    if docs:
        return docs[0]
    debt = Debt(user_id=user_id, group_id=group_id)
    db.upsert_item("debts", debt.model_dump(mode="json"))
    return debt.model_dump(mode="json")


# ── Ledger ────────────────────────────────────────────────────────────────────

@router.get("", response_class=HTMLResponse)
async def ledger(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc:
        return RedirectResponse("/dashboard", status_code=302)

    can_manage = _can_manage(group_doc, current_user.id)
    role = _user_role(group_doc, current_user.id)

    transactions = db.query_items(
        "transactions",
        "SELECT * FROM c WHERE c.group_id = @gid ORDER BY c.date DESC",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )

    opening_balance = group_doc.get("treasury", {}).get("opening_balance", 0.0)
    from app.database.models import Transaction as TModel
    tx_objects = []
    for t in transactions:
        try:
            tx_objects.append(TModel(**t))
        except Exception:
            pass
    balance = calculate_balance(opening_balance, tx_objects)

    # Staleness check: does current month have a CSV import?
    now = datetime.now(UTC)
    current_month = now.strftime("%Y-%m")
    has_import_this_month = any(
        t.get("source") == "csv_import" and (t.get("date") or "")[:7] == current_month
        for t in transactions
    )
    last_import = next(
        (t for t in transactions if t.get("source") == "csv_import"),
        None,
    )
    last_import_date = last_import.get("created_at", "")[:10] if last_import else None

    # Resolve user names for matched transactions
    user_ids = list({t.get("matched_user_id") for t in transactions if t.get("matched_user_id")})
    user_names: dict[str, str] = {}
    for uid in user_ids:
        doc = db.read_item("users", uid, uid)
        if doc:
            user_names[uid] = f"{doc.get('first_name','')} {doc.get('last_name','')}".strip()

    # Build running balance list (ascending order for running calc)
    tx_asc = sorted(transactions, key=lambda t: t.get("date", ""))
    running = opening_balance
    running_balances: dict[str, float] = {}
    for t in tx_asc:
        amount = t.get("amount", 0)
        if t.get("type") == "income":
            running += amount
        else:
            running -= abs(amount)
        running_balances[t["id"]] = round(running, 2)

    return _render(
        request, "treasury.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="treasury",
        role=role.value if role else "mitglied",
        can_manage=can_manage,
        transactions=transactions,
        balance=balance,
        opening_balance=opening_balance,
        has_import_this_month=has_import_this_month,
        last_import_date=last_import_date,
        user_names=user_names,
        running_balances=running_balances,
        current_user=current_user,
        success=request.query_params.get("success"),
    )


# ── CSV import ────────────────────────────────────────────────────────────────

@router.get("/import", response_class=HTMLResponse)
async def import_page(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/treasury", status_code=302)

    return _render(
        request, "treasury_import.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="treasury",
        role=_user_role(group_doc, current_user.id).value,
        current_user=current_user,
        error=request.query_params.get("error"),
    )


@router.post("/import", response_class=HTMLResponse)
async def import_csv(
    request: Request,
    group_id: str,
    csv_file: UploadFile = File(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/treasury", status_code=302)

    content = await csv_file.read()
    if not content:
        return RedirectResponse(f"/group/{group_id}/treasury/import?error=empty", status_code=302)

    try:
        rows = parse_csv(content)
    except Exception as exc:
        return RedirectResponse(f"/group/{group_id}/treasury/import?error=parse", status_code=302)

    if not rows:
        return RedirectResponse(f"/group/{group_id}/treasury/import?error=norows", status_code=302)

    # Existing hashes to deduplicate
    existing_txs = db.query_items(
        "transactions",
        "SELECT c.csv_row_hash FROM c WHERE c.group_id = @gid AND c.source = 'csv_import'",
        parameters=[{"name": "@gid", "value": group_id}],
        partition_key=group_id,
    )
    existing_hashes = {t["csv_row_hash"] for t in existing_txs if t.get("csv_row_hash")}

    # Build member info for matching
    members = group_doc.get("members", [])
    member_infos: list[MemberInfo] = []
    for m in members:
        udoc = db.read_item("users", m["user_id"], m["user_id"])
        if udoc:
            member_infos.append(MemberInfo(
                user_id=m["user_id"],
                full_name=f"{udoc.get('first_name','')} {udoc.get('last_name','')}".strip(),
                iban=m.get("iban") or udoc.get("iban"),
            ))

    results = match_rows(rows, member_infos, existing_hashes)
    skipped = len(rows) - len(results)

    if not results:
        return RedirectResponse(f"/group/{group_id}/treasury/import?error=alldupe", status_code=302)

    # Collect member names for dropdown
    all_members = []
    for m in members:
        udoc = db.read_item("users", m["user_id"], m["user_id"])
        if udoc:
            all_members.append({
                "user_id": m["user_id"],
                "name": f"{udoc.get('first_name','')} {udoc.get('last_name','')}".strip(),
            })

    # Serialize results for the confirm form
    serialized = []
    for r in results:
        serialized.append({
            "date": r.row.buchungstag.date().isoformat(),
            "name": r.row.name,
            "iban": r.row.iban,
            "buchungstext": r.row.buchungstext,
            "verwendungszweck": r.row.verwendungszweck,
            "amount": r.row.amount,
            "raw_hash": r.row.raw_hash,
            "matched_user_id": r.matched_user_id or "",
            "match_confidence": r.match_confidence,
            "is_expense": r.is_expense,
            "category_suggestion": r.category_suggestion,
        })

    return _render(
        request, "treasury_import_confirm.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="treasury",
        role=_user_role(group_doc, current_user.id).value,
        results=serialized,
        skipped=skipped,
        all_members=all_members,
        rows_json=json.dumps(serialized),
        current_user=current_user,
    )


@router.post("/import/confirm")
async def confirm_import(
    request: Request,
    group_id: str,
    rows_json: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/treasury", status_code=302)

    form_data = await request.form()
    rows = json.loads(rows_json)
    late_fee = group_doc.get("treasury", {}).get("late_payment_fee", 0.0)
    created = 0

    for i, row in enumerate(rows):
        skip = form_data.get(f"skip_{i}") == "on"
        if skip:
            continue

        matched_user_id = form_data.get(f"user_{i}") or row.get("matched_user_id") or None
        category = form_data.get(f"category_{i}") or row.get("category_suggestion") or "other_income"
        amount = abs(row["amount"])
        tx_type = TransactionType.expense if row["is_expense"] else TransactionType.income

        if category not in [c.value for c in TransactionCategory]:
            category = "other_income" if not row["is_expense"] else "other_expense"

        description = row.get("verwendungszweck") or row.get("buchungstext") or row.get("name", "")

        tx = Transaction(
            group_id=group_id,
            date=datetime.fromisoformat(row["date"] + "T00:00:00+00:00"),
            type=tx_type,
            category=TransactionCategory(category),
            amount=amount,
            description=description,
            matched_user_id=matched_user_id if matched_user_id else None,
            source=TransactionSource.csv_import,
            csv_row_hash=row["raw_hash"],
            created_by=current_user.id,
        )
        db.upsert_item("transactions", tx.model_dump(mode="json"))
        created += 1

        # Match payment to debts if income + member matched
        if tx_type == TransactionType.income and matched_user_id:
            debt_doc = _get_or_create_debt_doc(matched_user_id, group_id, db)
            payment_date_obj = datetime.fromisoformat(row["date"] + "T00:00:00+00:00").date()

            # Check for late fees before matching
            if late_fee > 0:
                for entry in debt_doc.get("entries", []):
                    if entry.get("paid") or entry.get("cancelled"):
                        continue
                    from app.database.models import DebtEntry as DE
                    de = DE(**entry)
                    late_entry = check_late_payment(de, payment_date_obj, late_fee)
                    if late_entry:
                        debt_doc["entries"].append(late_entry.model_dump(mode="json"))
                        _write_log(db, group_id, current_user, "late_payment_fee_applied",
                                   target_id=matched_user_id,
                                   details=f"Verspätungsstrafe {late_fee:.2f} € automatisch gebucht",
                                   visible_to=LogVisibility.all)

            from app.database.models import Debt as DModel
            debt_obj = DModel(**debt_doc)
            match_payment_to_debts(debt_obj, amount, tx.id, payment_date_obj)
            db.upsert_item("debts", debt_obj.model_dump(mode="json"))

    _write_log(
        db, group_id, current_user, "csv_import",
        details=f"CSV-Import: {created} Transaktionen importiert",
        visible_to=LogVisibility.kassenwart_admin,
    )

    return RedirectResponse(f"/group/{group_id}/treasury?success=import", status_code=302)


# ── Manual transaction ────────────────────────────────────────────────────────

@router.get("/transactions/new", response_class=HTMLResponse)
async def new_transaction_page(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/treasury", status_code=302)

    members = group_doc.get("members", [])
    all_members = []
    for m in members:
        udoc = db.read_item("users", m["user_id"], m["user_id"])
        if udoc:
            all_members.append({
                "user_id": m["user_id"],
                "name": f"{udoc.get('first_name','')} {udoc.get('last_name','')}".strip(),
            })

    today = datetime.now(UTC).date().isoformat()

    return _render(
        request, "treasury_transaction_new.html",
        group_id=group_id,
        group_name=group_doc.get("name", ""),
        active="treasury",
        role=_user_role(group_doc, current_user.id).value,
        all_members=all_members,
        categories=TransactionCategory,
        current_user=current_user,
        today=today,
        error=request.query_params.get("error"),
    )


@router.post("/transactions/new")
async def create_transaction(
    group_id: str,
    tx_type: str = Form(...),
    category: str = Form(...),
    amount: float = Form(...),
    description: str = Form(...),
    date_str: str = Form(...),
    matched_user_id: str = Form(""),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    group_doc = _get_group_as_member(group_id, current_user, db)
    if not group_doc or not _can_manage(group_doc, current_user.id):
        return RedirectResponse(f"/group/{group_id}/treasury", status_code=302)

    try:
        tx_date = datetime.fromisoformat(date_str + "T00:00:00+00:00")
    except ValueError:
        tx_date = datetime.now(UTC)

    tx = Transaction(
        group_id=group_id,
        date=tx_date,
        type=TransactionType(tx_type),
        category=TransactionCategory(category),
        amount=abs(amount),
        description=description,
        matched_user_id=matched_user_id or None,
        source=TransactionSource.manual,
        created_by=current_user.id,
    )
    db.upsert_item("transactions", tx.model_dump(mode="json"))

    # Match payment to debts if income + member matched
    if tx.type == TransactionType.income and matched_user_id:
        late_fee = group_doc.get("treasury", {}).get("late_payment_fee", 0.0)
        debt_doc = _get_or_create_debt_doc(matched_user_id, group_id, db)
        if late_fee > 0:
            for entry in debt_doc.get("entries", []):
                if entry.get("paid") or entry.get("cancelled"):
                    continue
                from app.database.models import DebtEntry as DE
                de = DE(**entry)
                late_entry = check_late_payment(de, tx_date.date(), late_fee)
                if late_entry:
                    debt_doc["entries"].append(late_entry.model_dump(mode="json"))
        from app.database.models import Debt as DModel
        debt_obj = DModel(**debt_doc)
        match_payment_to_debts(debt_obj, abs(amount), tx.id, tx_date.date())
        db.upsert_item("debts", debt_obj.model_dump(mode="json"))

    _write_log(
        db, group_id, current_user, "manual_transaction",
        details=f"{'Einnahme' if tx_type == 'income' else 'Ausgabe'}: {description} ({amount:.2f} €)",
        visible_to=LogVisibility.kassenwart_admin,
    )

    return RedirectResponse(f"/group/{group_id}/treasury?success=tx", status_code=302)
