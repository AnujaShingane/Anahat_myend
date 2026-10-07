"""I Gemini temporary failure | J Gemini successful extraction | K empty response."""
import pytest

from app.core.exceptions import LLMProviderExhaustedError
from app.llm.gemini_provider import GeminiProvider
from app.llm.schema_utils import to_gemini_schema
from app.llm.schemas import SemanticExtraction
from tests.helpers import (FakeGemini, NEGATIVE_TEXT, POSITIVE_TEXT, Sleeps, as_json, concept_texts, fenced,
                           gemini_error, gemini_reply, negative_payload, positive_payload)


def make(client, **kw):
    return GeminiProvider(client=client, model="gemini-test-model", max_retries=kw.pop("max_retries", 2),
                          backoff_base=0.0, backoff_max=0.0, sleep=kw.pop("sleep", Sleeps()), **kw)


# ---- J. success ---------------------------------------------------------------------
def test_J_success_from_parsed_dict():
    c = FakeGemini([gemini_reply(parsed=positive_payload())])
    r = make(c).extract_semantics(POSITIVE_TEXT)
    assert isinstance(r, SemanticExtraction) and concept_texts(r) == ["lower back pain"]
    assert len(c.calls) == 1


def test_J_success_from_text_and_from_fenced_text():
    for text in (as_json(positive_payload()), fenced(positive_payload())):
        r = make(FakeGemini([gemini_reply(text=text)])).extract_semantics(POSITIVE_TEXT)
        assert r.concepts[0].intensity == "Severe"


def test_J_structured_output_config_is_preserved():
    c = FakeGemini([gemini_reply(parsed=positive_payload())])
    make(c).extract_semantics(POSITIVE_TEXT)
    cfg = c.calls[0]["config"]
    assert cfg.response_mime_type == "application/json"
    assert cfg.temperature == 0
    assert cfg.response_schema == to_gemini_schema(SemanticExtraction)   # schema handling untouched
    assert cfg.http_options.timeout is not None                          # per-request timeout is set
    assert c.calls[0]["model"] == "gemini-test-model"
    assert POSITIVE_TEXT in c.calls[0]["contents"]


def test_J_sdk_timeout_uses_milliseconds_from_seconds_budget():
    c = FakeGemini([gemini_reply(parsed=positive_payload())])
    make(c, request_timeout=60, total_timeout=120, max_retries=0).extract_semantics(POSITIVE_TEXT)
    assert c.calls[0]["config"].http_options.timeout == 60_000


def test_J_negation_is_preserved_through_the_provider():
    r = make(FakeGemini([gemini_reply(parsed=negative_payload())])).extract_semantics(NEGATIVE_TEXT)
    assert r.concepts[0].polarity == "negative"


# ---- I. temporary failures ------------------------------------------------------------
@pytest.mark.parametrize("code,status", [(503, "UNAVAILABLE"), (429, "RESOURCE_EXHAUSTED"),
                                         (500, "INTERNAL"), (504, "DEADLINE_EXCEEDED")])
def test_I_temporary_failure_then_success(code, status):
    sleeps = Sleeps()
    c = FakeGemini([gemini_error(code, status), gemini_reply(parsed=positive_payload())])
    r = make(c, sleep=sleeps).extract_semantics(POSITIVE_TEXT)
    assert concept_texts(r) == ["lower back pain"]
    assert len(c.calls) == 2 and len(sleeps.calls) == 1


def test_I_persistent_503_is_bounded():
    c = FakeGemini([gemini_error(503, "UNAVAILABLE", "The model is overloaded")])
    with pytest.raises(LLMProviderExhaustedError) as ei:
        make(c, max_retries=2).extract_semantics(POSITIVE_TEXT)
    assert len(c.calls) == 3                                   # 1 + 2 retries, never unlimited
    assert ei.value.errors[-1].category == "server_error" and not ei.value.is_configuration


def test_I_max_retries_zero_means_single_attempt():
    c = FakeGemini([gemini_error(503, "UNAVAILABLE")])
    with pytest.raises(LLMProviderExhaustedError):
        make(c, max_retries=0).extract_semantics(POSITIVE_TEXT)
    assert len(c.calls) == 1


def test_I_schema_or_request_error_400_is_not_retried_and_is_configuration():
    c = FakeGemini([gemini_error(400, "INVALID_ARGUMENT", "response_schema is invalid")])
    with pytest.raises(LLMProviderExhaustedError) as ei:
        make(c).extract_semantics(POSITIVE_TEXT)
    assert len(c.calls) == 1 and ei.value.is_configuration
    assert ei.value.errors[0].category == "request_rejected"


def test_I_bad_api_key_400_is_reported_as_auth_error():
    c = FakeGemini([gemini_error(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.")])
    with pytest.raises(LLMProviderExhaustedError) as ei:
        make(c).extract_semantics(POSITIVE_TEXT)
    assert ei.value.errors[0].category == "auth_error" and len(c.calls) == 1


def test_I_network_timeout_is_temporary_and_retried():
    import httpx
    c = FakeGemini([httpx.ReadTimeout("timed out"), gemini_reply(parsed=positive_payload())])
    assert concept_texts(make(c).extract_semantics(POSITIVE_TEXT)) == ["lower back pain"]
    assert len(c.calls) == 2


# ---- K. empty / invalid ----------------------------------------------------------------
@pytest.mark.parametrize("reply", [gemini_reply(), gemini_reply(text=""), gemini_reply(text="   ")])
def test_K_empty_gemini_response_fails_and_is_not_retried(reply):
    c = FakeGemini([reply])
    with pytest.raises(LLMProviderExhaustedError) as ei:
        make(c).extract_semantics(POSITIVE_TEXT)
    assert ei.value.errors[0].category == "empty_response"
    assert len(c.calls) == 1                                    # invalid output is handled by fallback, not re-asked


def test_K_schema_invalid_output_is_rejected_even_via_parsed():
    bad = positive_payload(); bad["concepts"][0]["domain"] = "chakra"
    with pytest.raises(LLMProviderExhaustedError) as ei:
        make(FakeGemini([gemini_reply(parsed=bad)])).extract_semantics(POSITIVE_TEXT)
    assert ei.value.errors[0].category == "schema_invalid"


def test_K_invalid_json_text_is_rejected():
    with pytest.raises(LLMProviderExhaustedError) as ei:
        make(FakeGemini([gemini_reply(text="I think the patient has back pain.")])).extract_semantics(POSITIVE_TEXT)
    assert ei.value.errors[0].category == "invalid_json"


# ---- configuration ---------------------------------------------------------------------
def test_missing_model_is_a_configuration_error(monkeypatch):
    from app.core.config import settings
    from app.core.exceptions import LLMConfigurationError
    monkeypatch.setattr(settings, "llm_provider", "openrouter")
    monkeypatch.setattr(settings, "gemini_model", None)
    with pytest.raises(LLMConfigurationError):
        GeminiProvider(client=FakeGemini([]))          # no explicit model, not primary, no GEMINI_MODEL


def test_missing_api_key_is_a_configuration_error(monkeypatch):
    from app.core.config import settings
    from app.core.exceptions import LLMConfigurationError
    monkeypatch.setattr(settings, "gemini_api_key", None)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(LLMConfigurationError):
        GeminiProvider(model="gemini-test-model")
