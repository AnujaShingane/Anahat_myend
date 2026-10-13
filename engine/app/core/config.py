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
    # Spec section 3: Unresolved reliability is 0.1 (from config/scoring_rules.json). The legacy
    # behaviour (count unresolved at the 0.4 Provisional weight) is kept behind this switch.
    score_unresolved_as_provisional: bool = False
    # Weight used when the patient did not state intensity. It is NEVER below the KB Mild weight
    # (0.4): unstated intensity is counted as Mild, never 0, and the therapist is asked to clarify.
    # A higher value raises it; 0 or anything below Mild is ignored.
    unstated_intensity_weight: float = 0.4
    # An ambiguous indicator (e.g. Anxiety -> Root / Solar Plexus / Throat) that has not been
    # clarified is counted at FULL weight for a chakra only when that same chakra already has
    # its own confirmed, unambiguous evidence in this session (corroboration). Every other
    # chakra it maps to keeps the provisional weight. Shown in the trace. Set False to disable.
    # Off by default: it lifted Unresolved evidence from 0.1 to 1.0, which the finalized spec
    # (Unresolved = 0.1 until clarified) does not allow.
    resolve_ambiguity_by_corroboration: bool = False
    # When the patient did not state intensity, use the patient's OWN baseline rating for the
    # same construct (baseline anxiety -> Anxiety, energy -> Fatigue, sleep quality -> Insomnia).
    intensity_from_baseline: bool = True

    # ---- Finalized scoring rules (ANAHAT_Finalized_Scoring_Rules_Final.docx) ---------------
    # The numeric rules live in config/scoring_rules.json (bands, diminishing returns, weights,
    # direction thresholds). These switches only control HOW the engine applies them.
    scoring_rules_path: str = "./config/scoring_rules.json"
    # Spec section 2: "Below 0.40 + suggested quadrants completed -> Balanced; not completed ->
    # Not assessed properly". "suggested_and_selected" = every quadrant the engine suggested or the
    # therapist selected must be complete. "selected" = only the therapist-selected ones.
    quadrant_completion_basis: str = "suggested_and_selected"
    # Spec section 11: no extra "firm evidence" gate on top of the finalized Step 4 bands.
    require_firm_evidence_for_direction: bool = False
    # Spec section 3 gives Provisional evidence a 0.4 weight and section 11 forbids extra gates, so a
    # Strong + Severe + Provisional finding (0.40) can sit exactly on the Mild band. The previous
    # engine did not let provisional evidence ALONE establish an imbalance. Set to False to restore
    # that guard (the chakra then stays "Unresolved - needs confirmation" until something is confirmed).
    provisional_alone_can_establish_imbalance: bool = True

    # ---- Evidence matching -------------------------------------------------
    # A "partial" LLM match (closely related, not identical) is recorded as PROVISIONAL
    # evidence (reduced weight) instead of being thrown away. Only the best partial per concept.
    record_partial_matches_as_provisional: bool = True
    # If the LLM validator is unavailable (timeout/error), the single best retrieval match is
    # kept as PROVISIONAL evidence only when its similarity is at least this high.
    validator_failure_min_similarity: float = 0.70
    # Evidence grounding gate (app/engine/grounding.py). Retrieval similarity is only SUPPORT: an
    # indicator the patient's own words do not point at needs a validated semantic match at least
    # this strong to be CONFIRMED, or this strong to be PROVISIONAL; anything weaker is rejected.
    grounding_enabled: bool = True
    grounding_confirm_similarity: float = 0.72
    grounding_provisional_similarity: float = 0.55
    # A validated "exact" match whose similarity is below the provisional floor and that shares no
    # word with the patient's statement is still rejected. Raising the floor makes matching
    # stricter, lowering it looser; calibrate with scripts/validate_indicator_paraphrases.py.
    # Add the sentence that holds the patient's quote as an extra retrieval query (more context
    # than the extracted label alone).
    retrieval_use_sentence_query: bool = True
    # When the model's quote is not verbatim and its label words are not in the patient's text,
    # recover a short span around the single most distinctive content word of the label.
    quote_recovery_fallback: bool = True
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

    # ---- Adaptive (LLM-worded) quadrant questions ---------------------------
    # The KB/RAG question is still selected first; the LLM then words ONE patient-specific
    # follow-up from the patient's latest answer and the KB's competing interpretations.
    # Any failure or rejected output falls back to that KB question (never hidden).
    dynamic_questions_enabled: bool = True
    # False (default): after a quadrant's normal questions Nadika SUGGESTS (move on / deep dive /
    # related quadrants) and the therapist decides. True restores the old automatic move.
    auto_advance_quadrants: bool = False
    # Providers allowed to receive patient words for question generation, in order.
    # Default: local Ollama only. "mistral" may be added. gemini/openrouter are refused unless
    # dynamic_question_allow_remote_providers is True.
    dynamic_question_providers: str = "local"
    dynamic_question_allow_remote_providers: bool = False
    # Optional separate Ollama model for questions (defaults to local_llm_model).
    dynamic_question_model: str | None = None
    dynamic_question_temperature: float = 0.3
    # Short deadline: the patient is waiting for the next question.
    dynamic_question_timeout_seconds: float = 30.0
    # "auto": validated questions go straight to the patient (AI-only mode); sensitive or
    #         therapist-only cases use the KB question instead.
    # "therapist_review": every generated question waits for therapist approve/edit/reject.
    dynamic_question_delivery: str = "auto"
    dynamic_question_guidance_path: str = "./config/dynamic_question_guidance.json"

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
