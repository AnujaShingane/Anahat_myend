from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"

    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None
    qdrant_collection: str = "anahat_knowledge"
    qdrant_indicator_collection: str = "anahat_indicator_validation_v1"

    embedding_model: str = "BAAI/bge-m3"
    embedding_dimension: int = 1024

    chunk_size: int = 800
    chunk_max_size: int = 1000
    chunk_overlap: int = 120

    # Retrieval only proposes CANDIDATES. Similarity is never evidence.
    retrieval_top_k: int = 8
    retrieval_score_threshold: float = 0.45
    # Max validated candidates shown to the therapist per patient concept.
    candidate_display_limit: int = 3
    # Extracted concepts must carry a verbatim quote that really occurs in the
    # patient's text; anything else is dropped as a possible hallucination.
    require_evidence_quote: bool = True
    # Debug only: expose similarity score / chakra payload of candidates.
    expose_candidate_internals: bool = False

    # ---- Scoring (ENGINEERING BASELINES - not clinically validated) --------
    imbalance_score_threshold: float = 0.45      # presence gate      (PDF Part 40)
    direction_threshold: float = 0.45            # direction gate     (PDF Part 41)
    minimum_confidence_pct: float = 60.0
    minimum_independent_evidence_units: int = 2
    ambiguity_margin: float = 0.10               # PDF Part 42
    direction_gray_zone_margin: float = 0.15     # PDF Part 42 (0.10-0.15 = gray zone)
    insufficient_score_threshold: float = 0.20   # PDF Part 68
    high_priority_single_score: float = 0.70     # KB imbalance_gate.high_priority_single
    # The therapist decides which quadrants are relevant. One genuinely
    # assessed quadrant is enough to resolve absence of chakra evidence;
    # completing all ten quadrants is never required.
    balanced_min_assessed_quadrants: int = 1
    # A quadrant counts as "assessed" only after this many real patient responses.
    min_responses_per_quadrant_assessed: int = 1

    # Evidence waiting for a KB clarification (UNRESOLVED) is counted at the "Provisional"
    # reliability weight instead of 0. Set False for the strict "clarify first" behaviour.
    score_unresolved_as_provisional: bool = True
    # Weight used when the patient did not state intensity (0.4 == Mild). The item is still
    # listed as a pending detail so a follow-up question asks for it. Set 0 to score nothing.
    unstated_intensity_weight: float = 0.4
    # An ambiguous indicator (e.g. Anxiety -> Root / Solar Plexus / Throat) that has not been
    # clarified is counted at FULL weight for a chakra only when that same chakra already has
    # its own confirmed, unambiguous evidence in this session (corroboration). Every other
    # chakra it maps to keeps the provisional weight. Shown in the trace. Set False to disable.
    resolve_ambiguity_by_corroboration: bool = True
    # When the patient did not state intensity, use the patient's OWN baseline rating for the
    # same construct (baseline anxiety -> Anxiety, energy -> Fatigue, sleep quality -> Insomnia).
    intensity_from_baseline: bool = True

    # ---- Evidence matching -------------------------------------------------
    # A "partial" LLM match (closely related, not identical) is recorded as PROVISIONAL
    # evidence (reduced weight) instead of being thrown away. Only the best partial per concept.
    record_partial_matches_as_provisional: bool = True
    # If the LLM validator is unavailable (timeout/error), the single best retrieval match is
    # kept as PROVISIONAL evidence only when its similarity is at least this high.
    validator_failure_min_similarity: float = 0.70
    # Analyse the intake text (patient form notes + therapist context) sent with the first
    # quadrant recommendation as session evidence. It is otherwise never scored.
    analyse_intake_as_evidence: bool = True

    # ---- Logging --------------------------------------------------------------
    log_level: str = "INFO"

    # ---- Deep dive ----------------------------------------------------------
    # Hard stop so deep dive can never become endless questioning (PDF Part 53).
    deep_dive_max_questions_per_evidence: int = 4

    # LLM provider configuration
    llm_provider: str = "local"
    llm_fallback_providers: str = "gemini,openrouter"

    local_llm_url: str = "http://127.0.0.1:11434"
    local_llm_model: str = "llama3:latest"
    local_llm_keep_alive: str = "30m"

    gemini_api_key: str | None = None
    gemini_model: str | None = None

    openrouter_api_key: str | None = None
    openrouter_model: str | None = None
    openrouter_fallback_models: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    mistral_api_key: str | None = None
    mistral_model: str | None = None
    mistral_base_url: str = "https://api.mistral.ai/v1"

    together_api_key: str | None = None

    llm_model: str = "gemini-2.5-flash"

    # Bounded retry / timeout controls
    llm_request_timeout_seconds: float = 90.0
    llm_total_timeout_seconds: float = 180.0
    llm_max_retries: int = 1
    llm_retry_backoff_seconds: float = 0.5
    llm_retry_backoff_max_seconds: float = 8.0

    kb_path: str = "./knowledge_base/ANAHAT_KnowledgeBase_v3"

    # Optional: persist sessions as JSON so an engine restart does not lose them.
    # Off by default because sessions contain patient text; enable only with
    # disk encryption / access control in place.
    session_store_dir: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @field_validator(
        "llm_fallback_providers",
        "openrouter_fallback_models",
        mode="before",
    )
    @classmethod
    def normalize_csv(cls, value):
        if value is None:
            return ""
        return str(value)

    @property
    def llm_fallback_provider_list(self) -> list[str]:
        return [
            item.strip().lower()
            for item in self.llm_fallback_providers.split(",")
            if item.strip()
        ]

    @property
    def openrouter_fallback_model_list(self) -> list[str]:
        return [
            item.strip()
            for item in self.openrouter_fallback_models.split(",")
            if item.strip()
        ]

settings = Settings()
