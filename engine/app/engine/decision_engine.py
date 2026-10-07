from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AssessmentDecision:
    action: str
    recommended_quadrants: list[str]
    reason: str
    supported_chakras: list[str]
    unresolved_chakras: list[str]
    therapist_required: bool = True

    def as_dict(self):
        return self.__dict__.copy()


class DecisionEngine:
    """Deterministic assessment orchestration. Never makes clinical diagnoses."""

    def decide(self, chakra_report, *, assessed_quadrants=None, selected_quadrant=None,
               therapist_stop: bool = False):
        assessed = set(assessed_quadrants or [])
        supported = list(chakra_report.supported_chakras)
        unresolved = [r.chakra for r in chakra_report.results
                      if r.status in {"UNRESOLVED", "IMBALANCED_DIRECTION_UNRESOLVED"}]
        if therapist_stop:
            action = "STOP_ASSESSMENT"
            reason = "Therapist requested assessment stop."
        elif supported:
            action = "DEEP_DIVE_OR_THERAPIST_REVIEW"
            reason = "One or more chakras passed the engineering imbalance gate; corroboration and therapist review remain required."
        else:
            action = "CONTINUE_ASSESSMENT"
            reason = "No chakra passed the engineering imbalance gate; continue coverage or stop at therapist discretion."
        return AssessmentDecision(action, [], reason, supported, unresolved, True)

    def next_quadrants(self, kb, *, assessed_quadrants, current_recommendations=None, limit=3):
        assessed = set(assessed_quadrants or [])
        candidates = []
        for q in kb.quadrants:
            name = q.get("name")
            if name in assessed:
                continue
            attrs = q.get("attributes") or []
            candidates.append({
                "quadrant": name,
                "priority": round(1.0 / max(1, len(assessed) + 1), 3),
                "missing_information": attrs[:5],
                "reason": "Quadrant has not yet been assessed."
            })
        return candidates[:limit]
