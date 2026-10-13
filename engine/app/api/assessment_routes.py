import logging
import threading

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.models.assessment import AssessmentCreate, AssessmentResponse, BaselineCreate, QuadrantSelection
from app.models.response import PatientResponseCreate, ConfirmationRequest
from app.core.enums import EvidenceStatus
from app.core.exceptions import LLMServiceError
from app.core.config import settings
from app.api.llm_errors import GENERIC_PROCESSING_ERROR, clean_request_id, llm_error_response
from app.knowledge.loader import KnowledgeBase
from app.llm.gemini_provider import GeminiProvider
from app.llm.resilient import build_llm_provider
from app.retrieval.retriever import KnowledgeRetriever
from app.services.assessment_service import AssessmentService
from app.llm.openrouter_provider import OpenRouterProvider

router=APIRouter()
_kb=KnowledgeBase().load_directory(settings.kb_path)
_service=AssessmentService(kb=_kb, llm=None, retriever=None)
_runtime_service_lock = threading.Lock()


def _route_error_response(exc: Exception) -> JSONResponse:
    if isinstance(exc, LLMServiceError):
        return llm_error_response(exc)

    logging.getLogger("anahat.api").exception("assessment_route_unexpected_error")
    return JSONResponse(
        status_code=502,
        content={"detail": GENERIC_PROCESSING_ERROR, "error_code": "INTERNAL_ERROR", "retryable": True},
    )

class AmbiguityResolution(BaseModel):
    selected_chakra: str
    therapist_note: str | None = None


class ContradictionResolution(BaseModel):
    keep_evidence_id: str
    therapist_note: str | None = None


class DeepDiveAnswer(BaseModel):
    evidence_id: str
    field: str
    value: str
    raw_text: str | None = None
    # True when the patient could not say how strong it is and Mild is only the configured default.
    assumed: bool = False


class TherapistQuestion(BaseModel):
    text: str
    quadrant: str | None = None


class QuadrantComplete(BaseModel):
    quadrant: str
    early: bool = False


class QuestionReview(BaseModel):
    action: str                      # approve | edit | reject
    edited_text: str | None = None
    therapist_note: str | None = None


class SafetyAck(BaseModel):
    therapist_note: str | None = None
    resume: bool = False


def _call(fn, *args, _bad_status=400, **kwargs):
    """Uniform error mapping: bad input -> 400 with the message; LLM problems -> safe LLM error;
    anything else -> generic message (never leak internals or patient text)."""
    try:
        return fn(*args, **kwargs)
    except LLMServiceError as exc:
        return llm_error_response(exc)
    except ValueError as exc:
        raise HTTPException(status_code=_bad_status, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        return _route_error_response(exc)


class SuggestRequest(BaseModel):
    patient_text: str = ""
    asked_ids: list[str] = []
    style: str | None = None


@router.get('/opening-styles')
def opening_styles():
    """Session-less: therapist-selectable opening styles (A-J) from the KB assessments folder."""
    return _call(_service.list_opening_styles)


@router.post('/kb/suggest-question')
def suggest_question(request: SuggestRequest):
    """Session-less: choose (never write) the next KB question for a live conversation."""
    return _call(_service.suggest_question, request.patient_text, request.asked_ids, request.style)


@router.post('/sessions', response_model=AssessmentResponse)
def create_session(request: AssessmentCreate):
    return _service.create_session(request)

@router.post('/sessions/{session_id}/baseline')
def baseline(session_id: str, request: BaselineCreate):
    return _call(_service.set_baseline, session_id, request)

@router.get('/sessions/{session_id}/opening-questions')
def opening_questions(session_id: str, style: str | None = None):
    """No `style`: list the therapist-selectable styles. With `style`: that style's questions (KB text)."""
    return _call(_service.get_opening_questions, session_id, style)

@router.post('/sessions/{session_id}/opening-skip')
def opening_skip(session_id: str):
    return _call(_service.skip_opening, session_id)

def _runtime_service(*, include_retriever: bool = False):
    if _service.llm is None or (include_retriever and _service.retriever is None):
        with _runtime_service_lock:
            if _service.llm is None:
                _service.llm = build_llm_provider()
            if include_retriever and _service.retriever is None:
                _service.retriever = KnowledgeRetriever()
                _service.retriever.collection_name = settings.qdrant_indicator_collection
                # Reuse the same embedding/Qdrant retrieval implementation, but
                # query the general ANAHAT knowledge collection for question text.
                _service.question_retriever = (
                    KnowledgeRetriever(
                        client=_service.retriever.client,
                        embedder=_service.retriever.embedder,
                        collection_name=settings.qdrant_collection,
                    )
                    if hasattr(_service.retriever, "client") and hasattr(_service.retriever, "embedder")
                    else _service.retriever
                )
                if getattr(_service, 'questions', None) is not None and _service.questions.embedder is None:
                    _service.questions.embedder = _service.retriever.embedder
    return _service

@router.post('/sessions/{session_id}/opening-response')
def opening_response(session_id: str, request: PatientResponseCreate):
    return _call(lambda: _runtime_service(include_retriever=True).submit_opening_response(
        session_id, request.text, request.question_id), _bad_status=502)

@router.get('/sessions/{session_id}/quadrants')
def quadrants(session_id: str, current_issue: str | None = None):
    def run():
        # The intake text is analysed as evidence, which needs the LLM + indicator retriever.
        try:
            svc = _runtime_service(include_retriever=True)
        except Exception:  # noqa: BLE001 - recommendation still works without them
            svc = _service
        return svc.recommend_quadrants(session_id, current_issue=current_issue)
    return _call(run)

def _question_service():
    """Question selection uses the RAG retriever and (optionally) the adaptive LLM wording.
    If they cannot be initialised the KB question path still works."""
    try:
        return _runtime_service(include_retriever=True)
    except Exception:  # noqa: BLE001
        logging.getLogger("anahat.api").exception("question_runtime_init_failed; serving KB questions")
        return _service


@router.post('/sessions/{session_id}/quadrants/select')
def select_quadrant(session_id: str, request: QuadrantSelection):
    return _call(lambda: _question_service().select_quadrant(session_id, request.quadrant))

@router.post('/sessions/{session_id}/quadrants/complete')
def complete_quadrant(session_id: str, request: QuadrantComplete):
    return _call(lambda: _question_service().complete_quadrant(session_id, request.quadrant, request.early))

@router.get('/sessions/{session_id}/trace')
def explain_trace(session_id: str):
    """Developer decision trail (no raw patient text)."""
    return _call(lambda: _question_service().explain_trace(session_id))

@router.get('/sessions/{session_id}/quadrants/guidance')
def quadrant_guidance(session_id: str, quadrant: str):
    """Therapist advice for one quadrant: move on / keep asking / deep dive / related quadrants."""
    return _call(lambda: _question_service().quadrant_guidance(session_id, quadrant))

@router.get('/sessions/{session_id}/questions/next')
def next_questions(session_id: str, quadrant: str | None = None, limit: int = 3, deep_dive: bool = False):
    return _call(lambda: _question_service().next_questions(session_id, quadrant, max(1, min(limit, 10)), deep_dive))


@router.post('/sessions/{session_id}/questions/therapist')
def therapist_question(session_id: str, request: TherapistQuestion):
    """The therapist's own question (typed in the assessment window's bottom bar). Answer it with
    POST /responses using the returned id; the answer is scored like any other answer."""
    return _call(_service.register_therapist_question, session_id, request.text, request.quadrant)


@router.post('/sessions/{session_id}/questions/{question_id}/review')
def review_question(session_id: str, question_id: str, request: QuestionReview):
    """Therapist approve / edit / reject of an LLM-worded question
    (only needed when DYNAMIC_QUESTION_DELIVERY=therapist_review)."""
    return _call(_service.review_generated_question, session_id, question_id, request.action,
                 request.edited_text, request.therapist_note)

@router.post('/sessions/{session_id}/responses')
def response(session_id: str, request: PatientResponseCreate, req: Request):
    try:
        request_id = clean_request_id(req.headers.get("Idempotency-Key"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _call(lambda: _runtime_service(include_retriever=True).process_response(
        session_id, request.text, request.question_id, request.quadrant, request_id=request_id), _bad_status=502)

@router.post('/sessions/{session_id}/candidates/{candidate_id}/confirm')
def confirm(session_id: str, candidate_id: str, request: ConfirmationRequest, response_id: str, selected_chakra: str | None = None):
    return _call(_service.confirm_candidate, session_id, response_id, candidate_id, request.confirmed,
                 request.evidence_status, request.therapist_note, selected_chakra, request.confirmation_actor)

@router.post('/sessions/{session_id}/evidence/{evidence_id}/resolve-ambiguity')
def resolve_ambiguity(session_id: str, evidence_id: str, request: AmbiguityResolution):
    def run():
        ev = _service.resolve_ambiguity(session_id, evidence_id, request.selected_chakra, request.therapist_note)
        return {"status": "RESOLVED", "evidence": ev.model_dump()}
    return _call(run)

@router.post('/sessions/{session_id}/contradictions/resolve')
def resolve_contradiction(session_id: str, request: ContradictionResolution):
    return _call(_service.resolve_contradiction, session_id, request.keep_evidence_id, request.therapist_note)

@router.get('/sessions/{session_id}/deep-dive')
def deep_dive(session_id: str, stop: bool = False):
    return _call(_service.deep_dive_items, session_id, stop)

@router.post('/sessions/{session_id}/deep-dive/answer')
def deep_dive_answer(session_id: str, request: DeepDiveAnswer):
    return _call(_service.answer_deep_dive, session_id, request.evidence_id, request.field, request.value, request.raw_text, request.assumed)

@router.post('/sessions/{session_id}/safety/acknowledge')
def safety_acknowledge(session_id: str, request: SafetyAck):
    return _call(_service.acknowledge_safety, session_id, request.therapist_note, request.resume)

@router.get('/sessions/{session_id}/chakra-report')
def chakra_report(session_id: str):
    return _call(_service.score, session_id)

@router.get('/sessions/{session_id}/result')
def final_result(session_id: str):
    """Data for the result window: per-chakra status, scores, confidence, coverage, trace, open items."""
    return _call(_service.final_result, session_id)

@router.post('/sessions/{session_id}/end')
def end_session(session_id: str):
    """Run the final evaluation and Raag inference against the complete session context."""
    return _call(_service.finalize_session, session_id)

@router.post('/sessions/{session_id}/decision')
def therapist_decision(session_id: str, stop: bool = False):
    return _call(_service.decision, session_id, therapist_stop=stop)