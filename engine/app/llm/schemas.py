from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

class ExtractedConcept(BaseModel):
    model_config = ConfigDict(extra="forbid")
    concept: str = Field(min_length=1)
    # The patient's own words, copied verbatim. The service verifies it really appears in the
    # raw response; a concept without a verifiable quote is not allowed to become a candidate.
    evidence_quote: str | None = None
    domain: Literal["symptom", "emotion", "behaviour", "context", "other"]
    polarity: Literal["positive", "negative", "neutral", "uncertain"]
    currentness: Literal["current", "historical", "unknown"]
    certainty: Literal["certain", "probable", "uncertain"]
    intensity: Literal["Mild", "Moderate", "Severe"] | None = None
    frequency: str | None = None
    duration: str | None = None
    context: str | None = None
    trigger: str | None = None
    impact: str | None = None
    coping: str | None = None
    historical_status: str | None = None
    uncertainty: str | None = None
    clarification_required: bool = False
    clarification_reason: str | None = None

class SemanticExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    concepts: list[ExtractedConcept] = Field(default_factory=list)
    overall_uncertainty: str | None = None
    clarification_required: bool = False
    safety_relevant: bool = False


class CandidateJudgement(BaseModel):
    """LLM verdict on ONE retrieved indicator. The model only sees ids + plain descriptions
    (never chakras, scores or clinical meaning) and may only use ids from the list it was given."""
    model_config = ConfigDict(extra="forbid")
    indicator_id: str
    match: Literal["exact", "partial", "none"]
    reason: str | None = None


class CandidateValidation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    judgements: list[CandidateJudgement] = Field(default_factory=list)
