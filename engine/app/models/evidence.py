from pydantic import BaseModel, Field
from app.core.enums import EvidenceStatus

class EvidenceRecord(BaseModel):
    evidence_id: str
    response_id: str
    candidate_id: str | None = None
    canonical_indicator_id: str | None = None
    indicator_term: str | None = None
    domain: str | None = None
    status: EvidenceStatus
    polarity: str
    currentness: str
    certainty: str
    intensity: str | None = None
    context: str | None = None
    trigger: str | None = None
    provenance: dict = Field(default_factory=dict)
    confirmation: dict = Field(default_factory=dict)
    selected_chakra: str | None = None

    # ---- additive fields ----
    quote: str | None = None                 # patient's own words that support this evidence
    frequency: str | None = None
    duration: str | None = None
    impact: str | None = None
    coping: str | None = None
    # Evidence records that describe the SAME underlying observation share a group
    # and are scored once (PDF Part 24/38). Default grouping is by canonical term.
    correlation_group: str | None = None
    twin_of: str | None = None               # evidence auto-created for a same-term KB entry
    superseded: bool = False                 # resolved contradiction: kept for audit, not scored
    superseded_by: str | None = None
    deep_dive_asked: list[str] = Field(default_factory=list)
