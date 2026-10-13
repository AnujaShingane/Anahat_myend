"""Regression tests for the therapist feedback PDF (intensity, repeats, quadrant guidance, mapping)."""
import re

from app.engine.intensity import infer_intensity
from app.services.assessment_service import QUESTION_BANK_ALIGNMENT_BY_QUADRANT
from app.services.question_topics import audit_question_bank, merge_follow_up_fragments, question_fits
from tests.scenarios.harness import concept, make_session, say

BANK_DIR = "knowledge_base/ANAHAT_KnowledgeBase_v3/rag/question_bank"


# ---------------------------------------------------------------- 1. semantic intensity
def test_degree_words_behaviour_and_frequency_are_read_semantically():
    text = ("I get really irritated when they keep telling me to stop. If I get very upset, "
            "I go to my room and stop talking to anyone.")
    assert infer_intensity(text, "I get really irritated", "irritability").found
    assert infer_intensity("I feel a little anxious", "a little anxious").label == "Mild"
    assert infer_intensity("I feel very anxious", "very anxious").label == "Severe"
    assert infer_intensity("It is 8 out of 10", "").label == "Severe"
    assert infer_intensity("I'm not very anxious", "not very anxious").label == "Mild"


def test_no_cue_means_no_intensity_never_invented():
    assert not infer_intensity("I get headaches", "headaches").found
    assert not infer_intensity("sometimes I cry", "sometimes I cry").found      # one weak cue only
    assert not infer_intensity("I get irritated and angry more easily", "irritated and angry").found


def _session(text, concepts):
    svc, sid = make_session({text: concepts}, {})
    svc.select_quadrant(sid, "Nature")
    return svc, sid


def test_model_returning_null_intensity_does_not_trigger_the_intensity_question():
    text = "I get really irritated and angry. If I get very upset I go to my room and stop talking to anyone."
    svc, sid = _session(text, [concept("I get really irritated and angry", "anger", "emotion", intensity=None)])
    out = svc.process_response(sid, text, None, "Nature")
    assert out["evidence"], "anger should be recorded"
    assert out["evidence"][0]["intensity"] in {"Moderate", "Severe"}
    assert out["evidence"][0]["intensity_source"] == "inferred"
    assert out["intensity_follow_ups"] == []


def test_intensity_is_asked_only_when_there_is_genuinely_no_cue_and_once_per_statement():
    text = "I get angry and I stay quiet."
    svc, sid = _session(text, [concept("I get angry", "anger", "emotion", intensity=None),
                               concept("I get angry", "suppressed", "emotion", intensity=None)])
    out = svc.process_response(sid, text, None, "Nature")
    items = out["intensity_follow_ups"]
    assert len(items) == 1 and len(items[0]["evidence_ids"]) == len(out["evidence"]) >= 1
    svc.answer_deep_dive(sid, items[0]["evidence_id"], "intensity", "Severe")
    ctx = svc._ctx(sid)
    assert {e.intensity for e in ctx.evidence if e.response_id == out["response_id"]} == {"Severe"}


# ---------------------------------------------------------------- 4. one indicator = one count
def test_same_indicator_in_a_later_answer_is_not_counted_or_asked_again():
    t1, t2 = "I get angry quickly.", "Yes I get angry again when my parents push me."
    svc, sid = make_session({t1: [concept("I get angry", "anger", "emotion", intensity=None)],
                             t2: [concept("I get angry", "anger", "emotion", intensity=None)]}, {})
    svc.select_quadrant(sid, "Nature")
    a = svc.process_response(sid, t1, None, "Nature")
    b = svc.process_response(sid, t2, None, "Nature")
    ctx = svc._ctx(sid)
    assert len(a["evidence"]) == 1 and b["evidence"] == []
    assert len(b["repeat_mentions"]) == 1 and b["intensity_follow_ups"] == []
    assert len([e for e in ctx.evidence if not e.twin_of]) == 1
    assert len(ctx.evidence[0].mention_response_ids) == 1


# ---------------------------------------------------------------- 3. quadrant guidance
def test_no_automatic_move_after_three_questions_and_guidance_suggests_moving_on():
    svc, sid = make_session({}, {})
    svc.select_quadrant(sid, "Personal Interests")
    for i in range(3):
        out = svc.process_response(sid, f"I enjoy reading and music, answer {i}.", f"Q-4-{i+1}", "Personal Interests")
    assert "quadrant_transition" not in out
    g = out["quadrant_guidance"]
    assert g["suggestion"] == "move_on" and g["signal"] == "no_issue_found" and g["decision_required"]
    assert not svc._q_state(svc._ctx(sid), "Personal Interests")["completed"]


def test_issue_found_suggests_deep_dive_after_three_questions():
    text = "I feel angry and I stay quiet at home."
    svc, sid = make_session({text: [concept("I feel angry", "anger", "emotion", intensity="Moderate")]}, {})
    svc.select_quadrant(sid, "Family")
    for i in range(3):
        out = svc.process_response(sid, text if i == 0 else f"It is the same, answer {i}.", f"Q-2-{i+1}", "Family")
    g = out["quadrant_guidance"]
    assert g["suggestion"] == "deep_dive" and g["signal"] == "issue_found" and "Anger" in g["issue_terms"]


def test_therapist_can_move_on_early():
    svc, sid = make_session({}, {})
    svc.select_quadrant(sid, "Diet")
    svc.process_response(sid, "I eat three meals.", "Q-7-1", "Diet")
    svc.process_response(sid, "Mostly home food.", "Q-7-2", "Diet")
    assert svc.complete_quadrant(sid, "Diet", early=True)["completed_quadrant"] == "Diet"


# ---------------------------------------------------------------- 7. quadrant mapping
def test_no_question_is_offered_under_a_quadrant_it_does_not_belong_to():
    report = audit_question_bank(BANK_DIR, QUESTION_BANK_ALIGNMENT_BY_QUADRANT)
    prof = " ".join(x["question"].lower() for x in report["Profession"]["accepted"])
    for word in ("appetite", "sleep", "eating", "exercise", "therapy", "household"):
        assert word not in prof, word
    for quadrant, parts in report.items():
        for x in parts["accepted"]:
            ok, why = question_fits(quadrant, x["question"], x["bank"])
            assert ok, (quadrant, x)
    assert any("How is your appetite?" == x["question"] for x in report["Profession"]["rejected"])


def test_follow_up_fragments_are_joined_to_their_question():
    merged = merge_follow_up_fragments([
        "Do you engage in mindfulness or meditation practices?",
        "If so, how has it changed your day-to-day activities?",
        "How is that going?"])
    assert merged == ["Do you engage in mindfulness or meditation practices? If so, how has it changed your day-to-day activities?"]
    assert not any(re.match(r"^if so", m, re.I) for m in merged)


def test_deep_dive_is_not_interrupted_after_every_answer():
    text = "I feel angry and I stay quiet at home."
    svc, sid = make_session({text: [concept("I feel angry", "anger", "emotion", intensity="Moderate")]}, {})
    svc.select_quadrant(sid, "Family")
    for i in range(3):
        svc.process_response(sid, text if i == 0 else f"Same again {i}.", f"Q-2-{i+1}", "Family")
    st = svc._q_state(svc._ctx(sid), "Family")
    st["deep_dive_question_count"] = 1
    assert svc.quadrant_guidance(sid, "Family")["decision_required"] is False
    st["deep_dive_question_count"] = 2
    assert svc.quadrant_guidance(sid, "Family")["decision_required"] is True
