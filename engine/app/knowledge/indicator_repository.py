import re

from app.knowledge.loader import KnowledgeBase, Indicator


def normalize_term(term: str | None) -> str:
    """Case/spacing-insensitive form of a CANONICAL KB term. This is used only to
    recognise that two KB entries carry the identical term (e.g. 'Anxiety' exists as
    both SYM-009 and EMO-008). It is not a synonym dictionary."""
    return re.sub(r"[^a-z0-9]+", " ", (term or "").lower()).strip()


# These labels are emitted by the semantic extractor and are direct
# normalizations of canonical KB terms, not new clinical indicators.
_CONCEPT_ALIASES = {
    "low self confidence": "not confident low self confidence",
    "low self confidence behaviour": "not confident low self confidence",
    "stays silent": "silence not speaking up",
    "staying silent": "silence not speaking up",
    "difficulty speaking up": "silence not speaking up",
    "holds thoughts emotions inside": "suppressed expression",
    "feels unheard": "feeling unheard not understood",
    "feels misunderstood": "feeling unheard not understood",
}


class IndicatorRepository:
    """Authoritative read-only access to canonical indicator records."""
    def __init__(self, kb: KnowledgeBase):
        self.kb = kb
        self.by_id = {}
        for indicator in kb.indicators:
            self.by_id.setdefault(indicator.indicator_id, []).append(indicator)

    def get_by_id(self, indicator_id: str) -> list[Indicator]:
        return list(self.by_id.get(indicator_id, []))

    def term(self, indicator_id: str) -> str | None:
        records = self.by_id.get(indicator_id)
        return records[0].term if records else None

    def domain(self, indicator_id: str) -> str | None:
        records = self.by_id.get(indicator_id)
        return records[0].domain if records else None

    def group_key(self, indicator_id: str) -> str:
        """Scoring group: KB entries with the identical canonical term are ONE observation."""
        term = normalize_term(self.term(indicator_id))
        return f"term:{term}" if term else f"id:{indicator_id}"

    def twins(self, indicator_id: str) -> list[str]:
        """Other KB indicator ids with the identical canonical term (KB is not modified)."""
        key = self.group_key(indicator_id)
        return sorted({i.indicator_id for i in self.kb.indicators
                       if i.indicator_id != indicator_id and self.group_key(i.indicator_id) == key})

    def all(self) -> list[Indicator]:
        return list(self.kb.indicators)

    def find_exact_term(self, term: str) -> list[Indicator]:
        return self.kb.find_by_term(term)

    @staticmethod
    def term_variants(term: str | None) -> set[str]:
        """Exact sub-forms written INTO a canonical KB term with '/', e.g. 'Silence / Not Speaking
        Up' -> {'silence not speaking up', 'silence', 'not speaking up'}. Bracketed qualifiers are
        kept ('Allergies (food)' never becomes plain 'allergies'). Nothing is added from outside
        the KB term's own words."""
        raw = term or ""
        variants = {normalize_term(raw)}
        for part in re.split(r"\s*/\s*", raw):
            part = normalize_term(part)
            if part:
                variants.add(part)
        return {v for v in variants if v}

    def find_for_concept(self, concept: str) -> tuple[list[Indicator], str]:
        normalized = normalize_term(concept)
        target = _CONCEPT_ALIASES.get(normalized, normalized)
        matches = [
            indicator for indicator in self.kb.indicators
            if normalize_term(indicator.term) == target
        ]
        if matches:
            return matches, "canonical_term" if target == normalized else "kb_grounded_alias"
        # Second pass: one of the sub-forms the KB term itself lists ("A / B").
        # Single-word sub-forms must be at least 5 letters to avoid trivial collisions.
        matches = [
            indicator for indicator in self.kb.indicators
            if any(v == target and (" " in v or len(v) >= 5) for v in self.term_variants(indicator.term))
        ]
        return matches, "kb_term_variant"

    def validate_candidate(self, indicator_id: str, payload: dict | None = None) -> bool:
        records = self.get_by_id(indicator_id)
        if not records:
            return False
        if payload is None:
            return True
        # Retrieval metadata may only narrow to canonical records; it cannot
        # introduce an association. If supplied, fields must agree with at
        # least one authoritative record.
        payload_chakras = payload.get("chakra")
        if payload_chakras is not None:
            if isinstance(payload_chakras, str): payload_chakras = [payload_chakras]
            if set(payload_chakras) != {r.chakra for r in records}:
                return False
        payload_strength = payload.get("indicator_strength_by_chakra")
        if payload_strength is not None:
            expected = {r.chakra: r.association_rating for r in records}
            if payload_strength != expected:
                return False
        payload_state = payload.get("state")
        if payload_state is not None and len({r.state_raw for r in records}) == 1:
            if payload_state != records[0].raw_entry.get("state"):
                return False
        return True
