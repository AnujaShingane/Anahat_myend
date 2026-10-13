"""Regression tests for the 'no chakra is ever detected' bug: evidence must not vanish before the gate,
and the next follow-up question must be driven by what the patient just said."""
from app.core.config import settings
from app.core.enums import EvidenceStatus
from app.engine.evidence_engine import EvidenceEngine
from app.engine.scoring_engine import ScoringEngine
from app.knowledge.indicator_repository import IndicatorRepository
from tests.scenarios.harness import THROAT, card, concept, kb, make_session, say

T = "Throat Chakra"


def _ev(eid, iid, *, status=EvidenceStatus.CONFIRMED, intensity="Moderate"):
    eng = EvidenceEngine(IndicatorRepository(kb()))
    return eng.build_evidence(
        response_id="r1",
        candidate={"candidate_id": eid, "score": .99, "payload": {"indicator_id": iid},
                   "concept": {"polarity": "positive", "currentness": "current", "certainty": "certain",
                               "domain": "symptom", "intensity": intensity}},
        extraction={}, status=status)


def _non_directional_id():
    by = {}
    for i in kb().indicators:
        by.setdefault(i.indicator_id, []).append(i)
    return next(k for k, v in by.items() if not any(r.state_raw in ("Deficient", "Excess") for r in v))


def test_non_directional_indicator_is_presence_only_not_dropped():
    iid = _non_directional_id()
    report = ScoringEngine(kb()).score([_ev("a", iid, intensity="Severe")], assessed_quadrants={"Nature"})
    hit = [r for r in report.results if r.mapped_evidence_count]
    assert hit and all(r.status == "IMBALANCED_DIRECTION_UNRESOLVED" for r in hit)
    assert all(r.gate_passed and r.direction is None and r.presence_score > 0 for r in hit)
    assert set(report.supported_chakras) == {r.chakra for r in hit}
    assert report.directional_chakras == []          # direction is never guessed


def test_missing_intensity_scores_at_floor_and_stays_a_pending_detail():
    report = ScoringEngine(kb()).score([_ev("a", "EMO-012", intensity=None)], assessed_quadrants={"Nature"})
    r = next(x for x in report.results if x.chakra == T)
    assert r.pending_details and r.deficient_score > 0 and r.status == "IMBALANCED_DEFICIENT"
    assert any("floor weight" in reason for reason in r.reasons)


def test_unresolved_evidence_counts_provisionally_and_strict_mode_restores_zero(monkeypatch):
    ev = _ev("a", "EMO-012", status=EvidenceStatus.UNRESOLVED, intensity="Severe")
    r = next(x for x in ScoringEngine(kb()).score([ev], assessed_quadrants={"Nature"}).results if x.chakra == T)
    assert r.deficient_score > 0 and any("provisional" in reason for reason in r.reasons)
    monkeypatch.setattr(settings, "score_unresolved_as_provisional", False)
    r = next(x for x in ScoringEngine(kb()).score([ev], assessed_quadrants={"Nature"}).results if x.chakra == T)
    assert r.deficient_score == 0 and r.status != "IMBALANCED_DEFICIENT"


def test_follow_up_asks_for_intensity_in_patients_words_and_answer_unlocks_score():
    txt = "I feel unheard at home"
    svc, sid = make_session({txt: [concept("feel unheard", "feeling unheard", "emotion", intensity=None)]},
                            {"feeling unheard": [(THROAT["unheard"], .9)]})
    out = svc.process_response(sid, txt)
    fu = out["follow_up"]
    assert fu["field"] == "intensity" and fu["blocking"]
    assert '"feel unheard"' in fu["question"] and fu["options"] == ["Mild", "Moderate", "Severe"]
    assert fu["answer_endpoint"] == f"/sessions/{sid}/deep-dive/answer"
    ev = svc._ctx(sid).evidence[0]
    svc.answer_deep_dive(sid, fu["evidence_id"], "intensity", "Severe", raw_text="It is really bad")
    assert ev.intensity == "Severe"
    r = next(x for x in svc.scoring.score(svc._ctx(sid).evidence).results if x.chakra == T)
    assert r.status == "IMBALANCED_DEFICIENT" and not r.pending_details


def test_rag_question_query_is_led_by_the_latest_answer():
    quadrant = kb().quadrant_names[0]
    txt = "My throat feels tight whenever I try to speak up"
    svc, sid = make_session({txt: [concept("throat feels tight", "throat tightness")]}, {"throat tightness": []})
    seen = []

    class Spy:
        def search(self, query, top_k=None):
            seen.append(query)
            return []
    svc.question_retriever = Spy()
    svc.select_quadrant(sid, quadrant)
    svc.process_response(sid, txt, None, quadrant)
    svc.next_questions(sid, quadrant)
    assert seen and seen[-1].startswith(f"Latest patient answer: {txt}")
    assert "Demographics" not in seen[-1]
