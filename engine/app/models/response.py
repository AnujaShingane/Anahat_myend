from pydantic import BaseModel, Field
from app.core.enums import EvidenceStatus

class PatientResponseCreate(BaseModel):
    question_id: str | None = None
    quadrant: str | None = None
    text: str = Field(min_length=1)

class ResponseRecord(BaseModel):
    response_id: str
    question_id: str | None = None
    quadrant: str | None = None
    raw_text: str
    extraction: dict | None = None
    safety_status: str = "not_checked"

class ConfirmationRequest(BaseModel):
    candidate_id: str
    confirmed: bool
    evidence_status: EvidenceStatus = EvidenceStatus.CONFIRMED
    therapist_note: str | None = None
    confirmation_actor: str = "therapist"
