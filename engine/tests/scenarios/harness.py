"""Scenario harness: REAL validated KB + REAL scoring/evidence code; only the LLM and the vector
search are scripted (no network). The scripted LLM returns exactly what a correct model would,
so these tests check OUR logic (quotes, gates, scoring, safety), not a model's mood."""
from __future__ import annotations

from types import SimpleNamespace

from app.knowledge.loader import KnowledgeBase
from app.llm.schemas import CandidateJudgement, CandidateValidation, SemanticExtraction
from app.models.assessment import AssessmentCreate, BaselineCreate
from app.services.assessment_service import AssessmentService

KB_PATH = "knowledge_base/ANAHAT_KnowledgeBase_v3"
_KB = None

# Clean, single-chakra, non-ambiguous indicators from the validated KB
THROAT = {"suppressed": "EMO-007", "unheard": "EMO-012", "silence": "BEH-007"}      # Deficient
SOLAR_EXC = {"blood_pressure_high": "SYM-016", "anger": "EMO-004", "overworking": "BEH-003"}  # Excess
SOLAR_DEF = {"fatigue": "SYM-043", "passivity": "BEH-004"}                           # Deficient


def kb():
    global _KB
    if _KB is None:
        _KB = KnowledgeBase().load_directory(KB_PATH)
    return _KB


def concept(text_quote, name, domain="symptom", polarity="positive", currentness="current", intensity="Moderate", **kw):
    return {"concept": name, "evidence_quote": text_quote, "domain": domain, "polarity": polarity,
            "currentness": currentness, "certainty": "certain", "intensity": intensity,
            "clarification_required": False, **kw}


class ScriptedLLM:
    """text -> list of concept dicts. Optionally validates candidates (closed set)."""
    def __init__(self, script, safety_relevant=(), validate=None):
        self.script, self.safety_relevant, self.validate, self.calls = script, set(safety_relevant), validate, 0

    def extract_semantics(self, text, *, context=None):
        self.calls += 1
        return SemanticExtraction.model_validate({"concepts": self.script.get(text, []),
                                                  "safety_relevant": text in self.safety_relevant})

    def validate_candidates(self, text, concept, candidates):
        if self.validate is None:
            return CandidateValidation(judgements=[CandidateJudgement(indicator_id=c["indicator_id"], match="exact") for c in candidates])
        return self.validate(text, concept, candidates)


class ScriptedRetriever:
    """concept text -> [(indicator_id, score)]"""
    def __init__(self, table):
        self.table = table

    def search(self, query):
        return [SimpleNamespace(score=s, payload={"indicator_id": i}) for i, s in self.table.get(query, [])]


def make_session(script, table, *, safety_relevant=(), validate=None, baseline=True):
    llm = ScriptedLLM(script, safety_relevant, validate)
    svc = AssessmentService(kb=kb(), llm=llm, retriever=ScriptedRetriever(table))
    sid = svc.create_session(AssessmentCreate(patient_id="scenario")).session_id
    if baseline:
        svc.set_baseline(sid, BaselineCreate(stress=5, anxiety=5, mood=5, sleep_quality="Good", energy=5))
    return svc, sid


def say(svc, sid, text, quadrant=None, question_id=None, confirm=True):
    """Patient answer -> candidates -> (optionally) therapist confirms every candidate."""
    if quadrant and quadrant not in svc._ctx(sid).quadrants:
        svc.select_quadrant(sid, quadrant)
    out = svc.process_response(sid, text, question_id, quadrant)
    confirmed = []
    if confirm and out.get("status") == "OK":
        for c in out["candidates"]:
            confirmed.append(svc.confirm_candidate(sid, out["response_id"], c["candidate_id"], True))
    return out, confirmed


def cover_all_quadrants(svc, sid):
    for name in kb().quadrant_names:
        # This helper marks fixture coverage directly; production completion
        # requires three recorded normal answers per quadrant.
        svc._q_state(svc._ctx(sid), name)["normal_question_count"] = 3
        svc.complete_quadrant(sid, name)


def card(result, chakra):
    return next(c for c in result["chakras"] if c["chakra"] == chakra)
