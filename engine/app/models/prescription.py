from pydantic import BaseModel, Field

class PrescriptionDraft(BaseModel):
    patient_id: str
    findings: list[dict] = Field(default_factory=list)
    raga_candidates: list[dict] = Field(default_factory=list)
    activities: list[dict] = Field(default_factory=list)
    songs: list[dict] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    therapist_decision: str | None = None

class TherapistDecision(BaseModel):
    decision: str
    edits: dict = Field(default_factory=dict)
    therapist_id: str | None = None
    note: str | None = None
