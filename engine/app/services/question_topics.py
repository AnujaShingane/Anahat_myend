"""Keeps every question in the quadrant it belongs to.

The KB question-bank files are used as they are (hash-verified, never edited), but a few contain
lines that are not about the file's own subject: for example `future_plans.md` (served under
Profession) continues with a general intake list (appetite, sleep, exercise, family, therapy) and
`profession.md` contains lifestyle questions. Without a check those surface under the wrong
quadrant ("Profession -> Are you eating more or less than usual?").

`question_fits(quadrant, text, alignment)` is the runtime guard:
  1. A question that is clearly about ANOTHER quadrant's subject is rejected here.
  2. A bank borrowed from another subject (future_plans for Profession) must also show a
     positive link to the quadrant's own subject.
  3. Follow-up fragments ("If so, how has it changed...?", "How do you do that?") are merged into
     the question before them by `merge_follow_up_fragments`; an orphan fragment is dropped,
     because the therapist cannot ask it without its first half.

Word lists are plain regular expressions so a domain reviewer can extend them. They are
vocabulary cues, not clinical rules. `audit_question_bank()` prints/returns what the guard does to
every KB line, and a test asserts that no accepted question belongs to a different quadrant.
"""
from __future__ import annotations

import re

_TOPICS = {
    "Diet": r"\b(appetite|eat|eating|ate|meals?|food|foods|diet|dietary|water|drink|cravings?|vegetarian|vegan|snack\w*|hydrat\w*|fluid)\b",
    "Lifestyle": r"\b(sleep\w*|insomnia|routine|unwind\w*|self-care|household|work-life|screen time|technology|daily (?:life|practices|activities)|day-to-day|stress management|healthy (?:habits|lifestyle))\b",
    "Physical Nature": r"\b(exercis\w*|fitness|workout|gym|walking|running|yoga|body|pain|physical|health concerns?|check-?ups?|weight|digestion)\b",
    "Family": r"\b(family|families|parents|siblings?|spouse|children|home atmosphere|intimate|partner|marriage|upbringing)\b",
    "Social Circle": r"\b(friends?|friendships?|social media|support system|social circle|supportive|where do you go for support|network of)\b",
    "Medical & Therapeutic Background": r"\b(medication|medical|diagnos\w*|therapy|therapies|treatment|counsel\w*|psychiatr\w*|psycholog\w*|mental health|illness|allerg\w*|chronic|support group)\b",
    "Music Therapy Profile": r"\b(music|musical|instruments?|songs?|raga|raag|listen\w*|lyrics|melody|rhythm|chanting)\b",
    "Profession": r"\b(work|working|job|jobs|career|professional\w*|profession|colleagues?|workplace|deadlines?|workload|office|studies|school|projects?|manag\w+ a team)\b",
    "Personal Interests": r"\b(hobb(?:y|ies)|free time|reading|books?|creative|painting|travel\w*|learning|courses|spiritual|religious|meditation|prayer|gardening)\b",
    "Nature": r"\b(introvert|extrovert|optimis\w*|risk|forgive\w*|memory|leader\w*|personality|temperament)\b",
}
_TOPIC_RX = {name: re.compile(rx, re.IGNORECASE) for name, rx in _TOPICS.items()}

# Subjects that a quadrant legitimately shares with another one, so they are not "off topic".
_ALSO_OK = {
    "Nature": {"Lifestyle", "Personal Interests", "Family", "Social Circle", "Profession"},  # emotions / thoughts / beliefs banks are general
    "Lifestyle": {"Diet", "Physical Nature", "Personal Interests", "Profession"},  # healthy_habits spans these
    "Physical Nature": {"Medical & Therapeutic Background", "Family"},   # "family history of health conditions"
    "Medical & Therapeutic Background": {"Physical Nature"},
    "Family": {"Social Circle"},
    "Social Circle": {"Family", "Personal Interests"},
    "Personal Interests": {"Music Therapy Profile"},
    "Music Therapy Profile": {"Personal Interests", "Medical & Therapeutic Background"},
}

# A bank that belongs to another subject but is served under this quadrant must show a positive link.
_BORROWED_NEEDS_LINK = {
    ("Profession", "future_plans"): re.compile(
        r"\b(future|goals?|plans?|objectives?|long-term|short-term|career|work|job|professional\w*|ambition\w*|success|fulfil\w*|"
        r"purpose|uncertain\w*|school|studies)\b", re.IGNORECASE),
}

_FRAGMENT_START = re.compile(r"^\s*(?:if\s+(?:so|yes|not|no)\b|and\b|also\b|then\b|why\?|how\s+do\s+you\s+do\s+that\b|"
                             r"how\s+is\s+that\b|how\s+often\s+are\s+you\s+in\s+touch\s+with\s+them\b)", re.IGNORECASE)


def is_fragment(line: str) -> bool:
    t = (line or "").strip()
    return bool(_FRAGMENT_START.match(t)) or len(re.findall(r"[A-Za-z']+", t)) < 4


def merge_follow_up_fragments(lines: list[str]) -> list[str]:
    """Join 'If so, ...' style fragments to the question before them; drop orphans."""
    out: list[str] = []
    for raw in lines:
        line = (raw or "").strip()
        if not line:
            continue
        if is_fragment(line):
            if out and not is_fragment(out[-1].split("? ")[0]) and "? " not in out[-1]:
                out[-1] = f"{out[-1].rstrip()} {line}"
            continue                      # orphan fragment: not askable on its own
        out.append(line)
    return out


def topics_of(text: str) -> set[str]:
    return {name for name, rx in _TOPIC_RX.items() if rx.search(text or "")}


def question_fits(quadrant: str, text: str, alignment: str | None = None) -> tuple[bool, str | None]:
    topics = topics_of(text)
    allowed = {quadrant} | _ALSO_OK.get(quadrant, set())
    if topics and not (topics & allowed):
        return False, "off_topic_for_quadrant:" + ",".join(sorted(topics))
    # a question whose strongest signal is another subject, with only an incidental own-subject word
    if topics and quadrant not in topics:
        others = topics - {quadrant}
        if others and not (others <= allowed):
            return False, "off_topic_for_quadrant:" + ",".join(sorted(others))
    link = _BORROWED_NEEDS_LINK.get((quadrant, alignment or ""))
    if link is not None and not link.search(text or ""):
        return False, f"borrowed_bank_without_link:{alignment}"
    if is_fragment(text):
        return False, "fragment_without_parent"
    return True, None


def audit_question_bank(kb_dir, alignments_by_quadrant) -> dict:
    """What the guard does to every line of every KB question file (used by the tests and by
    scripts/audit_question_mapping.py)."""
    from pathlib import Path
    report = {}
    for quadrant, aligns in alignments_by_quadrant.items():
        accepted, rejected = [], []
        for al in sorted(aligns):
            path = Path(kb_dir) / f"{al}.md"
            if not path.exists():
                continue
            lines = [re.sub(r"^\s*[-*]\s*", "", ln).strip() for ln in path.read_text(encoding="utf-8").splitlines()
                     if ln.strip().startswith(("-", "*"))]
            for line in merge_follow_up_fragments(lines):
                if "?" not in line:
                    continue
                ok, why = question_fits(quadrant, line, al)
                (accepted if ok else rejected).append({"bank": al, "question": line, "reason": why})
        report[quadrant] = {"accepted": accepted, "rejected": rejected}
    return report
