from app.knowledge.loader import KnowledgeBase
from app.engine.patient_context import PatientContext
from app.services.assessment_service import AssessmentService
from app.services.prescription_service import PrescriptionService
from fastapi import FastAPI
from fastapi.testclient import TestClient

def test_therapist_approval_is_explicit():
    svc=PrescriptionService(); draft=svc.draft(patient_id='p',findings=[],raga_candidates=[],activities=[])
    assert draft['status']=='DRAFT_REQUIRES_THERAPIST_APPROVAL'
    final=svc.apply_therapist_decision(draft,{'decision':'approve'})
    assert final['status']=='THERAPIST_APPROVED'


def test_prescription_consumes_persisted_final_result_without_recalculation():
    svc = AssessmentService.__new__(AssessmentService)
    svc.prescriptions = PrescriptionService()
    ctx = PatientContext()
    ctx.demographics = {"patient_id": "patient-1"}
    ctx.patient_state = {
        "final_chakra_result": {
            "session_id": "session-1",
            "chakras": [{"chakra": "Throat Chakra", "status": "IMBALANCED_DEFICIENT"}],
        },
        "final_recommendations": {
            "raga": {"candidates": [{"name": "Bhairavi"}]},
            "activities": [{"name": "Breathing"}],
        },
    }
    AssessmentService._sessions["session-1"] = ctx

    result = svc.prescription("session-1")

    assert result["findings"] == ctx.patient_state["final_chakra_result"]["chakras"]
    assert result["raga_candidates"] == [{"name": "Bhairavi"}]
    assert result["activities"] == [{"name": "Breathing"}]


def test_prescription_returns_empty_recommendations_when_no_chakra_is_supported():
    svc = AssessmentService.__new__(AssessmentService)
    svc.prescriptions = PrescriptionService()
    ctx = PatientContext()
    ctx.demographics = {"patient_id": "patient-2"}
    ctx.patient_state = {
        "final_chakra_result": {"session_id": "session-2", "chakras": []},
        "final_recommendations": {
            "raga": {"status": "SKIPPED_NO_SUPPORTED_CHAKRA", "candidates": []},
            "activities": [],
        },
    }
    AssessmentService._sessions["session-2"] = ctx

    result = svc.prescription("session-2")

    assert result["status"] == "DRAFT_REQUIRES_THERAPIST_APPROVAL"
    assert result["raga_candidates"] == []
    assert result["activities"] == []


def test_prescription_route_returns_200_for_persisted_result(monkeypatch):
    import app.api.prescription_routes as routes

    svc = AssessmentService.__new__(AssessmentService)
    svc.prescriptions = PrescriptionService()
    ctx = PatientContext()
    ctx.demographics = {"patient_id": "patient-3"}
    ctx.patient_state = {
        "final_chakra_result": {"session_id": "session-3", "chakras": []},
        "final_recommendations": {
            "raga": {"status": "SKIPPED_NO_SUPPORTED_CHAKRA", "candidates": []},
            "activities": [],
        },
    }
    AssessmentService._sessions["session-3"] = ctx
    monkeypatch.setattr(routes, "_runtime_service", lambda: svc)
    app = FastAPI()
    app.include_router(routes.router, prefix="/prescription")

    response = TestClient(app).get("/prescription/sessions/session-3")

    assert response.status_code == 200
    assert response.json()["raga_candidates"] == []
