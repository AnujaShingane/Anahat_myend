class SafetyRules:
    def __init__(self, kb):
        self.rules = kb.safety_rules
        self.governance = kb.governance_rules

    def all(self):
        return self.rules.get("rules", []) if isinstance(self.rules, dict) else []
