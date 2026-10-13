import sys
from pathlib import Path

import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def _adaptive_questions_off_by_default(monkeypatch):
    """Existing tests exercise the KB question path and must never call a real model (a dev
    machine may have Ollama running). Adaptive-question tests switch it on explicitly."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "dynamic_questions_enabled", False)
    yield
