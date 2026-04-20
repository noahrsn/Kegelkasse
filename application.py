"""Compatibility entrypoint for PaaS platforms.

Some platforms (and some Azure/Oryx heuristics) look for a top-level module like
`application.py` or `app.py` exposing an `app` object.

The actual FastAPI instance lives in `app.main:app`.
"""

from app.main import app  # noqa: F401

