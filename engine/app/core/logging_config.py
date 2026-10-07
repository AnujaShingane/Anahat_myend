"""Logging setup for the engine.

Without this, Python only prints WARNING and above, so every INFO diagnostic
(CONCEPT CANONICAL MATCH, FINAL CHAKRA GATE, RAG QUERY ...) was invisible.
Level comes from settings.log_level (env LOG_LEVEL, default INFO).
"""
import logging

_CONFIGURED = False


def setup_logging(level: str | None = None) -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    from app.core.config import settings
    lvl = getattr(logging, str(level or settings.log_level or "INFO").upper(), logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s", "%H:%M:%S"))
    anahat = logging.getLogger("anahat")
    anahat.setLevel(lvl)
    if not anahat.handlers:
        anahat.addHandler(handler)
    anahat.propagate = False
    _CONFIGURED = True