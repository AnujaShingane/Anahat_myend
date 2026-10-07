from enum import Enum

class EvidenceStatus(str, Enum):
    CONFIRMED = "CONFIRMED"
    PROVISIONAL = "PROVISIONAL"
    UNRESOLVED = "UNRESOLVED"
    HISTORICAL = "HISTORICAL"
    NEGATIVE = "NEGATIVE"
    RESOLVED_AFTER_CLARIFICATION = "Resolved After Clarification"

class Polarity(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    UNCERTAIN = "uncertain"

class Currentness(str, Enum):
    CURRENT = "current"
    HISTORICAL = "historical"
    UNKNOWN = "unknown"

class AssessmentStage(str, Enum):
    BASELINE = "baseline"
    OPENING = "opening"
    QUADRANT_RECOMMENDATION = "quadrant_recommendation"
    QUADRANT_SELECTION = "quadrant_selection"
    PERSONALIZED_QUESTIONS = "personalized_questions"
    EVIDENCE_REVIEW = "evidence_review"
    CHAKRA_SCORING = "chakra_scoring"
    DEEP_DIVE = "deep_dive"
    RAGA_REVIEW = "raga_review"
    PRESCRIPTION = "prescription"
    COMPLETED = "completed"
    SAFETY_ESCALATION = "safety_escalation"
