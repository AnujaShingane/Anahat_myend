"""Deterministic post-generation checks for adaptive questions.

The backend never trusts the model's own claims about its output. Everything that matters for
patient safety and evidence neutrality is recomputed here from the question text and the
closed context the model was given:

  structure    one question, ends with "?", length, open-ended (not yes/no, not "why")
  leakage      chakra words / Sanskrit chakra names / energy language
  diagnosis    diagnostic, causal, treatment or advice language
  leading      leading phrasings, feelings the patient never mentioned, hinting at the
               (hidden) interpretation themes
  membership   attribute, signal id and interpretation ids must come from the context
  repetition   near-duplicate of anything already asked in the session
  confidence   below the configured minimum
  sensitivity  sensitive topics (reported, the service decides what to do)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_WORD = re.compile(r"[a-z0-9']+")
_CLOSED_STARTERS = {"do", "does", "did", "is", "are", "was", "were", "have", "has", "had", "can", "could",
                    "would", "will", "should", "shall", "am", "may", "might", "must"}
_CLOSED_AFTER_CLAUSE = re.compile(
    r"[,;:]\s*(?:do|does|did|is|are|was|were|have|has|can|could|would|will)\s+(?:you|he|she|they|it|your|this|that)\b",
    re.IGNORECASE)
_COMPOUND = re.compile(
    r"(?:,|;|\s)\s*(?:and|or|also)\s+(?:what|how|when|where|which|who|why|do|does|did|is|are|was|were|"
    r"can|could|would|will|have|has)\b", re.IGNORECASE)
_THEME_STOP = {"about", "with", "your", "from", "that", "this", "something", "other", "more", "feel", "feels",
               "feeling", "being", "going", "life", "very", "much", "some", "things", "thing", "what", "when",
               "able", "unable", "around", "connected", "usually", "often", "like", "personal", "strong",
               "people", "someone", "they", "them", "there", "their", "into", "over", "under", "after",
               "wrong", "happening", "happens", "what's"}


def norm_text(text: str | None) -> str:
    text = (text or "").lower().replace("’", "'").replace("‘", "'")
    return " ".join(_WORD.findall(text))


_SUFFIX = r"(?:s|es|ed|d|ing|ness|ly|al|ally)?"


def _has_term(text: str, term: str) -> bool:
    """Case-insensitive whole-word (or phrase) match, allowing simple inflections.
    A term ending in "*" is a STEM: "suicid*" matches "suicidal", "suicide".
    Without "*", "numb" does not match "number" and "hiv" does not match "hives"."""
    term = (term or "").strip().lower()
    if not term:
        return False
    if term.endswith("*"):
        pattern = r"(?<![a-z0-9])" + re.escape(term[:-1])
    else:
        # Inflections only for terms of 4+ letters ("hiv" must not match "hives").
        pattern = r"(?<![a-z0-9])" + re.escape(term) + (_SUFFIX if len(term) >= 4 else "") + r"(?![a-z0-9])"
    return re.search(pattern, text.lower()) is not None


def _has_stem(text: str, term: str) -> bool:
    """Lenient match used on the PATIENT's words (word start), so any inflection they used counts."""
    term = (term or "").strip().lower().rstrip("*")
    return bool(term) and re.search(r"(?<![a-z0-9])" + re.escape(term), text.lower()) is not None


def _content_words(text: str) -> set[str]:
    return {w for w in norm_text(text).split() if len(w) >= 4 and w not in _THEME_STOP}


_FILLER = {"the", "you", "your", "yours", "are", "and", "for", "that", "this", "with", "about", "does", "did",
           "has", "have", "had", "was", "were", "its", "it's", "is", "it", "him", "her", "his", "she", "they",
           "them", "then", "there", "exactly", "really", "just", "tell", "me", "describe", "share", "could",
           "would", "can", "please", "bit", "little", "more"}


def similarity(a: str, b: str) -> float:
    """Jaccard on 5-letter word stems, keeping question and time words (what / how often / when /
    say / like) because they ARE the difference between follow-ups on the same topic.
    "What exactly does your brother pressurize you about?" vs
      "What is it that your brother pressurizes you about?"  -> 1.0 (duplicate)
      "How often does your brother pressurize you?"          -> 0.33 (different question)"""
    def stems(t):
        return {w[:5] for w in norm_text(t).split() if w not in _FILLER and len(w) >= 2}
    wa, wb = stems(a), stems(b)
    if len(wa) < 3 or len(wb) < 3:
        return 1.0 if norm_text(a) == norm_text(b) else 0.0
    return len(wa & wb) / len(wa | wb)


def clean_question_text(text: str | None) -> str:
    text = (text or "").strip()
    text = re.sub(r"^(?:question|q)\s*[:\-]\s*", "", text, flags=re.IGNORECASE)
    text = text.strip().strip('"').strip("'").strip()
    return " ".join(text.split())


@dataclass
class QuestionCheck:
    ok: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    patient_facing_text_contains_chakra_term: bool = False
    diagnostic_language_detected: bool = False
    leading_assumption_detected: bool = False
    duplicate_of: str | None = None
    sensitive_topics: list[str] = field(default_factory=list)

    def fail(self, code: str):
        self.ok = False
        self.errors.append(code)

    def as_dict(self) -> dict:
        return {
            "ok": self.ok, "errors": list(self.errors), "warnings": list(self.warnings),
            "patient_facing_text_contains_chakra_term": self.patient_facing_text_contains_chakra_term,
            "diagnostic_language_detected": self.diagnostic_language_detected,
            "leading_assumption_detected": self.leading_assumption_detected,
            "duplicate_of": self.duplicate_of,
            "sensitive_topics": list(self.sensitive_topics),
        }


def sensitive_topics_in(text: str, guidance: dict) -> list[str]:
    topics = ((guidance.get("sensitive_topics") or {}).get("topics") or {})
    return sorted(name for name, terms in topics.items() if any(_has_term(text, t) for t in terms))


def validate_generated_question(
    output,
    *,
    guidance: dict,
    quadrant_attributes: list[str],
    signal_ids: set[str],
    interpretation_ids: dict[str, str],      # interpretation id -> signal id
    interpretation_themes: dict[str, str],   # interpretation id -> theme text (hidden from patient)
    asked_questions: list[str],
    patient_corpus: str,
    extra_chakra_terms: list[str] = (),
    quadrant: str | None = None,
) -> tuple[QuestionCheck, str]:
    """Returns (check, cleaned_question_text)."""
    chk = QuestionCheck()
    limits = guidance.get("limits") or {}
    if getattr(output, "status", None) != "QUESTION_GENERATED":
        chk.fail("model_returned_cannot_generate")
        return chk, ""
    text = clean_question_text(getattr(output, "question_text", None))
    low = text.lower()

    # ---- structure ------------------------------------------------------------
    if not text:
        chk.fail("empty_question")
        return chk, text
    if len(text) < int(limits.get("min_question_chars", 12)):
        chk.fail("question_too_short")
    if len(text) > int(limits.get("max_question_chars", 220)) or len(text.split()) > int(limits.get("max_question_words", 40)):
        chk.fail("question_too_long")
    # descriptive and self-contained: a therapist must understand it without the previous answer
    if len(text.split()) < int(limits.get("min_question_words", 6)):
        chk.fail("question_too_short_to_be_clear")
    from app.services.question_topics import is_fragment, question_fits
    if is_fragment(text):
        chk.fail("fragment_not_self_contained")
    if quadrant:
        fits, why = question_fits(quadrant, text)
        if not fits:
            chk.fail(why or "off_topic_for_quadrant")
    if not text.endswith("?"):
        chk.fail("does_not_end_with_question_mark")
    if text.count("?") > 1:
        chk.fail("more_than_one_question")
    if _COMPOUND.search(text):
        chk.fail("compound_question")
    if re.search(r"(?<![a-z])why(?![a-z])", low):
        chk.fail("why_question")
    starters = [s.lower() for s in guidance.get("open_question_starters") or []]
    first = (norm_text(text).split() or [""])[0]
    lead_in = norm_text(text)
    if not any(lead_in.startswith(s) for s in starters):
        if first in _CLOSED_STARTERS:
            chk.fail("closed_yes_no_question")
        else:
            chk.warnings.append("unusual_question_start")
    if _CLOSED_AFTER_CLAUSE.search(text):
        chk.fail("closed_yes_no_question")

    # ---- leakage / diagnosis ------------------------------------------------------
    forbidden = guidance.get("forbidden_patient_facing_terms") or {}
    chakra_terms = [*(forbidden.get("chakra_terms") or []), *[t.lower() for t in extra_chakra_terms if t]]
    if any(_has_term(low, t) for t in chakra_terms):
        chk.patient_facing_text_contains_chakra_term = True
        chk.fail("chakra_term_in_question")
    # plain language: a patient must be able to understand the question without clinical vocabulary
    jargon = [t for t in forbidden.get("plain_language_blocklist") or [] if _has_term(low, t)]
    if jargon:
        chk.fail("clinical_jargon_in_question:" + jargon[0].rstrip("*"))
    if any(_has_term(low, t) for t in forbidden.get("diagnostic_terms") or []):
        chk.diagnostic_language_detected = True
        chk.fail("diagnostic_or_advice_language")

    # ---- leading --------------------------------------------------------------------
    for pattern in (guidance.get("leading_patterns") or {}).get("patterns") or []:
        if re.search(pattern, low, flags=re.IGNORECASE):
            chk.leading_assumption_detected = True
            chk.fail("leading_phrasing")
            break
    corpus = (patient_corpus or "").lower()
    for group in (guidance.get("presupposed_feeling_words") or {}).get("groups") or []:
        named = [w for w in group if _has_term(low, w)]
        if named and not any(_has_stem(corpus, w) for w in group):
            chk.leading_assumption_detected = True
            chk.fail(f"presupposes_unstated_feeling:{named[0]}")
    # Hinting at the hidden interpretation themes (e.g. "is it about safety or being judged?").
    corpus_words = _content_words(corpus)
    q_words = _content_words(text)
    hinted = {}
    for iid, theme in interpretation_themes.items():
        # Words the patient used themselves (up to inflection) are never "hints".
        theme_only = {w for w in _content_words(theme)
                      if not any(cw[:5] == w[:5] for cw in corpus_words)}
        shared = {w for w in theme_only if any(qw.startswith(w[:5]) for qw in q_words)}
        if shared:
            hinted[iid] = shared
    distinguishing = (getattr(output, "exploration_goal", None) == "distinguish_interpretations"
                      or bool(getattr(output, "candidate_interpretation_ids", None)))
    if len(hinted) >= 2 or any(len(v) >= 2 for v in hinted.values()):
        chk.leading_assumption_detected = True
        chk.fail("reveals_interpretation_themes")
    elif hinted and distinguishing:
        # A question meant to tell interpretations apart must not use the words of one of them:
        # "What does your brother control in your life?" steers toward the pressure/control theme.
        chk.leading_assumption_detected = True
        chk.fail("steers_toward_one_interpretation:" + ",".join(sorted(next(iter(hinted.values())))))
    elif hinted:
        chk.warnings.append("uses_a_theme_word:" + ",".join(sorted(next(iter(hinted.values())))))

    # ---- membership ------------------------------------------------------------------
    attribute = getattr(output, "attribute", None)
    if attribute:
        if attribute.strip().lower() not in {a.strip().lower() for a in quadrant_attributes}:
            chk.fail("attribute_not_in_selected_quadrant")
    else:
        chk.warnings.append("no_attribute_selected")
    focus = getattr(output, "focus_signal_id", None)
    if focus and focus not in signal_ids:
        chk.fail("unknown_signal_id")
    for iid in getattr(output, "candidate_interpretation_ids", None) or []:
        if iid not in interpretation_ids:
            chk.fail("unknown_interpretation_id")
            break
        if focus and interpretation_ids[iid] != focus:
            chk.fail("interpretation_id_from_other_signal")
            break

    # ---- repetition --------------------------------------------------------------------
    threshold = float(limits.get("duplicate_similarity_threshold", 0.8))
    for old in asked_questions or []:
        if norm_text(old) == norm_text(text) or similarity(old, text) >= threshold:
            chk.duplicate_of = old
            chk.fail("duplicate_of_asked_question")
            break

    # ---- confidence / sensitivity ---------------------------------------------------------
    if float(getattr(output, "generation_confidence", 0.0) or 0.0) < float(limits.get("min_generation_confidence", 0.5)):
        chk.fail("low_generation_confidence")
    chk.sensitive_topics = sensitive_topics_in(text, guidance)
    return chk, text
