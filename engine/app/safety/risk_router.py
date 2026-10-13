class RiskRouter:
    def route(self, safety_result):
        return "therapist_safety_workflow" if safety_result.get("status") == "ESCALATE" else "normal_assessment"
