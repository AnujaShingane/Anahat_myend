"""Adaptive (LLM-worded) questions: real KB, real evidence pipeline, scripted model.

The central case is the one the ANAHAT team specified:
  patient: "I have family issues, my brother pressurizes me that makes me feel anxious"
  engine:  asks what exactly the brother pressurizes them about (to tell apart the KB's
           competing interpretations of anxiety) - without naming any chakra.
"""
from __future__ import annotations

import json

import httpx
import pytest

from app.core.config import settings
from app.llm.question_provider import OllamaQuestionGenerator, build_question_generator
from app.llm.question_schemas import GeneratedQuestion
from tests.scenarios.harness import concept, make_session

BROTHER = "I have family issues, my brother pressurizes me that makes me feel anxious"
ANXIOUS = concept("feel anxious", "anxiety", domain="emotion", intensity=None)
GOOD_Q = "What exactly does your brother pressurize you about?"
CHAKRA_WORDS = ("Root Chakra", "Solar Plexus", "Throat Chakra", "chakra")


def string_values(obj):
    """All string VALUES (not keys) in a JSON-like structure."""
    if isinstance(obj, dict):
        return [s for v in obj.values() for s in string_values(v)]
    if isinstance(obj, list):
        return [s for v in obj for s in string_values(v)]
    return [obj] if isinstance(obj, str) else []


def mentions_chakra(obj) -> bool:
    text = " ".join(string_values(obj)).lower()
    return any(w.lower() in text for w in CHAKRA_WORDS)


class FakeGenerator:
    """Returns scripted outputs and records every context it was given."""
    provider_name = "fake"

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.contexts = []

    def generate_question(self, context):
        self.contexts.append(json.loads(json.dumps(context)))
        out = self.outputs.pop(0) if len(self.outputs) > 1 else self.outputs[0]
        if isinstance(out, Exception):
            raise out
        return GeneratedQuestion.model_validate(out), self.provider_name


def ok(text=GOOD_Q, **kw):
    base = {"status": "QUESTION_GENERATED", "question_text": text, "question_type": "clarification",
            "attribute": "Family Dynamics", "exploration_goal": "distinguish_interpretations",
            "focus_signal_id": "S1", "candidate_interpretation_ids": ["S1-A", "S1-B", "S1-C"],
            "evidence_dimensions": ["trigger", "context"], "generation_confidence": 0.85}
    base.update(kw)
    return base


@pytest.fixture
def adaptive(monkeypatch):
    monkeypatch.setattr(settings, "dynamic_questions_enabled", True)
    monkeypatch.setattr(settings, "dynamic_question_delivery", "auto")


def session_after_brother(generator, extra_script=None):
    script = {BROTHER: [ANXIOUS], **(extra_script or {})}
    svc, sid = make_session(script, {})
    svc.dynamic._generator = generator
    out = svc.submit_opening_response(sid, BROTHER)
    assert out["status"] in {"OK", "NO_VALID_INDICATOR"}
    return svc, sid


# ---------------------------------------------------------------------------------------------
def test_brother_example_generates_targeted_question_without_chakra_names(adaptive):
    gen = FakeGenerator(ok())
    svc, sid = session_after_brother(gen)
    page = svc.select_quadrant(sid, "Family")

    q = page["questions"][0]
    assert q["question"] == GOOD_Q
    assert q["id"].startswith("DYN-") and q["generated"] is True
    assert page["retrieval_status"] == "LLM_ADAPTIVE"
    assert q["fallback_question"]["question"]                 # KB question kept as fallback
    assert {"EMO-008"} & set(q["generation"]["indicator_ids_being_clarified"])
    assert q["generation"]["patient_facing_text_contains_chakra_term"] is False
    # Nothing returned by the API names a chakra.
    assert not mentions_chakra(page)

    # What the model saw: the patient's words, the KB's three anxiety interpretations as
    # opaque ids with patient-safe themes, a recommended focus - and no chakra names.
    ctx_sent = gen.contexts[0]
    assert ctx_sent["latest_patient_answer"] == BROTHER
    s1 = ctx_sent["signals"][0]
    assert s1["from_latest_answer"] is True and s1["patient_words"] == "feel anxious"
    assert [i["id"] for i in s1["interpretations"]] == ["S1-A", "S1-B", "S1-C"]
    themes = " ".join(i["theme"] for i in s1["interpretations"]).lower()
    assert "safety" in themes and "pressure" in themes and "judged" in themes   # KB RCD-31 options
    assert ctx_sent["recommended_focus"] == {"signal_id": "S1", "goal": "distinguish_interpretations"}
    assert "Family Dynamics" in ctx_sent["area_attributes"]
    assert not mentions_chakra(ctx_sent)

    # Server side keeps the mapping (audit only).
    meta = svc.get(sid).patient_state["dynamic_question_meta"][q["id"]]
    assert set(meta["interpretation_chakras"].values()) == {"Root Chakra", "Solar Plexus Chakra", "Throat Chakra"}
    assert "ambiguity_with_3_or_more_interpretations" in meta["therapist_review_reasons"]


def test_answer_to_generated_question_goes_through_normal_pipeline_and_is_not_asked_again(adaptive):
    answer = "He keeps telling me I must take the engineering job he chose for me"
    gen = FakeGenerator(ok(), ok("How does this pressure show up in your daily routine?",
                                 exploration_goal="daily_impact", candidate_interpretation_ids=[],
                                 attribute="Family Atmosphere"))
    svc, sid = session_after_brother(gen)
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    seen_ctx = []
    original = svc.llm.extract_semantics
    svc.llm.extract_semantics = lambda text, context=None: seen_ctx.append(context) or original(text, context=context)

    out = svc.process_response(sid, answer, q["id"], "Family")
    assert out["status"] in {"OK", "NO_VALID_INDICATOR"}
    state = svc.get(sid).quadrants["Family"]
    assert state["normal_question_count"] == 1 and q["id"] in state["answered_question_ids"]
    assert seen_ctx[-1]["question"] == GOOD_Q        # extraction sees what was asked
    ps = svc.get(sid).patient_state
    assert "distinguish_interpretations" in next(iter(ps["dynamic_covered"].values()))
    assert "Family Dynamics" in ps["dynamic_explored_attributes"]["Family"]

    nxt = svc.next_questions(sid, "Family")["questions"][0]
    assert nxt["question"] != GOOD_Q
    ctx2 = gen.contexts[-1]
    assert GOOD_Q in ctx2["already_asked"]
    assert ctx2["latest_patient_answer"] == answer
    assert ctx2["question_that_was_answered"] == GOOD_Q
    s1 = next(s for s in ctx2["signals"] if s["patient_words"] == "feel anxious")
    assert "distinguish_interpretations" not in s1["open_details"]


def test_generating_a_question_never_changes_the_score(adaptive):
    gen = FakeGenerator(ok())
    svc, sid = session_after_brother(gen)
    ctx = svc.get(sid)

    def snapshot():
        report = svc.scoring.score(ctx.evidence, contradictions=[], assessed_quadrants=set(),
                                   responses={r.response_id: r.raw_text for r in ctx.responses},
                                   baseline=ctx.baseline)
        return report.model_dump(), [e.model_dump() for e in ctx.evidence], len(ctx.candidates)

    before = snapshot()
    svc.select_quadrant(sid, "Family")
    svc.next_questions(sid, "Family")
    assert svc.get(sid).patient_state["dynamic_question_meta"]      # a question was generated
    assert snapshot() == before


def test_same_state_reuses_the_question_instead_of_calling_the_model_again(adaptive):
    gen = FakeGenerator(ok())
    svc, sid = session_after_brother(gen)
    a = svc.select_quadrant(sid, "Family")["questions"][0]
    b = svc.next_questions(sid, "Family")["questions"][0]
    assert a["id"] == b["id"] and len(gen.contexts) == 1


# ---- fallback -------------------------------------------------------------------------------
@pytest.mark.parametrize("bad,reason", [
    (ok("How does your Root Chakra blockage make you feel unsafe?"), "chakra_term_in_question"),
    (ok("What makes you feel unsafe around your brother?"), "presupposes_unstated_feeling:unsafe"),
    (ok("Is it about your safety, or about being judged by him?"), "reveals_interpretation_themes"),
    (ok("Does your brother pressurize you every day?"), "closed_yes_no_question"),
    (ok("What does he pressurize you about, and how do you react?"), "compound_question"),
    (ok("Why does your brother pressurize you?"), "why_question"),
    (ok("What is the treatment you need for this anxiety?"), "diagnostic_or_advice_language"),
    (ok("Don't you think he is the reason you feel anxious?"), "leading_phrasing"),
    (ok(GOOD_Q, candidate_interpretation_ids=["S9-Z"]), "unknown_interpretation_id"),
    (ok(GOOD_Q, attribute="Career Goals"), "attribute_not_in_selected_quadrant"),
    (ok(GOOD_Q, generation_confidence=0.2), "low_generation_confidence"),
    (ok("What exactly does he pressurize you about? When did it start?"), "more_than_one_question"),
    ({"status": "CANNOT_GENERATE"}, "model_returned_cannot_generate"),
])
def test_invalid_model_output_falls_back_to_the_kb_question(adaptive, bad, reason):
    svc, sid = session_after_brother(FakeGenerator(bad))
    page = svc.select_quadrant(sid, "Family")
    q = page["questions"][0]
    assert q["generated"] is False and not q["id"].startswith("DYN-")
    assert q["generation"]["status"] == "FALLBACK" and q["generation"]["fallback_used"] is True
    assert reason in q["generation"]["fallback_reason"]
    assert page["retrieval_status"] == "FALLBACK_RETRIEVED"          # KB path unchanged


def test_duplicate_of_an_asked_question_is_rejected(adaptive):
    svc, sid = session_after_brother(FakeGenerator(ok()))
    first = svc.select_quadrant(sid, "Family")["questions"][0]
    svc.process_response(sid, "He wants me to study engineering", first["id"], "Family")
    svc.dynamic._generator = FakeGenerator(ok("What exactly is it that your brother pressurizes you about?"))
    q = svc.next_questions(sid, "Family")["questions"][0]
    assert "duplicate_of_asked_question" in q["generation"]["fallback_reason"]


def test_model_failure_falls_back_and_says_so(adaptive):
    from app.core.exceptions import LLMTemporaryError
    svc, sid = session_after_brother(FakeGenerator(LLMTemporaryError("down", category="timeout")))
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    assert q["generation"]["fallback_reason"] == "generator_failed:timeout"


def test_disabled_means_plain_kb_questions(monkeypatch):
    monkeypatch.setattr(settings, "dynamic_questions_enabled", False)
    gen = FakeGenerator(ok())
    svc, sid = session_after_brother(gen)
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    assert "generation" not in q and gen.contexts == []


# ---- safety / sensitivity -------------------------------------------------------------------
def test_sensitive_topic_in_answer_uses_kb_question_without_calling_the_model(adaptive):
    text = "My brother drinks a lot of alcohol and shouts, I feel anxious"
    gen = FakeGenerator(ok())
    svc, sid = make_session({text: [concept("feel anxious", "anxiety", domain="emotion")]}, {})
    svc.dynamic._generator = gen
    svc.submit_opening_response(sid, text)
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    assert gen.contexts == []
    assert q["generation"]["fallback_reason"].startswith("sensitive_topic_in_patient_context:addiction")


def test_amber_safety_answer_is_never_followed_by_a_generated_question(adaptive):
    text = "I feel hopeless when my brother pressurizes me"
    gen = FakeGenerator(ok())
    svc, sid = make_session({text: []}, {})
    svc.dynamic._generator = gen
    svc.submit_opening_response(sid, text)
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    assert gen.contexts == [] and q["generation"]["fallback_reason"].startswith("safety")


# ---- therapist review mode ---------------------------------------------------------------------
def test_therapist_review_mode_approve_edit_reject(monkeypatch, adaptive):
    monkeypatch.setattr(settings, "dynamic_question_delivery", "therapist_review")
    svc, sid = session_after_brother(FakeGenerator(ok()))
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    assert q["generation"]["delivery_status"] == "PENDING_THERAPIST_REVIEW"
    with pytest.raises(ValueError, match="therapist review"):
        svc.process_response(sid, "about my studies", q["id"], "Family")

    with pytest.raises(ValueError, match="not acceptable"):
        svc.review_generated_question(sid, q["id"], "edit", "Does your solar plexus chakra hurt?")
    edited = svc.review_generated_question(sid, q["id"], "edit", "What does your brother usually pressurize you about?")
    assert edited["delivery_status"] == "EDITED_BY_THERAPIST"
    assert svc.get(sid).patient_state["question_text_by_id"][q["id"]] == "What does your brother usually pressurize you about?"
    svc.process_response(sid, "about my studies", q["id"], "Family")   # now allowed


def test_therapist_reject_switches_to_kb_fallback(monkeypatch, adaptive):
    monkeypatch.setattr(settings, "dynamic_question_delivery", "therapist_review")
    svc, sid = session_after_brother(FakeGenerator(ok()))
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    res = svc.review_generated_question(sid, q["id"], "reject")
    assert res["question"]["id"] == q["fallback_question"]["id"]
    assert svc.get(sid).patient_state["current_question"]["generated"] is False


# ---- providers ----------------------------------------------------------------------------------
def test_google_and_openai_routed_providers_are_refused_for_patient_words(monkeypatch):
    monkeypatch.setattr(settings, "dynamic_question_providers", "gemini,openrouter,local")
    monkeypatch.setattr(settings, "dynamic_question_allow_remote_providers", False)
    chain = build_question_generator(settings)
    assert chain.provider_names == ["local"]
    assert {f.category for f in chain.config_failures} == {"privacy_blocked"}


def test_ollama_generator_uses_schema_constrained_chat():
    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": json.dumps(ok())}})

    gen = OllamaQuestionGenerator(base_url="http://ollama", model="llama3.2:3b",
                                  client=httpx.Client(transport=httpx.MockTransport(handler)))
    out = gen.generate_question({"selected_area": "Family", "patient_language": "English"})
    assert out.question_text == GOOD_Q
    assert sent["model"] == "llama3.2:3b" and sent["format"]["title"] == "GeneratedQuestion"
    assert sent["messages"][0]["role"] == "system" and "CONTEXT" in sent["messages"][-1]["content"]


def test_ollama_garbage_is_an_invalid_response_not_a_question():
    from app.core.exceptions import LLMInvalidResponseError
    client = httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"message": {"content": "Sure! Here is a question: how are you?"}})))
    gen = OllamaQuestionGenerator(base_url="http://ollama", model="m", client=client)
    with pytest.raises(LLMInvalidResponseError):
        gen.generate_question({})


def test_copying_the_prompt_example_for_a_different_patient_is_rejected(adaptive):
    text = "My sister pressurizes me about marriage and I feel anxious"
    gen = FakeGenerator(ok("What exactly does your brother pressurize you about that leaves you feeling this way?"))
    svc, sid = make_session({text: [ANXIOUS]}, {})
    svc.dynamic._generator = gen
    svc.submit_opening_response(sid, text)
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    assert "copied_prompt_example" in q["generation"]["fallback_reason"]


def test_example_wording_is_fine_when_it_really_fits_the_patient(adaptive):
    svc, sid = session_after_brother(FakeGenerator(ok(
        "What exactly does your brother pressurize you about that leaves you feeling this way?")))
    assert svc.select_quadrant(sid, "Family")["questions"][0]["generated"] is True


# ---- regression: questions stay stable until answered (independent review findings) -------------
def test_question_stays_the_same_across_quadrant_switches_until_answered(adaptive):
    gen = FakeGenerator(ok())
    svc, sid = session_after_brother(gen)
    first = svc.select_quadrant(sid, "Family")["questions"][0]
    svc.select_quadrant(sid, "Social Circle")
    again = svc.next_questions(sid, "Family")["questions"][0]
    assert again["id"] == first["id"] and again["question"] == GOOD_Q


def test_approved_and_edited_questions_survive_the_next_fetch(monkeypatch, adaptive):
    monkeypatch.setattr(settings, "dynamic_question_delivery", "therapist_review")
    svc, sid = session_after_brother(FakeGenerator(ok()))
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    svc.review_generated_question(sid, q["id"], "approve")
    nxt = svc.next_questions(sid, "Family")["questions"][0]
    assert nxt["id"] == q["id"] and nxt["generation"]["delivery_status"] == "APPROVED"
    with pytest.raises(ValueError, match="not awaiting review"):
        svc.review_generated_question(sid, q["id"], "reject")

    svc2, sid2 = session_after_brother(FakeGenerator(ok()))
    q2 = svc2.select_quadrant(sid2, "Family")["questions"][0]
    svc2.review_generated_question(sid2, q2["id"], "edit", "What does your brother usually expect from you?")
    nxt2 = svc2.next_questions(sid2, "Family")["questions"][0]
    assert nxt2["question"] == "What does your brother usually expect from you?"


def test_rejected_question_cannot_be_answered_and_fallback_stays(monkeypatch, adaptive):
    monkeypatch.setattr(settings, "dynamic_question_delivery", "therapist_review")
    svc, sid = session_after_brother(FakeGenerator(ok()))
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    svc.review_generated_question(sid, q["id"], "reject")
    with pytest.raises(ValueError, match="rejected"):
        svc.process_response(sid, "about my studies", q["id"], "Family")
    nxt = svc.next_questions(sid, "Family")["questions"][0]
    assert nxt["id"] == q["fallback_question"]["id"]
    svc.process_response(sid, "It is just okay", nxt["id"], "Family")
    assert svc.get(sid).quadrants["Family"]["normal_question_count"] == 1


def test_deep_dive_is_never_extended_by_the_model_once_the_kb_is_empty(adaptive):
    gen = FakeGenerator(ok())
    svc, sid = session_after_brother(gen)
    assert svc.dynamic.adapt(svc.get(sid), "Family", None, [], deep_dive=True) is None
    assert gen.contexts == []


@pytest.mark.parametrize("question", [
    "How often does your brother pressurize you?",
    "What does your brother usually say when he pressurizes you?",
    "What is it like for you when your brother pressurizes you?",
    "Could you say more about what happens at home when this starts?",
    "On a scale of 1 to 10, what number would you give how anxious you feel?",
    "How do people at home treat you when this happens?",
])
def test_good_follow_ups_after_the_brother_question_are_accepted(adaptive, question):
    svc, sid = session_after_brother(FakeGenerator(ok()))
    first = svc.select_quadrant(sid, "Family")["questions"][0]
    svc.process_response(sid, "He wants me to study engineering", first["id"], "Family")
    svc.dynamic._generator = FakeGenerator(ok(question, exploration_goal="frequency",
                                              candidate_interpretation_ids=[], focus_signal_id=None))
    q = svc.next_questions(sid, "Family")["questions"][0]
    assert q.get("generated") is True, q["generation"]


@pytest.mark.parametrize("question,reason", [
    ("What does your brother control in your life?", "steers_toward_one_interpretation"),
    ("When he pressurizes you, do you feel you are losing control?", "closed_yes_no_question"),
])
def test_steering_questions_are_rejected(adaptive, question, reason):
    svc, sid = session_after_brother(FakeGenerator(ok(question)))
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    assert reason in q["generation"]["fallback_reason"]


def test_sensitive_word_matching_has_no_substring_false_positives():
    from app.services.dynamic_question_service import load_guidance
    from app.services.question_validators import sensitive_topics_in
    g = load_guidance()
    assert sensitive_topics_in("I get hives and it hit me hard, I feel beaten down by work", g) == []
    assert sensitive_topics_in("I had suicidal thoughts last year", g) == ["self_harm_or_safety"]
    assert sensitive_topics_in("my father drinks alcohol every night", g) == ["addiction"]


def test_extraction_input_unchanged_when_feature_is_off(monkeypatch):
    monkeypatch.setattr(settings, "dynamic_questions_enabled", False)
    svc, sid = session_after_brother(FakeGenerator(ok()))
    q = svc.select_quadrant(sid, "Family")["questions"][0]
    seen = []
    original = svc.llm.extract_semantics
    svc.llm.extract_semantics = lambda text, context=None: seen.append(context) or original(text, context=context)
    svc.process_response(sid, "It is just okay", q["id"], "Family")
    assert "question" not in (seen[-1] or {})


def test_amber_answer_withdraws_waiting_generated_questions_in_other_quadrants(adaptive):
    svc, sid = session_after_brother(FakeGenerator(ok()))
    fam = svc.select_quadrant(sid, "Family")["questions"][0]
    svc.dynamic._generator = FakeGenerator(ok("What do your friends notice about you lately?",
                                              attribute=None, candidate_interpretation_ids=[],
                                              focus_signal_id=None, exploration_goal="context"))
    soc = svc.select_quadrant(sid, "Social Circle")["questions"][0]
    assert soc["generated"] is True
    svc.llm.script["I feel hopeless when my brother pressurizes me"] = []
    svc.process_response(sid, "I feel hopeless when my brother pressurizes me", fam["id"], "Family")
    again = svc.next_questions(sid, "Social Circle")["questions"][0]
    assert again["generated"] is False and again["generation"]["fallback_reason"].startswith("safety")
    with pytest.raises(ValueError, match="withdrawn"):
        svc.process_response(sid, "They say I am quiet", soc["id"], "Social Circle")
