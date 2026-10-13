from types import SimpleNamespace

from app.engine.patient_context import PatientContext
from app.services.assessment_service import AssessmentService
from app.services.safety_service import SafetyService


class FakeKB:
    safety_rules = {"rules": []}
    emergency_contacts = []


class FakeIndicators:
    def validate_candidate(self, iid, payload=None):
        return True

    def term(self, iid):
        return "Lower back pain"

    def domain(self, iid):
        return "symptom"

    @staticmethod
    def term_variants(term):
        return {(term or "").lower()}

    def find_for_concept(self, concept):
        return [], "none"          # no direct KB term match: the fake relies on retrieval

    def group_key(self, iid):
        return iid


class FakeRetriever:
    def __init__(self, fail=False):
        self.fail, self.calls = fail, 0

    def search(self, query):
        self.calls += 1
        if self.fail:
            raise ConnectionError("qdrant down: http://internal:6333")
        return [SimpleNamespace(score=0.9, payload={"indicator_id": "IND-LBP-1"})]


class CountingLLM:
    """Wraps a provider/callable and counts calls."""
    def __init__(self, behaviour):
        self.behaviour, self.calls = behaviour, 0

    def extract_semantics(self, text, *, context=None):
        self.calls += 1
        return self.behaviour(text)


def make_service(llm, retriever=None, sid="sess-1"):
    svc = AssessmentService(kb=None, llm=llm, retriever=retriever or FakeRetriever())
    svc.safety = SafetyService(FakeKB())
    svc.indicators = FakeIndicators()
    ctx = PatientContext()
    AssessmentService._sessions[sid] = ctx
    return svc, ctx, sid


def snapshot(ctx):
    return (len(ctx.responses), len(ctx.candidates), len(ctx.evidence), ctx.stage, len(ctx.audit_events),
            len(ctx.processed_requests))
