class QuestionRepository:
    def __init__(self, kb):
        self.kb = kb

    def baseline(self):
        return self.kb.opening_questions.get("baseline_rating_questions", {}).get("ratings", [])

    def opening_sets(self):
        return self.kb.opening_questions.get("opening_style_sets", [])

    def get_opening_set(self, set_id):
        return next((s for s in self.opening_sets() if s.get("set_id") == set_id), None)

    def quadrants(self):
        return self.kb.quadrants

    def quadrant(self, name):
        return next((q for q in self.kb.quadrants if q.get("name") == name), None)

    def disambiguation(self, pattern_id):
        return next((q for q in self.kb.disambiguation_questions if q.get("id") == pattern_id), None)
