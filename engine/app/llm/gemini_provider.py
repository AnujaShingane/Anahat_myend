from __future__ import annotations

import os
import time
from typing import Any, Callable

from app.core.config import settings
from app.core.exceptions import (
    LLMConfigurationError,
    LLMInvalidResponseError,
    LLMProviderError,
    LLMProviderExhaustedError,
    LLMTemporaryError,
)
from app.llm.base import LLMProvider
from app.llm.json_utils import parse_extraction_json
from app.llm.prompts import build_extraction_prompt
from app.llm.schema_utils import to_gemini_schema
from app.llm.schemas import SemanticExtraction
from app.llm.retry import (
    backoff_delay,
    can_wait,
    deadline_scope,
    remaining_seconds,
    request_timeout,
)


class GeminiProvider(LLMProvider):
    provider_name = "gemini"

    def __init__(
        self,
        client=None,
        model: str | None = None,
        api_key: str | None = None,
        request_timeout: float = 90.0,
        total_timeout: float = 180.0,
        max_retries: int = 1,
        backoff_base: float = 0.5,
        backoff_max: float = 8.0,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.request_timeout = request_timeout
        self.total_timeout = total_timeout
        self.max_retries = max(0, int(max_retries))
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max
        self.sleep = sleep

        self.model = model

        if self.model is None:
            self.model = getattr(settings, "gemini_model", None)

        if self.model is None:
            if getattr(settings, "llm_provider", None) == "openrouter":
                raise LLMConfigurationError(
                    "Gemini model is not configured",
                    category="configuration",
                    provider="gemini",
                )

            self.model = getattr(settings, "llm_model", None)

        if not self.model:
            raise LLMConfigurationError(
                "Gemini model is not configured",
                category="configuration",
                provider="gemini",
            )

        self._client = client

        if self._client is None:
            try:
                from google import genai
            except ImportError as exc:
                raise LLMConfigurationError(
                    "google-genai is not installed",
                    category="configuration",
                    provider="gemini",
                ) from exc

            configured_key = (
                api_key
                or getattr(settings, "gemini_api_key", None)
                or os.getenv("GEMINI_API_KEY")
            )

            if not configured_key:
                raise LLMConfigurationError(
                    "GEMINI_API_KEY is not configured",
                    category="configuration",
                    provider="gemini",
                )

            self._client = genai.Client(api_key=configured_key)

    # ------------------------------------------------------------------ #
    # Exception classification
    # ------------------------------------------------------------------ #

    @staticmethod
    def _status_from_exception(exc: BaseException) -> int | None:
        response = getattr(exc, "response", None)

        status = getattr(response, "status_code", None)

        if status is not None:
            return status

        return getattr(exc, "code", None)

    @classmethod
    def _classify_exception(
        cls,
        exc: BaseException,
    ) -> LLMProviderError:

        status = cls._status_from_exception(exc)

        text = str(exc)

        upper = text.upper()

        # Gemini sometimes reports an invalid API key as a 400.
        if (
            status == 400
            and (
                "API KEY" in upper
                or "API_KEY" in upper
                or "INVALID API KEY" in upper
            )
        ):
            return LLMConfigurationError(
                "Gemini authentication failed",
                category="auth_error",
                provider="gemini",
                status_code=status,
            )

        if status in (408, 429, 500, 502, 503, 504, 529):
            category = {
                408: "timeout",
                429: "rate_limited",
            }.get(status, "server_error")

            return LLMTemporaryError(
                "Gemini temporary provider failure",
                category=category,
                provider="gemini",
                model=None,
                status_code=status,
            )

        if status in (400, 422):
            return LLMConfigurationError(
                "Gemini request was rejected",
                category="request_rejected",
                provider="gemini",
                status_code=status,
            )

        if status in (401, 403):
            return LLMConfigurationError(
                "Gemini authentication failed",
                category="auth_error",
                provider="gemini",
                status_code=status,
            )

        if status == 404:
            return LLMConfigurationError(
                "Gemini model was not found",
                category="model_not_found",
                provider="gemini",
                status_code=status,
            )

        if (
            "TIMEOUT" in upper
            or "DEADLINE" in upper
            or "TIMED OUT" in upper
        ):
            return LLMTemporaryError(
                "Gemini request timed out",
                category="timeout",
                provider="gemini",
            )

        return LLMProviderError(
            "Gemini provider request failed",
            category="provider_error",
            provider="gemini",
        )

    # ------------------------------------------------------------------ #
    # Response parsing
    # ------------------------------------------------------------------ #

    def _parse_response(
        self,
        response: Any,
    ) -> SemanticExtraction:

        parsed = getattr(response, "parsed", None)

        if parsed is not None:
            try:
                if isinstance(parsed, SemanticExtraction):
                    return SemanticExtraction.model_validate(
                        parsed.model_dump()
                    )

                return SemanticExtraction.model_validate(parsed)

            except Exception as exc:
                raise LLMInvalidResponseError(
                    "Gemini returned schema-invalid structured output",
                    category="schema_invalid",
                    provider="gemini",
                    model=self.model,
                ) from exc

        text = getattr(response, "text", None)

        if not text or not str(text).strip():
            raise LLMInvalidResponseError(
                "Gemini returned empty content",
                category="empty_response",
                provider="gemini",
                model=self.model,
            )

        try:
            return parse_extraction_json(str(text))
        except LLMProviderError as exc:
            exc.provider = "gemini"
            exc.model = self.model
            raise

        except Exception as exc:
            raise LLMInvalidResponseError(
                "Gemini response parsing failed",
                category="invalid_json",
                provider="gemini",
                model=self.model,
            ) from exc

    # ------------------------------------------------------------------ #
    # Public extraction
    # ------------------------------------------------------------------ #

    def extract_semantics(
        self,
        text: str,
        *,
        context: dict | None = None,
    ) -> SemanticExtraction:

        prompt = build_extraction_prompt(
            text,
            context=context,
        )

        failures: list[LLMProviderError] = []
        attempts = 0

        with deadline_scope(self.total_timeout):

            while True:
                rem = remaining_seconds()

                if rem is not None and rem <= 0:
                    failures.append(
                        LLMTemporaryError(
                            "overall deadline exceeded",
                            category="deadline_exceeded",
                            provider="gemini",
                            model=self.model,
                        )
                    )
                    raise LLMProviderExhaustedError(failures)

                try:
                    from google.genai import types

                    response = self._client.models.generate_content(
                        model=self.model,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            temperature=0,
                            response_mime_type="application/json",
                            response_schema=to_gemini_schema(
                                SemanticExtraction
                            ),
                            http_options=types.HttpOptions(
                                timeout=int(
                                    request_timeout(self.request_timeout) * 1000
                                )
                            ),
                        ),
                    )

                    return self._parse_response(response)

                except (
                    LLMInvalidResponseError,
                ) as exc:

                    failures.append(exc)

                    # Invalid output is not retried.
                    raise LLMProviderExhaustedError(
                        failures
                    ) from exc

                except LLMProviderError as exc:

                    failures.append(exc)

                    if isinstance(exc, LLMTemporaryError):
                        if attempts < self.max_retries:

                            delay = backoff_delay(
                                attempts,
                                self.backoff_base,
                                self.backoff_max,
                                getattr(
                                    exc,
                                    "retry_after",
                                    None,
                                ),
                            )

                            if not can_wait(delay):
                                raise LLMProviderExhaustedError(
                                    failures
                                )

                            self.sleep(delay)
                            attempts += 1
                            continue

                    raise LLMProviderExhaustedError(
                        failures
                    ) from exc

                except Exception as exc:

                    error = self._classify_exception(exc)

                    failures.append(error)

                    if isinstance(error, LLMTemporaryError):

                        if attempts < self.max_retries:

                            delay = backoff_delay(
                                attempts,
                                self.backoff_base,
                                self.backoff_max,
                                getattr(
                                    error,
                                    "retry_after",
                                    None,
                                ),
                            )

                            if not can_wait(delay):
                                raise LLMProviderExhaustedError(
                                    failures
                                )

                            self.sleep(delay)
                            attempts += 1
                            continue

                    raise LLMProviderExhaustedError(
                        failures
                    ) from exc
