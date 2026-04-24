"""Email service: SendGrid integration with development console fallback."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from app.config import get_settings

if TYPE_CHECKING:
    from app.database.cosmos import CosmosDB

logger = logging.getLogger(__name__)

# Default opt-in state per notification type (mirrors NotificationSettings model defaults)
NOTIF_DEFAULTS: dict[str, bool] = {
    "new_penalty": True,
    "session_approved": True,
    "monthly_fee": True,
    "debt_reminder": True,
    "pending_session": True,
    "monthly_summary": True,
    "event_invitation": True,
    "rsvp_reminder": True,
    "deadline_warning": True,
    "late_rsvp_kassenwart": True,
    "payment_received": True,
    "late_payment_fee": True,
    "new_poll": True,
    "poll_closing_soon": True,
    "poll_closed": False,
}


# ── Core send ──────────────────────────────────────────────────────────────────

def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Send an email via SendGrid (production) or log to console (development)."""
    settings = get_settings()

    if not settings.is_production:
        logger.info("DEV EMAIL → to=%s subject=%s", to_email, subject)
        return True

    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail

    message = Mail(
        from_email=settings.sendgrid_from_email,
        to_emails=to_email,
        subject=subject,
        html_content=html_content,
    )
    try:
        client = SendGridAPIClient(settings.sendgrid_api_key)
        response = client.send(message)
        return response.status_code in (200, 201, 202)
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False


def send_verification_email(to_email: str, token: str) -> bool:
    settings = get_settings()
    link = f"{settings.app_base_url}/verify-email?token={token}"
    return send_email(
        to_email,
        "Kegelkasse — E-Mail bestätigen",
        _base_html(
            "E-Mail-Adresse bestätigen",
            "<p>Bitte bestätige deine E-Mail-Adresse, um Kegelkasse nutzen zu können.</p>",
            link, "E-Mail bestätigen",
        ),
    )


def send_password_reset_email(to_email: str, token: str) -> bool:
    settings = get_settings()
    link = f"{settings.app_base_url}/reset-password?token={token}"
    return send_email(
        to_email,
        "Kegelkasse — Passwort zurücksetzen",
        _base_html(
            "Passwort zurücksetzen",
            "<p>Du hast eine Passwort-Zurücksetzung angefordert. Klicke auf den Button um fortzufahren.</p>"
            "<p>Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>",
            link, "Passwort zurücksetzen",
        ),
    )


# ── Notification helpers ───────────────────────────────────────────────────────

def _should_notify(user_doc: dict, group_id: str, notif_type: str) -> bool:
    """Return True if the user has this notification type enabled for the group."""
    settings = user_doc.get("notification_settings", {})
    group_settings = settings.get(group_id)
    if group_settings is None:
        return NOTIF_DEFAULTS.get(notif_type, True)
    if isinstance(group_settings, dict):
        return group_settings.get(notif_type, NOTIF_DEFAULTS.get(notif_type, True))
    return NOTIF_DEFAULTS.get(notif_type, True)


def notify_member(
    db: "CosmosDB",
    user_id: str,
    group_id: str,
    notif_type: str,
    subject: str,
    html: str,
) -> bool:
    """Send a notification email to one member if they have the type enabled."""
    try:
        user_doc = db.read_item("users", user_id, user_id)
        if not user_doc or not user_doc.get("email"):
            return False
        if not _should_notify(user_doc, group_id, notif_type):
            return False
        return send_email(user_doc["email"], subject, html)
    except Exception:
        logger.exception("notify_member failed for user=%s notif=%s", user_id, notif_type)
        return False


def notify_group_members(
    db: "CosmosDB",
    group_doc: dict,
    notif_type: str,
    subject: str,
    html: str,
    role_filter: Optional[list[str]] = None,
) -> int:
    """Broadcast a notification email to all group members (with optional role filter).

    Returns the number of emails successfully dispatched.
    """
    group_id = group_doc["id"]
    sent = 0
    for member in group_doc.get("members", []):
        if role_filter and member.get("role") not in role_filter:
            continue
        sent += notify_member(db, member["user_id"], group_id, notif_type, subject, html)
    return sent


# ── HTML email template ────────────────────────────────────────────────────────

def _base_html(title: str, body_html: str, cta_url: str = "", cta_label: str = "") -> str:
    cta_block = ""
    if cta_url and cta_label:
        cta_block = (
            f'<div style="margin-top:24px;">'
            f'<a href="{cta_url}" style="display:inline-block;padding:12px 24px;'
            f'background:#F0A030;color:#000;font-weight:700;text-decoration:none;'
            f'border-radius:8px;font-size:14px;">{cta_label}</a></div>'
        )
    settings = get_settings()
    base = settings.app_base_url
    return (
        "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1.0'></head>"
        "<body style='margin:0;padding:0;background:#0C0C0F;"
        "font-family:Helvetica Neue,Arial,sans-serif;'>"
        "<div style='max-width:560px;margin:0 auto;padding:32px 20px;'>"
        "<div style='font-size:20px;font-weight:900;letter-spacing:3px;"
        "margin-bottom:28px;color:#EEE8E0;'>KEGEL<span style='color:#F0A030;'>KASSE</span></div>"
        "<div style='background:#131318;border-radius:12px;padding:28px;"
        "border:1px solid rgba(255,255,255,0.07);'>"
        f"<h2 style='margin:0 0 14px;font-size:17px;font-weight:700;color:#EEE8E0;'>{title}</h2>"
        f"<div style='font-size:14px;line-height:1.65;color:rgba(238,232,224,0.78);'>{body_html}</div>"
        f"{cta_block}"
        "</div>"
        "<p style='font-size:11px;color:rgba(238,232,224,0.25);margin-top:20px;text-align:center;'>"
        f"Kegelkasse &middot; <a href='{base}/profile/notifications' "
        "style='color:rgba(238,232,224,0.35);'>Benachrichtigungen anpassen</a></p>"
        "</div></body></html>"
    )


# ── Notification email builders ────────────────────────────────────────────────

def build_new_penalty(
    first_name: str, group_name: str, description: str, amount: float, group_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Neue Strafe: {amount:.2f} €"
    html = _base_html(
        "Neue Strafe gebucht",
        f"<p>Hallo {first_name},</p>"
        f"<p>für dich wurde eine neue Strafe im Club <strong>{group_name}</strong> gebucht:</p>"
        f"<p style='background:rgba(255,77,77,0.1);padding:12px;border-radius:8px;"
        f"border-left:3px solid #FF4D4D;'><strong>{description}</strong><br>"
        f"<span style='color:#F0A030;font-size:18px;font-weight:700;'>{amount:.2f} €</span></p>",
        f"{base}/group/{group_id}/debts", "Meine Schulden anzeigen",
    )
    return subject, html


def build_session_approved(
    first_name: str, group_name: str, date_display: str, group_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Kegelabend {date_display} genehmigt"
    html = _base_html(
        "Kegelabend genehmigt",
        f"<p>Hallo {first_name},</p>"
        f"<p>der Kegelabend vom <strong>{date_display}</strong> im Club <strong>{group_name}</strong> "
        f"wurde genehmigt. Die Schulden wurden eingebucht.</p>",
        f"{base}/group/{group_id}/debts", "Schulden ansehen",
    )
    return subject, html


def build_monthly_fee(
    first_name: str, group_name: str, amount: float, period: str, group_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Monatsbeitrag {period} gebucht"
    html = _base_html(
        f"Monatsbeitrag {period}",
        f"<p>Hallo {first_name},</p>"
        f"<p>dein Monatsbeitrag für <strong>{period}</strong> im Club <strong>{group_name}</strong> "
        f"wurde gebucht: <strong style='color:#F0A030;'>{amount:.2f} €</strong></p>",
        f"{base}/group/{group_id}/debts", "Schulden ansehen",
    )
    return subject, html


def build_debt_reminder(
    first_name: str, group_name: str, total_debt: float, group_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Offene Schulden: {total_debt:.2f} €"
    html = _base_html(
        "Erinnerung: offene Schulden",
        f"<p>Hallo {first_name},</p>"
        f"<p>du hast noch offene Schulden im Club <strong>{group_name}</strong>:</p>"
        f"<p style='font-size:24px;font-weight:700;color:#FF4D4D;'>{total_debt:.2f} €</p>"
        f"<p>Bitte überweise den Betrag zeitnah.</p>",
        f"{base}/group/{group_id}/debts", "Schulden ansehen",
    )
    return subject, html


def build_pending_session(
    group_name: str, submitted_by: str, date_display: str, group_id: str, session_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Kegelabend eingereicht — Freigabe nötig"
    html = _base_html(
        "Kegelabend wartet auf Freigabe",
        f"<p><strong>{submitted_by}</strong> hat den Kegelabend vom "
        f"<strong>{date_display}</strong> im Club <strong>{group_name}</strong> eingereicht.</p>"
        f"<p>Bitte prüfe und genehmige die Einreichung.</p>",
        f"{base}/group/{group_id}/sessions/pending", "Zur Freigabe",
    )
    return subject, html


def build_event_invitation(
    first_name: str, group_name: str, event_title: str, date_display: str,
    group_id: str, event_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Neuer Termin: {event_title}"
    html = _base_html(
        f"Neuer Termin: {event_title}",
        f"<p>Hallo {first_name},</p>"
        f"<p>im Club <strong>{group_name}</strong> wurde ein neuer Termin angelegt:</p>"
        f"<p style='background:rgba(240,160,48,0.08);padding:12px;border-radius:8px;"
        f"border-left:3px solid #F0A030;'><strong>{event_title}</strong><br>"
        f"<span style='color:rgba(238,232,224,0.6);'>{date_display}</span></p>"
        f"<p>Bitte gib deine Rückmeldung ab.</p>",
        f"{base}/group/{group_id}/calendar/{event_id}", "Zum Termin",
    )
    return subject, html


def build_rsvp_reminder(
    first_name: str, group_name: str, event_title: str,
    deadline_display: str, group_id: str, event_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Erinnerung: RSVP für {event_title}"
    html = _base_html(
        "Rückmeldung noch ausstehend",
        f"<p>Hallo {first_name},</p>"
        f"<p>du hast noch keine Rückmeldung für den Termin <strong>{event_title}</strong> "
        f"im Club <strong>{group_name}</strong> abgegeben.</p>"
        f"<p>Absagefrist: <strong>{deadline_display}</strong></p>",
        f"{base}/group/{group_id}/calendar/{event_id}", "Jetzt rückmelden",
    )
    return subject, html


def build_deadline_warning(
    first_name: str, group_name: str, event_title: str,
    deadline_display: str, group_id: str, event_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Absagefrist läuft ab: {event_title}"
    html = _base_html(
        "Absagefrist läuft bald ab!",
        f"<p>Hallo {first_name},</p>"
        f"<p>die Absagefrist für <strong>{event_title}</strong> im Club <strong>{group_name}</strong> "
        f"läuft <strong style='color:#F0A030;'>bald ab</strong>:</p>"
        f"<p style='background:rgba(240,160,48,0.08);padding:12px;border-radius:8px;"
        f"border-left:3px solid #F0A030;'>{deadline_display}</p>"
        f"<p>Du hast noch keine Rückmeldung gegeben. Jetzt ist deine letzte Chance!</p>",
        f"{base}/group/{group_id}/calendar/{event_id}", "Jetzt rückmelden",
    )
    return subject, html


def build_late_rsvp_kassenwart(
    group_name: str, member_name: str, event_title: str, group_id: str, event_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Verspätete Absage: {member_name}"
    html = _base_html(
        "Verspätete Absage",
        f"<p><strong>{member_name}</strong> hat nach Ablauf der Frist für den Termin "
        f"<strong>{event_title}</strong> in Club <strong>{group_name}</strong> abgesagt.</p>",
        f"{base}/group/{group_id}/calendar/{event_id}", "Zum Termin",
    )
    return subject, html


def build_payment_received(
    first_name: str, group_name: str, amount: float, entries_count: int, group_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Zahlung eingegangen: {amount:.2f} €"
    html = _base_html(
        "Zahlung erhalten",
        f"<p>Hallo {first_name},</p>"
        f"<p>deine Zahlung von <strong style='color:#2ECC9A;'>{amount:.2f} €</strong> "
        f"im Club <strong>{group_name}</strong> ist eingegangen.</p>"
        f"<p>{entries_count} Schuld{'en' if entries_count != 1 else ''} wurden als bezahlt markiert.</p>",
        f"{base}/group/{group_id}/debts", "Schulden ansehen",
    )
    return subject, html


def build_late_payment_fee(
    first_name: str, group_name: str, fee_amount: float, group_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Verspätungsstrafe: {fee_amount:.2f} €"
    html = _base_html(
        "Verspätungsstrafe gebucht",
        f"<p>Hallo {first_name},</p>"
        f"<p>da deine Zahlung im Club <strong>{group_name}</strong> die Frist überschritten hat, "
        f"wurde automatisch eine Verspätungsstrafe von "
        f"<strong style='color:#FF4D4D;'>{fee_amount:.2f} €</strong> gebucht.</p>",
        f"{base}/group/{group_id}/debts", "Schulden ansehen",
    )
    return subject, html


def build_new_poll(
    first_name: str, group_name: str, poll_title: str, group_id: str, poll_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Neue Abstimmung: {poll_title}"
    html = _base_html(
        f"Neue Abstimmung: {poll_title}",
        f"<p>Hallo {first_name},</p>"
        f"<p>im Club <strong>{group_name}</strong> wurde eine neue Abstimmung gestartet:</p>"
        f"<p style='background:rgba(240,160,48,0.08);padding:12px;border-radius:8px;"
        f"border-left:3px solid #F0A030;'><strong>{poll_title}</strong></p>"
        f"<p>Gib jetzt deine Stimme ab!</p>",
        f"{base}/group/{group_id}/polls/{poll_id}", "Zur Abstimmung",
    )
    return subject, html


def build_poll_closing_soon(
    first_name: str, group_name: str, poll_title: str,
    deadline_display: str, group_id: str, poll_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Abstimmung endet bald: {poll_title}"
    html = _base_html(
        "Abstimmung endet in Kürze",
        f"<p>Hallo {first_name},</p>"
        f"<p>die Abstimmung <strong>{poll_title}</strong> im Club <strong>{group_name}</strong> "
        f"endet am <strong>{deadline_display}</strong>.</p>"
        f"<p>Du hast noch nicht abgestimmt. Jetzt ist die letzte Chance!</p>",
        f"{base}/group/{group_id}/polls/{poll_id}", "Jetzt abstimmen",
    )
    return subject, html


def build_poll_closed(
    first_name: str, group_name: str, poll_title: str,
    result_summary: str, group_id: str, poll_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Abstimmung abgeschlossen: {poll_title}"
    html = _base_html(
        "Abstimmung abgeschlossen",
        f"<p>Hallo {first_name},</p>"
        f"<p>die Abstimmung <strong>{poll_title}</strong> im Club <strong>{group_name}</strong> "
        f"wurde abgeschlossen.</p>"
        + (f"<p style='background:rgba(255,255,255,0.04);padding:12px;border-radius:8px;'>"
           f"{result_summary}</p>" if result_summary else ""),
        f"{base}/group/{group_id}/polls/{poll_id}", "Ergebnis ansehen",
    )
    return subject, html


def build_monthly_summary(
    first_name: str, group_name: str, period: str,
    open_debt: float, sessions_count: int, group_id: str
) -> tuple[str, str]:
    base = get_settings().app_base_url
    subject = f"[{group_name}] Monatszusammenfassung {period}"
    html = _base_html(
        f"Zusammenfassung {period}",
        f"<p>Hallo {first_name},</p>"
        f"<p>hier deine Monatszusammenfassung für den Club <strong>{group_name}</strong>:</p>"
        f"<table style='width:100%;border-collapse:collapse;margin:12px 0;'>"
        f"<tr><td style='padding:6px 0;color:rgba(238,232,224,0.6);'>Offene Schulden</td>"
        f"<td style='text-align:right;font-weight:700;"
        f"color:{'#FF4D4D' if open_debt > 0 else '#2ECC9A'};'>{open_debt:.2f} €</td></tr>"
        f"<tr><td style='padding:6px 0;color:rgba(238,232,224,0.6);'>Kegelabende</td>"
        f"<td style='text-align:right;font-weight:700;'>{sessions_count}</td></tr>"
        f"</table>",
        f"{base}/group/{group_id}/dashboard", "Zum Dashboard",
    )
    return subject, html
