"""E 429 | F 503 | G fallback success | H all models failing | K empty | + timeout, bounded retries.

Uses the REAL openai SDK talking real HTTP to a local mock, so genuine SDK exception
types (RateLimitError, InternalServerError, APITimeoutError...) are what gets classified.
"""
import logging
import time

import pytest

from app.core.exceptions import LLMConfigurationError, LLMProviderExhaustedError
from app.llm.openrouter_provider import MAX_MODELS_PER_REQUEST, OpenRouterProvider, build_model_chain
from app.llm.schemas import SemanticExtraction
from tests.helpers import (MockOpenRouter, POSITIVE_TEXT, Reply, Sleeps, as_json, completion, concept_texts,
                           fail, fenced, ok, positive_payload)

PRIMARY, FB1, FB2 = "z-ai/primary:free", "vendor/fallback-one:free", "vendor/fallback-two:free"


def make(server, *, fallbacks=(FB1, FB2), max_retries=1, sleep=None, **kw):
    return OpenRouterProvider(api_key="test-key-not-real", model=PRIMARY, fallback_models=list(fallbacks),
                              base_url=server.url, max_retries=max_retries, backoff_base=0.0, backoff_max=0.0,
                              sleep=sleep or Sleeps(), **kw)


def good(model=PRIMARY):
    return ok(as_json(positive_payload()), model)


# ---- A/B through the provider ---------------------------------------------------
def test_valid_json_returns_validated_extraction():
    with MockOpenRouter([good()]) as srv:
        r = make(srv).extract_semantics(POSITIVE_TEXT)
    assert isinstance(r, SemanticExtraction) and concept_texts(r) == ["lower back pain"]
    assert srv.call_count == 1


def test_fenced_json_is_recovered():
    with MockOpenRouter([ok(fenced(positive_payload()), PRIMARY)]) as srv:
        assert concept_texts(make(srv).extract_semantics(POSITIVE_TEXT)) == ["lower back pain"]


# ---- request shape: real prompt + documented fallback mechanism ------------------
def test_request_uses_openrouter_models_fallback_and_real_prompt():
    from app.llm.prompts import EXTRACTION_SYSTEM_PROMPT
    with MockOpenRouter([good()]) as srv:
        make(srv).extract_semantics(POSITIVE_TEXT)
    body = srv.requests[0]["body"]
    assert body["model"] == PRIMARY
    assert body["models"] == [FB1, FB2]          # documented OpenRouter fallback list (extra_body)
    assert body["temperature"] == 0
    user = body["messages"][1]["content"]
    assert EXTRACTION_SYSTEM_PROMPT in user       # the REAL ANAHAT prompt
    assert POSITIVE_TEXT in user                  # patient text passed through
    assert "Required JSON schema" in user
    assert srv.requests[0]["has_auth"]


def test_no_models_field_when_no_fallbacks_configured():
    with MockOpenRouter([good()]) as srv:
        make(srv, fallbacks=()).extract_semantics(POSITIVE_TEXT)
    assert "models" not in srv.requests[0]["body"]


def test_sdk_hidden_retries_are_disabled():
    # If the OpenAI SDK's own retry (default 2) were active, a 503 would hit the server 3x per attempt.
    with MockOpenRouter([fail(503)]) as srv:
        p = make(srv, fallbacks=(), max_retries=0)
        with pytest.raises(LLMProviderExhaustedError):
            p.extract_semantics(POSITIVE_TEXT)
    assert srv.call_count == 1


# ---- E. 429 ---------------------------------------------------------------------
def test_E_429_then_success_after_one_bounded_retry():
    sleeps = Sleeps()
    with MockOpenRouter([fail(429, "rate limit"), good()]) as srv:
        r = make(srv, sleep=sleeps).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"]
    assert srv.call_count == 2 and len(sleeps.calls) == 1


def test_E_429_persistent_is_bounded_and_fails_cleanly():
    sleeps = Sleeps()
    with MockOpenRouter([fail(429, "rate limit")]) as srv:
        with pytest.raises(LLMProviderExhaustedError) as ei:
            make(srv, sleep=sleeps, max_retries=1).extract_semantics(POSITIVE_TEXT)
    assert srv.call_count == 2                  # 1 attempt + exactly 1 retry, not unlimited
    assert all(e.category == "rate_limited" and e.status_code == 429 for e in ei.value.errors)
    assert not ei.value.is_configuration


def test_E_retry_after_header_is_honoured_but_capped():
    sleeps = Sleeps()
    with MockOpenRouter([Reply(429, {"error": {"code": 429, "message": "slow down"}}, {"Retry-After": "999"}),
                         good()]) as srv:
        p = OpenRouterProvider(api_key="k", model=PRIMARY, fallback_models=[], base_url=srv.url, max_retries=1,
                               backoff_base=0.1, backoff_max=2.0, sleep=sleeps)
        p.extract_semantics(POSITIVE_TEXT)
    assert 0 < sleeps.calls[0] <= 2.0            # capped at backoff_max, never 999s


# ---- F. 503 (and the other transient statuses) -----------------------------------
@pytest.mark.parametrize("status", [408, 502, 503, 504])
def test_F_transient_statuses_retry_then_succeed(status):
    with MockOpenRouter([fail(status), good()]) as srv:
        r = make(srv).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"] and srv.call_count == 2


def test_F_503_persistent_fails_cleanly():
    with MockOpenRouter([fail(503, "overloaded")]) as srv:
        with pytest.raises(LLMProviderExhaustedError) as ei:
            make(srv).extract_semantics(POSITIVE_TEXT)
    assert srv.call_count == 2 and ei.value.errors[-1].category == "server_error"


# ---- G. fallback success ----------------------------------------------------------
def test_G_server_side_fallback_answer_is_accepted_after_validation():
    # OpenRouter served the request from fallback #1 and says so in `model`.
    with MockOpenRouter([good(FB1)]) as srv:
        r = make(srv).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"] and srv.call_count == 1


def test_G_client_side_fallback_when_primary_returns_invalid_json():
    # Server-side fallback can't help here (HTTP 200). Client must move on to the models AFTER the answering one.
    with MockOpenRouter([ok("Sorry, I cannot help with that.", PRIMARY), good(FB1)]) as srv:
        r = make(srv).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"]
    assert srv.requests[0]["body"]["model"] == PRIMARY and srv.requests[0]["body"]["models"] == [FB1, FB2]
    assert srv.requests[1]["body"]["model"] == FB1 and srv.requests[1]["body"]["models"] == [FB2]


def test_G_client_side_fallback_on_schema_invalid_output():
    bad = positive_payload(); bad["concepts"][0]["polarity"] = "definitely-yes"
    with MockOpenRouter([ok(as_json(bad), PRIMARY), good(FB1)]) as srv:
        assert concept_texts(make(srv).extract_semantics(POSITIVE_TEXT)) == ["lower back pain"]
    assert srv.call_count == 2


def test_G_answered_model_variant_suffix_is_matched():
    # Response says "vendor/fallback-one" (no :free). Must still advance past fallback-one, not loop on it.
    with MockOpenRouter([ok("garbage", "vendor/fallback-one"), good(FB2)]) as srv:
        make(srv, fallbacks=(FB1, FB2), max_retries=0).extract_semantics(POSITIVE_TEXT)
    assert srv.requests[1]["body"]["model"] == FB2


def test_long_chains_continue_client_side_in_windows():
    chain = [f"v/m{i}:free" for i in range(1, 6)]           # 1 primary + 4 fallbacks > MAX per request
    assert MAX_MODELS_PER_REQUEST == 3
    with MockOpenRouter([fail(503), good("v/m4:free")]) as srv:
        p = OpenRouterProvider(api_key="k", model=chain[0], fallback_models=chain[1:], base_url=srv.url,
                               max_retries=0, backoff_base=0, backoff_max=0, sleep=Sleeps())
        p.extract_semantics(POSITIVE_TEXT)
    assert [r["body"]["model"] for r in srv.requests] == ["v/m1:free", "v/m4:free"]


# ---- H. all models failing ----------------------------------------------------------
def test_H_all_models_failing_raises_exhausted_with_bounded_calls():
    with MockOpenRouter([ok("nope", PRIMARY), ok("still nope", FB1), ok("", FB2)]) as srv:
        with pytest.raises(LLMProviderExhaustedError) as ei:
            make(srv).extract_semantics(POSITIVE_TEXT)
    assert srv.call_count == 3                                   # each model tried once, then stop
    assert [e.category for e in ei.value.errors] == ["invalid_json", "invalid_json", "empty_response"]


def test_H_auth_error_stops_immediately_and_is_configuration():
    with MockOpenRouter([fail(401, "bad key")]) as srv:
        with pytest.raises(LLMProviderExhaustedError) as ei:
            make(srv).extract_semantics(POSITIVE_TEXT)
    assert srv.call_count == 1 and ei.value.is_configuration


def test_H_unknown_model_404_moves_to_next_model():
    with MockOpenRouter([fail(404, "no such model"), good(FB2)]) as srv:
        # window 1 = [PRIMARY, FB1, FB2] all 404 server-side -> next window would be empty; use 4-model chain
        p = OpenRouterProvider(api_key="k", model="a/one", fallback_models=["a/two", "a/three", "a/four"],
                               base_url=srv.url, max_retries=0, backoff_base=0, backoff_max=0, sleep=Sleeps())
        r = p.extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"] and srv.requests[1]["body"]["model"] == "a/four"


# ---- K. empty / malformed provider responses --------------------------------------
@pytest.mark.parametrize("reply", [
    ok("", PRIMARY),
    ok(None, PRIMARY),
    Reply(200, {"id": "x", "object": "chat.completion", "created": 1, "model": PRIMARY, "choices": []}),
])
def test_K_empty_responses_fail_and_never_yield_empty_concepts(reply):
    with MockOpenRouter([reply]) as srv:
        with pytest.raises(LLMProviderExhaustedError) as ei:
            make(srv, fallbacks=(), max_retries=0).extract_semantics(POSITIVE_TEXT)
    assert ei.value.errors[0].category == "empty_response"


def test_K_http_200_with_error_body_is_classified_as_rate_limit():
    body = {"error": {"code": 429, "message": "Provider returned error",
                      "metadata": {"provider_name": "Venice"}}}
    with MockOpenRouter([Reply(200, body), good()]) as srv:
        r = make(srv).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"] and srv.call_count == 2


# ---- timeouts -----------------------------------------------------------------------
def test_request_timeout_is_enforced_and_total_is_bounded():
    with MockOpenRouter([Reply(200, completion(as_json(positive_payload()), PRIMARY), delay=1.5)]) as srv:
        p = OpenRouterProvider(api_key="k", model=PRIMARY, fallback_models=[], base_url=srv.url,
                               request_timeout=0.3, total_timeout=2.0, max_retries=1,
                               backoff_base=0, backoff_max=0, sleep=Sleeps())
        t0 = time.monotonic()
        with pytest.raises(LLMProviderExhaustedError) as ei:
            p.extract_semantics(POSITIVE_TEXT)
        elapsed = time.monotonic() - t0
    assert elapsed < 2.5, elapsed                               # never left waiting indefinitely
    assert ei.value.errors[0].category == "timeout"


def test_expired_overall_deadline_sends_no_request():
    from app.llm.retry import deadline_scope
    with MockOpenRouter([fail(503)]) as srv:
        p = OpenRouterProvider(api_key="k", model=PRIMARY, fallback_models=[FB1], base_url=srv.url,
                               request_timeout=5, total_timeout=60, max_retries=3,
                               backoff_base=0, backoff_max=0, sleep=Sleeps())
        with deadline_scope(0.0):            # an outer budget that is already spent
            time.sleep(0.01)
            with pytest.raises(LLMProviderExhaustedError) as ei:
                p.extract_semantics(POSITIVE_TEXT)
    assert srv.call_count == 0
    assert ei.value.errors[0].category == "deadline_exceeded"


def test_retry_budget_never_exceeds_max_retries_even_with_large_total_timeout():
    with MockOpenRouter([fail(503)]) as srv:
        p = OpenRouterProvider(api_key="k", model=PRIMARY, fallback_models=[], base_url=srv.url,
                               total_timeout=600, max_retries=2, backoff_base=0, backoff_max=0, sleep=Sleeps())
        with pytest.raises(LLMProviderExhaustedError):
            p.extract_semantics(POSITIVE_TEXT)
    assert srv.call_count == 3                   # 1 + 2 retries, then stop


# ---- configuration validation ----------------------------------------------------------
def test_missing_api_key_is_a_configuration_error():
    with pytest.raises(LLMConfigurationError):
        OpenRouterProvider(api_key="", model=PRIMARY, fallback_models=[])


@pytest.mark.parametrize("primary", ["", "   ", None, "has space/model", "bad,comma"])
def test_invalid_primary_model_is_a_configuration_error(primary):
    with pytest.raises(LLMConfigurationError):
        build_model_chain(primary, [])


def test_bad_fallback_entries_are_dropped_not_fatal(caplog):
    chain, dropped = build_model_chain(PRIMARY, [FB1, "bad model", FB1, "", FB2])
    assert chain == [PRIMARY, FB1, FB2] and dropped == ["bad model"]
