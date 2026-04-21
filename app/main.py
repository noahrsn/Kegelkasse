"""Kegelkasse — FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database.cosmos import CosmosDB
from app.limiter import limiter
from app.services.auth_service import NotAuthenticatedError, create_access_token
from app.routers import (
    auth,
    awards,
    calendar,
    debts,
    groups,
    members,
    notifications,
    penalties,
    polls,
    rulebook,
    sessions,
    treasury,
)
from app.services.scheduler_service import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
# Suppress verbose HTTP-level logging from the Azure SDK
logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)
logging.getLogger("azure").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB containers + scheduler. Shutdown: stop scheduler."""
    settings = get_settings()
    logger.info("Starting Kegelkasse [%s]", settings.environment)

    # Initialize Cosmos DB containers
    # Skip if endpoint/key look like placeholder values from .env.example
    db_configured = (
        settings.cosmos_endpoint
        and not settings.cosmos_endpoint.startswith("https://your-")
        and settings.cosmos_key
        and settings.cosmos_key != "your-cosmos-key"
    )
    if db_configured:
        try:
            db = CosmosDB.get()
            db.ensure_containers()
            logger.info("Cosmos DB containers ready")
        except Exception as exc:
            if settings.is_production and settings.cosmos_strict_startup:
                raise
            logger.warning(
                "Cosmos DB init failed (continuing without DB). "
                "Set COSMOS_STRICT_STARTUP=true to fail startup on DB errors. Error: %s",
                exc,
            )
    else:
        logger.warning("Cosmos DB not configured — running without database (set COSMOS_ENDPOINT and COSMOS_KEY in .env)")

    # Start background scheduler
    start_scheduler()

    yield

    stop_scheduler()
    logger.info("Kegelkasse shut down")


app = FastAPI(
    title="Kegelkasse",
    description="Vereinsverwaltung für Kegelclubs",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https://images.unsplash.com blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response


class JWTRefreshMiddleware(BaseHTTPMiddleware):
    """Extend JWT cookie when less than half the token lifetime remains (sliding expiry)."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        token = request.cookies.get("access_token")
        if not token:
            return response
        settings = get_settings()
        try:
            from jose import jwt as jose_jwt
            payload = jose_jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            exp = payload.get("exp")
            user_id = payload.get("sub")
            if exp and user_id:
                expires_at = datetime.utcfromtimestamp(exp)
                refresh_threshold = timedelta(minutes=settings.jwt_expire_minutes // 2)
                if expires_at - datetime.utcnow() < refresh_threshold:
                    new_token = create_access_token(user_id)
                    response.set_cookie(
                        "access_token",
                        new_token,
                        httponly=True,
                        samesite="strict",
                        secure=settings.is_production,
                        max_age=86400,
                    )
        except Exception:
            pass
        return response


app.add_middleware(JWTRefreshMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(NotAuthenticatedError)
async def not_authenticated_handler(request, exc):
    return RedirectResponse("/login", status_code=302)

# Static files + templates (use absolute paths so it works on Azure regardless of cwd)
_BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=str(_BASE_DIR / "static")), name="static")

templates = Jinja2Templates(directory=str(_BASE_DIR / "templates"))

# Register routers
app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(members.router)
app.include_router(penalties.router)
app.include_router(sessions.router)
app.include_router(calendar.router)
app.include_router(debts.router)
app.include_router(treasury.router)
app.include_router(awards.router)
app.include_router(rulebook.router)
app.include_router(notifications.router)
app.include_router(polls.router)


@app.get("/")
async def index():
    """Root redirect — go to dashboard or login."""
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/login")


@app.get("/health")
async def health():
    """Lightweight health endpoint (no DB calls).

    Configure Azure App Service 'Health check path' to `/health`.
    """

    return {"status": "ok"}


if __name__ == "__main__":
    import sys
    from pathlib import Path

    # When run as `python app/main.py`, the project root is not in sys.path.
    # Add it so that `from app.xxx import ...` works correctly.
    project_root = Path(__file__).resolve().parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=not settings.is_production,
    )
