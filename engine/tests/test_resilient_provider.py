"""Provider fallback flow, single clean application error, config errors, logging hygiene, no fabrication."""
import logging

import pytest

from app.core.config import Settings
from app.core.exceptions import (LLMNotConfiguredError, LLMProviderError, LLMServiceError, LLMUnavailableError,
                                 USER_MESSAGE_NOT_CONFIGURED, USER_MESSAGE_UNAVAILABLE)
from app.llm.gemini_provider import GeminiProvider
from app.llm.openrouter_provider import OpenRouterProvider
from app.llm.resilient import ResilientLLMProvider, build_llm_provider
from app.llm.schemas import SemanticExtraction
from tests.helpers import (FakeGemini, MockOpenRouter, NEGATIVE_TEXT, POSITIVE_TEXT, Sleeps, as_json, concept_texts,
                           fail, gemini_error, gemini_reply, negative_payload, ok, positive_payload)

MODELS = ["z-ai/primary:free", "vendor/fb-one:free"]
LEAK_TERMS = ["429", "503", "502", "upstream", "UpstreamCo", "openrouter", "gemini", "z-ai", "vendor/",
              "http://", "https://", "127.0.0.1", "Traceback", "api key", "test-key-not-real"]


def openrouter(srv, **kw):
    return OpenRouterProvider(api_key="test-key-not-real", model=MODELS[0], fallback_models=MODELS[1:],
                              base_url=srv.url, max_retries=kw.pop("max_retries", 0), backoff_base=0,
                              backoff_max=0, sleep=Sleeps(), **kw)


def gemini(client, **kw):
    return GeminiProvider(client=client, model="gemini-test-model", max_retries=kw.pop("max_retries", 1),
                          backoff_base=0, backoff_max=0, sleep=Sleeps(), **kw)


# ---- the fallback flow from the spec ---------------------------------------------------------
def test_flow_openrouter_success_never_touches_gemini():
    g = FakeGemini([gemini_reply(parsed=positive_payload())])
    with MockOpenRouter([ok(as_json(positive_payload()), MODELS[0])]) as srv:
        r = ResilientLLMProvider([openrouter(srv), gemini(g)]).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"] and g.calls == []


def test_flow_openrouter_fallback_model_then_success():
    with MockOpenRouter([ok("junk", MODELS[0]), ok(as_json(positive_payload()), MODELS[1])]) as srv:
        r = ResilientLLMProvider([openrouter(srv)]).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"] and srv.call_count == 2


def test_flow_all_openrouter_models_fail_then_gemini_succeeds():
    g = FakeGemini([gemini_reply(parsed=positive_payload())])
    with MockOpenRouter([fail(429, "rate limited")]) as srv:
        r = ResilientLLMProvider([openrouter(srv), gemini(g)]).extract_semantics(POSITIVE_TEXT)
    assert isinstance(r, SemanticExtraction) and concept_texts(r) == ["lower back pain"]
    assert len(g.calls) == 1


def test_flow_gemini_temporary_failure_recovers_within_its_own_retry_budget():
    g = FakeGemini([gemini_error(503, "UNAVAILABLE"), gemini_reply(parsed=positive_payload())])
    with MockOpenRouter([fail(503)]) as srv:
        r = ResilientLLMProvider([openrouter(srv), gemini(g)]).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"] and len(g.calls) == 2


def test_flow_gemini_timeout_falls_back_to_openrouter():
    import httpx

    g = FakeGemini([httpx.ReadTimeout("timed out"), httpx.ReadTimeout("timed out")])
    with MockOpenRouter([ok(as_json(positive_payload()), MODELS[0])]) as srv:
        provider = ResilientLLMProvider(
            [gemini(g, max_retries=1), openrouter(srv, max_retries=0)],
            total_timeout=120,
        )
        result = provider.extract_semantics(POSITIVE_TEXT)

    assert concept_texts(result) == ["lower back pain"]
    assert len(g.calls) == 2 and srv.call_count == 1


# ---- H. everything fails -> ONE clean application error ---------------------------------------------
def test_H_all_providers_fail_raises_one_safe_unavailable_error():
    g = FakeGemini([gemini_error(503, "UNAVAILABLE", "The model is overloaded. Try again later.")])
    with MockOpenRouter([fail(429, "Provider returned error", headers=None)]) as srv:
        with pytest.raises(LLMServiceError) as ei:
            ResilientLLMProvider([openrouter(srv, max_retries=1), gemini(g, max_retries=1)]).extract_semantics(POSITIVE_TEXT)
    exc = ei.value
    assert isinstance(exc, LLMUnavailableError)
    assert str(exc) == exc.user_message == USER_MESSAGE_UNAVAILABLE == \
        "Nadika is temporarily unavailable. Please retry in a few seconds."
    assert exc.retryable and exc.http_status == 502 and exc.code == "LLM_UNAVAILABLE"
    blob = " ".join([str(exc), repr(exc), exc.user_message, exc.code])
    for term in LEAK_TERMS:
        assert term.lower() not in blob.lower(), f"leaked {term!r}"


def test_H_invalid_output_everywhere_is_also_unavailable_not_a_fake_result():
    g = FakeGemini([gemini_reply(text="not json")])
    with MockOpenRouter([ok("nope", MODELS[0]), ok("nope", MODELS[1])]) as srv:
        with pytest.raises(LLMUnavailableError):
            ResilientLLMProvider([openrouter(srv), gemini(g)]).extract_semantics(POSITIVE_TEXT)


# ---- configuration errors get a DIFFERENT safe message ----------------------------------------------
def test_configuration_only_failure_gives_not_configured_message():
    with MockOpenRouter([fail(401, "invalid key")]) as srv:
        with pytest.raises(LLMNotConfiguredError) as ei:
            ResilientLLMProvider([openrouter(srv)]).extract_semantics(POSITIVE_TEXT)
    assert str(ei.value) == USER_MESSAGE_NOT_CONFIGURED == \
        "Nadika is not configured correctly. Please contact the administrator."
    assert not ei.value.retryable and ei.value.code == "LLM_NOT_CONFIGURED"


def test_missing_keys_via_factory_do_not_raise_at_build_time_but_fail_safely_at_request_time():
    cfg = Settings(_env_file=None, llm_provider="openrouter", llm_model="a/b:free", openrouter_api_key=None,
                   gemini_api_key=None)
    provider = build_llm_provider(cfg)                  # must not raise
    with pytest.raises(LLMNotConfiguredError):
        provider.extract_semantics(POSITIVE_TEXT)


def test_unsupported_provider_is_not_configured_error():
    cfg = Settings(_env_file=None, llm_provider="together", llm_model="x")
    with pytest.raises(LLMNotConfiguredError):
        build_llm_provider(cfg).extract_semantics(POSITIVE_TEXT)


def test_mixed_config_and_temporary_failure_is_unavailable_not_misconfigured():
    g = FakeGemini([gemini_error(503, "UNAVAILABLE")])
    cfg_fail = build_llm_provider(Settings(_env_file=None, llm_provider="openrouter", llm_model="a/b:free",
                                           openrouter_api_key=None))
    combo = ResilientLLMProvider([gemini(g, max_retries=0)], config_failures=cfg_fail._config_failures)
    with pytest.raises(LLMUnavailableError):
        combo.extract_semantics(POSITIVE_TEXT)


def test_factory_builds_configured_chain_in_order():
    cfg = Settings(_env_file=None, llm_provider="openrouter", llm_model="z-ai/primary:free",
                   openrouter_api_key="k", openrouter_fallback_models="vendor/fb-one:free, vendor/fb-two:free",
                   llm_fallback_providers="gemini", gemini_api_key="g", gemini_model="gemini-test-model",
                   llm_max_retries=2)
    p = build_llm_provider(cfg)
    assert p.provider_names == ["openrouter", "gemini"]
    orp, gm = p._providers
    assert orp.chain == ["z-ai/primary:free", "vendor/fb-one:free", "vendor/fb-two:free"]
    assert orp.max_retries == 2 and gm.model == "gemini-test-model"


def test_fallback_provider_without_its_own_model_is_reported_not_guessed():
    cfg = Settings(_env_file=None, llm_provider="openrouter", llm_model="z-ai/primary:free",
                   openrouter_api_key="k", llm_fallback_providers="gemini", gemini_api_key="g")   # no GEMINI_MODEL
    p = build_llm_provider(cfg)
    assert p.provider_names == ["openrouter"]                                    # gemini skipped, not guessed
    assert p._config_failures and p._config_failures[0].provider == "gemini"


# ---- defence in depth ------------------------------------------------------------------------------
def test_composite_revalidates_whatever_a_provider_returns():
    class Sloppy:
        provider_name = "sloppy"
        def extract_semantics(self, text, *, context=None):
            return SemanticExtraction.model_construct(concepts=[{"concept": "x", "polarity": "bogus"}])
    with pytest.raises(LLMUnavailableError):
        ResilientLLMProvider([Sloppy()]).extract_semantics(POSITIVE_TEXT)


def test_unexpected_exception_in_provider_is_contained_and_falls_through():
    class Buggy:
        provider_name = "buggy"
        def extract_semantics(self, text, *, context=None):
            raise KeyError("secret internal detail")
    g = FakeGemini([gemini_reply(parsed=positive_payload())])
    assert concept_texts(ResilientLLMProvider([Buggy(), gemini(g)]).extract_semantics(POSITIVE_TEXT)) == ["lower back pain"]
    with pytest.raises(LLMUnavailableError) as ei:
        ResilientLLMProvider([Buggy()]).extract_semantics(POSITIVE_TEXT)
    assert "secret internal detail" not in str(ei.value)


# ---- N. no fabricated concepts ----------------------------------------------------------------------
def test_N_failure_never_returns_a_result_object():
    for script in ([fail(503)], [ok("", MODELS[0])], [ok("garbage", MODELS[0])]):
        with MockOpenRouter(script) as srv:
            result = None
            with pytest.raises(LLMServiceError):
                result = ResilientLLMProvider([openrouter(srv)]).extract_semantics(POSITIVE_TEXT)
            assert result is None      # no empty-concepts "success", no default object


def test_N_provider_output_is_returned_verbatim_never_augmented():
    # The provider says "no concepts" for text that mentions pain: we return exactly that (a valid answer),
    # we do NOT fill in a symptom ourselves.
    with MockOpenRouter([ok('{"concepts": []}', MODELS[0])]) as srv:
        r = ResilientLLMProvider([openrouter(srv)]).extract_semantics(POSITIVE_TEXT)
    assert r.concepts == []


def test_N_negation_survives_the_whole_chain():
    with MockOpenRouter([ok(as_json(negative_payload()), MODELS[0])]) as srv:
        r = ResilientLLMProvider([openrouter(srv)]).extract_semantics(NEGATIVE_TEXT)
    assert [c.polarity for c in r.concepts] == ["negative"]


# ---- logging hygiene ---------------------------------------------------------------------------------
def test_logs_contain_technical_detail_but_no_secrets_or_patient_text(caplog):
    caplog.set_level(logging.DEBUG)
    secret_leak = "sk-or-v1-" + "abcdefghijklmnopqrstuvwxyz0123456789"   # fake; built at runtime so no key-shaped literal is in source
    body_msg = f"Incorrect API key provided: {secret_leak}; input was: {POSITIVE_TEXT}"
    g = FakeGemini([gemini_error(503, "UNAVAILABLE", f"echo {POSITIVE_TEXT}")])
    with MockOpenRouter([fail(429, body_msg)]) as srv:
        with pytest.raises(LLMServiceError):
            ResilientLLMProvider([openrouter(srv, max_retries=1), gemini(g)]).extract_semantics(POSITIVE_TEXT)
    logs = "\n".join(r.getMessage() for r in caplog.records)
    # useful technical info is present ...
    for needle in ("provider=openrouter", "provider=gemini", "category=rate_limited", "status=429",
                   "attempt=", "action=", "model=z-ai/primary:free", "all_providers_failed"):
        assert needle in logs, needle
    # ... and nothing sensitive is
    assert "test-key-not-real" not in logs
    assert secret_leak not in logs
    assert "severe lower back pain" not in logs
    assert "affected sleep" not in logs
