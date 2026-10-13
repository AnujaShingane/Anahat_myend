"""Adaptive question generator: what it is given (form, baseline, session memory) and what it may say."""
from __future__ import annotations

import pytest

from app.services.session_memory import build_session_memory, reason_to_explore
from tests.scenarios.harness import concept, make_session
from tests.unit.test_dynamic_questions import FakeGenerator, ok, adaptive  # noqa: F401  (fixture)

FORM = ("46 yrs, Female \u00b7 Salaried \u00b7 married \u00b7 from Mumbai\n"
        "Main concerns: Blood pressure concerns, Stress and burnout, Anxiety, Irregular or poor sleep.\n"
        "Notes from the form: \"I get tired easily and cannot relax.\"")
ANSWER = "I keep my worries to myself because I do not want my family to worry."
SUPPRESS = concept("I keep my worries to myself", "keeps worries to self", "behaviour", intensity=None)
TABLE = {"keeps worries to self": [("EMO-007", 0.8)], "I keep my worries to myself": [("EMO-007", 0.8)]}
GOOD = "What do you think would happen if you shared those worries with your family?"


def session(generator, answer=ANSWER, concepts=(SUPPRESS,)):
    svc, sid = make_session({answer: list(concepts)}, TABLE)
    ctx = svc._ctx(sid)
    ctx.demographics.update({"age": 46, "gender": "Female", "occupation": "Salaried", "marital_status": "married"})
    ctx.patient_state["current_issue"] = FORM
    svc.dynamic._generator = generator
    svc.submit_opening_response(sid, answer)
    return svc, sid


def test_generator_is_given_form_baseline_and_session_memory(adaptive):
    gen = FakeGenerator(ok(GOOD, attribute="Family Dynamics", exploration_goal="context", focus_signal_id=None,
                           candidate_interpretation_ids=[]))
    svc, sid = session(gen)
    svc.select_quadrant(sid, "Family")
    context = gen.contexts[-1]
    assert context["patient_background"]["occupation"] == "Salaried"
    assert any("Blood pressure" in line for line in context["patient_background"]["form"])
    assert context["baseline_ratings_0_to_10"]["stress"] == 5
    mem = context["session_memory"]
    assert any("do not want my family to worry" in c for c in mem["disclosed_causes_or_reasons"])
    assert mem["patient_reported_facts"] and "UNKNOWN" in mem["note"]


def test_a_reason_the_patient_gives_becomes_the_next_focus(adaptive):
    gen = FakeGenerator(ok(GOOD, exploration_goal="context", focus_signal_id=None, candidate_interpretation_ids=[]))
    svc, sid = session(gen)
    svc.select_quadrant(sid, "Family")
    focus = gen.contexts[-1]["recommended_focus"]
    assert focus["goal"] == "explore_patient_reason" and "family to worry" in focus["patient_words"]


def test_asking_a_question_creates_no_evidence(adaptive):
    gen = FakeGenerator(ok(GOOD, exploration_goal="context", focus_signal_id=None, candidate_interpretation_ids=[]))
    svc, sid = session(gen)
    before = len(svc._ctx(sid).evidence)
    svc.select_quadrant(sid, "Family")
    assert len(svc._ctx(sid).evidence) == before


@pytest.mark.parametrize("bad", [
    "Can you describe the psychological manifestations of your emotional suppression?",   # jargon
    "Is your anxiety caused by childhood trauma?",                                         # assumed cause / diagnosis
    "Don't you think your family would understand if you told them?",                      # leading
    "Why?",                                                                                # unclear / too short
    "Do you suffer from a stress disorder that needs treatment?",                          # diagnosis language
])
def test_unsafe_or_unclear_questions_are_not_shown(adaptive, bad):
    gen = FakeGenerator(ok(bad, exploration_goal="context", focus_signal_id=None, candidate_interpretation_ids=[]))
    svc, sid = session(gen)
    page = svc.select_quadrant(sid, "Family")
    assert page["questions"][0]["question"] != bad


def test_a_simple_exploring_question_is_accepted(adaptive):
    gen = FakeGenerator(ok(GOOD, exploration_goal="context", focus_signal_id=None, candidate_interpretation_ids=[]))
    svc, sid = session(gen)
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    assert q["question"] == GOOD and q["generated"] is True


def test_session_memory_reports_unknown_not_absent_and_follows_exact_words():
    svc, sid = make_session({ANSWER: [SUPPRESS]}, TABLE)
    svc.process_response(sid, ANSWER, None, None)
    mem = build_session_memory(svc._ctx(sid))
    dims = next(iter(mem["details_known_vs_unknown"].values()))
    assert {"frequency", "duration", "daily_impact", "coping"} <= set(dims["unknown"])
    assert reason_to_explore("It was fine today.") is None
    assert reason_to_explore(ANSWER).startswith("I keep my worries")
