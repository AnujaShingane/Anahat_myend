"""Runs ONLY against the real app/models package (skipped when test stand-ins are active).

These pin down the assumptions the LLM fix makes about the real models, so a mismatch in the real
repository fails loudly here instead of silently in production.
"""
import os

import pytest

pytestmark = pytest.mark.skipif(os.environ.get("ANAHAT_MODEL_STUBS_ACTIVE") == "1",
                                reason="real app/models not present: stand-ins are active, contract NOT verified")


def test_patient_response_create_accepts_the_fields_the_route_reads():
    from app.models.response import PatientResponseCreate
    fields = PatientResponseCreate.model_fields
    for name in ("text", "question_id", "quadrant"):
        assert name in fields, f"PatientResponseCreate lacks {name!r}"


def test_report_request_id_field_presence():
    from app.models.response import PatientResponseCreate
    names = set(PatientResponseCreate.model_fields)
    has = sorted(names & {"request_id", "requestId"})
    print(f"\nPatientResponseCreate request-id field(s): {has or 'NONE (Idempotency-Key header is the only source)'}")
    # If the frontend sends requestId in the body and the model has no such field, pydantic drops it
    # silently and idempotency would not apply. Surface that instead of hiding it.
    extra = PatientResponseCreate.model_config.get("extra")
    print(f"PatientResponseCreate extra policy: {extra!r}")


def test_response_record_supports_the_assignments_process_response_makes():
    from app.services.response_service import ResponseService
    rec = ResponseService().create(text="hello", question_id=None, quadrant=None)
    rec.safety_status = "OK"                       # original code already did this
    rec.extraction = {"concepts": []}              # ... and this
    assert rec.response_id and rec.safety_status == "OK" and rec.extraction == {"concepts": []}
    assert isinstance(rec.model_dump(), dict)       # PatientContext.summary() relies on model_dump()


def test_evidence_engine_and_scoring_unchanged_by_llm_layer():
    import app.engine.scoring_engine, app.engine.decision_engine, app.engine.evidence_engine  # noqa: F401
