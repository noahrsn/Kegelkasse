"""Kegelkasse — FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.database.cosmos import CosmosDB
from app.services.auth_service import NotAuthenticatedError
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
