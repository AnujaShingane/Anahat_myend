"""Deadline, backoff and HTTP-status classification shared by all providers."""
from __future__ import annotations

import random
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator

from app.core.exceptions import (
    LLMConfigurationError,
    LLMProviderError,
    LLMTemporaryError,
)

# Statuses worth a bounded retry / fallback.
TEMPORARY_STATUSES = frozenset({408, 429, 500, 502, 503, 504, 529})

_DEADLINE: ContextVar[float | None] = ContextVar("anahat_llm_deadline", default=None)


@contextmanager
def deadline_scope(total_seconds: float) -> Iterator[None]:
    """Bound everything inside by ``total_seconds``. Nested scopes can only shorten it."""
    new = time.monotonic() + max(0.0, total_seconds)
    current = _DEADLINE.get()
    token = _DEADLINE.set(new if current is None else min(current, new))
    try:
        yield
    finally:
        _DEADLINE.reset(token)


def remaining_seconds() -> float | None:
    """Seconds left in the active deadline, or None when no deadline is active."""
    d = _DEADLINE.get()
    return None if d is None else d - time.monotonic()


def request_timeout(per_request: float) -> float:
    """Timeout for the next network call: never longer than what is left."""
    rem = remaining_seconds()
    return per_request if rem is None else max(0.1, min(per_request, rem))


def backoff_delay(attempt: int, base: float, cap: float, retry_after: float | None = None,
                  rng=random.random) -> float:
    """Exponential backoff with jitter; honours Retry-After but never beyond ``cap``."""
    delay = min(cap, base * (2 ** attempt))
    delay = delay * (0.5 + rng() * 0.5)
    if retry_after is not None:
        delay = max(delay, min(float(retry_after), cap))
    return delay


def can_wait(delay: float) -> bool:
    """True if sleeping ``delay`` still leaves time for one more attempt."""
    rem = remaining_seconds()
    return rem is None or rem > delay + 1.0


def classify_status(status: int | None, *, provider: str, model: str | None,
                    detail: str = "", retry_after: float | None = None) -> LLMProviderError:
    """Map an HTTP status to a typed internal error (never shown to users)."""
    common = dict(status_code=status, provider=provider, model=model, retry_after=retry_after)
    if status in TEMPORARY_STATUSES:
        cat = {408: "timeout", 429: "rate_limited"}.get(status, "server_error")
        return LLMTemporaryError(detail or cat, category=cat, **common)
    if status in (401, 403):
        return LLMConfigurationError(detail or "auth_error", category="auth_error", **common)
    if status == 402:
        return LLMConfigurationError(detail or "payment_required", category="payment_required", **common)
    if status == 404:
        return LLMConfigurationError(detail or "model_not_found", category="model_not_found", **common)
    if status in (400, 422):
        return LLMConfigurationError(detail or "request_rejected", category="request_rejected", **common)
    return LLMProviderError(detail or "unexpected_http_status", category="unexpected_http_status", **common)
