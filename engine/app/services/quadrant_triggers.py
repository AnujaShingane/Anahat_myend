"""Configurable trigger rules for assessment-area (quadrant) recommendation.

Semantic similarity alone missed obvious cases (a patient form listing blood pressure, stress and
poor sleep recommended Nature / Lifestyle / Music but not Medical & Therapeutic Background).
These rules make the important links explicit and reviewable, then the recommender combines them
with semantic relevance and coverage (see QuestionService.recommend_quadrants).

A trigger is only a cue to ASK about an area. It is not evidence, it never maps to a chakra, and a
negated mention ("no blood pressure problem") does not fire.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "config" / "quadrant_triggers.json"
_NEGATION = re.compile(r"\b(?:no|not|never|without|denies|deny|denied|free of|none)\b(?:\W+\w+){0,3}\W*$", re.IGNORECASE)


@lru_cache(maxsize=1)
def load_rules() -> dict:
    try:
        return json.loads(_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"quadrants": {}, "baseline_rules": [], "max_recommended": 3}


def _fires(pattern: re.Pattern, text: str) -> bool:
    for m in pattern.finditer(text):
        before = text[max(0, m.start() - 40):m.start()]
        if not _NEGATION.search(before):
            return True
    return False


def trigger_hits(texts: list[tuple[str, str]], baseline: dict | None, rules: dict | None = None) -> dict:
    """texts: [(source_label, text)]. Returns {quadrant: {"score", "reasons", "triggers", "must_include"}}."""
    rules = rules or load_rules()
    hits: dict[str, dict] = {}

    def add(quadrant, trigger_id, reason, weight, source):
        spec = rules["quadrants"].get(quadrant, {})
        entry = hits.setdefault(quadrant, {"triggers": {}, "reasons": [], "must_include": bool(spec.get("must_include")),
                                           "priority": spec.get("priority", 50)})
        if trigger_id in entry["triggers"]:
            return
        entry["triggers"][trigger_id] = weight
        entry["reasons"].append(f"{reason} ({source})")

    for quadrant, spec in rules["quadrants"].items():
        for trig in spec.get("triggers", []):
            rx = re.compile(trig["pattern"], re.IGNORECASE)
            for source, text in texts:
                if text and _fires(rx, text):
                    add(quadrant, trig["id"], trig["reason"], float(trig.get("weight", 1.0)), source)
                    break
    for rule in rules.get("baseline_rules", []):
        value = (baseline or {}).get(rule["field"])
        if value in (None, ""):
            continue
        ok = False
        try:
            if rule["op"] == "in":
                ok = str(value).strip().lower() in rule["value"]
            elif rule["op"] == ">=":
                ok = float(value) >= rule["value"]
            elif rule["op"] == "<=":
                ok = float(value) <= rule["value"]
        except (TypeError, ValueError):
            ok = False
        if ok:
            for quadrant in rule["quadrants"]:
                add(quadrant, "baseline_" + rule["field"], rule["reason"], 0.75, "baseline ratings")
    for entry in hits.values():
        weights = sorted(entry["triggers"].values(), reverse=True)
        # the strongest trigger sets the level; each further independent trigger adds a little, capped
        entry["score"] = entry["priority"] * (weights[0] + 0.15 * min(2, len(weights) - 1) * weights[0])
    return hits
