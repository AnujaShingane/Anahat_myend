"""Through the REAL FastAPI route: therapist never sees raw provider errors; idempotency header works."""
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.exceptions import USER_MESSAGE_NOT_CONFIGURED, USER_MESSAGE_UNAVAILABLE
from app.llm.resilient import ResilientLLMProvider
from app.llm.openrouter_provider import OpenRouterProvider
from app.llm.schemas import SemanticExtraction
from app.engine.patient_context import PatientContext
from app.services.assessment_service import AssessmentService
from app.services.safety_service import SafetyService
from tests.fakes_service import FakeIndicators, FakeKB, FakeRetriever
from tests.helpers import MockOpenRouter, POSITIVE_TEXT, Sleeps, as_json, fail, ok, positive_payload

LEAKS = ["429", "503", "upstream", "UpstreamCo", "openrouter", "z-ai", "127.0.0.1", "Traceback", "api key",
         "test-key-not-real", "qdrant", "internal:6333", "http://"]


@pytest.fixture()
def routes(monkeypatch):
    import app.knowledge.loader as loader
    import app.retrieval.retriever as retr
    monkeypatch.setattr(loader.KnowledgeBase, "load_directory", lambda self, path: None)
    monkeypatch.setattr(retr, "KnowledgeRetriever", lambda: FakeRetriever())
    import importlib, sys
    sys.modules.pop("app.api.assessment_routes", None)
    mod = importlib.import_module("app.api.assessment_routes")
    monkeypatch.setattr(mod, "KnowledgeRetriever", lambda: FakeRetriever())
    mod._service.safety, mod._service.indicators = SafetyService(FakeKB()), FakeIndicators()
    mod._service.llm = mod._service.retriever = None
    AssessmentService._sessions["s1"] = PatientContext()
    return mod


def client_for(mod):
    app = FastAPI(); app.include_router(mod.router, prefix="/assessment")
    return TestClient(app, raise_server_exceptions=False)


def openrouter_chain(srv, max_retries=0):
    p = OpenRouterProvider(api_key="test-key-not-real", model="z-ai/primary:free", fallback_models=[],
                           base_url=srv.url, max_retries=max_retries, backoff_base=0, backoff_max=0, sleep=Sleeps())
    return ResilientLLMProvider([p])


def post(c, text=POSITIVE_TEXT, key=None):
    return c.post("/assessment/sessions/s1/responses", json={"text": text},
                  headers={"Idempotency-Key": key} if key else {})


def test_provider_429_and_503_become_clean_502_with_safe_message(routes):
    for status in (429, 503):
        with MockOpenRouter([fail(status, "Provider returned error at https://api.upstream.example/v1 key sk-or-v1-" + "abcdefghijklmnop")]) as srv:
            routes._service.llm = openrouter_chain(srv)
            r = post(client_for(routes))
        assert r.status_code == 502            # same status this route has always used on failure
        body = r.json()
        assert body["detail"] == USER_MESSAGE_UNAVAILABLE
        assert body["error_code"] == "LLM_UNAVAILABLE" and body["retryable"] is True
        assert r.headers["retry-after"] == "5"
        for term in LEAKS:
            assert term.lower() not in r.text.lower(), term
    assert AssessmentService._sessions["s1"].responses == []      # nothing persisted


def test_configuration_error_uses_different_safe_message(routes):
    with MockOpenRouter([fail(401, "No auth credentials found")]) as srv:
        routes._service.llm = openrouter_chain(srv)
        r = post(client_for(routes))
    assert r.status_code == 502 and r.json()["detail"] == USER_MESSAGE_NOT_CONFIGURED
    assert r.json()["retryable"] is False and "retry-after" not in r.headers
    assert "auth" not in r.text.lower() or "not configured" in r.text.lower()


def test_missing_provider_config_via_factory_is_safe(routes, monkeypatch):
    from app.core.config import Settings
    from app.llm.resilient import build_llm_provider
    cfg = Settings(_env_file=None, llm_provider="openrouter", llm_model="a/b:free", openrouter_api_key=None)
    monkeypatch.setattr(routes, "build_llm_provider", lambda: build_llm_provider(cfg))
    r = post(client_for(routes))
    assert r.status_code == 502 and r.json()["detail"] == USER_MESSAGE_NOT_CONFIGURED
    assert "OPENROUTER_API_KEY" not in r.text


def test_unexpected_internal_error_is_generic_and_logged(routes, caplog):
    class Exploding:
        def search(self, q): raise ConnectionError("qdrant down at http://internal:6333")
    with MockOpenRouter([ok(as_json(positive_payload()), "z-ai/primary:free")]) as srv:
        routes._service.llm = openrouter_chain(srv)
        routes._service.retriever = Exploding()
        with caplog.at_level(logging.ERROR):
            r = post(client_for(routes))
    assert r.status_code == 502 and "Something went wrong" in r.json()["detail"]
    for term in LEAKS:
        assert term.lower() not in r.text.lower(), term
    assert "qdrant down" in caplog.text                                  # detail stays in server logs


def test_success_then_duplicate_key_replays_one_llm_call(routes):
    with MockOpenRouter([ok(as_json(positive_payload()), "z-ai/primary:free")]) as srv:
        routes._service.llm = openrouter_chain(srv)
        c = client_for(routes)
        r1, r2 = post(c, key="abc-123"), post(c, key="abc-123")
    assert r1.status_code == r2.status_code == 200
    assert srv.call_count == 1
    assert r2.json()["idempotent_replay"] is True and r1.json()["response_id"] == r2.json()["response_id"]
    assert len(AssessmentService._sessions["s1"].responses) == 1


def test_retry_after_provider_failure_with_same_key_succeeds_once(routes):
    with MockOpenRouter([fail(503), ok(as_json(positive_payload()), "z-ai/primary:free")]) as srv:
        routes._service.llm = openrouter_chain(srv)
        c = client_for(routes)
        r1 = post(c, key="retry-1"); r2 = post(c, key="retry-1")
    assert r1.status_code == 502 and r2.status_code == 200 and r2.json()["status"] == "OK"
    assert len(AssessmentService._sessions["s1"].responses) == 1


def test_malformed_and_reused_keys_are_client_errors(routes):
    with MockOpenRouter([ok(as_json(positive_payload()), "z-ai/primary:free")]) as srv:
        routes._service.llm = openrouter_chain(srv)
        c = client_for(routes)
        assert post(c, key="bad key with spaces!").status_code == 400
        assert post(c, key="k1").status_code == 200
        assert post(c, text="different", key="k1").status_code == 502   # service ValueError: original 502 kept


def test_unknown_session_keeps_original_502_with_its_message(routes):
    with MockOpenRouter([ok(as_json(positive_payload()), "z-ai/primary:free")]) as srv:
        routes._service.llm = openrouter_chain(srv)
        r = client_for(routes).post("/assessment/sessions/nope/responses", json={"text": "x"})
    assert r.status_code == 502 and r.json()["detail"] == "Assessment session not found"


def test_429_on_openrouter_falls_back_to_gemini_and_persists_exactly_once(routes):
    from app.llm.gemini_provider import GeminiProvider
    from tests.helpers import FakeGemini, gemini_reply
    g = FakeGemini([gemini_reply(parsed=positive_payload())])
    gp = GeminiProvider(client=g, model="gemini-test-model", max_retries=0, backoff_base=0, backoff_max=0, sleep=Sleeps())
    with MockOpenRouter([fail(429, "rate limited")]) as srv:
        routes._service.llm = ResilientLLMProvider([openrouter_chain(srv)._providers[0], gp])
        r = post(client_for(routes), key="fb-1")
    ctx = AssessmentService._sessions["s1"]
    assert r.status_code == 200 and r.json()["status"] == "OK" and len(g.calls) == 1
    assert len(ctx.responses) == 1 and len(ctx.candidates) == 1
    assert sum(e["event"] == "RAW_RESPONSE_STORED" for e in ctx.audit_events) == 1


def test_all_providers_fail_leaves_session_resumable(routes):
    ctx = AssessmentService._sessions["s1"]
    ctx.stage = "personalized_questions"
    before = (len(ctx.responses), len(ctx.candidates), len(ctx.evidence), ctx.stage, len(ctx.audit_events))
    with MockOpenRouter([fail(503)]) as srv:
        routes._service.llm = openrouter_chain(srv)
        r = post(client_for(routes), key="down-1")
    assert r.status_code == 502 and r.json()["detail"] == USER_MESSAGE_UNAVAILABLE
    assert (len(ctx.responses), len(ctx.candidates), len(ctx.evidence), ctx.stage, len(ctx.audit_events)) == before
    # provider recovers: the very same session continues normally, exactly one response persisted
    with MockOpenRouter([ok(as_json(positive_payload()), "z-ai/primary:free")]) as srv:
        routes._service.llm = openrouter_chain(srv)
        r2 = post(client_for(routes), key="down-1")
    assert r2.status_code == 200 and len(ctx.responses) == 1 and ctx.stage == "evidence_review"
