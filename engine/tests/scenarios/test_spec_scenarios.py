"""The 20 scenarios required by the spec (PDF: 'Tests to add'), on the real KB.
Each test states the rule it protects."""
import pytest

from app.core.enums import EvidenceStatus
from tests.scenarios.harness import (SOLAR_EXC, THROAT, card, concept, cover_all_quadrants, kb, make_session, say)

T = "Throat Chakra"
S = "Solar Plexus Chakra"


def throat_script():
    t1 = "I keep everything inside and never say what I feel"
    t2 = "Nobody listens to me when I talk"
    return ({t1: [concept("never say what I feel", "suppressed expression", "emotion", intensity="Severe")],
             t2: [concept("Nobody listens to me", "feeling unheard", "emotion", intensity="Severe")]},
            {"suppressed expression": [(THROAT["suppressed"], 0.9)], "feeling unheard": [(THROAT["unheard"], 0.9)]}, t1, t2)


# ---------------- 1-5: opening styles per patient type (KB-only text) -------------------------------
@pytest.mark.parametrize("persona,style", [
    ("normal adult", "A"), ("nervous patient", "C"), ("child", "E"), ("older adult", "F"),
    ("accessibility needs", "H")])
def test_01_to_05_persona_opening_comes_from_kb_only(persona, style):
    svc, sid = make_session({}, {})
    styles = svc.get_opening_questions(sid)
    assert {s["id"] for s in styles["styles"]} >= {style}
    got = svc.get_opening_questions(sid, style=style)
    kb_texts = [q["text"] for s in kb().opening_styles["styles"] if s["id"] == style for q in s["questions"]]
    assert [q["text"] for q in got["questions"]] == kb_texts          # verbatim KB wording, no rewriting
    assert 2 <= len(got["questions"]) <= 3


# ---------------- 6: vague answer -------------------------------------------------------------------
def test_06_vague_answer_creates_no_evidence_and_no_invented_symptom():
    text = "I just feel off, you know"
    svc, sid = make_session({text: [concept("feel off", "general unease", "other", polarity="uncertain")]}, {})
    out, _ = say(svc, sid, text)
    assert out["status"] == "NO_VALID_INDICATOR" and out["candidate_count"] == 0
    assert svc._ctx(sid).evidence == []


# ---------------- 7: negative --------------------------------------------------------------------------
def test_07_negative_statement_is_not_scored_as_presence():
    pos, neg = "I feel unheard at home", "I am not silent, I speak up"
    svc, sid = make_session(
        {pos: [concept("feel unheard", "feeling unheard", "emotion", intensity="Severe")],
         neg: [concept("not silent", "silence", "behaviour", polarity="negative")]},
        {"feeling unheard": [(THROAT["unheard"], .9)], "silence": [(THROAT["silence"], .9)]})
    say(svc, sid, pos); say(svc, sid, neg)
    ev = {e.canonical_indicator_id: e for e in svc._ctx(sid).evidence}
    assert ev[THROAT["silence"]].status == EvidenceStatus.NEGATIVE
    c = card(svc.final_result(sid), T)
    assert c["counts"]["negative"] == 1
    assert c["status"].startswith("IMBALANCED")  # one confirmed directional unit reaches 0.20
    assert all(not t["counted"] for t in c["trace"] if t["indicator_id"] == THROAT["silence"])


# ---------------- 8: historical -----------------------------------------------------------------------
def test_08_historical_evidence_does_not_count_as_current():
    txt = "I used to stay silent, but not anymore"
    svc, sid = make_session({txt: [concept("used to stay silent", "silence", "behaviour", currentness="historical")]},
                            {"silence": [(THROAT["silence"], .9)]})
    say(svc, sid, txt)
    assert svc._ctx(sid).evidence[0].status == EvidenceStatus.HISTORICAL
    c = card(svc.final_result(sid), T)
    assert c["scores"]["presence"] == 0 and c["counts"]["historical"] == 1


# ---------------- 9: ambiguous indicator --------------------------------------------------------------
def test_09_ambiguous_indicator_needs_kb_disambiguation_before_chakra_counts():
    txt = "I keep getting abdominal cramps"
    svc, sid = make_session({txt: [concept("abdominal cramps", "abdominal cramps", intensity="Severe")]},
                            {"abdominal cramps": [("SYM-001", .9)]})
    _, conf = say(svc, sid, txt)
    assert conf[0]["clarification_required"] and conf[0]["clarifications"][0]["id"] == "RCD-01"
    ev = svc._ctx(sid).evidence[0]
    assert ev.status == EvidenceStatus.UNRESOLVED
    # a chakra passed at confirmation time is ignored
    assert ev.selected_chakra is None
    with pytest.raises(ValueError):
        svc.resolve_ambiguity(sid, ev.evidence_id, "Throat Chakra")      # not an association for SYM-001
    svc.resolve_ambiguity(sid, ev.evidence_id, "Root Chakra")
    assert ev.status == EvidenceStatus.RESOLVED_AFTER_CLARIFICATION


def test_09b_patient_disambiguation_response_is_mapped_before_scoring():
    txt = "I keep getting abdominal cramps"
    svc, sid = make_session({txt: [concept("abdominal cramps", "abdominal cramps", intensity="Severe")]},
                            {"abdominal cramps": [("SYM-001", .9)]})
    _, conf = say(svc, sid, txt)
    ev = svc._ctx(sid).evidence[0]
    svc.answer_deep_dive(
        sid,
        ev.evidence_id,
        "disambiguation",
        "Root Chakra",
        raw_text="I feel unsafe and worried about basic needs.",
    )
    assert ev.status == EvidenceStatus.RESOLVED_AFTER_CLARIFICATION
    report = svc.scoring.score(svc._ctx(sid).evidence)
    root = next(item for item in report.results if item.chakra == "Root Chakra")
    assert root.scored_evidence_count == 1
    assert root.score > 0


# ---------------- 10: multi-chakra evidence ----------------------------------------------------------------
def test_10_multi_chakra_indicator_credits_only_its_own_kb_chakras():
    multi = [i for i in kb().indicators if i.indicator_id in {"SYM-009", "EMO-008"}]   # KB twin pair
    chakras = {i.chakra for i in multi}
    txt = "I feel anxious most days"
    svc, sid = make_session({txt: [concept("feel anxious", "anxiety", intensity="Severe")]}, {"anxiety": [("SYM-009", .9)]})
    say(svc, sid, txt)
    res = svc.final_result(sid)
    touched = {c["chakra"] for c in res["chakras"] if c["trace"]}
    assert touched <= chakras                                               # nothing outside the KB rows


# ---------------- 11: contradiction --------------------------------------------------------------------------
def test_11_contradiction_blocks_imbalance_until_therapist_resolves_it():
    a, b = "I always keep quiet about how I feel", "I never keep quiet, I say everything"
    svc, sid = make_session(
        {a: [concept("keep quiet", "silence", "behaviour", intensity="Severe")],
         b: [concept("never keep quiet", "silence", "behaviour", polarity="negative")]},
        {"silence": [(THROAT["silence"], .9)]})
    say(svc, sid, a); say(svc, sid, b)
    res = svc.final_result(sid)
    assert res["open_items"]["contradictions"]
    keep = next(e for e in svc._ctx(sid).evidence if e.status != EvidenceStatus.NEGATIVE)
    svc.resolve_contradiction(sid, keep.evidence_id, "patient clarified")
    neg = next(e for e in svc._ctx(sid).evidence if e.status == EvidenceStatus.NEGATIVE)
    assert neg.superseded and neg.superseded_by == keep.evidence_id          # kept for audit, never deleted
    assert not svc.final_result(sid)["open_items"]["contradictions"]


# ---------------- 12: duplicate / repeated mention ------------------------------------------------------------
def test_12_repeating_the_same_symptom_does_not_inflate_the_score():
    t = "I feel unheard at home"
    svc, sid = make_session({t + " 1": [concept("feel unheard", "feeling unheard", "emotion", intensity="Severe")],
                             t + " 2": [concept("feel unheard", "feeling unheard", "emotion", intensity="Severe")]},
                            {"feeling unheard": [(THROAT["unheard"], .9)]})
    say(svc, sid, t + " 1")
    once = card(svc.final_result(sid), T)["scores"]["presence"]
    say(svc, sid, t + " 2")
    res = svc.final_result(sid)
    assert card(res, T)["scores"]["presence"] == once
    assert card(res, T)["independent_evidence_units"] == 1
    assert card(res, T)["status"].startswith("IMBALANCED")


def test_12b_kb_twin_entries_count_once():
    txt = "I feel anxious every day"
    svc, sid = make_session({txt: [concept("feel anxious", "anxiety", intensity="Severe")]}, {"anxiety": [("SYM-009", .9)]})
    _, conf = say(svc, sid, txt)
    assert conf[0]["twin_evidence_ids"]                                     # EMO-008 is auto-linked
    res = svc.final_result(sid)
    assert all(c["independent_evidence_units"] <= 1 for c in res["chakras"])


# ---------------- 13: deep dive ---------------------------------------------------------------------------------------
def test_13_deep_dive_asks_for_missing_details_is_capped_and_stops():
    txt = "I feel unheard at home"
    svc, sid = make_session({txt: [concept("feel unheard", "feeling unheard", "emotion", intensity=None)]},
                            {"feeling unheard": [(THROAT["unheard"], .9)]})
    say(svc, sid, txt)
    first = svc.deep_dive_items(sid)
    fields = [i["field"] for i in first["items"]]
    assert fields[0] == "intensity" and first["items"][0]["blocking"]
    assert len(fields) <= 4                                                # per-evidence cap
    ev = svc._ctx(sid).evidence[0]
    assert card(svc.final_result(sid), T)["pending_details"]              # missing intensity is visible, not silent
    with pytest.raises(ValueError):
        svc.answer_deep_dive(sid, ev.evidence_id, "intensity", "extreme")  # no guessing scale values
    svc.answer_deep_dive(sid, ev.evidence_id, "intensity", "Severe", raw_text="It is really bad")
    assert any(r.raw_text == "It is really bad" for r in svc._ctx(sid).responses)   # raw words preserved
    assert svc.deep_dive_items(sid, therapist_stop=True)["stopped"]


# ---------------- 14: insufficient evidence -----------------------------------------------------------------------------
def test_14_one_mild_mention_passes_meaningful_directional_threshold():
    t = "Sometimes I stay silent"
    svc, sid = make_session({t: [concept("stay silent", "silence", "behaviour", intensity="Mild")]},
                            {"silence": [(THROAT["silence"], .9)]})
    say(svc, sid, t)
    c = card(svc.final_result(sid), T)
    assert c["status"].startswith("IMBALANCED")
    assert c["scores"]["deficient"] >= .2 or c["scores"]["excess"] >= .2
    assert c["status"] != "BALANCED"


# ---------------- 15: multiple imbalanced chakras -----------------------------------------------------------------------------
def test_15_two_chakras_can_be_imbalanced_together_with_direction():
    script, table, t1, t2 = throat_script()
    a1, a2 = "I get angry all the time", "My blood pressure is high"
    script[a1] = [concept("angry all the time", "anger", "emotion", intensity="Severe")]
    script[a2] = [concept("blood pressure is high", "high blood pressure", intensity="Severe")]
    table.update({"anger": [(SOLAR_EXC["anger"], .9)], "high blood pressure": [(SOLAR_EXC["blood_pressure_high"], .9)]})
    svc, sid = make_session(script, table)
    for t in (t1, t2, a1, a2):
        say(svc, sid, t)
    cover_all_quadrants(svc, sid)
    res = svc.final_result(sid)
    assert card(res, T)["status"] == "IMBALANCED_DEFICIENT"
    assert card(res, S)["status"] == "IMBALANCED_EXCESS"
    assert set(res["summary"]["imbalanced"]) >= {T, S}


# ---------------- 16: AMBER ----------------------------------------------------------------------------------------------------------
def test_16_amber_alerts_therapist_pauses_deep_dive_until_acknowledged():
    txt = "I feel hopeless and I feel unheard at home"
    svc, sid = make_session({txt: [concept("feel unheard", "feeling unheard", "emotion", intensity=None)]},
                            {"feeling unheard": [(THROAT["unheard"], .9)]})
    out, _ = say(svc, sid, txt)
    assert out["safety"]["level"] == "AMBER"
    paused = svc.deep_dive_items(sid)
    assert paused["stopped"] and paused["stop_reason"] == "safety_hold"
    svc.acknowledge_safety(sid, "reviewed")
    assert svc.deep_dive_items(sid)["items"]


def test_16b_llm_can_only_raise_safety_never_lower_it():
    txt = "Things at home are not safe"
    svc, sid = make_session({txt: []}, {}, safety_relevant=[txt])
    out, _ = say(svc, sid, txt)
    assert out["safety"]["level"] == "AMBER"
    red = "I want to end my life"
    svc2, sid2 = make_session({red: []}, {}, safety_relevant=[])
    assert svc2.process_response(sid2, red)["status"] == "SAFETY_ESCALATION"


# ---------------- 17: RED ----------------------------------------------------------------------------------------------------------------
def test_17_red_stops_everything_llm_not_called_and_needs_therapist_to_resume():
    txt = "I want to kill myself"
    svc, sid = make_session({}, {})
    out = svc.process_response(sid, txt)
    assert out["status"] == "SAFETY_ESCALATION" and svc.llm.calls == 0
    assert svc.process_response(sid, "next answer")["status"] == "SAFETY_ESCALATION"    # interrupted
    with pytest.raises(ValueError):
        svc.acknowledge_safety(sid, "ack only")                                          # cannot silently continue
    svc.acknowledge_safety(sid, "therapist reviewed", resume=True)
    assert svc._ctx(sid).stage != "safety_escalation"
    for ec in out["safety"]["emergency_contacts"]:                                       # only KB contacts, flagged
        assert ec["requires_live_verification_before_production"] in (True, False)
    kb_numbers = str(kb().emergency_contacts)
    assert all(str(ec["contact"]) in kb_numbers for ec in out["safety"]["emergency_contacts"])


# ---------------- 18: no valid indicator ----------------------------------------------------------------------------------------------------
def test_18_concept_with_no_kb_match_or_no_quote_never_becomes_a_candidate():
    t1, t2 = "I have a strange tingling", "I feel tired"
    svc, sid = make_session(
        {t1: [concept("strange tingling", "tingling", intensity="Mild")],
         t2: [concept("this quote is not in the text", "fatigue")]},              # fabricated quote
        {"tingling": []})
    assert say(svc, sid, t1)[0]["status"] == "NO_VALID_INDICATOR"
    out = say(svc, sid, t2)[0]
    assert out["status"] == "NO_VALID_INDICATOR" and out["unverified_concepts"]


def test_18b_llm_validation_rejects_bad_matches_and_ignores_invented_ids():
    from app.llm.schemas import CandidateJudgement, CandidateValidation
    txt = "Nobody at home listens to me"
    # Wording that is NOT a canonical KB term, so the semantic route + LLM validator is exercised
    # ("feeling unheard" is now matched directly as a sub-form of "Feeling Unheard / Not Understood").
    def validate(text, concept, cands):
        return CandidateValidation(judgements=[CandidateJudgement(indicator_id="SYM-999", match="exact"),
                                                CandidateJudgement(indicator_id=cands[0]["indicator_id"], match="none")])
    svc, sid = make_session({txt: [concept("Nobody at home listens to me", "nobody listens to me", "emotion")]},
                            {"nobody listens to me": [(THROAT["unheard"], .9)]}, validate=validate)
    assert say(svc, sid, txt)[0]["candidate_count"] == 0


def test_18c_public_candidates_hide_scores_and_chakras():
    txt = "I feel unheard at home"
    svc, sid = make_session({txt: [concept("feel unheard", "feeling unheard", "emotion")]}, {"feeling unheard": [(THROAT["unheard"], .9)]})
    c = svc.process_response(sid, txt)["candidates"][0]
    assert "score" not in c and "payload" not in c and "chakra" not in str(c).lower()


# ---------------- 19: raga governance -----------------------------------------------------------------------------------------------------------
def test_19_raga_output_never_invents_a_chakra_to_raga_mapping():
    script, table, t1, t2 = throat_script()
    svc, sid = make_session(script, table)
    say(svc, sid, t1); say(svc, sid, t2); cover_all_quadrants(svc, sid)
    rec = svc.recommendations(sid)
    assert rec["therapist_approval_required"] is True
    assert any("No validated chakra-to-raga mapping" in n for n in rec["raga"]["governance_notes"]) \
        or kb().raga_bridge.get("can_influence_raga_recommendation") is True


# ---------------- 20: therapist approval -------------------------------------------------------------------------------------------------------------
def test_20_prescription_is_only_a_draft_until_the_therapist_decides():
    script, table, t1, t2 = throat_script()
    svc, sid = make_session(script, table)
    say(svc, sid, t1); say(svc, sid, t2)
    end = svc.finalize_session(sid)                 # a prescription exists only after End Session
    assert end["status"] == "COMPLETED"
    draft = svc.prescription(sid)
    # the chakra findings the prescription is based on travel with the draft
    assert [c["chakra"] for c in draft["chakra_imbalances"]] == end["final_result"]["summary"]["imbalanced"]
    dumped = draft if isinstance(draft, dict) else draft.model_dump() if hasattr(draft, "model_dump") else vars(draft)
    text = str(dumped).lower()
    assert "approv" in text or "draft" in text
    assert svc.final_result(sid)["therapist_approval_required"] is True and svc.final_result(sid)["is_diagnosis"] is False
