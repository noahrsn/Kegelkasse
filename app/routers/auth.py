"""Authentication routes: register, login, verify email, password reset."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.database.cosmos import CosmosDB, get_db
from app.database.models import User
from app.services.auth_service import (
    create_access_token,
    generate_verification_token,
    hash_password,
    require_auth,
    verify_password,
)
from app.services.email_service import send_password_reset_email, send_verification_email

router = APIRouter(prefix="", tags=["auth"])
templates = Jinja2Templates(directory="app/templates")


def _render(request: Request, template: str, **ctx):
    return templates.TemplateResponse(template, {"request": request, **ctx})


# ── Register ──────────────────────────────────────────────────────────────────

@router.get("/register")
async def register_page(request: Request, error: Optional[str] = None, success: Optional[str] = None):
    return _render(request, "register.html", error=error, success=success)


@router.post("/register")
async def register(
    request: Request,
    email: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    password: str = Form(...),
    db: CosmosDB = Depends(get_db),
):
    email = email.strip().lower()
    first_name = first_name.strip()
    last_name = last_name.strip()

    if len(password) < 8:
        return _render(request, "register.html", error="Das Passwort muss mindestens 8 Zeichen lang sein.")

    try:
        existing = db.query_items("users", "SELECT * FROM c WHERE c.email = @e", [{"name": "@e", "value": email}])
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("DB error on register query: %s", exc)
        return _render(request, "register.html", error="Datenbankfehler: Verbindung zur Datenbank fehlgeschlagen. Bitte prüfe die Konfiguration.")

    if existing:
        return _render(request, "register.html", error="Diese E-Mail-Adresse ist bereits registriert.")

    token = generate_verification_token()
    user = User(
        email=email,
        first_name=first_name,
        last_name=last_name,
        password_hash=hash_password(password),
        verification_token=token,
        verification_token_expires=datetime.now(tz=UTC) + timedelta(hours=24),
    )
    settings = get_settings()
    if not settings.is_production:
        user.email_verified = True
        user.verification_token = None
        user.verification_token_expires = None
    try:
        db.create_item("users", user.model_dump(mode="json"))
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("DB error on register create: %s", exc)
        return _render(request, "register.html", error="Datenbankfehler: Benutzer konnte nicht gespeichert werden.")
    if settings.is_production:
        send_verification_email(email, token)

    return RedirectResponse("/login?success=registered", status_code=303)


# ── Login ─────────────────────────────────────────────────────────────────────

@router.get("/login")
async def login_page(request: Request, error: Optional[str] = None, success: Optional[str] = None):
    return _render(request, "login.html", error=error, success=success)


@router.post("/login")
async def login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: CosmosDB = Depends(get_db),
):
    email = email.strip().lower()
    try:
        users = db.query_items("users", "SELECT * FROM c WHERE c.email = @e", [{"name": "@e", "value": email}])
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("DB error on login query: %s", exc)
        return _render(request, "login.html", error="Datenbankfehler: Verbindung zur Datenbank fehlgeschlagen.")
    if not users:
        return _render(request, "login.html", error="E-Mail oder Passwort falsch.")

    user_doc = users[0]
    stored_hash = user_doc.get("password_hash") or ""
    if not stored_hash:
        return _render(request, "login.html", error="E-Mail oder Passwort falsch.")
    try:
        password_ok = verify_password(password, stored_hash)
    except Exception:
        password_ok = False
    if not password_ok:
        return _render(request, "login.html", error="E-Mail oder Passwort falsch.")

    if not user_doc.get("email_verified", False):
        return _render(request, "login.html", error="Bitte bestätige zuerst deine E-Mail-Adresse.")

    token = create_access_token(user_doc["id"])
    response = RedirectResponse("/dashboard", status_code=303)
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        samesite="strict",
        max_age=86400,
    )
    return response


# ── Email verification ────────────────────────────────────────────────────────

@router.get("/verify-email")
async def verify_email(token: str, db: CosmosDB = Depends(get_db)):
    users = db.query_items(
        "users",
        "SELECT * FROM c WHERE c.verification_token = @t",
        [{"name": "@t", "value": token}],
    )
    if not users:
        return RedirectResponse("/login?error=invalid_token", status_code=303)

    user_doc = users[0]
    expires = user_doc.get("verification_token_expires")
    if expires and datetime.fromisoformat(expires.replace("Z", "+00:00")) < datetime.now(tz=UTC):
        return RedirectResponse("/login?error=token_expired", status_code=303)

    user_doc["email_verified"] = True
    user_doc["verification_token"] = None
    user_doc["verification_token_expires"] = None
    db.upsert_item("users", user_doc)

    return RedirectResponse("/login?success=verified", status_code=303)


# ── Forgot password ───────────────────────────────────────────────────────────

@router.get("/forgot-password")
async def forgot_password_page(request: Request, error: Optional[str] = None, success: Optional[str] = None):
    return _render(request, "forgot_password.html", error=error, success=success)


@router.post("/forgot-password")
async def forgot_password(
    request: Request,
    email: str = Form(...),
    db: CosmosDB = Depends(get_db),
):
    email = email.strip().lower()
    users = db.query_items("users", "SELECT * FROM c WHERE c.email = @e", [{"name": "@e", "value": email}])
    if users:
        user_doc = users[0]
        token = generate_verification_token()
        user_doc["reset_token"] = token
        user_doc["reset_token_expires"] = (datetime.now(tz=UTC) + timedelta(hours=2)).isoformat()
        db.upsert_item("users", user_doc)
        send_password_reset_email(email, token)

    return RedirectResponse("/forgot-password?success=sent", status_code=303)


# ── Reset password ────────────────────────────────────────────────────────────

@router.get("/reset-password")
async def reset_password_page(request: Request, token: str = "", error: Optional[str] = None):
    return _render(request, "reset_password.html", token=token, error=error)


@router.post("/reset-password")
async def reset_password(
    request: Request,
    token: str = Form(...),
    password: str = Form(...),
    db: CosmosDB = Depends(get_db),
):
    if len(password) < 8:
        return _render(request, "reset_password.html", token=token, error="Das Passwort muss mindestens 8 Zeichen lang sein.")

    users = db.query_items(
        "users",
        "SELECT * FROM c WHERE c.reset_token = @t",
        [{"name": "@t", "value": token}],
    )
    if not users:
        return _render(request, "reset_password.html", token=token, error="Ungültiger oder abgelaufener Link.")

    user_doc = users[0]
    expires = user_doc.get("reset_token_expires")
    if expires and datetime.fromisoformat(expires.replace("Z", "+00:00")) < datetime.now(tz=UTC):
        return _render(request, "reset_password.html", token=token, error="Dieser Link ist abgelaufen.")

    user_doc["password_hash"] = hash_password(password)
    user_doc["reset_token"] = None
    user_doc["reset_token_expires"] = None
    db.upsert_item("users", user_doc)

    return RedirectResponse("/login?success=password_reset", status_code=303)


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout():
    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie("access_token")
    return response


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/profile")
async def profile_page(
    request: Request,
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    from datetime import UTC, datetime
    now = datetime.now(UTC)
    current_month = now.strftime("%Y-%m")

    # Collect active awards across all groups for the current user
    active_awards: list[dict] = []
    for gid in current_user.group_ids:
        group_doc = db.read_item("groups", gid, gid)
        group_name = group_doc.get("name", gid) if group_doc else gid
        award_docs = db.query_items(
            "awards",
            "SELECT * FROM c WHERE c.group_id = @gid AND c.period_ref = @ref",
            parameters=[{"name": "@gid", "value": gid}, {"name": "@ref", "value": current_month}],
            partition_key=gid,
        )
        for doc in award_docs:
            for ae in doc.get("awards", []):
                if ae.get("user_id") == current_user.id:
                    active_awards.append({**ae, "group_name": group_name})

    return _render(request, "profile.html", user=current_user, active_awards=active_awards)


@router.post("/profile")
async def update_profile(
    request: Request,
    first_name: str = Form(...),
    last_name: str = Form(...),
    current_user: User = Depends(require_auth),
    db: CosmosDB = Depends(get_db),
):
    user_doc = db.read_item("users", current_user.id, current_user.id)
    if user_doc:
        user_doc["first_name"] = first_name.strip()
        user_doc["last_name"] = last_name.strip()
        db.upsert_item("users", user_doc)
    return RedirectResponse("/profile?success=saved", status_code=303)
