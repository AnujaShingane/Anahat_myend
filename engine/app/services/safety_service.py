from __future__ import annotations

# RED: immediate-risk phrases. Stops normal probing at once.
# These phrase lists are a minimal routing safeguard, NOT a clinical rule set and NOT evidence.
# REQUIRES DOMAIN/THERAPIST VALIDATION before production use.
_RED_SIGNALS = (
    "kill myself", "suicide", "suicidal", "end my life", "want to die",
    "hurt myself", "self harm", "self-harm", "harm myself", "overdose",
    "kill someone", "hurt someone", "harm someone", "immediate danger",
)
# AMBER: worrying but not immediate. Assessment may continue, the therapist is alerted and
# automatic deep-dive probing pauses until the therapist acknowledges.
# REQUIRES DOMAIN/THERAPIST VALIDATION (the list is illustrative, not clinically validated).
_AMBER_SIGNALS = (
    "hopeless", "no point in", "can't go on", "cannot go on", "worthless", "panic attack",
    "can't breathe", "cannot breathe", "chest pain", "being abused", "hits me", "hitting me",
    "afraid for my safety", "not safe at home", "can't cope", "cannot cope", "giving up on life",
)

# Statuses. "ESCALATE" is kept as the RED status for backward compatibility with older clients.
CLEAR, AMBER, ESCALATE = "CLEAR", "AMBER", "ESCALATE"


class SafetyService:
    def __init__(self, kb):
        self.kb = kb

    def _rule_ids(self):
        rules = self.kb.safety_rules.get("rules", []) if isinstance(self.kb.safety_rules, dict) else []
        return [r.get("id") for r in rules if r.get("id")]

    def emergency_contacts(self) -> list[dict]:
        """Contacts exactly as stored in the KB (never generated). Each carries the KB's own
        verification flags so the UI can show 'verify before use'."""
        data = getattr(self.kb, "emergency_contacts", None)
        if not isinstance(data, dict):
            return []
        out = []
        for country in data.get("countries", []):
            for res in country.get("resources", []):
                out.append({"country": country.get("country"), "name": res.get("name"),
                            "contact": res.get("phone") or res.get("contact"),
                            "verification_status": res.get("verification_status"),
                            "requires_live_verification_before_production":
                                res.get("requires_live_verification_before_production", True)})
        return out

    def assess(self, text: str, *, llm_safety_relevant: bool = False) -> dict:
        """`llm_safety_relevant` can only RAISE the level (CLEAR -> AMBER); the model can never
        lower or clear a keyword hit."""
        lower = (text or "").lower()
        red = [p for p in _RED_SIGNALS if p in lower]
        amber = [p for p in _AMBER_SIGNALS if p in lower]
        base = {"governance_rule_ids": self._rule_ids(), "clinical_diagnosis": False}
        if red:
            return {**base, "status": ESCALATE, "level": "RED", "matched_signals": red,
                    "action": "stop_normal_probing_and_route_to_therapist",
                    "emergency_contacts_available": bool(self.emergency_contacts()),
                    "emergency_contacts": self.emergency_contacts()}
        if amber or llm_safety_relevant:
            return {**base, "status": AMBER, "level": "AMBER", "matched_signals": amber,
                    "llm_flagged": bool(llm_safety_relevant),
                    "action": "alert_therapist_pause_auto_probing_until_acknowledged"}
        return {**base, "status": CLEAR, "level": "GREEN", "matched_signals": [], "action": "continue"}
