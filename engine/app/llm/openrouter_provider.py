from __future__ import annotations

import time
from typing import Any, Callable

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    NotFoundError,
    OpenAI,
    PermissionDeniedError,
    RateLimitError,
)

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
from app.llm.retry import (
    backoff_delay,
    can_wait,
    classify_status,
    deadline_scope,
    remaining_seconds,
    request_timeout,
)
from app.llm.safe_logging import log_attempt, scrub
from app.llm.schemas import SemanticExtraction


MAX_MODELS_PER_REQUEST = 3


def build_model_chain(
    primary: str | None,
    fallbacks: list[str] | None,
):
    """Validate and normalize the OpenRouter model chain."""

    if not primary or not isinstance(primary, str):
        raise LLMConfigurationError(
            "primary model is not configured",
            category="configuration",
            provider="openrouter",
        )

    primary = primary.strip()

    if (
        not primary
        or " " in primary
        or "," in primary
        or "/" not in primary
    ):
        raise LLMConfigurationError(
            "invalid primary model",
            category="configuration",
            provider="openrouter",
        )

    chain = [primary]
    dropped: list[str] = []

    for model in fallbacks or []:
        if not isinstance(model, str):
            continue

        model = model.strip()

        if not model:
            continue

        if " " in model or "," in model or "/" not in model:
            dropped.append(model)
            continue

        if model not in chain:
            chain.append(model)

    return chain, dropped


def _same_model(left: str | None, right: str | None) -> bool:
    """
    Compare model identifiers while tolerating provider variant suffixes.

    Example:
        vendor/fallback-one
        vendor/fallback-one:free

    are considered the same model.
    """
    if not left or not right:
        return False

    left = left.strip()
    right = right.strip()

    if left == right:
        return True

    return left.split(":", 1)[0] == right.split(":", 1)[0]


class OpenRouterProvider(LLMProvider):
    provider_name = "openrouter"

    def __init__(
        self,
        *,
        api_key: str | None,
        model: str | None,
        fallback_models: list[str] | None = None,
        base_url: str = "https://openrouter.ai/api/v1",
        request_timeout: float = 90.0,
        total_timeout: float = 180.0,
        max_retries: int = 1,
        backoff_base: float = 0.5,
        backoff_max: float = 8.0,
        sleep: Callable[[float], None] = time.sleep,
        client: OpenAI | None = None,
    ):
        if not api_key:
            raise LLMConfigurationError(
                "OPENROUTER_API_KEY is not configured",
                category="configuration",
                provider="openrouter",
            )

        self.api_key = api_key
        self.request_timeout = request_timeout
        self.total_timeout = total_timeout
        self.max_retries = max(0, int(max_retries))
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max
        self.sleep = sleep

        self.chain, self.dropped_models = build_model_chain(
            model,
            fallback_models,
        )

        self.model = self.chain[0]

        self.client = client or OpenAI(
            api_key=api_key,
            base_url=base_url,
            max_retries=0,
            default_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "ANAHAT AI Engine",
            },
        )

    # ------------------------------------------------------------------ #
    # Exception classification
    # ------------------------------------------------------------------ #

    @staticmethod
    def _status_from_exception(exc: BaseException) -> int | None:
        response = getattr(exc, "response", None)
        return getattr(response, "status_code", None)

    @staticmethod
    def _retry_after(exc: BaseException) -> float | None:
        response = getattr(exc, "response", None)

        if response is None:
            return None

        headers = getattr(response, "headers", None)

        if not headers:
            return None

        value = headers.get("retry-after")

        if value is None:
            return None

        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @classmethod
    def _classify_exception(
        cls,
        exc: BaseException,
        *,
        model: str,
    ) -> LLMProviderError:

        status = cls._status_from_exception(exc)

        if isinstance(exc, RateLimitError):
            status = status or 429

        elif isinstance(exc, APITimeoutError):
            status = status or 408

        elif isinstance(exc, AuthenticationError):
            status = status or 401

        elif isinstance(exc, PermissionDeniedError):
            status = status or 403

        elif isinstance(exc, BadRequestError):
            status = status or 400

        elif isinstance(exc, NotFoundError):
            status = status or 404

        elif isinstance(exc, InternalServerError):
            status = status or 500

        elif isinstance(exc, APIConnectionError):
            return LLMTemporaryError(
                "connection failure",
                category="timeout",
                provider="openrouter",
                model=model,
            )
        if status == 404:
            return LLMProviderError(
                scrub(exc),
                category="model_not_found",
                provider="openrouter",
                model=model,
                status_code=404,
            )
        return classify_status(
            status,
            provider="openrouter",
            model=model,
            detail=scrub(exc),
            retry_after=cls._retry_after(exc),
        )

    # ------------------------------------------------------------------ #
    # Response handling
    # ------------------------------------------------------------------ #

    def _parse_response(
        self,
        response: Any,
        *,
        requested_model: str,
    ) -> tuple[SemanticExtraction, str | None]:

        # OpenRouter-compatible APIs may return an HTTP 200 containing
        # an error object instead of raising an SDK exception.
        error = getattr(response, "error", None)

        if error:
            code = getattr(error, "code", None)

            if code is None and isinstance(error, dict):
                code = error.get("code")

            if isinstance(code, str):
                try:
                    code = int(code)
                except ValueError:
                    pass

            if code == 429:
                raise classify_status(
                    429,
                    provider="openrouter",
                    model=requested_model,
                    detail="rate limited",
                )

            raise LLMProviderError(
                "provider returned an error response",
                category="provider_error",
                provider="openrouter",
                model=requested_model,
                status_code=code,
            )

        # The local mock returns a plain dict for the error-body case,
        # while the real SDK returns a ChatCompletion object.
        if isinstance(response, dict) and response.get("error"):
            error = response["error"]
            code = error.get("code")

            if isinstance(code, str):
                try:
                    code = int(code)
                except ValueError:
                    pass

            if code == 429:
                raise classify_status(
                    429,
                    provider="openrouter",
                    model=requested_model,
                    detail="rate limited",
                )

            raise LLMProviderError(
                "provider returned an error response",
                category="provider_error",
                provider="openrouter",
                model=requested_model,
                status_code=code,
            )

        choices = (
            response.get("choices")
            if isinstance(response, dict)
            else getattr(response, "choices", None)
        )

        if not choices:
            raise LLMInvalidResponseError(
                "provider returned no choices",
                category="empty_response",
                provider="openrouter",
                model=requested_model,
            )

        choice = choices[0]

        if isinstance(choice, dict):
            message = choice.get("message") or {}
            content = message.get("content")
        else:
            message = getattr(choice, "message", None)
            content = getattr(message, "content", None) if message else None

        if not content:
            raise LLMInvalidResponseError(
                "provider returned empty content",
                category="empty_response",
                provider="openrouter",
                model=requested_model,
            )

        answered_model = (
            response.get("model")
            if isinstance(response, dict)
            else getattr(response, "model", None)
        )

        try:
            extraction = parse_extraction_json(content)
        except LLMProviderError as exc:
            exc.model = answered_model or requested_model
            raise
        except Exception as exc:
            raise LLMInvalidResponseError(
                f"response parsing failed: {type(exc).__name__}",
                category="invalid_json",
                provider="openrouter",
                model=requested_model,
            ) from exc

        return extraction, answered_model

    # ------------------------------------------------------------------ #
    # One HTTP request
    # ------------------------------------------------------------------ #

    def _request(
        self,
        model: str,
        server_fallbacks: list[str],
        prompt: str,
    ) -> tuple[SemanticExtraction, str | None]:

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are the ANAHAT semantic extraction component. "
                        "Extract only information explicitly present in the "
                        "patient response. Do not diagnose, infer chakras, "
                        "infer energetic states, or recommend ragas."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        prompt
                        + "\n\nRequired JSON schema:\n"
                        + str(SemanticExtraction.model_json_schema())
                    ),
                },
            ],
            "temperature": 0,
            "timeout": request_timeout(self.request_timeout),
        }

        if server_fallbacks:
            kwargs["extra_body"] = {
                "models": server_fallbacks[:MAX_MODELS_PER_REQUEST - 1]
            }

        response = self.client.chat.completions.create(**kwargs)

        return self._parse_response(
            response,
            requested_model=model,
        )

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

        with deadline_scope(self.total_timeout):
            # A window contains the model being explicitly requested plus
            # up to two server-side fallback models.
            #
            # Example:
            # [m1, m2, m3] -> one OpenRouter request
            # [m4, m5]    -> next client-side request
            for window_start in range(
                0,
                len(self.chain),
                MAX_MODELS_PER_REQUEST,
            ):
                window = self.chain[
                    window_start:
                    window_start + MAX_MODELS_PER_REQUEST
                ]

                primary_model = window[0]

                attempts = 0

                while True:

                    rem = remaining_seconds()

                    if rem is not None and rem <= 0:
                        failures.append(
                            LLMTemporaryError(
                                "overall deadline exceeded",
                                category="deadline_exceeded",
                                provider="openrouter",
                                model=primary_model,
                            )
                        )
                        raise LLMProviderExhaustedError(failures)

                    try:
                        extraction, answered_model = self._request(
                            primary_model,
                            window[1:],
                            prompt,
                        )
                        canonical_model = answered_model or primary_model

                        if answered_model:
                            for candidate in self.chain:
                                if _same_model(answered_model, candidate):
                                    canonical_model = candidate
                                    break
                        log_attempt(
                            20,
                            "provider_success",
                            provider="openrouter",
                            model=canonical_model,
                            attempt=attempts + 1,
                        )

                        return extraction

                    except LLMProviderError as exc:

                        failures.append(exc)

                        category = exc.category

                        # -------------------------------------------------- #
                        # Transient HTTP failure:
                        # retry the SAME primary model.
                        #
                        # Do not move to the next fallback window simply
                        # because a 429/503 happened.
                        # -------------------------------------------------- #
                        if isinstance(exc, LLMTemporaryError):

                            if attempts < self.max_retries:

                                delay = backoff_delay(
                                    attempts,
                                    self.backoff_base,
                                    self.backoff_max,
                                    getattr(exc, "retry_after", None),
                                )

                                if not can_wait(delay):
                                    failures.append(
                                        LLMTemporaryError(
                                            "overall deadline exceeded",
                                            category="deadline_exceeded",
                                            provider="openrouter",
                                            model=primary_model,
                                        )
                                    )
                                    raise LLMProviderExhaustedError(
                                        failures
                                    )

                                log_attempt(
                                    30,
                                    "provider_retry",
                                    provider="openrouter",
                                    model=primary_model,
                                    category=category,
                                    status=getattr(
                                        exc,
                                        "status_code",
                                        None,
                                    ),
                                    attempt=attempts + 1,
                                    action="retry",
                                    detail=scrub(
                                        exc,
                                        sensitive=[text],
                                    ),
                                )

                                self.sleep(delay)
                                attempts += 1
                                continue

                            log_attempt(
                                30,
                                "provider_failed",
                                provider="openrouter",
                                model=primary_model,
                                category=category,
                                status=getattr(exc, "status_code", None),
                                attempt=attempts + 1,
                                action="next_provider",
                                detail=scrub(exc, sensitive=[text]),
                            )

                            # Retry budget exhausted.
                            raise LLMProviderExhaustedError(
                                failures
                            )

                        # -------------------------------------------------- #
                        # Configuration failures stop immediately.
                        # -------------------------------------------------- #
                        if exc.is_configuration:
                            raise LLMProviderExhaustedError(
                                failures
                            )

                        # -------------------------------------------------- #
                        # 404 means this model/window is unavailable.
                        #
                        # Move to the next client-side window.
                        # -------------------------------------------------- #
                        if (
                            getattr(exc, "status_code", None) == 404
                            or category == "model_not_found"
                        ):
                            log_attempt(
                                30,
                                "provider_failed",
                                provider="openrouter",
                                model=primary_model,
                                category=category,
                                status=getattr(
                                    exc,
                                    "status_code",
                                    None,
                                ),
                                attempt=attempts + 1,
                                action="next_window",
                            )
                            break

                        # -------------------------------------------------- #
                        # Invalid JSON/schema/empty response.
                        #
                        # Try the next model individually.
                        #
                        # This is deliberately different from a transient
                        # HTTP failure: the request succeeded, but the
                        # returned content was unusable.
                        # -------------------------------------------------- #
                        if category in {
                            "invalid_json",
                            "schema_invalid",
                            "empty_response",
                        }:

                            answered_model = getattr(
                                exc,
                                "model",
                                None,
                            )

                            # Determine the next model after the model
                            # which actually answered, tolerating ":free"
                            # suffix differences.
                            next_index = window_start + 1

                            if answered_model:
                                for idx, candidate in enumerate(
                                    self.chain
                                ):
                                    if _same_model(
                                        answered_model,
                                        candidate,
                                    ):
                                        next_index = idx + 1
                                        break

                            # Try the next model through the chain.
                            if next_index < len(self.chain):
                                # We don't jump directly into the outer
                                # window loop because the next model may be
                                # inside the same server-side window.
                                #
                                # The next iteration starts a new request
                                # with that model as primary.
                                remaining_chain = self.chain[next_index:]

                                if not remaining_chain:
                                    raise LLMProviderExhaustedError(
                                        failures
                                    )

                                for next_model_index, next_model in enumerate(
                                    remaining_chain
                                ):
                                    # Avoid duplicating the whole algorithm:
                                    # make this model the effective primary
                                    # and use following models as server-side
                                    # fallbacks.
                                    try:
                                        extraction, answered = self._request(
                                            next_model,
                                            remaining_chain[
                                                next_model_index + 1:
                                            ],
                                            prompt,
                                        )
                                        return extraction

                                    except LLMProviderError as next_exc:
                                        failures.append(next_exc)

                                        if (
                                            next_exc.is_configuration
                                            or isinstance(
                                                next_exc,
                                                LLMTemporaryError,
                                            )
                                        ):
                                            raise LLMProviderExhaustedError(
                                                failures
                                            )

                                        if getattr(
                                            next_exc,
                                            "status_code",
                                            None,
                                        ) == 404:
                                            continue

                                        if next_exc.category in {
                                            "invalid_json",
                                            "schema_invalid",
                                            "empty_response",
                                        }:
                                            continue
                                        if window_start + MAX_MODELS_PER_REQUEST < len(self.chain):
                                            break   
                                        raise LLMProviderExhaustedError(
                                            failures
                                        )

                                raise LLMProviderExhaustedError(
                                    failures
                                )

                            raise LLMProviderExhaustedError(
                                failures
                            )

                        raise LLMProviderExhaustedError(
                            failures
                        )

                    except (APITimeoutError, TimeoutError) as exc:
                        error = LLMTemporaryError(
                            "request timeout",
                            category="timeout",
                            provider="openrouter",
                            model=primary_model,
                        )

                        failures.append(error)

                        if attempts < self.max_retries:
                            delay = backoff_delay(
                                attempts,
                                self.backoff_base,
                                self.backoff_max,
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

                    except APIConnectionError as exc:
                        error = LLMTemporaryError(
                            "connection failure",
                            category="timeout",
                            provider="openrouter",
                            model=primary_model,
                        )

                        failures.append(error)

                        if attempts < self.max_retries:
                            delay = backoff_delay(
                                attempts,
                                self.backoff_base,
                                self.backoff_max,
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

                    except APIStatusError as exc:
                        error = self._classify_exception(
                            exc,
                            model=primary_model,
                        )

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

                            log_attempt(
                                30,
                                "provider_failed",
                                provider="openrouter",
                                model=primary_model,
                                category=error.category,
                                status=getattr(error, "status_code", None),
                                attempt=attempts + 1,
                                action="next_window" if window_start + MAX_MODELS_PER_REQUEST < len(self.chain) else "give_up",
                                detail=scrub(error, sensitive=[text]),
                            )

                            # Retry budget exhausted for this window.
                            # Continue with the next client-side window if one exists.
                            if window_start + MAX_MODELS_PER_REQUEST < len(self.chain):
                                break

                            raise LLMProviderExhaustedError(
                                failures
                            )

                        if error.is_configuration:
                            raise LLMProviderExhaustedError(
                                failures
                            )

                        if getattr(
                            error,
                            "status_code",
                            None,
                        ) == 404:
                            break

                        raise LLMProviderExhaustedError(
                            failures
                        ) from exc

                    except Exception as exc:
                        error = LLMProviderError(
                            f"unexpected {type(exc).__name__}",
                            category="internal_error",
                            provider="openrouter",
                            model=primary_model,
                        )

                        failures.append(error)

                        log_attempt(
                            40,
                            "provider_internal_error",
                            provider="openrouter",
                            model=primary_model,
                        )

                        raise LLMProviderExhaustedError(
                            failures
                        ) from exc

            raise LLMProviderExhaustedError(failures)