"""Validated, optional OpenAI reasoning for contextual assessment decisions.

The model may prioritize assessment domains and choose among retrieved KB questions. It
cannot create indicators or chakra evidence; those remain owned by the existing pipeline.
"""
from __future__ import annotations

import json
import logging
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.config import Settings, settings as default_settings

log = logging.getLogger("anahat.contextual_reasoning")


class QuadrantDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quadrant_id: str
    quadrant: str
    status: Literal["priority", "relevant", "conditional", "deferred", "inapplicable"]
    rationale: str = Field(min_length=1, max_length=400)
    retrieval_query: str = Field(max_length=500)


class InitialAssessmentDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    developmental_stage: str = Field(min_length=1, max_length=100)
    context_summary: str = Field(min_length=1, max_length=600)
    information_gaps: list[str] = Field(max_length=12)
    initial_hypotheses: list[str] = Field(max_length=12)
    quadrants: list[QuadrantDecision] = Field(min_length=1)


class QuestionSelectionDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["follow_up", "continue", "explore", "reconsider_deferred", "advance"]
    selected_question_id: str | None
    rationale: str = Field(min_length=1, max_length=400)
    ask_to: Literal["patient", "caregiver"]
    follow_up_warranted: bool


class ContextualReasoningService:
    def __init__(self, *, api_key: str | None, model: str, timeout: float = 30.0,
                 max_retries: int = 1, client=None):
        self.api_key, self.model = api_key, model
        self.timeout, self.max_retries = timeout, max(0, min(max_retries, 2))
        self.client = client or httpx.Client()

    @classmethod
    def from_settings(cls, cfg: Settings | None = None):
        cfg = cfg or default_settings
        return cls(api_key=cfg.openai_api_key, model=cfg.openai_reasoning_model,
                   timeout=cfg.llm_request_timeout_seconds, max_retries=cfg.llm_max_retries)

    @property
    def available(self) -> bool:
        return bool(self.api_key and self.model)

    def analyze_profile(self, *, profile: dict, concerns: str, quadrants: list[dict]) -> InitialAssessmentDecision:
        system = (
            "You are an assessment-planning assistant. Use only supplied facts; do not infer a diagnosis. "
            "Demographics guide question suitability and never count as evidence of imbalance. "
            "Return exactly one decision for every supplied quadrant, using its exact id and name. "
            "Classify as priority, relevant, conditional, deferred, or inapplicable. For young children, "
            "avoid adult roles and direct questions to a caregiver when developmentally appropriate. "
            "Missing fields are unknown, not negative evidence. Hypotheses are exploration topics only."
        )
        user = {"profile": profile, "main_concerns_and_context": concerns, "quadrants": quadrants}
        return self._complete(InitialAssessmentDecision, system, user, "initial_assessment_decision")

    def select_question(self, *, context: dict, candidates: list[dict]) -> QuestionSelectionDecision:
        system = (
            "Choose whether to follow up or continue the assessment, using the patient's latest answer and "
            "the supplied KB-approved candidate questions. Select only a candidate id, never write a question. "
            "Reject questions that are developmentally inappropriate, redundant, or unrelated. If the answer "
            "is already clear, continue or explore another supported domain; do not ask clarification by habit. "
            "Use caregiver as the recipient when the patient cannot reasonably answer. A deferred domain may be "
            "reconsidered only when the new answer supports it. For follow_up or continue, select a candidate id. "
            "For explore, reconsider_deferred, or advance, return a null candidate id so the engine can return "
            "updated quadrant recommendations instead of asking the current-area question."
        )
        user = {"context": context, "kb_candidates": candidates}
        result = self._complete(QuestionSelectionDecision, system, user, "question_selection_decision")
        valid_ids = {str(candidate.get("id")) for candidate in candidates}
        if result.selected_question_id is not None and result.selected_question_id not in valid_ids:
            raise ValueError("question selection referenced an unknown candidate")
        if result.action in {"follow_up", "continue"} and not result.selected_question_id:
            raise ValueError("question selection omitted a candidate id")
        if result.action in {"explore", "reconsider_deferred", "advance"} and result.selected_question_id:
            raise ValueError("advance decision must not select a current-area candidate")
        return result

    def _complete(self, schema, system: str, payload: dict, schema_name: str):
        if not self.available:
            raise RuntimeError("OpenAI contextual reasoning is not configured")
        request = {
            "model": self.model,
            "temperature": 0,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": json.dumps(payload, ensure_ascii=True)}],
            "response_format": {"type": "json_schema", "json_schema": {
                "name": schema_name, "strict": True, "schema": schema.model_json_schema()}},
        }
        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self.client.post(
                    "https://api.openai.com/v1/chat/completions", json=request,
                    headers={"Authorization": f"Bearer {self.api_key}"}, timeout=self.timeout)
                response.raise_for_status()
                body = response.json()
                content = body["choices"][0]["message"]["content"]
                return schema.model_validate_json(content)
            except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError,
                    KeyError, IndexError, TypeError, ValueError, ValidationError) as exc:
                last_error = exc
                retryable = (not isinstance(exc, httpx.HTTPStatusError)
                             or exc.response.status_code in {408, 429}
                             or exc.response.status_code >= 500)
                if attempt >= self.max_retries or not retryable:
                    break
        log.warning("OpenAI contextual decision unavailable schema=%s error=%s",
                    schema_name, type(last_error).__name__ if last_error else "unknown")
        raise RuntimeError("OpenAI contextual decision unavailable") from last_error