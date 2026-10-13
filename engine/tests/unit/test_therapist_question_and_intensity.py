"""Therapist's own questions (assessment window bottom bar) and the intensity rule.

Rules protected here:
  * A therapist can type their own question; the patient's answer to it is analysed and scored
    through the normal pipeline, the question is given to extraction for context, and it does
    NOT use up one of the quadrant's three normal questions or move the assessment's stage.
  * When the patient does not state how strong something is, the engine asks the therapist to
    clarify intensity; until then the evidence is scored as Mild - never 0, whatever the config.
"""
from __future__ import annotations

import pytest

from app.core.config import settings
from app.core.enums import AssessmentStage
from tests.scenarios.harness import THROAT, card, concept, make_session

T = "Throat Chakra"
Q = "How do people at home react when you share your opinion?"
ANSWER = "Nobody listens to me when I talk"


def unheard(intensity=None):
    return concept("Nobody listens to me", "feeling unheard", "emotion", intensity=intensity)


def session(intensity=None):
    svc, sid = make_session({ANSWER: [unheard(intensity)]}, {"feeling unheard": [(THROAT["unheard"], 0.9)]})
    return svc, sid


# ---- therapist's own question ------------------------------------------------------------------------
def test_therapist_question_answer_is_scored_but_does_not_use_a_normal_slot():
    svc, sid = session("Severe")
    svc.skip_opening(sid)
    svc.select_quadrant(sid, "Family")
    tq = svc.register_therapist_question(sid, Q, "Family")
    assert tq["id"].startswith("TQ-") and tq["therapist_question"] is True

    seen = []
    original = svc.llm.extract_semantics
    svc.llm.extract_semantics = lambda text, context=None: seen.append(context) or original(text, context=context)
    stage_before = svc.get(sid).stage
    out = svc.process_response(sid, ANSWER, tq["id"], "Family")

    assert out["therapist_question"] is True and out["evidence"]            # scored like any answer
    assert seen[-1]["question"] == Q                                         # extraction saw the question
    st = svc.get(sid).quadrants["Family"]
    assert st["normal_question_count"] == 0 and st["deep_dive_question_count"] == 0
    assert tq["id"] in st["answered_question_ids"]
    assert svc.get(sid).stage == stage_before                                # side step, no stage change
    assert Q in svc.get(sid).patient_state["asked_questions"]                # adaptive generator won't repeat it


def test_therapist_question_answer_changes_the_chakra_result():
    svc, sid = session("Severe")
    svc.skip_opening(sid)
    svc.select_quadrant(sid, "Family")
    tq = svc.register_therapist_question(sid, Q, "Family")
    svc.process_response(sid, ANSWER, tq["id"], "Family")
    ctx = svc.get(sid)
    report = svc.scoring.score(ctx.evidence, contradictions=[], assessed_quadrants={"Family"},
                               responses={r.response_id: r.raw_text for r in ctx.responses}, baseline=ctx.baseline)
    throat = next(r for r in report.model_dump()["results"] if r["chakra"] == T)
    assert throat["score"] > 0


def test_therapist_question_during_opening_keeps_the_opening_stage():
    svc, sid = session("Severe")
    assert svc.get(sid).stage == AssessmentStage.OPENING.value
    tq = svc.register_therapist_question(sid, Q)
    svc.process_response(sid, ANSWER, tq["id"], None)
    assert svc.get(sid).stage == AssessmentStage.OPENING.value
    svc.llm.script["I feel fine overall"] = []
    out = svc.submit_opening_response(sid, "I feel fine overall")         # opening still works
    assert out["stage"] == AssessmentStage.QUADRANT_RECOMMENDATION.value


@pytest.mark.parametrize("text,quadrant,msg", [
    ("   ", None, "required"), ("x" * 501, None, "too long"), (Q, "Not A Quadrant", "Unknown quadrant")])
def test_therapist_question_validation(text, quadrant, msg):
    svc, sid = session()
    with pytest.raises(ValueError, match=msg):
        svc.register_therapist_question(sid, text, quadrant)


# ---- intensity ------------------------------------------------------------------------------------------
def test_missing_intensity_asks_the_therapist_to_clarify():
    svc, sid = session(intensity=None)
    svc.skip_opening(sid)
    svc.select_quadrant(sid, "Family")
    out = svc.process_response(sid, ANSWER, None, "Family")
    items = out["intensity_follow_ups"]
    assert len(items) == 1                                   # twins / alternatives asked once
    item = items[0]
    assert item["quote"] == "Nobody listens to me" and item["options"] == ["Mild", "Moderate", "Severe"]
    assert item["scored_as_until_answered"] == "Mild"
    svc.answer_deep_dive(sid, item["evidence_id"], "intensity", "Moderate", raw_text="Quite a lot")
    ev = next(e for e in svc.get(sid).evidence if e.evidence_id == item["evidence_id"])
    assert ev.intensity == "Moderate"


def test_stated_intensity_is_not_asked_again():
    svc, sid = session(intensity="Severe")
    svc.skip_opening(sid)
    svc.select_quadrant(sid, "Family")
    assert svc.process_response(sid, ANSWER, None, "Family")["intensity_follow_ups"] == []


def test_opening_answer_also_asks_for_missing_intensity():
    svc, sid = session(intensity=None)
    out = svc.submit_opening_response(sid, ANSWER)
    assert out["intensity_follow_ups"] and out["intensity_follow_ups"][0]["field"] == "intensity"


@pytest.mark.parametrize("configured", [0.0, 0.1, None])
def test_unstated_intensity_is_never_scored_below_mild(monkeypatch, configured):
    monkeypatch.setattr(settings, "unstated_intensity_weight", configured)
    monkeypatch.setattr(settings, "intensity_from_baseline", False)
    svc, sid = session(intensity=None)
    svc.skip_opening(sid)
    svc.select_quadrant(sid, "Family")
    svc.process_response(sid, ANSWER, None, "Family")
    ctx = svc.get(sid)
    from app.engine.scoring_engine import ScoringEngine
    report = ScoringEngine(svc.kb).score(ctx.evidence, contradictions=[], assessed_quadrants={"Family"},
                                         responses={r.response_id: r.raw_text for r in ctx.responses},
                                         baseline=ctx.baseline)
    throat = next(r for r in report.model_dump()["results"] if r["chakra"] == T)
    counted = [t for t in throat["trace"] if t["counted"]]
    assert counted, "evidence without intensity must still count"
    assert all(t["intensity"] == "Mild" and t["intensity_weight"] >= 0.4 for t in counted)
    assert throat["score"] > 0


# ---- HTTP: the route the Node backend calls ------------------------------------------------------------
def test_therapist_question_route_end_to_end(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    import app.api.assessment_routes as routes
    from tests.scenarios.harness import ScriptedLLM, ScriptedRetriever

    from app.services.assessment_service import AssessmentService
    from tests.scenarios.harness import kb
    # A fresh service so other test modules that modify the shared route service cannot interfere.
    fresh = AssessmentService(kb=kb(), llm=ScriptedLLM({ANSWER: [unheard(None)]}),
                              retriever=ScriptedRetriever({"feeling unheard": [(THROAT["unheard"], 0.9)]}))
    fresh.question_retriever = None
    monkeypatch.setattr(routes, "_service", fresh)
    c = TestClient(app)
    prefix = "/assessment"            # as mounted in app/main.py and called by backend engineClient.js
    sid = c.post(f"{prefix}/sessions", json={"patient_id": "p1"}).json()["session_id"]
    c.post(f"{prefix}/sessions/{sid}/baseline",
           json={"stress": 5, "anxiety": 5, "mood": 5, "sleep_quality": "Good", "energy": 5})
    c.post(f"{prefix}/sessions/{sid}/opening-skip")
    assert c.post(f"{prefix}/sessions/{sid}/quadrants/select", json={"quadrant": "Family"}).status_code == 200

    tq = c.post(f"{prefix}/sessions/{sid}/questions/therapist", json={"text": Q, "quadrant": "Family"}).json()
    assert tq["id"].startswith("TQ-")
    out = c.post(f"{prefix}/sessions/{sid}/responses",
                 json={"text": ANSWER, "question_id": tq["id"], "quadrant": "Family"}).json()
    assert out["therapist_question"] is True and out["evidence"]
    item = out["intensity_follow_ups"][0]
    r = c.post(f"{prefix}/sessions/{sid}/deep-dive/answer",
               json={"evidence_id": item["evidence_id"], "field": "intensity", "value": "Mild"})
    assert r.status_code == 200 and r.json()["evidence"]["intensity"] == "Mild"
    bad = c.post(f"{prefix}/sessions/{sid}/questions/therapist", json={"text": "  "})
    assert bad.status_code == 400


def test_trace_marks_unstated_intensity_as_assumed_mild(monkeypatch):
    monkeypatch.setattr(settings, "intensity_from_baseline", False)
    svc, sid = session(intensity=None)
    svc.skip_opening(sid)
    svc.select_quadrant(sid, "Family")
    svc.process_response(sid, ANSWER, None, "Family")
    ctx = svc.get(sid)
    report = svc.scoring.score(ctx.evidence, contradictions=[], assessed_quadrants={"Family"},
                               responses={r.response_id: r.raw_text for r in ctx.responses}, baseline=ctx.baseline)
    item = next(t for r in report.model_dump()["results"] if r["chakra"] == T for t in r["trace"] if t["counted"])
    assert item["intensity"] == "Mild" and item["intensity_assumed"] is True


def test_therapist_question_keeps_the_waiting_adaptive_question(monkeypatch):
    from tests.unit.test_dynamic_questions import BROTHER, ANXIOUS, FakeGenerator, ok
    monkeypatch.setattr(settings, "dynamic_questions_enabled", True)
    svc, sid = make_session({BROTHER: [ANXIOUS], ANSWER: [unheard("Severe")]}, {})
    svc.dynamic._generator = FakeGenerator(ok())
    svc.submit_opening_response(sid, BROTHER)
    waiting = svc.select_quadrant(sid, "Family")["questions"][0]
    assert waiting["generated"] is True
    tq = svc.register_therapist_question(sid, Q, "Family")
    svc.process_response(sid, ANSWER, tq["id"], "Family")
    again = svc.next_questions(sid, "Family")["questions"][0]
    assert again["id"] == waiting["id"]                     # resumes exactly where it was
