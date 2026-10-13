import threading

from app.models.response import ResponseRecord


class PatientContext:
    def __init__(self):
        self.demographics = {}
        self.baseline = {}
        self.patient_state = {}
        self.responses: list[ResponseRecord] = []
        self.candidates: list[dict] = []
        self.evidence: list[dict] = []
        self.clarifications: list[dict] = []
        self.contradictions: list[dict] = []
        self.quadrants: dict = {}
        self.audit_events: list[dict] = []
        self.therapist_decisions: list[dict] = []
        self.stage = "baseline"
        self.stop_requested = False
        self.processed_requests: dict[str, dict] = {}
        self._request_lock = threading.Lock()
        self._inflight_requests: dict[str, threading.Event] = {}

    def add_response(self, response): self.responses.append(response)
    def add_indicator(self, indicator): self.evidence.append(indicator)
    def add_clarification(self, clarification): self.clarifications.append(clarification)
    def add_contradiction(self, contradiction): self.contradictions.append(contradiction)
    def audit(self, event: str, **data): self.audit_events.append({"event": event, **data})

    def summary_min(self):
        """The only slice of the session that may be sent to an LLM (no evidence, candidates or audit)."""
        return {"baseline": self.baseline, "demographics": {"language": self.demographics.get("language")},
                "opening_questions": self.patient_state.get("opening_questions"),
                "opening_response": self.patient_state.get("opening_response")}

    def summary(self):
        return {
            "demographics": self.demographics,
            "baseline": self.baseline,
            "patient_state": self.patient_state,
            "responses": [r.model_dump() if hasattr(r, "model_dump") else r for r in self.responses],
            "candidates": self.candidates,
            "evidence": self.evidence,
            "clarifications": self.clarifications,
            "contradictions": self.contradictions,
            "quadrants": self.quadrants,
            "audit_events": self.audit_events,
            "therapist_decisions": self.therapist_decisions,
            "stage": self.stage,
            "stop_requested": self.stop_requested,
        }
