"""Mistral provider (OpenAI-compatible chat API), via httpx.

Structured output: ``response_format`` json_schema first; if the API rejects the schema
(HTTP 400/422) we retry once with plain ``json_object`` and validate locally. Whatever comes
back is ALWAYS validated against the real pydantic schema before it leaves this class.
"""
from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel

from app.core.exceptions import (
    LLMConfigurationError, LLMInvalidResponseError, LLMProviderError, LLMTemporaryError,
)
from app.llm.base import LLMProvider
from app.llm.json_utils import validate_extraction, _candidate_json_text, _loads_object
from app.llm.prompts import EXTRACTION_SYSTEM_PROMPT, VALIDATION_SYSTEM_PROMPT, build_extraction_prompt, build_validation_prompt
from app.llm.retry import deadline_scope, remaining_seconds, request_timeout
from app.llm.schemas import CandidateValidation, SemanticExtraction


class MistralProvider(LLMProvider):
    provider_name = "mistral"

    def __init__(self, *, api_key: str | None, model: str | None,
                 base_url: str = "https://api.mistral.ai/v1", request_timeout: float = 60.0,
                 total_timeout: float = 120.0, client: Any | None = None):
        if not api_key:
            raise LLMConfigurationError("Mistral API key is not configured", category="configuration",
                                        provider=self.provider_name)
        if not model:
            raise LLMConfigurationError("Mistral model is not configured", category="configuration",
                                        provider=self.provider_name)
        self.api_key, self.model = api_key, model
        self.base_url = base_url.rstrip("/")
        self.request_timeout, self.total_timeout = request_timeout, total_timeout
        self.client = client or httpx.Client()

    # ------------------------------------------------------------------ #
    def extract_semantics(self, text: str, *, context: dict | None = None) -> SemanticExtraction:
        content = self._chat_json(EXTRACTION_SYSTEM_PROMPT, build_extraction_prompt(text, context),
                                  SemanticExtraction, "semantic_extraction")
        return validate_extraction(content)

    def validate_candidates(self, text: str, concept: dict, candidates: list[dict]) -> CandidateValidation:
        content = self._chat_json(VALIDATION_SYSTEM_PROMPT, build_validation_prompt(text, concept, candidates),
                                  CandidateValidation, "candidate_validation")
        try:
            return CandidateValidation.model_validate(content)
        except Exception as exc:  # noqa: BLE001
            raise LLMInvalidResponseError("mistral returned schema-invalid validation",
                                          category="schema_invalid", provider=self.provider_name,
                                          model=self.model) from exc

    # ------------------------------------------------------------------ #
    def _chat_json(self, system: str, user: str, schema: type[BaseModel], name: str) -> dict:
        base = {"model": self.model, "temperature": 0,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        strict = {**base, "response_format": {"type": "json_schema", "json_schema": {
            "name": name, "schema": schema.model_json_schema(), "strict": True}}}
        loose = {**base, "response_format": {"type": "json_object"}}
        try:
            body = self._post(strict)
        except LLMConfigurationError as exc:
            if exc.status_code not in (400, 422):
                raise
            body = self._post(loose)
        try:
            raw = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMInvalidResponseError("mistral returned no content", category="empty_response",
                                          provider=self.provider_name, model=self.model) from exc
        if isinstance(raw, list):  # content chunks
            raw = "".join(c.get("text", "") for c in raw if isinstance(c, dict))
        if not isinstance(raw, str) or not raw.strip():
            raise LLMInvalidResponseError("mistral returned empty content", category="empty_response",
                                          provider=self.provider_name, model=self.model)
        try:
            return _loads_object(_candidate_json_text(raw))
        except LLMProviderError as exc:
            exc.provider, exc.model = self.provider_name, self.model
            raise

    def _post(self, payload: dict) -> dict:
        with deadline_scope(self.total_timeout):
            rem = remaining_seconds()
            if rem is not None and rem <= 0:
                raise LLMTemporaryError("mistral deadline exceeded", category="deadline_exceeded",
                                        provider=self.provider_name, model=self.model)
            try:
                r = self.client.post(f"{self.base_url}/chat/completions", json=payload,
                                     headers={"Authorization": f"Bearer {self.api_key}"},
                                     timeout=request_timeout(self.request_timeout))
                r.raise_for_status()
            except httpx.TimeoutException as exc:
                raise LLMTemporaryError("mistral request timed out", category="timeout",
                                        provider=self.provider_name, model=self.model) from exc
            except httpx.HTTPStatusError as exc:
                st = exc.response.status_code
                if st in {408, 429} or st >= 500:
                    raise LLMTemporaryError("mistral temporarily unavailable", category="server_error",
                                            provider=self.provider_name, model=self.model,
                                            status_code=st) from exc
                cat = "auth" if st in (401, 403) else "model_not_found" if st == 404 else "request_rejected"
                raise LLMConfigurationError("mistral rejected the request", category=cat,
                                            provider=self.provider_name, model=self.model,
                                            status_code=st) from exc
            except httpx.RequestError as exc:
                raise LLMTemporaryError("mistral unreachable", category="connection_error",
                                        provider=self.provider_name, model=self.model) from exc
        try:
            return r.json()
        except ValueError as exc:
            raise LLMInvalidResponseError("mistral returned invalid JSON", category="invalid_json",
                                          provider=self.provider_name, model=self.model) from exc
