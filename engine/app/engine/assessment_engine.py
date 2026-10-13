class AssessmentEngine:
    """Thin orchestration facade; business rules live in services/engines."""
    def __init__(self, service): self.service=service
