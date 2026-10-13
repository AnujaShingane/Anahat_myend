"""Evidence grounding gate: is this KB indicator really supported by what the patient said?

Why this exists
---------------
Retrieval proposes KB indicators that LOOK related; it does not prove the patient reported them.
In this project the problem was sharper: the KB's `comment`/`meaning` text is a chakra
INTERPRETATION ("Stroke: Overwhelm to consciousness...", "Vaginitis: Overwhelmed and need to shut
out...", "Hives: Intolerance, anger, excess irritation"), and that text was both embedded for
retrieval and handed to the LLM checker as the indicator's "meaning". An emotion such as
"overwhelmed" or "irritated" therefore pulled in physical illnesses, and a lenient "partial" verdict
recorded them as provisional evidence.

This gate sits AFTER retrieval and the LLM check and does not trust either on its own. It decides
using only things that can be verified:

  * the indicator's own identity (its KB term and its listed sub-forms, plus everyday cue words from
    config/indicator_vocabulary.json) versus the patient's own words (quote + extracted concept);
  * the indicator's domain versus the extracted concept's domain (a general emotion / behaviour /
    stressor can never establish a physical symptom);
  * the retrieval similarity, used as support, never as proof;
  * what the LLM checker said (exact / partial / unavailable).

Verdicts: CONFIRMED (genuine equivalent), PROVISIONAL (plausible, needs therapist review),
REJECTED (unsupported or merely related-looking). Negation and history are NOT decided here; they
are carried by the concept (polarity / currentness) into the evidence status.
Everything is pure and deterministic, so it is unit-testable without a model.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

CONFIRMED, PROVISIONAL, REJECTED = "CONFIRMED", "PROVISIONAL", "REJECTED"
_VOCAB_PATH = Path(__file__).resolve().parents[2] / "config" / "indicator_vocabulary.json"
_STOP = {"problem", "problems", "general", "issue", "issues", "feeling", "feelings", "difficulty", "lack", "pain", "with",
         "the", "and", "not", "from", "have", "has", "had", "feel", "felt", "very", "much", "more", "some", "than",
         "when", "that", "this", "they", "them", "their", "about", "because", "often", "always", "really", "just"}
_EMOTION_LIKE = {"emotion", "behaviour", "behavior", "context", "stressor", "thought", "situation"}


def _norm(text) -> str:
    return re.sub(r"[^a-z0-9' ]+", " ", (text or "").lower().replace("\u2019", "'")).strip()


def stem(token: str) -> str:
    token = token.lower()
    if token.endswith("ies") and len(token) > 5:
        return token[:-3] + "y"
    for suffix in ("ing", "ed", "es", "s"):
        if token.endswith(suffix) and len(token) > len(suffix) + 3:
            return token[:-len(suffix)]
    return token


def _content_stems(text: str) -> set[str]:
    return {stem(t) for t in re.findall(r"[a-z]{3,}", _norm(text)) if t not in _STOP}


@lru_cache(maxsize=1)
def _vocabulary() -> dict[str, list[str]]:
    try:
        data = json.loads(_VOCAB_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {re.sub(r"[^a-z0-9]+", " ", k.lower()).strip(): v for k, v in data.items() if not k.startswith("_")}


@dataclass
class GroundingDecision:
    verdict: str
    reasons: list[str] = field(default_factory=list)
    lexical_overlap: list[str] = field(default_factory=list)
    similarity: float | None = None
    validator_match: str | None = None

    def as_trace(self) -> dict:
        return {"verdict": self.verdict, "reasons": self.reasons, "lexical_overlap": self.lexical_overlap,
                "similarity": None if self.similarity is None else round(self.similarity, 3),
                "validator_match": self.validator_match}


def indicator_vocabulary(term: str, variants: set[str] | list[str] | None = None) -> set[str]:
    """Word stems that identify the indicator: its own term / sub-forms and cue words for it."""
    stems = set()
    for v in (variants or [term]):
        stems |= _content_stems(v)
    stems |= _content_stems(term)
    key = re.sub(r"[^a-z0-9]+", " ", (term or "").lower()).strip()
    vocab = _vocabulary()
    for k in {key, *(re.sub(r"[^a-z0-9]+", " ", str(v).lower()).strip() for v in (variants or []))}:
        for cue in vocab.get(k, []):
            stems |= _content_stems(cue)
    return stems


def ground_candidate(*, concept: dict, term: str, indicator_domain: str | None, validator_match: str | None,
                     similarity: float | None, variants=None, confirm_similarity: float = 0.72,
                     provisional_similarity: float = 0.55) -> GroundingDecision:
    """Decide whether one retrieved indicator is supported by the patient's own words."""
    patient_words = f"{concept.get('evidence_quote') or ''} {concept.get('concept') or ''}"
    overlap = sorted(_content_stems(patient_words) & indicator_vocabulary(term, variants))
    sim = similarity
    base = dict(lexical_overlap=overlap, similarity=sim, validator_match=validator_match)
    c_domain = (concept.get("domain") or "").lower()

    # 1. A general emotion / behaviour / stressor never establishes a specific physical symptom.
    if c_domain in _EMOTION_LIKE and (indicator_domain or "").lower() == "symptom" and not overlap:
        return GroundingDecision(REJECTED, ["a general emotion, behaviour or stressor cannot establish a physical "
                                            "symptom the patient did not describe"], **base)
    # 2. The LLM checker said it is not the same thing.
    if validator_match == "none":
        return GroundingDecision(REJECTED, ["the matching check judged it a different concept"], **base)
    # 3. The patient's own words name the indicator (or a listed sub-form / cue word for it).
    if overlap:
        if validator_match == "exact":
            return GroundingDecision(CONFIRMED, ["patient's words name the indicator and the check agrees"], **base)
        return GroundingDecision(PROVISIONAL, ["patient's words are related to the indicator but the match is not "
                                               "clearly the same thing"], **base)
    # 4. No shared words: only a strong, validated semantic equivalent may pass.
    if validator_match == "retrieval_only":
        return GroundingDecision(REJECTED, ["validator unavailable and no word-level link to the indicator"], **base)
    if sim is not None and validator_match == "exact" and sim >= confirm_similarity:
        return GroundingDecision(CONFIRMED, [f"validated semantic equivalent (similarity {sim:.2f})"], **base)
    if sim is not None and validator_match in {"exact", "partial"} and sim >= provisional_similarity:
        return GroundingDecision(PROVISIONAL, [f"plausible semantic match, similarity {sim:.2f} is below the "
                                               f"confirm level; therapist review"], **base)
    return GroundingDecision(REJECTED, ["no word-level link and not a strong validated semantic match"], **base)
