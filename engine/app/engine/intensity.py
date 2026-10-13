"""Semantic intensity inference from the patient's own words.

Why this exists
---------------
The language model is asked to fill ``intensity`` only when the patient used a clear qualifier.
Small local models mostly return ``null`` unless the patient literally says "mild", "moderate" or
"severe", and the assessment then stopped to ask the therapist for something the patient had
already said ("I get really irritated ... if I get very upset I go to my room and stop talking to
anyone").

This module reads the patient's response the way a clinician would. It looks for:

* degree modifiers        ("a little", "quite", "really", "very", "extremely", "unbearable" ...)
* a stated number         ("7 out of 10")
* frequency               ("every day", "all the time" ... / "sometimes", "once in a while")
* duration                ("for hours", "for months" ...)
* behavioural / functional impact (withdrawing, not sleeping, arguing, crying, can't work ...)

and combines them into Mild / Moderate / Severe. It is deliberately conservative:

* It NEVER invents severity. With no usable cue it returns ``None`` and the caller asks the
  therapist (that is the only case where the "intensity not mentioned" question is shown).
* A single weak cue (for example only "sometimes") is not enough.
* Nothing here is tied to a particular patient sentence; the cue lists are the general vocabulary.

The function is pure (no I/O, no model call), so it is cheap to run on every answer and easy to
test. Word lists live in this file on purpose: they are clinical-language cues that a domain
reviewer may want to extend, and they are listed in the "requires validation" notes.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

MILD, MODERATE, SEVERE = "Mild", "Moderate", "Severe"

# ---------------------------------------------------------------------------------------------
# Cue vocabulary. Each entry is a regular expression fragment matched on lower-cased text.
# Scores are positions on a 1-3 scale: <1.5 Mild, <2.6 Moderate, otherwise Severe.
# ---------------------------------------------------------------------------------------------

# "not very", "not that bad", "not too" etc. turn a degree word into a minimiser.
_NEGATED_DEGREE = r"\bnot\s+(?:very|too|that|so|really|quite|extremely)\b"

_MINIMISERS = (
    r"a\s+little(?:\s+bit)?", r"a\s+bit", r"slightly", r"somewhat", r"mildly", r"mild\b",
    r"barely", r"hardly", r"just\s+a\s+(?:little|bit)", r"kind\s+of", r"sort\s+of", r"a\s+touch",
    r"minor", r"not\s+a\s+big\s+deal",
)
_MODERATE_CUES = (
    r"quite(?:\s+a\s+lot)?", r"pretty(?!\s+bad\b)", r"fairly", r"rather", r"really", r"so\s+(?:much|\w+ed|\w+ing)\b",
    r"noticeabl[ey]", r"considerabl[ey]", r"a\s+lot", r"moderate(?:ly)?", r"bothers?\s+me\s+(?:a\s+lot|often)",
    r"pretty\s+bad", r"quite\s+bad",
)
_STRONG_CUES = (
    r"very", r"extremely", r"terribl[ey]", r"severe(?:ly)?", r"intens(?:e|ely)", r"unbearabl[ey]?",
    r"overwhelm(?:ing|ed)", r"horribl[ey]", r"awful(?:ly)?", r"excruciating", r"worst", r"can'?t\s+(?:stand|take|bear|handle)",
    r"cannot\s+(?:stand|take|bear|handle)", r"too\s+much", r"completely", r"totally", r"absolutely",
    r"deeply", r"badly", r"desperate(?:ly)?", r"breaking\s+down", r"can'?t\s+function",
    r"unable\s+to\s+(?:function|work|cope)", r"out\s+of\s+control", r"all\s+the\s+time\s+and\s+(?:very|so)",
)

# Behavioural / functional impact: what the feeling or symptom makes the person do or stop doing.
_IMPACT_CUES = {
    "withdrawal": (r"(?:go|went|going|stay|stays|stayed|lock|locked)\s+(?:to\s+)?(?:in\s+)?(?:my|the)\s+room",
                   r"stop\s+talking", r"don'?t\s+(?:feel\s+like\s+)?talk", r"avoid(?:s|ing)?\s+(?:people|everyone|anyone|them)",
                   r"want\s+to\s+be\s+alone", r"shut\s+(?:myself|down)", r"withdraw", r"isolat",
                   r"cut\s+(?:myself\s+)?off"),
    "daily_function": (r"can'?t\s+(?:sleep|eat|work|focus|concentrate|study|function|get\s+out)",
                       r"unable\s+to\s+(?:sleep|eat|work|focus|concentrate|study)", r"couldn'?t\s+(?:sleep|eat|work|focus|concentrate)",
                       r"stop(?:ped)?\s+(?:eating|sleeping|working|going)", r"miss(?:ed|ing)?\s+(?:work|school|college|classes)",
                       r"affect(?:s|ed|ing)?\s+(?:my\s+)?(?:work|sleep|studies|relationships|daily|life)",
                       r"keeps?\s+(?:affecting|bothering)\s+me",
                       r"lose\s+(?:my\s+)?(?:appetite|sleep|interest)", r"no\s+(?:energy|appetite|motivation)"),
    "behavioural_escalation": (r"\barg(?:ue|ued|uing)\b", r"\bshout(?:ed|ing)?\b", r"\byell(?:ed|ing)?\b", r"\bscream(?:ed|ing)?\b",
                               r"\bcry(?:ing)?\b", r"\bcried\b", r"\bbreak(?:ing)?\s+(?:down|things)\b", r"\bthrow(?:ing)?\b",
                               r"\blose\s+(?:my\s+)?(?:temper|control)\b", r"\blash(?:ed|ing)?\s+out\b",
                               r"\bpanic(?:ked|king)?\b", r"\bshak(?:e|es|ing)\b"),
}
_FREQUENCY_HIGH = (r"all\s+the\s+time", r"every\s+(?:day|night|morning|evening|time)", r"daily", r"constant(?:ly)?",
                   r"again\s+and\s+again", r"over\s+and\s+over", r"non-?stop", r"always", r"most\s+(?:days|nights|of\s+the\s+time)",
                   r"several\s+times",
                   r"all\s+day", r"every\s+other", r"more\s+(?:easily|often|frequently)", r"more\s+than\s+(?:usual|before)")
# Spec section 4/16: "often" is a FREQUENCY word, not an intensity word. These habitual words are
# recorded in the basis for the audit trail but never count as a severity signal on their own.
_FREQUENCY_HABITUAL = (r"\boften\b", r"\busually\b", r"\bregularly\b", r"\bgenerally\b", r"\btend\s+to\b",
                       r"\bfrequently\b", r"\bmost\s+of\s+the\s+time\b")
_FREQUENCY_LOW = (r"sometimes", r"occasional(?:ly)?", r"once\s+in\s+a\s+while", r"rarely", r"now\s+and\s+then",
                  r"every\s+now\s+and\s+then", r"once\s+or\s+twice", r"on\s+and\s+off")
_DURATION_LONG = (r"for\s+(?:a\s+few\s+|several\s+|many\s+)?(?:hours|days|weeks|months|years)", r"since\s+(?:childhood|school|last|\w+\s+years?)",
                  r"\bfor\s+\d+\s*(?:hours?|days?|weeks?|months?|years?)", r"(?:long|many)\s+(?:time|hours)", r"takes?\s+(?:me\s+)?(?:\w+\s+){0,2}hours",
                  r"all\s+(?:night|day|week)", r"never\s+goes\s+away", r"won'?t\s+go\s+away")

_COMPILED = {
    "negated": re.compile(_NEGATED_DEGREE),
    "mild": re.compile(r"\b(?:" + "|".join(_MINIMISERS) + r")"),
    "moderate": re.compile(r"\b(?:" + "|".join(_MODERATE_CUES) + r")"),
    "strong": re.compile(r"\b(?:" + "|".join(_STRONG_CUES) + r")"),
    "freq_high": re.compile(r"(?:" + "|".join(_FREQUENCY_HIGH) + r")"),
    "freq_habitual": re.compile(r"(?:" + "|".join(_FREQUENCY_HABITUAL) + r")"),
    "freq_low": re.compile(r"\b(?:" + "|".join(_FREQUENCY_LOW) + r")\b"),
    "duration": re.compile(r"(?:" + "|".join(_DURATION_LONG) + r")"),
    "impact": {name: re.compile("(?:" + "|".join(parts) + ")") for name, parts in _IMPACT_CUES.items()},
}
_NUMBER = re.compile(r"\b(\d{1,2})\s*(?:/|out\s+of)\s*10\b")
_EXPLICIT = {"mild": MILD, "moderate": MODERATE, "severe": SEVERE}
_EXPLICIT_RE = re.compile(r"\b(mild|moderate|severe)(?:ly)?\b")


@dataclass
class IntensityInference:
    label: str | None
    score: float = 0.0
    basis: list[str] = field(default_factory=list)
    source: str = "none"          # explicit | semantic | none

    @property
    def found(self) -> bool:
        return self.label is not None


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").lower()
    text = text.replace("\u2019", "'").replace("\u2018", "'").replace("\u2026", "...")
    return re.sub(r"\s+", " ", text).strip()


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;])\s+|\.{2,}\s*|\n+", text)
    return [p.strip() for p in parts if p and p.strip()]


def _label(score: float) -> str:
    return MILD if score < 1.5 else MODERATE if score < 2.6 else SEVERE


def _local_index(sentences: list[str], quote: str | None, words: list[str]) -> int | None:
    """Which sentence holds the quoted words (falls back to the concept's own words)."""
    q = _norm(quote or "")
    if q:
        for i, s in enumerate(sentences):
            if q in s:
                return i
        # quote spans a sentence break: use the sentence holding its first words
        head = " ".join(q.split()[:3])
        for i, s in enumerate(sentences):
            if head and head in s:
                return i
    for w in words:
        w = _norm(w)
        if len(w) >= 4:
            stem = w[:max(4, len(w) - 2)]
            for i, s in enumerate(sentences):
                if stem in s:
                    return i
    return None


def _degree(sentence: str) -> tuple[float, str] | None:
    """Strongest degree cue inside one sentence, as (score, cue)."""
    best: tuple[float, str] | None = None

    def consider(score, cue):
        nonlocal best
        if best is None or score > best[0]:
            best = (score, cue)

    for m in _EXPLICIT_RE.finditer(sentence):
        word = m.group(1)
        consider({"mild": 1.0, "moderate": 2.0, "severe": 3.0}[word], word)
    neg = _COMPILED["negated"].search(sentence)
    if neg:
        consider(1.0, neg.group(0))
        sentence = sentence.replace(neg.group(0), " ")      # do not also read the "very" in "not very"
    m = _COMPILED["strong"].search(sentence)
    if m:
        consider(2.6, m.group(0))
    m = _COMPILED["moderate"].search(sentence)
    if m:
        consider(2.0, m.group(0))
    m = _COMPILED["mild"].search(sentence)
    if m and best is None:
        consider(1.0, m.group(0))
    return best


def infer_intensity(response_text: str, quote: str | None = None, concept: str | None = None,
                    extra_words: list[str] | None = None) -> IntensityInference:
    """Infer Mild / Moderate / Severe for ONE concept from the patient's full response.

    ``quote`` is the patient's own words for the concept (verbatim). The sentence that holds it is
    the main evidence; neighbouring sentences contribute only impact / frequency / duration cues and
    a weaker degree cue, because those describe the same episode while a stray "very" belongs to
    whatever it sits next to. Returns ``IntensityInference(label=None)`` when the response gives no
    usable cue: the caller must then ask rather than guess."""
    text = _norm(response_text)
    if not text:
        return IntensityInference(None)
    sentences = _sentences(text)
    words = [w for w in [concept, *(extra_words or [])] if w]
    idx = _local_index(sentences, quote, words)
    if idx is None:
        # The concept's words could not be located: only trust the response if it is one short
        # statement; otherwise we cannot tell which symptom a modifier belongs to.
        if len(sentences) > 2:
            return IntensityInference(None)
        idx = 0
    local = sentences[idx]
    near = [sentences[j] for j in (idx - 1, idx + 1) if 0 <= j < len(sentences)]

    basis: list[str] = []

    # 1. a stated number ("7 out of 10") is as direct as the patient can be
    for s in [local, *near]:
        nm = _NUMBER.search(s)
        if nm:
            n = int(nm.group(1))
            if 0 <= n <= 10:
                label = SEVERE if n >= 7 else MODERATE if n >= 4 else MILD
                return IntensityInference(label, float(n), [f"stated number {n}/10"], "explicit")

    # 2. degree modifiers
    score: float | None = None
    deg = _degree(local)
    if deg:
        score = deg[0]
        basis.append(f"degree word '{deg[1]}'")
    else:
        nearby: tuple[float, str] | None = None
        for s in near:
            d = _degree(s)
            if d and (nearby is None or d[0] > nearby[0]):
                nearby = d
        if nearby:
            score = max(1.0, nearby[0] - 0.5)         # weaker: it sits next to, not in, the statement
            basis.append(f"nearby degree word '{nearby[1]}'")
    explicit = bool(deg and deg[1] in _EXPLICIT)

    # 3. impact / frequency / duration, read from the statement and its neighbours
    scope = " ".join([local, *near])
    support = 0.0
    signals = 0
    impacts = [name for name, rx in _COMPILED["impact"].items() if rx.search(scope)]
    if impacts:
        signals += len(impacts)
        support += 0.25 * min(2, len(impacts))
        basis.append("impact: " + ", ".join(i.replace("_", " ") for i in impacts))
    hi = _COMPILED["freq_high"].search(scope)
    lo = _COMPILED["freq_low"].search(scope)
    if hi:
        signals += 1
        support += 0.25
        basis.append(f"frequency '{hi.group(0)}'")
    elif lo:
        support -= 0.5                 # only lowers: "sometimes" alone never establishes severity
        basis.append(f"frequency '{lo.group(0)}'")
    else:
        habitual = _COMPILED["freq_habitual"].search(scope)
        if habitual:
            # frequency is not intensity: noted for the audit trail, adds no signal and no support
            basis.append(f"habitual frequency word '{habitual.group(0)}' (not an intensity cue)")
    dur = _COMPILED["duration"].search(scope)
    if dur:
        signals += 1
        support += 0.25
        basis.append(f"duration '{dur.group(0)}'")

    # 4. decide. A degree word is a usable cue on its own. Without one, two independent
    #    supporting signals are needed; a single weak hint is not enough to call it.
    if score is None:
        if signals < 2:
            return IntensityInference(None)
        score = 1.5 + max(0.0, support) * 2      # no degree word: middle band, moved up by impact / frequency / duration
    else:
        # a degree word sets the level; supporting cues may nudge it by at most half a step
        score = score + (0.0 if explicit else max(-0.5, min(0.5, support)))
    score = max(1.0, min(3.0, score))
    return IntensityInference(_label(score), round(score, 2), basis, "explicit" if explicit else "semantic")
