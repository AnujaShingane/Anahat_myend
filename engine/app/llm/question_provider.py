"""Provider chain for the adaptive question generator.

Separate from the extraction chain on purpose:
  * it has its own, short deadline (a question must not keep the patient waiting), and
  * it only talks to providers allowed to receive patient words. By default that is the
    local Ollama model only. Mistral can be added explicitly. Gemini / OpenRouter (Google /
    OpenAI-routed models) are refused unless DYNAMIC_QUESTION_ALLOW_REMOTE_PROVIDERS=true.

Every reply is validated against GeneratedQuestion here; the business rules (one question,
no chakra words, closed-set ids, duplicates, ...) are validated again by the service.
"""
from __future__ import annotations

import logging
from typing import Any, Protocol

import httpx
from pydantic import ValidationError

from app.core.config import Settings, settings as default_settings
from app.core.exceptions import (
    LLMConfigurationError,
    LLMInvalidResponseError,
    LLMProviderError,
    LLMTemporaryError,
)
from app.llm.json_utils import _candidate_json_text, _loads_object
from app.llm.question_prompts import build_question_messages
from app.llm.question_schemas import GeneratedQuestion
from app.llm.retry import deadline_scope, remaining_seconds, request_timeout

log = logging.getLogger("anahat.dynamic_questions")

_REMOTE_GOOGLE_OR_OPENAI = {"gemini", "openrouter"}


class QuestionGenerator(Protocol):
    provider_name: str

    def generate_question(self, context: dict) -> GeneratedQuestion: ...


def _parse(raw: Any, provider: str, model: str | None) -> GeneratedQuestion:
    if isinstance(raw, list):  # content chunks (Mistral)
        raw = "".join(c.get("text", "") for c in raw if isinstance(c, dict))
    if not isinstance(raw, str) or not raw.strip():
        raise LLMInvalidResponseError("empty question reply", category="empty_response",
                                      provider=provider, model=model)
    try:
        data = _loads_object(_candidate_json_text(raw))
        return GeneratedQuestion.model_validate(data)
    except LLMProviderError as exc:
        exc.provider, exc.model = provider, model
        raise
    except ValidationError as exc:
        summary = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}:{e['type']}" for e in exc.errors()[:6])
        raise LLMInvalidResponseError(f"question schema invalid: {summary}", category="schema_invalid",
                                      provider=provider, model=model) from exc


class OllamaQuestionGenerator:
    provider_name = "local"

    def __init__(self, *, base_url: str, model: str, keep_alive: str = "30m",
                 request_timeout: float = 30.0, temperature: float = 0.3, client: Any | None = None):
        if not base_url or not model:
            raise LLMConfigurationError("local model is not configured", category="configuration",
                                        provider=self.provider_name)
        self.base_url, self.model = base_url.rstrip("/"), model
        self.keep_alive, self.request_timeout, self.temperature = keep_alive, request_timeout, temperature
        self.client = client or httpx.Client()

    def generate_question(self, context: dict) -> GeneratedQuestion:
        payload = {
            "model": self.model,
            "messages": build_question_messages(context),
            "format": GeneratedQuestion.model_json_schema(),
            "stream": False,
            "keep_alive": self.keep_alive,
            # A little temperature keeps wording natural; structure is enforced by `format`.
            "options": {"temperature": self.temperature},
        }
        rem = remaining_seconds()
        if rem is not None and rem <= 0:
            raise LLMTemporaryError("question deadline exceeded", category="deadline_exceeded",
                                    provider=self.provider_name, model=self.model)
        try:
            r = self.client.post(f"{self.base_url}/api/chat", json=payload,
                                 timeout=request_timeout(self.request_timeout))
            r.raise_for_status()
        except httpx.TimeoutException as exc:
            raise LLMTemporaryError("local question request timed out", category="timeout",
                                    provider=self.provider_name, model=self.model) from exc
        except httpx.HTTPStatusError as exc:
            st = exc.response.status_code
            if st in {408, 429} or st >= 500:
                raise LLMTemporaryError("local model unavailable", category="server_error",
                                        provider=self.provider_name, model=self.model, status_code=st) from exc
            raise LLMConfigurationError("local model rejected the question request",
                                        category="model_not_found" if st == 404 else "request_rejected",
                                        provider=self.provider_name, model=self.model, status_code=st) from exc
        except httpx.RequestError as exc:
            raise LLMTemporaryError("local model unreachable", category="connection_error",
                                    provider=self.provider_name, model=self.model) from exc
        try:
            body = r.json()
        except ValueError as exc:
            raise LLMInvalidResponseError("local model returned invalid JSON", category="invalid_json",
                                          provider=self.provider_name, model=self.model) from exc
        if body.get("error"):
            raise LLMProviderError("local model returned an error", category="provider_error",
                                   provider=self.provider_name, model=self.model)
        return _parse((body.get("message") or {}).get("content"), self.provider_name, self.model)


class MistralQuestionGenerator:
    provider_name = "mistral"

    def __init__(self, *, api_key: str | None, model: str | None, base_url: str = "https://api.mistral.ai/v1",
                 request_timeout: float = 30.0, temperature: float = 0.3, client: Any | None = None):
        if not api_key or not model:
            raise LLMConfigurationError("Mistral is not configured", category="configuration",
                                        provider=self.provider_name)
        from app.llm.mistral_provider import MistralProvider
        # Reuse the existing provider's HTTP handling and error mapping.
        self._inner = MistralProvider(api_key=api_key, model=model, base_url=base_url,
                                      request_timeout=request_timeout, total_timeout=request_timeout,
                                      client=client)
        self.model, self.temperature = model, temperature

    def generate_question(self, context: dict) -> GeneratedQuestion:
        base = {"model": self.model, "temperature": self.temperature, "messages": build_question_messages(context)}
        strict = {**base, "response_format": {"type": "json_schema", "json_schema": {
            "name": "adaptive_question", "schema": GeneratedQuestion.model_json_schema(), "strict": True}}}
        try:
            body = self._inner._post(strict)
        except LLMConfigurationError as exc:
            if exc.status_code not in (400, 422):
                raise
            body = self._inner._post({**base, "response_format": {"type": "json_object"}})
        try:
            raw = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMInvalidResponseError("mistral returned no content", category="empty_response",
                                          provider=self.provider_name, model=self.model) from exc
        return _parse(raw, self.provider_name, self.model)


class QuestionGeneratorChain:
    """Tries each allowed provider in order inside one overall deadline."""

    def __init__(self, generators: list, *, total_timeout: float, config_failures: list | None = None):
        self.generators = list(generators)
        self.total_timeout = total_timeout
        self.config_failures = list(config_failures or [])

    @property
    def provider_names(self) -> list[str]:
        return [getattr(g, "provider_name", type(g).__name__) for g in self.generators]

    def generate_question(self, context: dict) -> tuple[GeneratedQuestion, str]:
        """Returns (output, provider_name). Raises LLMProviderError when every provider failed."""
        failures: list[str] = [f"{getattr(f, 'provider', '?')}:{getattr(f, 'category', '?')}"
                               for f in self.config_failures]
        if not self.generators:
            raise LLMConfigurationError("no question provider is configured", category="configuration",
                                        provider="dynamic_questions")
        with deadline_scope(self.total_timeout):
            for gen in self.generators:
                name = getattr(gen, "provider_name", type(gen).__name__)
                rem = remaining_seconds()
                if rem is not None and rem <= 0:
                    failures.append(f"{name}:deadline_exceeded")
                    break
                try:
                    return gen.generate_question(context), name
                except LLMProviderError as exc:
                    failures.append(f"{name}:{exc.category}")
                    log.warning("dynamic_question.provider_failed provider=%s category=%s", name, exc.category)
                except Exception as exc:  # noqa: BLE001 - a provider bug must never break the assessment
                    failures.append(f"{name}:internal_error")
                    log.exception("dynamic_question.provider_internal_error provider=%s (%s)", name, type(exc).__name__)
        raise LLMTemporaryError("all question providers failed: " + ",".join(failures),
                                category="all_failed", provider="dynamic_questions")


def build_question_generator(cfg: Settings | None = None) -> QuestionGeneratorChain:
    """Never raises: configuration problems are recorded and the caller falls back to the KB."""
    cfg = cfg or default_settings
    names: list[str] = []
    for raw in (cfg.dynamic_question_providers or "").split(","):
        n = raw.strip().lower()
        if n == "ollama":
            n = "local"
        if n and n not in names:
            names.append(n)
    gens, failures = [], []
    for name in names:
        try:
            if name in _REMOTE_GOOGLE_OR_OPENAI and not cfg.dynamic_question_allow_remote_providers:
                raise LLMConfigurationError(
                    f"{name} refused for question generation: patient words may not be sent to "
                    "Google/OpenAI-routed models (set DYNAMIC_QUESTION_ALLOW_REMOTE_PROVIDERS=true to override)",
                    category="privacy_blocked", provider=name)
            if name == "local":
                gens.append(OllamaQuestionGenerator(
                    base_url=cfg.local_llm_url, model=cfg.dynamic_question_model or cfg.local_llm_model,
                    keep_alive=cfg.local_llm_keep_alive, request_timeout=cfg.dynamic_question_timeout_seconds,
                    temperature=cfg.dynamic_question_temperature))
            elif name == "mistral":
                gens.append(MistralQuestionGenerator(
                    api_key=cfg.mistral_api_key, model=cfg.mistral_model, base_url=cfg.mistral_base_url,
                    request_timeout=cfg.dynamic_question_timeout_seconds,
                    temperature=cfg.dynamic_question_temperature))
            elif name in _REMOTE_GOOGLE_OR_OPENAI:
                raise LLMConfigurationError(f"{name} question generation is not implemented",
                                            category="configuration", provider=name)
            else:
                raise LLMConfigurationError(f"unsupported question provider '{name}'",
                                            category="configuration", provider=name)
        except LLMConfigurationError as exc:
            failures.append(exc)
            log.warning("dynamic_question.provider_skipped provider=%s category=%s", name, exc.category)
    return QuestionGeneratorChain(gens, total_timeout=cfg.dynamic_question_timeout_seconds,
                                  config_failures=failures)
