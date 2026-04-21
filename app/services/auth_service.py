"""Authentication service: password hashing, JWT tokens, email verification."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import bcrypt as _bcrypt

from fastapi import Depends, Request
from jose import jwt

from app.config import get_settings
from app.database.cosmos import CosmosDB, get_db
from app.database.models import User


class NotAuthenticatedError(Exception):
    pass


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, expires_delta: Optional[timedelta] = None) -> str:
    settings = get_settings()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> Optional[str]:
    """Decode JWT and return user_id, or None if invalid/expired."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload.get("sub")
    except Exception:
        return None


def generate_verification_token() -> str:
    """Generate a random token for email verification or password reset."""
    import secrets

    return secrets.token_urlsafe(32)


async def get_current_user_optional(
    request: Request,
    db: CosmosDB = Depends(get_db),
) -> Optional[User]:
    """Return the current user or None if not authenticated."""
    token = request.cookies.get("access_token")
    if not token:
        return None
    user_id = decode_access_token(token)
    if not user_id:
        return None
    doc = db.read_item("users", user_id, user_id)
    if not doc:
        return None
    return User(**doc)


async def require_auth(
    request: Request,
    db: CosmosDB = Depends(get_db),
) -> User:
    """FastAPI dependency — returns current user, raises NotAuthenticatedError if not logged in."""
    user = await get_current_user_optional(request, db)
    if user is None:
        raise NotAuthenticatedError()
    return user
