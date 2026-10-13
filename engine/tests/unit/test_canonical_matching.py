"""Regression tests: extracted concept -> canonical KB indicator -> chakra association,
and the verbatim-quote gate that sits in front of it."""
from types import SimpleNamespace

from app.knowledge.indicator_repository import IndicatorRepository
from app.knowledge.loader import KnowledgeBase
from app.llm.schemas import CandidateValidation, ExtractedConcept, SemanticExtraction
from app.models.assessment import AssessmentCreate, BaselineCreate
from app.services.assessment_service import AssessmentService, recover_verbatim_quote

KB = KnowledgeBase().load_directory("knowledge_base/ANAHAT_KnowledgeBase_v3")
REPO = IndicatorRepository(KB)


def assoc(concept, indicator_id):
    matches, _ = REPO.find_for_concept(concept)
    return {(m.chakra, m.state_raw, m.association_rating) for m in matches if m.indicator_id == indicator_id}


def test_overthinking_matches_emo_010_third_eye_excess_strong():
    assert ("Third Eye Chakra", "Excess", "Strong") in assoc("overthinking", "EMO-010")


def test_anxiety_matches_emo_008_root_deficient_strong():
    assert ("Root Chakra", "Deficient", "Strong") in assoc("anxiety", "EMO-008")


def test_low_self_confidence_matches_beh_017_solar_plexus_deficient_strong():
    assert ("Solar Plexus Chakra", "Deficient", "Strong") in assoc("low self-confidence", "BEH-017")


def test_snake_case_labels_from_the_model_still_match():
    assert assoc("low_self_confidence", "BEH-017")


PATIENT = ("When work gets stressful, I usually take a short break and spend some time alone to calm down. "
           "I tend to overthink the situation and keep my concerns to myself rather than speaking up or asking for help.")


def test_quote_recovered_from_patient_words_when_model_returns_label():
    assert recover_verbatim_quote(PATIENT, "overthinking", "overthinking") == "overthink"


def test_quote_never_recovered_for_something_the_patient_did_not_say():
    assert recover_verbatim_quote(PATIENT, "sleep", "sleep_issue") is None
    assert recover_verbatim_quote(PATIENT, "fear of judgment", "judgment_fear") is None
    assert recover_verbatim_quote(PATIENT, "misunderstood", "misunderstood") is None


def _service(concepts):
    class LLM:
        def extract_semantics(self, text, context=None):
            return SemanticExtraction(concepts=concepts)

        def validate_candidates(self, *a):
            return CandidateValidation(judgements=[])

    class NoRetrieval:
        def search(self, *a, **k):
            return []

    svc = AssessmentService(kb=KB, llm=LLM(), retriever=NoRetrieval())
    sid = svc.create_session(AssessmentCreate(patient_id="t")).session_id
    svc.set_baseline(sid, BaselineCreate(stress=5, anxiety=5, mood=5, sleep_quality="Fair", energy=5))
    svc.skip_opening(sid)
    svc.select_quadrant(sid, "Profession")
    return svc, sid


def C(label, quote, domain="emotion"):
    return ExtractedConcept(concept=label, evidence_quote=quote, domain=domain, polarity="positive",
                            currentness="current", certainty="certain")


def test_end_to_end_overthink_answer_records_emo_010_and_rejects_context_concepts():
    svc, sid = _service([C("overthinking", "overthinking"), C("sleep", "sleep", "symptom"),
                         C("misunderstood", "misunderstood")])
    out = svc.process_response(sid, PATIENT, None, "Profession")
    assert out["status"] == "OK"
    assert [e["canonical_indicator_id"] for e in out["evidence"]] == ["EMO-010"]
    assert {u["concept"] for u in out["unverified_concepts"]} == {"sleep", "misunderstood"}


def test_same_indicator_repeated_in_many_answers_counts_once():
    """'Overthinking' said in 5 different answers is ONE observation, not 5 independent units."""
    svc, sid = _service([C("overthinking", "overthink")])
    for i in range(5):
        svc.process_response(sid, f"I overthink things a lot, answer {i}.", None, "Profession")
    ctx = svc._ctx(sid)
    assert len(ctx.evidence) == 1                 # one indicator = one record
    assert len(ctx.evidence[0].mention_response_ids) == 4
    ctx.patient_state["final_chakra_evaluated"] = True
    third_eye = next(r for r in svc.score(sid).results if r.chakra == "Third Eye Chakra")
    assert third_eye.independent_evidence_units == 1
    assert third_eye.excess_score == 0.7          # Strong x Moderate ('a lot', read semantically) x confirmed, counted once


def test_direct_label_match_needs_the_quote_to_name_the_indicator():
    """Label 'feeling unheard' with an unrelated quote is not auto-confirmed (validator says none)."""
    text = "Some unresolved experiences from the past still affect me."
    svc, sid = _service([C("feeling unheard", "Some unresolved experiences from the past still affect me.")])
    out = svc.process_response(sid, text, None, "Profession")
    assert out["evidence"] == []
    text2 = "I often feel misunderstood or unheard at work."
    svc2, sid2 = _service([C("feeling unheard", "I often feel misunderstood or unheard")])
    out2 = svc2.process_response(sid2, text2, None, "Profession")
    assert [e["canonical_indicator_id"] for e in out2["evidence"]] == ["EMO-012"]
