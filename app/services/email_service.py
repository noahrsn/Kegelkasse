"""Email service: SendGrid integration with development console fallback."""

from __future__ import annotations

import logging

from app.config import get_settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Send an email via SendGrid (production) or log to console (development)."""
    settings = get_settings()

    if not settings.is_production:
        logger.info(
            "DEV EMAIL → to=%s subject=%s\n%s", to_email, subject, html_content
        )
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
        f'<p>Bitte bestätige deine E-Mail-Adresse:</p><p><a href="{link}">{link}</a></p>',
    )


def send_password_reset_email(to_email: str, token: str) -> bool:
    settings = get_settings()
    link = f"{settings.app_base_url}/reset-password?token={token}"
    return send_email(
        to_email,
        "Kegelkasse — Passwort zurücksetzen",
        f'<p>Klicke hier um dein Passwort zurückzusetzen:</p><p><a href="{link}">{link}</a></p>',
    )
