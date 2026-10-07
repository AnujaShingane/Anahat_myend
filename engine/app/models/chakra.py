from pydantic import BaseModel, Field


class TraceItem(BaseModel):
    """One evidence -> score step. Lets a therapist see WHERE a number came from
    (raw patient words -> indicator -> KB association -> strength x intensity x
    reliability -> contribution)."""
    evidence_id: str
    response_id: str | None = None
    quote: str | None = None
    indicator_id: str | None = None
    term: str | None = None
    domain: str | None = None
    kb_state: str | None = None
    directional: bool = False
    strength: str | None = None
    strength_weight: float | None = None
    intensity: str | None = None
    intensity_weight: float | None = None
    evidence_status: str | None = None
    reliability_weight: float | None = None
    contribution: float = 0.0
    counted: bool = False
    note: str | None = None


class ChakraResult(BaseModel):
    chakra: str
    score: float = 0.0
    presence_score: float
    deficient_score: float
    excess_score: float
    direction: str | None
    status: str
    severity: str
    confidence_pct: float
    independent_evidence_units: int
    gate_passed: bool = False
    gate_threshold: float = 0.0
    gate_reason: str = ""
    mapped_evidence_count: int = 0
    scored_evidence_count: int = 0
    reasons: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)

    # ---- additive fields (older consumers keep working) ----
    status_label: str = ""
    status_code: str = ""              # machine-readable reason, e.g. NOT_ASSESSED
    confidence_label: str = ""         # High / Moderate / Low
    coverage_pct: float = 0.0          # assessed quadrants / reference, NOT "questions shown"
    high_priority: bool = False        # single strong+severe+confirmed item: needs corroboration
    direction_gray_zone: bool = False
    negative_evidence_ids: list[str] = Field(default_factory=list)
    historical_evidence_ids: list[str] = Field(default_factory=list)
    unresolved_evidence_ids: list[str] = Field(default_factory=list)
    nondirectional_evidence_ids: list[str] = Field(default_factory=list)
    pending_details: list[dict] = Field(default_factory=list)
    trace: list[TraceItem] = Field(default_factory=list)


class ChakraReport(BaseModel):
    results: list[ChakraResult]
    supported_chakras: list[str]           # every chakra that passed the imbalance gate
    audit: dict
    directional_chakras: list[str] = Field(default_factory=list)
    ranking: list[str] = Field(default_factory=list)   # by presence score, for display only
    assessed_quadrants: list[str] = Field(default_factory=list)
    coverage: dict = Field(default_factory=dict)
