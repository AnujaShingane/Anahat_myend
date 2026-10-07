"""L duplicate requestId | failed LLM request must not touch assessment state."""
import threading

import pytest

from app.core.exceptions import LLMUnavailableError
from app.llm.schemas import SemanticExtraction
from tests.fakes_service import CountingLLM, FakeRetriever, make_service, snapshot
from tests.helpers import POSITIVE_TEXT, positive_payload


def good(_text):
    return SemanticExtraction.model_validate(positive_payload())


def boom(_text):
    raise LLMUnavailableError()


# ---- failed LLM request leaves state exactly as it was ------------------------------------
def test_failed_llm_request_changes_nothing():
    svc, ctx, sid = make_service(CountingLLM(boom))
    ctx.stage = "personalized_questions"
    before = snapshot(ctx)
    with pytest.raises(LLMUnavailableError):
        svc.process_response(sid, POSITIVE_TEXT, "q1", None, request_id="req-1")
    assert snapshot(ctx) == before                      # no response stored, no audit, no stage change
    assert ctx.responses == [] and ctx.candidates == [] and ctx.evidence == []
    assert "req-1" not in ctx.processed_requests        # failures are NOT remembered as done


def test_retrieval_failure_after_successful_llm_also_changes_nothing():
    svc, ctx, sid = make_service(CountingLLM(good), FakeRetriever(fail=True))
    before = snapshot(ctx)
    with pytest.raises(ConnectionError):
        svc.process_response(sid, POSITIVE_TEXT)
    assert snapshot(ctx) == before


def test_retry_after_failure_succeeds_once_without_duplicates():
    state = {"n": 0}

    def flaky(text):
        state["n"] += 1
        if state["n"] == 1:
            raise LLMUnavailableError()
        return good(text)

    svc, ctx, sid = make_service(CountingLLM(flaky))
    with pytest.raises(LLMUnavailableError):
        svc.process_response(sid, POSITIVE_TEXT, request_id="req-2")
    r = svc.process_response(sid, POSITIVE_TEXT, request_id="req-2")      # therapist retries, same id
    assert r["status"] == "OK" and r["candidate_count"] == 1
    assert len(ctx.responses) == 1 and len(ctx.candidates) == 1           # exactly one of each
    assert ctx.stage == "evidence_review"
    assert sum(e["event"] == "RAW_RESPONSE_STORED" for e in ctx.audit_events) == 1


def test_success_is_committed_with_extraction_attached():
    svc, ctx, sid = make_service(CountingLLM(good))
    r = svc.process_response(sid, POSITIVE_TEXT)
    assert ctx.responses[0].extraction == r["extraction"]
    assert r["extraction"]["concepts"][0]["concept"] == "lower back pain"


# ---- L. duplicate requestId ----------------------------------------------------------------
def test_L_duplicate_request_id_replays_without_new_llm_call_or_data():
    llm = CountingLLM(good)
    svc, ctx, sid = make_service(llm)
    first = svc.process_response(sid, POSITIVE_TEXT, "q1", None, request_id="dup-1")
    after_first = snapshot(ctx)
    second = svc.process_response(sid, POSITIVE_TEXT, "q1", None, request_id="dup-1")
    assert llm.calls == 1                                  # not re-analysed
    assert snapshot(ctx) == after_first                    # no duplicate response/evidence/concepts
    assert second.pop("idempotent_replay") is True
    assert second == first                                 # same response_id, same candidates
    assert len(ctx.candidates) == 1


def test_L_same_request_id_with_different_payload_is_rejected():
    svc, ctx, sid = make_service(CountingLLM(good))
    svc.process_response(sid, POSITIVE_TEXT, request_id="dup-2")
    with pytest.raises(ValueError, match="different patient response"):
        svc.process_response(sid, "A completely different answer", request_id="dup-2")
    assert len(ctx.responses) == 1


def test_L_without_request_id_each_call_is_processed():
    llm = CountingLLM(good)
    svc, ctx, sid = make_service(llm)
    svc.process_response(sid, POSITIVE_TEXT)
    svc.process_response(sid, POSITIVE_TEXT)
    assert llm.calls == 2 and len(ctx.responses) == 2      # inherent: no key => cannot dedupe


def test_L_concurrent_duplicate_requests_are_analysed_once():
    started = threading.Event()

    def slow(text):
        started.set()
        import time; time.sleep(0.2)
        return good(text)

    llm = CountingLLM(slow)
    svc, ctx, sid = make_service(llm)
    results, errors = [], []

    def worker():
        try:
            results.append(svc.process_response(sid, POSITIVE_TEXT, request_id="dup-3"))
        except Exception as exc:  # noqa
            errors.append(exc)

    ts = [threading.Thread(target=worker) for _ in range(4)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert not errors and llm.calls == 1
    assert len(ctx.responses) == 1 and len(ctx.candidates) == 1
    assert len({r["response_id"] for r in results}) == 1


def test_safety_escalation_path_never_calls_llm_and_is_idempotent():
    llm = CountingLLM(good)
    svc, ctx, sid = make_service(llm)
    r1 = svc.process_response(sid, "I want to die", request_id="esc-1")
    r2 = svc.process_response(sid, "I want to die", request_id="esc-1")
    assert r1["status"] == "SAFETY_ESCALATION" and llm.calls == 0
    assert len(ctx.responses) == 1 and r2["idempotent_replay"] is True
