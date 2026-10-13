"""Strict parsing + validation of model output into ``SemanticExtraction``.

Recoverable formats (and ONLY these):
  1. the whole reply is one JSON object (surrounding whitespace/BOM ignored)
  2. the whole reply is wrapped in one ``` / ```json fence (closing fence optional)
  3. exactly ONE closed fenced block, with prose before/after it

Deliberately NOT recovered: bare JSON buried in prose, several fenced blocks
(ambiguous), non-object top-level values, or anything that fails schema
validation. Those raise ``LLMInvalidResponseError`` so the caller can fall back
instead of returning fabricated or guessed data.
"""
from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from app.core.exceptions import LLMInvalidResponseError
from app.llm.schemas import SemanticExtraction

_FENCE_LANGS = {"", "json"}
# ```lang\n ... ```   (closed block anywhere in the text)
_CLOSED_FENCE = re.compile(r"```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n(.*?)```", re.DOTALL)
# whole text starts with a fence; closing fence optional
_LEADING_FENCE = re.compile(r"^```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n(.*?)(?:```)?\s*$", re.DOTALL)


def _invalid(category: str, detail: str) -> LLMInvalidResponseError:
    return LLMInvalidResponseError(detail, category=category)


def _loads_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if not text.startswith("{"):
        raise _invalid("invalid_json", "reply is not a JSON object")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        # Position only: never echo model output (it may contain patient text).
        raise _invalid("invalid_json", f"JSON decode error at char {exc.pos}") from exc
    if not isinstance(data, dict):
        raise _invalid("invalid_json", "top-level JSON value is not an object")
    return data


def _candidate_json_text(raw: str) -> str:
    text = raw.replace("\ufeff", "").strip()
    if not text:
        raise _invalid("empty_response", "provider returned an empty response")

    if text.startswith("{"):
        return text

    m = _LEADING_FENCE.match(text)
    if m:
        if m.group(1).lower() not in _FENCE_LANGS:
            raise _invalid("invalid_json", "fenced block has a non-JSON language tag")
        return m.group(2)

    blocks = _CLOSED_FENCE.findall(text)
    if len(blocks) == 1:
        lang, body = blocks[0]
        if lang.lower() in _FENCE_LANGS:
            return body
        raise _invalid("invalid_json", "fenced block has a non-JSON language tag")
    if len(blocks) > 1:
        raise _invalid("invalid_json", "multiple fenced blocks; refusing to guess")
    raise _invalid("invalid_json", "no JSON object found in reply")


def validate_extraction(payload: Any) -> SemanticExtraction:
    """Validate a dict / JSON string / SemanticExtraction against the REAL schema.

    Every provider result funnels through here before being returned.
    """
    if isinstance(payload, SemanticExtraction):
        # Re-validate from a dump so a mutated/hand-built instance cannot slip through.
        payload = payload.model_dump()
    elif isinstance(payload, str):
        payload = _loads_object(_candidate_json_text(payload))
    elif payload is None:
        raise _invalid("empty_response", "provider returned no content")

    if not isinstance(payload, dict):
        raise _invalid("invalid_json", "extraction payload is not an object")

    try:
        return SemanticExtraction.model_validate(payload)
    except ValidationError as exc:
        # Locations + error types only. Pydantic's default message embeds the
        # offending input value, which could contain patient text.
        summary = "; ".join(
            f"{'.'.join(str(p) for p in e['loc']) or '<root>'}:{e['type']}" for e in exc.errors()[:8]
        )
        raise _invalid("schema_invalid", f"schema validation failed: {summary}") from exc


def parse_extraction_json(raw: str | None) -> SemanticExtraction:
    """Parse raw model text and validate it. Raises ``LLMInvalidResponseError`` on any failure."""
    if raw is None or not isinstance(raw, str):
        raise _invalid("empty_response", "provider returned no text content")
    return validate_extraction(raw)
