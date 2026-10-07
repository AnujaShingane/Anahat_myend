from __future__ import annotations
from datetime import datetime
from app.knowledge.raga_repository import RagaRepository


class RagaService:
    def __init__(self, kb):
        self.kb = kb
        self.repo = RagaRepository(kb)

    @staticmethod
    def _time_match(label: str | None, traditional: str | None) -> bool:
        if not label or not traditional:
            return True
        a, b = label.lower(), traditional.lower()
        if "any time" in b:
            return True
        return a in b or b in a

    def candidates(self, *, approved_chakras=None, current_time_label=None, preferences=None):
        bridge = self.kb.raga_bridge or {}
        notes = []
        if bridge.get("can_influence_raga_recommendation") is not True:
            notes.append("No validated chakra-to-raga mapping")
        # Without an approved chakra->raga bridge, only non-clinical metadata may
        # filter an already-authorized candidate set. We therefore do not invent
        # candidates from chakra names or traditional associations.
        if not bridge.get("can_influence_raga_recommendation") is True:
            return {"candidates": [], "blocked": [], "governance_notes": notes}

        candidates = []
        for r in self.repo.all():
            if r.get("can_influence_chakra_score"):
                continue
            if r.get("review_status") not in {"approved", "therapist_approved"}:
                # Current canonical rows are needs_review; do not present them as
                # automatic clinical recommendations.
                continue
            if current_time_label and not self._time_match(current_time_label, r.get("traditional_performance_time")):
                continue
            candidates.append(r)
        return {"candidates": candidates, "blocked": [], "governance_notes": notes}
