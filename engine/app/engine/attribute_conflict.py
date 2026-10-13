"""Detects when a later statement contradicts an earlier one about the SAME problem
(ANAHAT scoring spec section 6): frequency, duration, intensity.

Purely deterministic and conservative: a value is compared only when BOTH statements can be
placed on the same scale. Anything that cannot be placed is NOT treated as a conflict (the engine
never guesses). Nothing here overwrites a stored answer; callers keep both statements.
"""
from __future__ import annotations

import re

_NUM = {"a": 1, "an": 1, "one": 1, "two": 2, "couple": 2, "three": 3, "few": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "several": 4}

# frequency scale: events per week (approximate, only used to compare two statements)
_FREQ_PATTERNS = [
    (7.0, r"\b(every|each)\s+(single\s+)?(day|night|evening|morning)\b|\bdaily\b|\bnightly\b|\ball\s+the\s+time\b"
          r"|\bconstant(ly)?\b|\bcontinuous(ly)?\b|\balways\b|\bnon[- ]?stop\b|\bevery\s+day\b"),
    (0.7, r"\b(once|twice)\s+(a|per|every)\s+month\b|\bmonthly\b|\brare(ly)?\b|\bonce\s+in\s+a\s+while\b"
           r"|\bhardly\s+ever\b|\bseldom\b"),
]
_PER_WEEK = re.compile(r"\b(?P<n>a|an|one|two|couple(?:\s+of)?|three|few|four|five|six|seven|several|\d+)\s*"
                       r"(?:or\s+\w+\s+)?(?:times?\s+|nights?\s+|days?\s+|evenings?\s+)?"
                       r"(?:a|per|each|every|in\s+a)\s+week\b")
_PER_MONTH = re.compile(r"\b(?P<n>a|an|one|two|couple(?:\s+of)?|three|few|four|\d+)\s*(?:times?\s+)?"
                        r"(?:a|per|each|every|in\s+a)\s+month\b")
_SOMETIMES = re.compile(r"\b(sometimes|occasional(ly)?|now\s+and\s+then|from\s+time\s+to\s+time|on\s+and\s+off)\b")

_DUR = re.compile(r"\b(?P<n>a|an|one|two|couple(?:\s+of)?|three|few|four|five|six|seven|eight|nine|ten|several|\d+)\s*"
                  r"(?P<u>day|week|month|year)s?\b")
_DUR_WORDS = [(3650, r"\bsince\s+(childhood|i\s+was\s+(a\s+)?(child|kid|young))\b|\ball\s+my\s+life\b|\bfor\s+decades\b")]
_UNIT_DAYS = {"day": 1, "week": 7, "month": 30, "year": 365}
_INTENSITY_ORDER = {"mild": 1, "moderate": 2, "severe": 3}


def _num(token: str) -> float:
    token = re.sub(r"\s+of$", "", (token or "").strip().lower())
    token = token.split()[0] if token else token
    if token.isdigit():
        return float(token)
    return float(_NUM.get(token, 0))


def frequency_per_week(text: str | None) -> float | None:
    """Rough events/week, or None when the wording cannot be placed on the scale."""
    t = (text or "").lower()
    if not t.strip():
        return None
    m = _PER_WEEK.search(t)
    if m and _num(m.group("n")):
        return min(7.0, _num(m.group("n")))
    m = _PER_MONTH.search(t)
    if m and _num(m.group("n")):
        return _num(m.group("n")) / 4.3
    for value, pattern in _FREQ_PATTERNS:
        if re.search(pattern, t):
            return value
    if _SOMETIMES.search(t):
        return 1.5
    return None


def duration_days(text: str | None) -> float | None:
    t = (text or "").lower()
    if not t.strip():
        return None
    for days, pattern in _DUR_WORDS:
        if re.search(pattern, t):
            return float(days)
    m = _DUR.search(t)
    if m and _num(m.group("n")):
        return _num(m.group("n")) * _UNIT_DAYS[m.group("u")]
    if re.search(r"\b(for\s+)?years\b", t):
        return 730.0
    return None


def frequency_conflict(old: str | None, new: str | None) -> bool:
    """True when the two statements land on clearly different frequencies (a factor of 2.5+)."""
    a, b = frequency_per_week(old), frequency_per_week(new)
    if a is None or b is None:
        return False
    return max(a, b) / max(min(a, b), 0.01) >= 2.5


def duration_conflict(old: str | None, new: str | None) -> bool:
    a, b = duration_days(old), duration_days(new)
    if a is None or b is None:
        return False
    return max(a, b) / max(min(a, b), 0.01) >= 3.0


def intensity_conflict(old: str | None, old_source: str | None, new: str | None, new_source: str | None) -> bool:
    """Only two EXPLICIT patient statements can conflict; inferred, baseline and therapist values never do."""
    if old_source != "patient_words" or new_source != "patient_words":
        return False
    a, b = _INTENSITY_ORDER.get((old or "").lower()), _INTENSITY_ORDER.get((new or "").lower())
    return bool(a and b and a != b)


def clarification_question(term: str, attribute: str, earlier: str, later: str) -> str:
    """Polite wording from spec section 6. Quotes the patient's own two statements."""
    label = {"frequency": "how often it happens", "duration": "how long it has been going on",
             "intensity": "how strong it is", "currentness": "whether it is happening now",
             "presence": "whether you have it"}.get(attribute, attribute)
    return (f'Just to make sure I have this right about {term}: you mentioned earlier "{earlier}", '
            f'but later said "{later}". Could you clarify which better describes your current experience '
            f'({label})?')
