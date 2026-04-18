"""Treasury routes: ledger, CSV import, manual transactions, payment matching."""

from fastapi import APIRouter

router = APIRouter(prefix="/group/{group_id}/treasury", tags=["treasury"])


@router.get("")
async def ledger(group_id: str):
    """GET — Transaction list with running balance (Kassenwart/Admin)."""
    ...


@router.get("/import")
async def import_page(group_id: str):
    """GET — CSV upload & match preview page."""
    ...


@router.post("/import")
async def import_csv(group_id: str):
    """POST — Upload Sparkasse CSV, parse, deduplicate, auto-match."""
    ...


@router.post("/import/confirm")
async def confirm_import(group_id: str):
    """POST — Confirm imported transactions and matches."""
    ...


@router.get("/transactions/new")
async def new_transaction_page(group_id: str):
    """GET — Manual transaction form."""
    ...


@router.post("/transactions/new")
async def create_transaction(group_id: str):
    """POST — Create manual income/expense entry."""
    ...
