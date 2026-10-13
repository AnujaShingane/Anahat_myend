import httpx
import pytest

from app.core.config import settings
from app.llm.schemas import SemanticExtraction
from app.models.assessment import AssessmentCreate, BaselineCreate
from app.models.response import ResponseRecord
from app.services.assessment_service import AssessmentService
from app.services.contextual_reasoning import (
    ContextualReasoningService,
    InitialAssessmentDecision,
    QuestionSelectionDecision,
)
from tests.scenarios.harness import kb


class ScriptedReasoner:
    available = True

    def __init__(self, plans, question_decision=None):
        self.plans = list(plans)
        self.question_decision = question_decision
        self.profiles = []
        self.selection_contexts = []

    def analyze_profile(self, *, profile, concerns, quadrants):
        self.profiles.append((profile.copy(), concerns))
        statuses, gaps = self.plans[min(len(self.profiles) - 1, len(self.plans) - 1)]
        return InitialAssessmentDecision(
            developmental_stage="early childhood" if profile.get("age", 99) < 6 else "adult",
            context_summary="Context is limited to supplied patient information.",
            information_gaps=gaps,
            initial_hypotheses=["Explore emotional expression without treating it as a diagnosis."],
            quadrants=[{
                "quadrant_id": str(item["quadrant_id"]),
                "quadrant": item["name"],
                "status": statuses.get(item["name"], "deferred"),
                "rationale": "Relevant to the supplied concerns." if statuses.get(item["name"]) != "inapplicable"
                else "Not developmentally applicable.",
                "retrieval_query": "developmentally appropriate emotional expression",
            } for item in quadrants],
        )

    def select_question(self, *, context, candidates):
        self.selection_contexts.append((context, candidates))
        return self.question_decision


def _recommend_service(monkeypatch, request, reasoner):
    monkeypatch.setattr(settings, "analyse_intake_as_evidence", False)
    service = AssessmentService(kb=kb(), contextual_reasoner=reasoner)
    session_id = service.create_session(request).session_id
    service.set_baseline(session_id, BaselineCreate(
        stress=5, anxiety=5, mood=5, sleep_quality="Good", energy=5))
    service.skip_opening(session_id)
    return service, session_id


def _statuses(**overrides):
    return overrides


def test_child_profile_skips_adult_domains_and_prioritizes_emotional_context(monkeypatch):
    reasoner = ScriptedReasoner([(_statuses(**{
        "Nature": "priority", "Family": "relevant", "Social Circle": "conditional",
        "Profession": "inapplicable", "Lifestyle": "relevant", "Diet": "deferred",
    }), [])])
    service, session_id = _recommend_service(monkeypatch, AssessmentCreate(
        patient_id="child", age=4, occupation="Not applicable", marital_status="Not applicable"), reasoner)

    recommendations = service.recommend_quadrants(
        session_id, "Main concerns: difficulty expressing emotions. Parent reports distress in unfamiliar situations.")

    names = {item["quadrant"] for item in recommendations}
    assert {"Nature", "Family"} <= names
    assert "Profession" not in names and "Diet" not in names
    assert reasoner.profiles[0][0]["age"] == 4
    assert "patient_id" not in reasoner.profiles[0][0]
    assert service._ctx(session_id).patient_state["contextual_assessment"]["developmental_stage"] == "early childhood"
    with pytest.raises(ValueError, match="inapplicable"):
        service.select_quadrant(session_id, "Profession")
    with pytest.raises(ValueError, match="deferred"):
        service.select_quadrant(session_id, "Diet")


def test_employed_adult_prioritizes_occupational_and_emotional_domains(monkeypatch):
    reasoner = ScriptedReasoner([(_statuses(Profession="priority", Nature="relevant", Family="deferred"), [])])
    service, session_id = _recommend_service(monkeypatch, AssessmentCreate(
        patient_id="adult", age=35, occupation="Employed"), reasoner)

    recommendations = service.recommend_quadrants(session_id, "Workplace stress and low self-confidence.")

    assert recommendations[0]["quadrant"] == "Profession"
    assert "Nature" in {item["quadrant"] for item in recommendations}
    assert "Family" not in {item["quadrant"] for item in recommendations}
    assert reasoner.profiles[0][0]["occupation"] == "Employed"


def test_missing_demographics_remain_missing_and_are_reported_as_information_gaps(monkeypatch):
    reasoner = ScriptedReasoner([(_statuses(Nature="priority"), ["age", "occupation"] )])
    service, session_id = _recommend_service(monkeypatch, AssessmentCreate(patient_id="unknown"), reasoner)

    service.recommend_quadrants(session_id, "Main concerns: feeling overwhelmed.")

    profile = reasoner.profiles[0][0]
    assert "age" not in profile and "occupation" not in profile
    assert service._ctx(session_id).patient_state["contextual_assessment"]["information_gaps"] == ["age", "occupation"]


def test_new_answer_reconsiders_a_deferred_quadrant(monkeypatch):
    reasoner = ScriptedReasoner([
        (_statuses(Nature="priority", Family="deferred"), []),
        (_statuses(Nature="relevant", Family="priority"), []),
    ])
    service, session_id = _recommend_service(monkeypatch, AssessmentCreate(patient_id="adult", age=35), reasoner)
    service.recommend_quadrants(session_id, "Main concerns: workplace stress.")
    ctx = service._ctx(session_id)
    ctx.responses.append(ResponseRecord(
        response_id="response-1", raw_text="Family conflict has also been weighing on me.",
        extraction=SemanticExtraction().model_dump()))

    recommendations = service.recommend_quadrants(session_id)

    assert "Family" in {item["quadrant"] for item in recommendations}
    assert len(reasoner.profiles) == 2
    assert "Family conflict" in reasoner.profiles[1][1]


def test_question_decision_is_adaptive_and_cannot_select_outside_retrieved_candidates(monkeypatch):
    service = ContextualReasoningService(api_key="test-key", model="test-model", client=object())
    service._complete = lambda schema, *_args: schema.model_validate({
        "action": "follow_up", "selected_question_id": "kb-1",
        "rationale": "Clarify the stated fear before moving on.", "ask_to": "caregiver",
        "follow_up_warranted": True,
    })
    candidates = [{"id": "kb-1", "question": "What makes it hard to express your feelings?"}]

    decision = service.select_question(
        context={"latest_answer": "I keep quiet because I fear judgment."}, candidates=candidates)

    assert decision.action == "follow_up" and decision.selected_question_id == "kb-1"
    assert decision.ask_to == "caregiver" and decision.follow_up_warranted

    service._complete = lambda schema, *_args: schema.model_validate({
        "action": "continue", "selected_question_id": "not-retrieved",
        "rationale": "Choose another question.", "ask_to": "patient", "follow_up_warranted": False,
    })
    with pytest.raises(ValueError, match="unknown candidate"):
        service.select_question(context={}, candidates=candidates)

    service._complete = lambda schema, *_args: schema.model_validate({
        "action": "reconsider_deferred", "selected_question_id": None,
        "rationale": "The latest answer introduced relevant family distress.",
        "ask_to": "patient", "follow_up_warranted": False,
    })
    decision = service.select_question(context={"latest_answer": "Family conflict is affecting me."},
                                       candidates=candidates)
    assert decision.action == "reconsider_deferred" and decision.selected_question_id is None


def test_openai_transport_failure_retries_once_and_raises_safe_error():
    class FailingClient:
        calls = 0

        def post(self, *_args, **_kwargs):
            self.calls += 1
            raise httpx.ConnectError("private connection detail")

    client = FailingClient()
    service = ContextualReasoningService(api_key="test-key", model="test-model", max_retries=1, client=client)

    with pytest.raises(RuntimeError, match="unavailable") as error:
        service.analyze_profile(profile={}, concerns="", quadrants=[{
            "quadrant_id": "1", "name": "Nature", "attributes": []}])

    assert client.calls == 2
    assert "private connection detail" not in str(error.value)


def test_contextual_planner_failure_keeps_existing_quadrant_fallback(monkeypatch):
    class BrokenReasoner:
        available = True

        def analyze_profile(self, **_kwargs):
            raise RuntimeError("provider unavailable")

    service, session_id = _recommend_service(
        monkeypatch, AssessmentCreate(patient_id="adult"), BrokenReasoner())

    recommendations = service.recommend_quadrants(session_id, "Main concerns: work pressure.")

    assert recommendations
    assert service._ctx(session_id).patient_state["contextual_assessment_status"] == "fallback"


def test_intentional_llm_advance_is_not_recorded_as_rag_failure_or_coverage(monkeypatch):
    decision = QuestionSelectionDecision(
        action="advance", selected_question_id=None, rationale="Explore another relevant area.",
        ask_to="patient", follow_up_warranted=False)
    reasoner = ScriptedReasoner([(_statuses(Nature="relevant"), [])], decision)
    service, session_id = _recommend_service(monkeypatch, AssessmentCreate(patient_id="advance"), reasoner)

    page = service.select_quadrant(session_id, "Nature")
    ctx = service._ctx(session_id)

    assert page["questions"] == [] and page["retrieval_status"] == "LLM_ADVANCE"
    assert ctx.quadrants["Nature"]["retrieval_failed"] is False
    assert ctx.quadrants["Nature"]["completed"] is False
    assert service.assessed_quadrants(ctx) == set()