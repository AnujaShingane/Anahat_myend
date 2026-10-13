from pydantic import BaseModel

class RagaCandidate(BaseModel):
    raga: str
    traditional_performance_time: str | None = None
    reason: str
    review_status: str | None = None
    safety_flags: list[str] = []
    requires_therapist_review: bool = True

class RecommendationResponse(BaseModel):
    candidates: list[RagaCandidate]
    blocked: list[dict] = []
    governance_notes: list[str] = []
