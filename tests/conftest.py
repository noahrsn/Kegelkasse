"""Shared test fixtures."""

import os

import pytest
from fastapi.testclient import TestClient

# Force development mode for all tests
os.environ["ENVIRONMENT"] = "development"
os.environ["COSMOS_ENDPOINT"] = ""
os.environ["JWT_SECRET"] = "test-secret-do-not-use-in-production"


@pytest.fixture
def client():
    """FastAPI test client — no real database connection."""
    from app.main import app

    with TestClient(app) as c:
        yield c
