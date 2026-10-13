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
    # Where the intensity came from: "patient_words" (stated by the patient / model read it from
    # the quote), "inferred" (semantic cues in the patient's response, see app/engine/intensity.py),
    # "therapist" (recorded by the therapist after asking the patient), "prior_mention".
    intensity_source: str | None = None
    intensity_basis: list[str] = Field(default_factory=list)
    # One indicator = one count. Later answers that mention the same indicator are listed here
    # instead of creating a second evidence record (and a second scoring unit).
    mention_response_ids: list[str] = Field(default_factory=list)
    mention_quotes: list[str] = Field(default_factory=list)

    # ---- contradiction handling (spec section 6) ----
    # True while a later statement contradicts an earlier one about the SAME problem (frequency,
    # intensity, duration, presence, currentness). The evidence is scored at the Unresolved
    # weight until a clarification resolves it. Both statements stay in attribute_history.
    contradiction_open: bool = False
    attribute_conflicts: list[dict] = Field(default_factory=list)
    attribute_history: list[dict] = Field(default_factory=list)
