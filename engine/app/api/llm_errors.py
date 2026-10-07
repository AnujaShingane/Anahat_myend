"""Therapist-safe HTTP mapping for LLM failures + request-id validation."""
from __future__ import annotations

import re

from fastapi.responses import JSONResponse

from app.core.exceptions import LLMServiceError

GENERIC_PROCESSING_ERROR = "Something went wrong while processing this response. Please retry."
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:\-]{1,128}$")


def llm_error_response(exc: LLMServiceError) -> JSONResponse:
    """`detail` stays a plain string (FastAPI convention, what the frontend already reads).

    Only the safe message, a stable code and a retry hint are exposed: no status codes,
    provider/model names, URLs or stack traces.
    """
    headers = {"Retry-After": "5"} if exc.retryable else None
    return JSONResponse(
        status_code=exc.http_status,
        content={"detail": exc.user_message, "error_code": exc.code, "retryable": exc.retryable},
        headers=headers,
    )


def clean_request_id(value: str | None) -> str | None:
    """Return a validated idempotency key, None if absent; ValueError if malformed."""
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    if not _REQUEST_ID.match(value):
        raise ValueError("Invalid request id (use up to 128 letters, digits, '.', '_', ':' or '-')")
    return value
