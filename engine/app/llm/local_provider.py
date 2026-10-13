from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.exceptions import (
    LLMConfigurationError,
    LLMInvalidResponseError,
    LLMProviderError,
    LLMTemporaryError,
)
from app.llm.base import LLMProvider
from app.llm.json_utils import _candidate_json_text, _loads_object, parse_extraction_json
from app.llm.prompts import (
    VALIDATION_SYSTEM_PROMPT,
    build_extraction_prompt,
    build_validation_prompt,
)
from app.llm.retry import deadline_scope, remaining_seconds, request_timeout
from app.llm.schemas import CandidateValidation, SemanticExtraction


class LocalOllamaProvider(LLMProvider):
    """JSON-schema constrained semantic extraction through a local Ollama model."""

    provider_name = "local"

    def validate_candidates(self, text: str, concept: dict, candidates: list[dict]) -> CandidateValidation:
        """Use the configured local model for the same closed-set validation as remote providers."""
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": VALIDATION_SYSTEM_PROMPT},
                {"role": "user", "content": build_validation_prompt(text, concept, candidates)},
            ],
            "format": CandidateValidation.model_json_schema(),
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0},
        }
        with deadline_scope(self.total_timeout):
            remaining = remaining_seconds()
            if remaining is not None and remaining <= 0:
                raise LLMTemporaryError("local candidate validation deadline exceeded",
                                        category="deadline_exceeded", provider=self.provider_name,
                                        model=self.model)
            try:
                response = self.client.post(
                    f"{self.base_url}/api/chat", json=payload,
                    timeout=request_timeout(self.request_timeout),
                )
                response.raise_for_status()
            except httpx.TimeoutException as exc:
                raise LLMTemporaryError("local candidate validation timed out", category="timeout",
                                        provider=self.provider_name, model=self.model) from exc
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status in {408, 429} or status >= 500:
                    raise LLMTemporaryError("local candidate validation temporarily unavailable",
                                            category="server_error", provider=self.provider_name,
                                            model=self.model, status_code=status) from exc
                raise LLMConfigurationError("local model rejected candidate validation",
                                            category="request_rejected", provider=self.provider_name,
                                            model=self.model, status_code=status) from exc
            except httpx.RequestError as exc:
                raise LLMTemporaryError("local model unavailable for candidate validation",
                                        category="connection_error", provider=self.provider_name,
                                        model=self.model) from exc

        try:
            body = response.json()
        except (ValueError, TypeError) as exc:
            raise LLMInvalidResponseError("local model returned invalid validation JSON",
                                          category="invalid_json", provider=self.provider_name,
                                          model=self.model) from exc
        if body.get("error"):
            raise LLMProviderError("local model returned a validation error", category="provider_error",
                                   provider=self.provider_name, model=self.model)
        content = (body.get("message") or {}).get("content")
        if not isinstance(content, str) or not content.strip():
            raise LLMInvalidResponseError("local model returned empty candidate validation",
                                          category="empty_response", provider=self.provider_name,
                                          model=self.model)
        try:
            return CandidateValidation.model_validate(_loads_object(_candidate_json_text(content)))
        except LLMProviderError as exc:
            exc.provider, exc.model = self.provider_name, self.model
            raise
        except Exception as exc:
            raise LLMInvalidResponseError("local model returned schema-invalid candidate validation",
                                          category="schema_invalid", provider=self.provider_name,
                                          model=self.model) from exc

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        keep_alive: str = "30m",
        request_timeout: float = 90.0,
        total_timeout: float = 180.0,
        client: Any | None = None,
    ):
        if not base_url:
            raise LLMConfigurationError(
                "local model URL is not configured",
                category="configuration",
                provider=self.provider_name,
            )
        if not model:
            raise LLMConfigurationError(
                "local model is not configured",
                category="configuration",
                provider=self.provider_name,
            )
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.keep_alive = keep_alive
        self.request_timeout = request_timeout
        self.total_timeout = total_timeout
        self.client = client or httpx.Client()

    @staticmethod
    def _compact_context(context: dict | None) -> dict | None:
        if not isinstance(context, dict):
            return context

        compact = {
            key: context[key]
            for key in (
                "baseline",
                "opening_questions",
                "opening_response",
                "question",
                "quadrant",
                "current_issue",
            )
            if key in context
        }
        state = context.get("patient_state")
        if isinstance(state, dict):
            relevant_state = {
                key: state[key]
                for key in ("opening_questions", "opening_response", "current_issue")
                if key in state
            }
            if relevant_state:
                compact["patient_state"] = relevant_state
        demographics = context.get("demographics")
        if isinstance(demographics, dict) and demographics.get("language"):
            compact["language"] = demographics["language"]
        return compact or None

    def extract_semantics(
        self,
        text: str,
        *,
        context: dict | None = None,
    ) -> SemanticExtraction:
        prompt = build_extraction_prompt(text, context=self._compact_context(context))
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Extract only details explicitly stated in the patient response. "
                        "Do not diagnose, infer chakras, or recommend treatment. Return "
                        "only an object matching the supplied JSON schema. For polarity, "
                        "use positive when the patient reports the symptom, emotion, or "
                        "behaviour as present; use negative only for an explicit denial "
                        "that the symptom is present. Reported difficulties and deficits "
                        "such as low energy, poor or irregular sleep, decreased motivation, "
                        "or inability to concentrate are positive current symptoms, not "
                        "negative polarity. For example, 'I can't concentrate' means the "
                        "concentration difficulty is present; 'I don't have difficulty "
                        "concentrating' is negative."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "format": SemanticExtraction.model_json_schema(),
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0},
        }

        with deadline_scope(self.total_timeout):
            remaining = remaining_seconds()
            if remaining is not None and remaining <= 0:
                raise LLMTemporaryError(
                    "local model deadline exceeded",
                    category="deadline_exceeded",
                    provider=self.provider_name,
                    model=self.model,
                )

            try:
                response = self.client.post(
                    f"{self.base_url}/api/chat",
                    json=payload,
                    timeout=request_timeout(self.request_timeout),
                )
                response.raise_for_status()
            except httpx.TimeoutException as exc:
                raise LLMTemporaryError(
                    "local model request timed out",
                    category="timeout",
                    provider=self.provider_name,
                    model=self.model,
                ) from exc
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status in {408, 429} or status >= 500:
                    raise LLMTemporaryError(
                        "local model service is temporarily unavailable",
                        category="server_error",
                        provider=self.provider_name,
                        model=self.model,
                        status_code=status,
                    ) from exc
                if status == 404:
                    raise LLMConfigurationError(
                        "configured local model was not found",
                        category="model_not_found",
                        provider=self.provider_name,
                        model=self.model,
                        status_code=status,
                    ) from exc
                raise LLMConfigurationError(
                    "local model rejected the extraction request",
                    category="request_rejected",
                    provider=self.provider_name,
                    model=self.model,
                    status_code=status,
                ) from exc
            except httpx.RequestError as exc:
                raise LLMTemporaryError(
                    "local model service is unavailable",
                    category="connection_error",
                    provider=self.provider_name,
                    model=self.model,
                ) from exc

        try:
            body = response.json()
        except (ValueError, TypeError) as exc:
            raise LLMInvalidResponseError(
                "local model returned invalid JSON",
                category="invalid_json",
                provider=self.provider_name,
                model=self.model,
            ) from exc

        if body.get("error"):
            raise LLMProviderError(
                "local model returned an error",
                category="provider_error",
                provider=self.provider_name,
                model=self.model,
            )

        content = (body.get("message") or {}).get("content")
        if not isinstance(content, str) or not content.strip():
            raise LLMInvalidResponseError(
                "local model returned empty content",
                category="empty_response",
                provider=self.provider_name,
                model=self.model,
            )

        try:
            result = parse_extraction_json(content)
            return SemanticExtraction.model_validate(result)
        except LLMProviderError as exc:
            exc.provider = self.provider_name
            exc.model = self.model
            raise
        except Exception as exc:
            raise LLMInvalidResponseError(
                "local model returned schema-invalid content",
                category="schema_invalid",
                provider=self.provider_name,
                model=self.model,
            ) from exc
