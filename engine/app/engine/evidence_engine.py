from __future__ import annotations
from uuid import uuid4
from app.core.enums import EvidenceStatus
from app.models.evidence import EvidenceRecord


class EvidenceEngine:
    """Turns a therapist/patient-CONFIRMED candidate into an evidence record.
    A retrieval candidate is never evidence by itself (PDF Part 21)."""

    def __init__(self, indicator_repo):
        self.indicator_repo = indicator_repo

    def build_evidence(self, *, response_id, candidate, extraction, status: EvidenceStatus,
                       confirmation=None, selected_chakra=None, indicator_id=None, twin_of=None):
        concept = candidate.get("concept") or {}
        payload = candidate.get("payload") or {}
        indicator_id = indicator_id or payload.get("indicator_id")
        if not indicator_id or not self.indicator_repo.validate_candidate(indicator_id):
            return None
        polarity = concept.get("polarity", "uncertain")
        currentness = concept.get("currentness", "unknown")
        if polarity == "negative":
            status = EvidenceStatus.NEGATIVE
        elif currentness == "historical":
            status = EvidenceStatus.HISTORICAL
        term = None
        if hasattr(self.indicator_repo, "term"):
            term = self.indicator_repo.term(indicator_id)
        group = None
        if hasattr(self.indicator_repo, "group_key"):
            group = self.indicator_repo.group_key(indicator_id)
        return EvidenceRecord(
            evidence_id=str(uuid4()), response_id=response_id,
            candidate_id=candidate.get("candidate_id"), canonical_indicator_id=indicator_id,
            indicator_term=term or payload.get("ailment") or payload.get("term"),
            domain=concept.get("domain"), status=status, polarity=polarity,
            currentness=currentness, certainty=concept.get("certainty", "uncertain"),
            intensity=concept.get("intensity"), context=concept.get("context"),
            trigger=concept.get("trigger"), quote=candidate.get("quote") or concept.get("evidence_quote"),
            frequency=concept.get("frequency"), duration=concept.get("duration"),
            impact=concept.get("impact"), coping=concept.get("coping"),
            correlation_group=group, twin_of=twin_of,
            provenance={"retrieval_score": candidate.get("score"), "retrieval_layer": "canonical_indicator",
                        "validation": candidate.get("validation"), "extracted_concept": concept.get("concept")},
            confirmation=confirmation or {}, selected_chakra=selected_chakra,
        )
