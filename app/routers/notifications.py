"""Notification settings management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from app.database.cosmos import CosmosDB, get_db
from app.database.models import User
from app.services.auth_service import require_auth
from app.services.email_service import NOTIF_DEFAULTS

router = APIRouter(tags=["notifications"])
templates = Jinja2Templates(directory="app/templates")

NOTIFICATION_TYPES: list[tuple[str, str, str]] = [
    ("new_penalty",          "Neue Strafe gebucht",          "Wenn nach einem Kegelabend eine Strafe für dich eingebucht wird"),
    ("session_approved",     "Kegelabend genehmigt",         "Wenn ein eingereichte Kegelabend genehmigt und Schulden gebucht werden"),
    ("monthly_fee",          "Monatsbeitrag gebucht",        "Wenn dein monatlicher Vereinsbeitrag gebucht wird"),
    ("debt_reminder",        "Schulden-Erinnerung",          "Wöchentliche Erinnerung bei offenen Schulden (montags)"),
    ("pending_session",      "Einreichung zur Freigabe",     "Wenn ein Kegelabend auf Genehmigung wartet — nur für Kassenwart & Admin"),
    ("monthly_summary",      "Monatszusammenfassung",        "Monatliche Übersicht über Schulden und Aktivitäten (1. des Monats)"),
    ("event_invitation",     "Neuer Termin im Kalender",     "Wenn ein neues Event angelegt wird und eine Rückmeldung erwartet wird"),
    ("rsvp_reminder",        "RSVP-Erinnerung",              "Erinnerung wenn du noch nicht auf eine Einladung geantwortet hast"),
    ("deadline_warning",     "Absagefrist läuft ab",         "Hinweis wenn die Absagefrist für einen Termin bald abläuft"),
    ("payment_received",     "Zahlung erhalten",             "Wenn eine Zahlung deinem Konto zugeordnet und Schulden abgehakt wurden"),
    ("late_payment_fee",     "Verspätungsstrafe",            "Wenn eine Verspätungsstrafe automatisch für dich gebucht wird"),
    ("new_poll",             "Neue Abstimmung",              "Wenn eine neue Abstimmung im Club erstellt wird"),
    ("poll_closing_soon",    "Abstimmung endet bald",        "Erinnerung 24 Stunden vor Ende einer Abstimmung (wenn noch nicht abgestimmt)"),
    ("poll_closed",          "Abstimmung abgeschlossen",     "Wenn eine Abstimmung beendet wird und das Ergebnis feststeht"),
]


def _get_user_settings(user_doc: dict, group_id: str) -> dict[str, bool]:
    """Return notification settings for a group, falling back to NOTIF_DEFAULTS."""
    stored = user_doc.get("notification_settings", {}).get(group_id)
    result: dict[str, bool] = {}
    for key, *_ in NOTIFICATION_TYPES:
        if isinstance(stored, dict):
            result[key] = stored.get(key, NOTIF_DEFAULTS.get(key, True))
        else:
            result[key] = NOTIF_DEFAULTS.get(key, True)
    return result


# ── GET ────────────────────────────────────────────────────────────────────────

@router.get("/profile/notifications")
async def notification_settings_page(
    request: Request,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    user_doc = db.read_item("users", current_user.id, current_user.id)
    if not user_doc:
        return RedirectResponse("/profile", status_code=302)

    # Load groups the user belongs to
    groups: list[dict] = []
    for gid in user_doc.get("group_ids", []):
        gdoc = db.read_item("groups", gid, gid)
        if gdoc:
            groups.append({
                "id": gid,
                "name": gdoc.get("name", gid),
                "settings": _get_user_settings(user_doc, gid),
            })

    active_group_id = request.query_params.get("group") or (groups[0]["id"] if groups else None)

    success = request.query_params.get("success") == "1"

    return templates.TemplateResponse("notifications.html", {
        "request": request,
        "user": current_user,
        "groups": groups,
        "active_group_id": active_group_id,
        "notification_types": NOTIFICATION_TYPES,
        "success": success,
    })


# ── POST ───────────────────────────────────────────────────────────────────────

@router.post("/profile/notifications/{group_id}")
async def update_notification_settings(
    request: Request,
    group_id: str,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    user_doc = db.read_item("users", current_user.id, current_user.id)
    if not user_doc or group_id not in user_doc.get("group_ids", []):
        return RedirectResponse("/profile/notifications", status_code=302)

    form_data = await request.form()

    new_settings: dict[str, bool] = {}
    for key, *_ in NOTIFICATION_TYPES:
        new_settings[key] = form_data.get(key) == "on"

    user_doc.setdefault("notification_settings", {})[group_id] = new_settings
    db.upsert_item("users", user_doc)

    return RedirectResponse(
        f"/profile/notifications?group={group_id}&success=1", status_code=302
    )
