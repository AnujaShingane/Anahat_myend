"""Structured output for the adaptive question generator.

Deliberately SEPARATE from the semantic-extraction schema: a generated question has
different requirements (exactly one patient-facing question, closed-set ids, no scoring).

The schema is kept small and enum-constrained so that a small local model (Ollama,
llama3.2:3b class) can fill it reliably under JSON-schema constrained decoding. Fields such
as "contains chakra name" or "leading assumption detected" are NOT asked from the model:
the backend computes them itself (see app/services/question_validators.py) because a
model's self-report about its own output is not trustworthy.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

QuestionType = Literal[
    "exploration", "clarification", "impact", "trigger", "timeline", "intensity", "coping", "context",
]

ExplorationGoal = Literal[
    "distinguish_interpretations", "context", "trigger", "onset", "duration", "frequency",
    "intensity", "current_or_historical", "daily_impact", "emotional_response",
    "behavioural_response", "coping", "what_helps_or_worsens", "attribute_exploration",
]

EvidenceDimension = Literal[
    "current_or_historical", "onset", "duration", "frequency", "intensity", "trigger",
    "context", "daily_impact", "emotional_response", "behavioural_response", "coping",
]


class GeneratedQuestion(BaseModel):
    """What the model returns. Everything here is re-checked by the backend."""
    model_config = ConfigDict(extra="forbid")

    status: Literal["QUESTION_GENERATED", "CANNOT_GENERATE"]
    question_text: str | None = Field(default=None, max_length=400)
    question_type: QuestionType | None = None
    # Must be one of the selected quadrant's KB attributes (checked by the backend).
    attribute: str | None = None
    exploration_goal: ExplorationGoal | None = None
    # A signal id from the supplied context ("S1", "S2", ...) or null.
    focus_signal_id: str | None = None
    # Interpretation ids from the supplied context ("S1-A", "S1-B", ...). Opaque on purpose:
    # the model never sees which chakra an id stands for.
    candidate_interpretation_ids: list[str] = Field(default_factory=list)
    evidence_dimensions: list[EvidenceDimension] = Field(default_factory=list)
    generation_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    # Short internal note (never shown to the patient).
    reason: str | None = Field(default=None, max_length=300)
