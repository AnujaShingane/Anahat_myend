import re


class AmbiguityService:
    def __init__(self, kb):
        self.kb = kb

    def for_indicator(self, indicator_id):
        ids = {i.disambiguation_pattern_id for i in self.kb.indicators if i.indicator_id == indicator_id}
        return [q for q in self.kb.disambiguation_questions if q.get("id") in ids]

    def needs_clarification(self, indicator_id):
        inds = [i for i in self.kb.indicators if i.indicator_id == indicator_id]
        return any(i.disambiguation_pattern_id for i in inds) or any(
            (i.state_raw or "").lower() in {"either", "varies", "depends on area", "conflict in area", "any", "deficient or excess", "excess or deficient"}
            for i in inds
        )

    def resolve_patient_answer(self, indicator_id, answer: str) -> str:
        """Map a patient's clarification response to one KB chakra option.

        The response is matched only against the authoritative answer options for
        this indicator. A tie or no match remains unresolved rather than guessing.
        """
        answer = " ".join((answer or "").lower().split())
        if not answer:
            raise ValueError("Patient clarification response is required")
        questions = self.for_indicator(indicator_id)
        options = [
            option
            for question in questions
            for option in question.get("answer_options", [])
        ]
        if not options:
            raise ValueError("No KB clarification options are available for this indicator")

        def tokens(text):
            return {
                token for token in re.findall(r"[a-z0-9]+", text.lower())
                if len(token) > 2
            }

        answer_tokens = tokens(answer)
        ranked = []
        for option in options:
            option_tokens = tokens(option.get("label", ""))
            overlap = len(answer_tokens & option_tokens)
            phrase_match = option.get("label", "").lower() in answer
            ranked.append((int(phrase_match), overlap, option.get("points_to_chakra")))
        ranked.sort(reverse=True)
        best = ranked[0]
        tied = [item for item in ranked if item[:2] == best[:2]]
        if best[1] == 0 or len(tied) != 1 or not best[2]:
            raise ValueError("Patient clarification did not identify one specific chakra; ask the KB question again")
        return best[2]
