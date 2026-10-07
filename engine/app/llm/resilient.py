"""Provider fallback chain + factory.

    primary provider (its own model fallbacks / retries)
        -> next configured provider -> ...
    all failed -> ONE application-level error with a therapist-safe message.

Whatever a provider returns is validated once more here, so no provider (present
or future) can hand unvalidated output to the assessment flow.
"""
from __future__ import annotations

import logging

from app.core.config import Settings, settings as default_settings
from app.core.exceptions import (
    LLMConfigurationError,
    LLMNotConfiguredError,
    LLMProviderError,
    LLMServiceError,
    LLMTemporaryError,
    LLMUnavailableError,
)
from app.llm.base import LLMProvider
from app.llm.json_utils import validate_extraction
from app.llm.retry import deadline_scope, remaining_seconds
from app.llm.safe_logging import log_attempt, scrub
from app.llm.schemas import SemanticExtraction


class ResilientLLMProvider(LLMProvider):
    def __init__(self, providers: list[LLMProvider], *, config_failures: list[LLMProviderError] | None = None,
                 total_timeout: float = 180.0):
        self._providers = list(providers)
        self._config_failures = list(config_failures or [])
        self.total_timeout = total_timeout

    @property
    def provider_names(self) -> list[str]:
        return [getattr(p, "provider_name", type(p).__name__) for p in self._providers]

    def extract_semantics(self, text: str, *, context: dict | None = None) -> SemanticExtraction:
        failures: list[LLMProviderError] = list(self._config_failures)

        with deadline_scope(self.total_timeout):
            for idx, provider in enumerate(self._providers):
                name = getattr(provider, "provider_name", type(provider).__name__)
                rem = remaining_seconds()
                if rem is not None and rem <= 0:
                    failures.append(LLMTemporaryError("overall deadline exceeded",
                                                      category="deadline_exceeded", provider=name))
                    break
                # Share the remaining time so a slow primary cannot starve the fallback provider.
                share = None if rem is None else rem / (len(self._providers) - idx)
                try:
                    with deadline_scope(share if share is not None else self.total_timeout):
                        result = provider.extract_semantics(text, context=context)
                    return validate_extraction(result)  # defence in depth: never return unvalidated output
                except LLMProviderError as exc:
                    failures.append(exc)
                    log_attempt(logging.WARNING, "provider_failed", provider=name, model=getattr(exc, "model", None),
                                category=exc.category, status=getattr(exc, "status_code", None),
                                attempt=idx + 1, action="next_provider" if idx + 1 < len(self._providers) else "give_up",
                                detail=scrub(exc, sensitive=[text]))
                except Exception as exc:  # noqa: BLE001 - a bug in a provider must not leak or crash the flow
                    logging.getLogger("anahat.llm").exception("llm.provider_internal_error provider=%s", name)
                    failures.append(LLMProviderError(f"unexpected {type(exc).__name__}",
                                                     category="internal_error", provider=name))

        raise self._final_error(failures)

    def validate_candidates(self, text: str, concept: dict, candidates: list[dict]):
        """Closed-set validation through the first provider that supports it.
        Raises LLMServiceError if every capable provider fails; the caller degrades gracefully."""
        failures: list[LLMProviderError] = []
        capable = [p for p in self._providers if callable(getattr(p, "validate_candidates", None))]
        if not capable:
            raise LLMNotConfiguredError()
        with deadline_scope(self.total_timeout):
            for provider in capable:
                try:
                    return provider.validate_candidates(text, concept, candidates)
                except LLMProviderError as exc:
                    failures.append(exc)
                except Exception:  # noqa: BLE001
                    logging.getLogger("anahat.llm").exception("llm.validate_internal_error")
        raise self._final_error(failures)

    @staticmethod
    def _final_error(failures: list[LLMProviderError]) -> LLMServiceError:
        cats = ",".join(f"{f.provider or '?'}:{f.category}" for f in failures) or "no_provider_configured"
        # Configuration problems only (missing key, bad model, auth) -> admin message; anything
        # involving a temporary/invalid-output failure -> "retry in a few seconds".
        if not failures or all(f.is_configuration for f in failures):
            log_attempt(logging.ERROR, "all_providers_failed", outcome="not_configured", failures=cats)
            return LLMNotConfiguredError()
        log_attempt(logging.ERROR, "all_providers_failed", outcome="unavailable", failures=cats)
        return LLMUnavailableError()


# --------------------------------------------------------------------------- #
# Factory
# --------------------------------------------------------------------------- #
def _build_one(name: str, cfg: Settings, primary: str) -> LLMProvider:
    is_primary = name == primary
    if name in {"local", "ollama"}:
        from app.llm.local_provider import LocalOllamaProvider
        return LocalOllamaProvider(
            base_url=cfg.local_llm_url,
            model=cfg.local_llm_model,
            keep_alive=cfg.local_llm_keep_alive,
            request_timeout=cfg.llm_request_timeout_seconds,
            total_timeout=cfg.llm_total_timeout_seconds,
        )
    if name == "mistral":
        from app.llm.mistral_provider import MistralProvider
        return MistralProvider(
            api_key=cfg.mistral_api_key,
            model=cfg.mistral_model,
            base_url=cfg.mistral_base_url,
            request_timeout=cfg.llm_request_timeout_seconds,
            total_timeout=cfg.llm_total_timeout_seconds,
        )
    if name == "openrouter":
        from app.llm.openrouter_provider import OpenRouterProvider
        return OpenRouterProvider(
            api_key=cfg.openrouter_api_key,
            model=cfg.llm_model if is_primary else cfg.openrouter_model,
            fallback_models=cfg.openrouter_fallback_model_list,
            base_url=cfg.openrouter_base_url,
            request_timeout=cfg.llm_request_timeout_seconds,
            total_timeout=cfg.llm_total_timeout_seconds,
            max_retries=cfg.llm_max_retries,
            backoff_base=cfg.llm_retry_backoff_seconds,
            backoff_max=cfg.llm_retry_backoff_max_seconds,
        )
    if name == "gemini":
        from app.llm.gemini_provider import GeminiProvider
        model = cfg.llm_model if is_primary else cfg.gemini_model
        if not model:
            raise LLMConfigurationError(
                "Gemini fallback model is not configured",
                category="configuration",
                provider="gemini",
            )
        return GeminiProvider(
            model=model,
            api_key=cfg.gemini_api_key,
            request_timeout=cfg.llm_request_timeout_seconds,
            total_timeout=cfg.llm_total_timeout_seconds,
            max_retries=cfg.llm_max_retries,
            backoff_base=cfg.llm_retry_backoff_seconds,
            backoff_max=cfg.llm_retry_backoff_max_seconds,
        )
    raise LLMConfigurationError(f"unsupported provider '{name}'", category="configuration", provider=name)


def build_llm_provider(cfg: Settings | None = None) -> ResilientLLMProvider:
    """Build the configured chain. Never raises: config problems are recorded, logged, and
    surface as a safe 'not configured' error at request time (unless a fallback works)."""
    cfg = cfg or default_settings
    primary = (cfg.llm_provider or "").strip().lower()
    names: list[str] = []
    for n in [primary, *cfg.llm_fallback_provider_list]:
        if n and n not in names:
            names.append(n)

    providers: list[LLMProvider] = []
    config_failures: list[LLMProviderError] = []
    for name in names:
        try:
            providers.append(_build_one(name, cfg, primary))
        except LLMConfigurationError as exc:
            exc.provider = exc.provider or name
            config_failures.append(exc)
            log_attempt(logging.WARNING, "optional_provider_skipped", provider=name, category=exc.category)

    return ResilientLLMProvider(providers, config_failures=config_failures,
                                total_timeout=cfg.llm_total_timeout_seconds)
