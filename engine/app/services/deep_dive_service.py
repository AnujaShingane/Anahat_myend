from __future__ import annotations

from app.core.config import settings
from app.core.enums import EvidenceStatus

# Neutral detail prompts. They only ask for facts the patient can state; they never suggest an
# answer. Wording is illustrative: REQUIRES THERAPIST VALIDATION.
_TEMPLATES = {
    "currentness": "Is this something you are experiencing now, or was it in the past?",
    "intensity": "How strong is this for you: mild, moderate, or severe?",
    "frequency": "How often does this happen?",
    "duration": "For how long has this been going on?",
    "trigger": "What is usually happening around the time it starts?",
    "impact": "How does this affect your daily life?",
}
_ORDER = ["currentness", "intensity", "disambiguation", "frequency", "duration", "trigger", "impact"]
_BLOCKING = {"currentness", "intensity", "disambiguation"}   # change how the evidence is scored/read
_INTENSITY = {"mild": "Mild", "moderate": "Moderate", "severe": "Severe"}


class DeepDiveService:
    """Structured follow-up on evidence that is missing details. Fixed stop conditions:
    per-evidence cap, therapist stop, all details known, red safety, unacknowledged AMBER.
    The engine never guesses a missing value."""

    def __init__(self, ambiguity_service):
        self.ambiguity = ambiguity_service

    @staticmethod
    def _eligible(ev) -> bool:
        return (not ev.superseded and ev.status not in {EvidenceStatus.NEGATIVE, EvidenceStatus.HISTORICAL})

    def missing_fields(self, ev) -> list[str]:
        out = []
        if ev.currentness == "unknown":
            out.append("currentness")
        if not ev.intensity:
            out.append("intensity")
        if ev.status == EvidenceStatus.UNRESOLVED and self.ambiguity.needs_clarification(ev.canonical_indicator_id):
            out.append("disambiguation")
        for f in ("frequency", "duration", "trigger", "impact"):
            if not getattr(ev, f, None) and not (f == "trigger" and ev.context):
                out.append(f)
        return sorted(out, key=_ORDER.index)

    def open_items(self, evidence, *, therapist_stop=False, safety_blocked=False) -> dict:
        cap = settings.deep_dive_max_questions_per_evidence
        if therapist_stop or safety_blocked:
            return {"items": [], "stopped": True,
                    "stop_reason": "therapist_stop" if therapist_stop else "safety_hold"}
        items, capped = [], []
        for ev in evidence:
            if not self._eligible(ev):
                continue
            asked = list(ev.deep_dive_asked)
            fields = self.missing_fields(ev)
            # already-presented fields still count toward the cap, but stay open if unanswered
            budget = cap - len(asked)
            chosen = [f for f in fields if f in asked] + [f for f in fields if f not in asked][:max(0, budget)]
            if len(asked) >= cap and not [f for f in fields if f in asked]:
                capped.append(ev.evidence_id)
            for f in chosen:
                item = {"evidence_id": ev.evidence_id, "indicator_id": ev.canonical_indicator_id,
                        "term": ev.indicator_term, "quote": ev.quote, "field": f,
                        "blocking": f in _BLOCKING,
                        "reason": "Needed before this evidence can be scored or read" if f in _BLOCKING
                        else "Optional detail"}
                if f == "disambiguation":
                    item["questions"] = self.ambiguity.for_indicator(ev.canonical_indicator_id)
                    item["question"] = (item["questions"][0]["question"] if item["questions"] else None)
                    item["therapist_only_options"] = True
                else:
                    item["question"] = _TEMPLATES[f]
                items.append(item)
        # blocking items first
        items.sort(key=lambda i: (not i["blocking"], _ORDER.index(i["field"])))
        return {"items": items, "stopped": not items,
                "stop_reason": None if items else "all_details_known_or_cap_reached",
                "capped_evidence_ids": capped}

    def mark_presented(self, ev, field):
        if field not in ev.deep_dive_asked and len(ev.deep_dive_asked) < settings.deep_dive_max_questions_per_evidence:
            ev.deep_dive_asked.append(field)

    def apply_answer(self, ev, field: str, value: str):
        """Store a therapist-entered value. Nothing is inferred from free text."""
        value = (value or "").strip()
        if not value:
            raise ValueError("value is required")
        if field == "intensity":
            if value.lower() not in _INTENSITY:
                raise ValueError("intensity must be Mild, Moderate or Severe")
            ev.intensity = _INTENSITY[value.lower()]
        elif field == "currentness":
            if value.lower() not in {"current", "historical"}:
                raise ValueError("currentness must be current or historical")
            ev.currentness = value.lower()
            if ev.currentness == "historical":
                ev.status = EvidenceStatus.HISTORICAL
        elif field in {"frequency", "duration", "impact"}:
            setattr(ev, field, value)
        elif field == "trigger":
            ev.trigger = value
        else:
            raise ValueError("field must be one of currentness, intensity, frequency, duration, trigger, impact")
