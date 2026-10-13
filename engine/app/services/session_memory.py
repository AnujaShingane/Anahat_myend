"""Structured session memory for the adaptive question generator.

Before every question the generator is given an up-to-date, SMALL summary of what is known, what
has been explored and what is still unknown. It is built only from what the patient / therapist
actually provided:

  * facts          - positive, current concepts with the patient's own words (never invented)
  * disclosed_causes - causes / reasons / fears the patient themselves put into words
  * dimensions     - for each main concern: which details are known and which are still unknown
  * topics_explored / not_yet_asked - assessment areas touched so far versus relevant but untouched
  * unresolved     - indicators that are only provisional or awaiting clarification
  * goals          - what the patient said they want to change

An unexplored topic is reported as UNKNOWN, never as absent. A question being asked creates no
evidence: only the patient's later answer can.
"""
from __future__ import annotations

import re

from app.core.enums import EvidenceStatus

_DIMENSIONS = ("context", "trigger", "frequency", "duration", "daily_impact", "coping")
_FIELD = {"context": "context", "trigger": "trigger", "frequency": "frequency", "duration": "duration",
          "daily_impact": "impact", "coping": "coping"}
# cue phrases that show the patient is giving a reason, fear or barrier in their own words
_REASON_CUES = re.compile(
    r"\b(?:because|since|due to|as a result of|that is why|that's why|so that|don'?t want to|do not want to|afraid (?:of|that)|"
    r"scared (?:of|that)|worried (?:that|about)|fear(?:s|ed)?|so i keep|keep (?:it|them|my \w+) to myself|"
    r"don'?t feel (?:understood|heard)|no one (?:understands|listens)|pressure from|after (?:my|the|i))\b", re.IGNORECASE)
_GOAL_CUES = re.compile(r"\b(?:i (?:want|would like|wish|hope|need) to [^.;]{3,80}|i(?:'d| would) like [^.;]{3,80})", re.IGNORECASE)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text or "") if s.strip()]


def build_session_memory(ctx, quadrant: str | None = None, max_items: int = 8) -> dict:
    state = ctx.patient_state
    live = [e for e in ctx.evidence
            if not e.superseded and not e.twin_of and e.status not in {EvidenceStatus.NEGATIVE, EvidenceStatus.HISTORICAL}]
    facts, unresolved, dims = [], [], {}
    for ev in live:
        if len(facts) < max_items:
            facts.append({"patient_words": (ev.quote or ev.indicator_term or "")[:140], "recognised_as": ev.indicator_term})
        if ev.status in {EvidenceStatus.PROVISIONAL, EvidenceStatus.UNRESOLVED}:
            unresolved.append(ev.indicator_term)
        known = [d for d in _DIMENSIONS if getattr(ev, _FIELD[d], None)]
        dims[ev.indicator_term] = {"known": known, "unknown": [d for d in _DIMENSIONS if d not in known],
                                   "intensity": "known" if ev.intensity else "unknown"}
    dims = dict(list(dims.items())[:max_items])

    causes, goals = [], []
    for r in ctx.responses:
        for sent in _sentences(r.raw_text):
            if _REASON_CUES.search(sent) and sent[:160] not in causes:
                causes.append(sent[:160])
            for g in _GOAL_CUES.findall(sent):
                goals.append(g.strip()[:100])
    for ev in live:
        for val in (ev.trigger, ev.context):
            if val and str(val)[:120] not in causes:
                causes.append(str(val)[:120])

    explored = sorted(name for name, st in (ctx.quadrants or {}).items() if st.get("response_ids"))
    recommended = [r.get("quadrant") for r in (state.get("selected_quadrants") or []) if isinstance(r, dict)]
    return {
        "patient_reported_facts": facts,
        "disclosed_causes_or_reasons": causes[-max_items:],
        "details_known_vs_unknown": dims,
        "areas_explored": explored,
        "relevant_areas_not_yet_asked": [q for q in recommended if q and q not in explored],
        "still_unresolved": list(dict.fromkeys(unresolved))[:max_items],
        "patient_goals": list(dict.fromkeys(goals))[:4],
        "note": "Anything not listed is UNKNOWN, not absent. Do not repeat what the patient already said clearly.",
    }


def reason_to_explore(latest_text: str | None) -> str | None:
    """The patient's own reason / fear / barrier in the latest answer, if any (to follow up on exact words)."""
    for sent in _sentences(latest_text or ""):
        if _REASON_CUES.search(sent):
            return sent[:160]
    return None
