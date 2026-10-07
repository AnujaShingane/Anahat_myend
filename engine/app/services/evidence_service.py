from app.engine.evidence_engine import EvidenceEngine

class EvidenceService:
    def __init__(self, indicator_repo):
        self.engine=EvidenceEngine(indicator_repo)
