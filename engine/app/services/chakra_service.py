class ChakraService:
    def __init__(self, scoring_engine):
        self.scoring_engine=scoring_engine

    def score(self, evidence, contradictions=None, assessed_quadrants=None):
        return self.scoring_engine.score(evidence, contradictions=contradictions, assessed_quadrants=assessed_quadrants)
