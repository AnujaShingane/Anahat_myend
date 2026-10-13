"""Knowledge base loader.

This replaces the prior loader, which silently produced unusable data against
the real KB (see docs/GAP_MATRIX.md item KB-1..KB-6 for the audit that found
this). Every parser here is written against the *actual* schema of the file
it reads, confirmed by inspecting the real KB — not a guessed generic shape.

Nothing here invents data. Fields that are null/None in the source stay
None here; callers must handle that, not paper over it.
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Optional


def _load_json(path: Path) -> Optional[Any]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 — we want to know exactly which file broke
        raise ValueError(f"Failed to parse JSON at {path}: {exc}") from exc


class Indicator:
    """One symptom/emotion/behaviour term, expanded into one record per
    chakra it is associated with. This is the unit evidence-building and
    retrieval operate on — a single KB entry with 2 chakras becomes 2
    Indicator objects here, each carrying only its own direction/strength.
    """
    __slots__ = (
        "indicator_id", "term", "domain", "chakra", "state_raw",
        "association_rating", "diagnostic_type", "disambiguation_pattern_id",
        "meaning", "clinical_disclaimer", "raw_entry",
    )

    def __init__(self, indicator_id, term, domain, chakra, state_raw,
                 association_rating, diagnostic_type, disambiguation_pattern_id,
                 meaning, clinical_disclaimer, raw_entry):
        self.indicator_id = indicator_id
        self.term = term
        self.domain = domain
        self.chakra = chakra
        self.state_raw = state_raw
        self.association_rating = association_rating
        self.diagnostic_type = diagnostic_type
        self.disambiguation_pattern_id = disambiguation_pattern_id
        self.meaning = meaning
        self.clinical_disclaimer = clinical_disclaimer
        self.raw_entry = raw_entry

    def as_dict(self):
        return {s: getattr(self, s) for s in self.__slots__}


# ---------------------------------------------------------------------------
# Per-chakra state parsing for symptom_to_chakra.json's compound `state`
# field, e.g. "Deficient Heart, Excess Sacral" for a 2-chakra entry, or a
# single word like "Deficient" for a 1-chakra entry, or a shared descriptor
# like "Either" / "Conflict in area" that applies identically to every
# listed chakra. This is the exact bug (#2 in the audit) that silently
# collapsed multi-chakra entries before — fixed here.
# ---------------------------------------------------------------------------

_SHARED_STATE_WORDS = {
    "deficient", "excess", "either", "deficient or excess", "excess or deficient",
    "varies", "depends on area", "conflict in area", "excess to deficient",
    "usually excess", "any",
}

# Maps a chakra's short name (as it appears inline in a compound state
# string like "Deficient Heart, Excess Sacral") back to its canonical name.
_CHAKRA_SHORT_NAMES = {
    "root": "Root Chakra", "sacral": "Sacral Chakra", "solar": "Solar Plexus Chakra",
    "solar plexus": "Solar Plexus Chakra", "heart": "Heart Chakra", "throat": "Throat Chakra",
    "third eye": "Third Eye Chakra", "third-eye": "Third Eye Chakra", "crown": "Crown Chakra",
}


def _per_chakra_state(chakra_list: list[str], state_field) -> dict[str, str]:
    """Return {chakra_name: state_raw_for_that_chakra}.

    Handles three shapes actually found in symptom_to_chakra.json:
      1. state_field is a plain string shared by all chakras, e.g. "Deficient".
      2. state_field is a shared descriptor requiring no direction, e.g.
         "Either", "Conflict in area", "varies" — every chakra gets that
         same descriptor (it is NOT resolved into a direction here).
      3. state_field is a compound per-chakra string, e.g.
         "Deficient Heart, Excess Sacral" — split on chakra name and assign
         each chakra its own segment.
    """
    if not chakra_list:
        return {}
    if not isinstance(state_field, str) or not state_field.strip():
        return {c: None for c in chakra_list}

    s_lower = state_field.strip().lower()

    if len(chakra_list) == 1:
        return {chakra_list[0]: state_field.strip()}

    if s_lower in _SHARED_STATE_WORDS:
        return {c: state_field.strip() for c in chakra_list}

    # Try compound parse: split on commas, match each segment's trailing/
    # leading chakra short-name token to a chakra in chakra_list.
    segments = [seg.strip() for seg in state_field.split(",")]
    result: dict[str, str] = {}
    for seg in segments:
        seg_lower = seg.lower()
        matched_chakra = None
        for short, full in _CHAKRA_SHORT_NAMES.items():
            if short in seg_lower and full in chakra_list:
                matched_chakra = full
                break
        if matched_chakra:
            direction = next(
                (value for value in ("Deficient", "Excess") if seg_lower.startswith(value.lower())),
                seg.strip(),
            )
            result[matched_chakra] = direction

    # Anything in chakra_list not resolved by the compound parse falls back
    # to the raw shared string rather than being silently dropped — callers
    # will see an unrecognized state and can treat it as context-dependent.
    for c in chakra_list:
        if c not in result:
            result[c] = state_field.strip()
    return result


class KnowledgeBase:
    def __init__(self):
        self.indicators: list[Indicator] = []
        self.quadrants: list[dict] = []              # from quadrant_question_bank.json
        self.quadrant_names: list[str] = []
        self.chakra_master: list[dict] = []           # from chakra_master.json
        self.chakra_names: list[str] = []
        self.assessment_design: dict = {}
        self.scoring_config: dict = {}
        self.disambiguation_questions: list[dict] = []
        self.disambiguation_rules: dict = {}
        self.opening_questions: dict = {}             # legacy 4-question combined set (structured/opening_questions.json)
        # Therapist-selectable opening styles A-J (structured/assessment/fixed_opening_questions_v3.json).
        # This is the opening-question source the engine serves; the legacy set is kept only as provenance.
        self.opening_styles: dict = {}
        # {quadrant name: [question text per attribute, in attribute order]} from rag/question_bank/*.md.
        # Loaded ONLY when the file has exactly one question per attribute (no guessing).
        self.quadrant_question_text: dict[str, list[str]] = {}
        self.quadrants_without_kb_question_text: list[str] = []
        self.clinical_context_questions: dict = {}
        self.governance_rules: dict = {}
        self.evidence_policy: dict = {}
        self.safety_rules: dict = {}
        self.emergency_contacts: dict = {}

        self.ragas: list[dict] = []
        self.raga_bridge: dict = {}
        self.raga_safety: dict = {}
        self.raga_time_of_day: dict = {}
        self.svara_chakra_mapping: dict = {}

        self._load_warnings: list[str] = []
        self.kb_root: Optional[Path] = None

    # -- public API ---------------------------------------------------

    def load_directory(self, kb_dir: str | Path) -> "KnowledgeBase":
        root = Path(kb_dir)
        self.kb_root = root
        if not root.exists():
            self._load_warnings.append(f"KB root does not exist: {root}")
            return self

        self._load_indicators(root / "structured")
        self._load_quadrants(root / "structured" / "quadrant_question_bank.json")
        self._load_chakra_master(root / "structured" / "chakra_master.json")
        self._load_json_into(root / "structured" / "assessment" / "assessment_engine_design_v3.json", "assessment_design")
        self._load_json_into(root / "structured" / "assessment" / "chakra_scoring_config_v2.json", "scoring_config")
        self._load_disambiguation(root / "structured" / "assessment" / "chakra_disambiguation_questions_v3.json")
        self._load_json_into(root / "structured" / "opening_questions.json", "opening_questions")
        self._load_json_into(root / "structured" / "assessment" / "fixed_opening_questions_v3.json", "opening_styles")
        self._load_question_texts(root / "rag" / "question_bank")
        self._load_json_into(root / "structured" / "clinical_context_questions.json", "clinical_context_questions")
        self._load_json_into(root / "config" / "governance_rules.json", "governance_rules")
        self._load_json_into(root / "governance" / "evidence_policy.json", "evidence_policy")
        self._load_json_into(root / "governance" / "safety_rules.json", "safety_rules")
        self._load_json_into(root / "structured" / "emergency_contacts.json", "emergency_contacts")

        self._load_raga_metadata(root / "raaga" / "structured")

        return self

    def warnings(self) -> list[str]:
        return list(self._load_warnings)

    # -- helpers --------------------------------------------------------

    def _load_json_into(self, path: Path, attr: str):
        data = _load_json(path)
        if data is None:
            self._load_warnings.append(f"Missing or unreadable: {path}")
            return
        setattr(self, attr, data)

    def _load_indicators(self, structured_dir: Path):
        specs = [
            ("symptom_to_chakra.json", "symptom", "ailment"),
            ("emotion_to_chakra.json", "emotion", "emotion"),
            ("behaviour_to_chakra.json", "behaviour", "behaviour"),
        ]
        for filename, domain, term_key in specs:
            data = _load_json(structured_dir / filename)
            if data is None:
                self._load_warnings.append(f"Missing indicator file: {filename}")
                continue
            entries = data.get("entries", [])
            for entry in entries:
                term = entry.get(term_key) or ""
                entry_id = entry.get("id")
                diagnostic_type = entry.get("diagnostic_type")
                disambig_id = entry.get("disambiguation_pattern_id")
                clinical_disclaimer = entry.get("clinical_disclaimer")

                if domain == "symptom":
                    # Shape: chakra: [...], state: "<compound or shared string>",
                    # indicator_strength_by_chakra: {chakra: Strong|Medium|Weak}
                    chakra_list = entry.get("chakra") or []
                    if isinstance(chakra_list, str):
                        chakra_list = [chakra_list]
                    per_chakra_state = _per_chakra_state(chakra_list, entry.get("state"))
                    strength_map = entry.get("indicator_strength_by_chakra") or {}
                    for chakra in chakra_list:
                        self.indicators.append(Indicator(
                            indicator_id=entry_id, term=term, domain=domain,
                            chakra=chakra, state_raw=per_chakra_state.get(chakra),
                            association_rating=strength_map.get(chakra),
                            diagnostic_type=diagnostic_type,
                            disambiguation_pattern_id=disambig_id,
                            meaning=entry.get("comment"),
                            clinical_disclaimer=clinical_disclaimer,
                            raw_entry=entry,
                        ))
                else:
                    # Shape: mappings: [{chakra, state, meaning, indicator_strength}]
                    for m in entry.get("mappings", []):
                        self.indicators.append(Indicator(
                            indicator_id=entry_id, term=term, domain=domain,
                            chakra=m.get("chakra"), state_raw=m.get("state"),
                            association_rating=m.get("indicator_strength"),
                            diagnostic_type=diagnostic_type,
                            disambiguation_pattern_id=disambig_id,
                            meaning=m.get("meaning"),
                            clinical_disclaimer=clinical_disclaimer,
                            raw_entry=entry,
                        ))

    def _load_quadrants(self, path: Path):
        data = _load_json(path)
        if data is None:
            self._load_warnings.append(f"Missing quadrant question bank: {path}")
            return
        self.quadrants = data.get("quadrants", [])
        self.quadrant_names = [q.get("name") for q in self.quadrants if q.get("name")]

    def _load_question_texts(self, qdir: Path):
        """Use the KB's real question wording where it maps 1:1 onto a quadrant's attributes.
        Where the counts differ the mapping would be a guess, so we do not guess: that quadrant
        keeps the attribute-based prompt and is reported for therapist validation."""
        import re
        for q in self.quadrants:
            name = q.get("name") or ""
            slug = re.sub(r"[^a-z]+", "_", name.lower()).strip("_")
            path = qdir / f"{slug}.md"
            attrs = q.get("attributes") or []
            if not path.exists():
                self.quadrants_without_kb_question_text.append(name)
                continue
            texts = [ln[2:].strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.startswith("- ")]
            if len(texts) == len(attrs) and texts:
                self.quadrant_question_text[name] = texts
            else:
                self.quadrants_without_kb_question_text.append(name)
                self._load_warnings.append(
                    f"REQUIRES DOMAIN VALIDATION: question bank '{slug}.md' has {len(texts)} questions for "
                    f"{len(attrs)} attributes of '{name}'; not mapped automatically.")

    def _load_chakra_master(self, path: Path):
        data = _load_json(path)
        if data is None:
            self._load_warnings.append(f"Missing chakra master: {path}")
            return
        self.chakra_master = data.get("chakras", [])
        self.chakra_names = [c.get("name") for c in self.chakra_master if c.get("name")]

    def _load_disambiguation(self, path: Path):
        data = _load_json(path)
        if data is None:
            self._load_warnings.append(f"Missing disambiguation questions: {path}")
            return
        self.disambiguation_questions = data.get("questions", [])
        self.disambiguation_rules = data.get("rules", {})

    def _load_raga_metadata(self, rdir: Path):
        self.ragas = _load_json(rdir / "raga_metadata.json") or []
        if isinstance(self.ragas, dict):
            # raga_metadata.json wraps a list under some key in some KB
            # versions; support both without guessing field names blindly.
            for key in ("ragas", "entries", "items"):
                if isinstance(self.ragas.get(key), list):
                    self.ragas = self.ragas[key]
                    break

        self.raga_bridge = _load_json(rdir / "chakra_raga_bridge.json") or {}
        self.raga_safety = _load_json(rdir / "raga_safety_metadata.json") or {}
        self.raga_time_of_day = _load_json(rdir / "raga_time_of_day.json") or {}
        self.svara_chakra_mapping = _load_json(rdir.parent.parent / "structured" / "svara_chakra_mapping.json") or {}

    # -- query helpers used by retrieval/evidence ------------------------

    def indicators_by_domain(self, domain: str) -> list[Indicator]:
        return [i for i in self.indicators if i.domain == domain]

    def find_by_term(self, term: str) -> list[Indicator]:
        t = (term or "").strip().lower()
        return [i for i in self.indicators if (i.term or "").strip().lower() == t]
