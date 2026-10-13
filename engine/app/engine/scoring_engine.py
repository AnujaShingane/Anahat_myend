"""Deterministic chakra scoring. NO LLM is involved anywhere in this module.

Implements ANAHAT_Finalized_Scoring_Rules_Final.docx (numeric rules: config/scoring_rules.json).

Pipeline per chakra:
  evidence -> KB association (chakra / state / strength) -> unit contribution
  (strength x intensity x reliability) -> collapse correlated / semantically equivalent evidence into
  independent groups -> diminishing returns (strongest first) -> OVERALL evidence score
  -> Step 4 bands (Balanced / Not assessed properly / Imbalanced Mild-Moderate-Severe)
  -> direction (Deficient / Excess / Direction unclear) -> ranking (most affected first).

Four questions, kept separate (spec section 1):
  overall score  -> Balanced / Imbalanced + Mild / Moderate / Severe   (spec section 2)
  directional    -> Deficient / Excess / Direction unclear              (spec sections 7, 10)
  severity       -> comes from the overall score band only
  confidence     -> reliability of the conclusion; never a gate         (spec section 13)

Rules enforced here (each has a test in tests/unit/test_scoring_finalized_rules.py):
  * Overall bands: < 0.40 Balanced (suggested quadrants complete) or Not assessed properly (not
    complete); 0.40-<0.55 Mild; 0.55-<0.75 Moderate; >= 0.75 Severe. 0.70 is NOT an imbalance threshold.
  * Unit contribution = strength x intensity x reliability. Reliability: Confirmed / Resolved After
    Clarification 1.0, Provisional 0.4, Unresolved 0.1, Historical 0.1.
  * Same underlying problem = ONE evidence group (canonical term, same extracted signal, or a curated
    correlation cluster), grouped BEFORE diminishing returns.
  * Diminishing returns: groups ordered strongest first, multiplier(n) = 0.70^(n-1) (configurable;
    the stepped 1/.75/.5/.25 curve is available). Overall: new = old + (1-old) * c * m(n).
    Directional support: c1*m1 + c2*m2 + ...  (not a majority vote).
  * Direction: only Deficient >= 0.20 -> Deficient; only Excess >= 0.20 -> Excess; both -> the stronger
    one must be >= 1.20x the weaker, otherwise Conflicted. The old 0.10 conflict margin is removed.
  * No extra gate (0.45 / 60% confidence / 2 units, or a "firm evidence" rule) sits on top of Step 4.
  * Negative / historical / superseded evidence never adds to a score. Unresolved contradictions are
    scored at the Unresolved weight only and never establish an imbalance or a direction.
  * Missing intensity is never invented as Moderate: it is counted as Mild (never 0), listed as a
    pending detail and asked about.
  * Source states that are not exactly Deficient/Excess ("Either", "Varies", "Excess to Deficient"...)
    add PRESENCE only and are never reinterpreted into a direction.
  * All numeric values are ENGINEERING BASELINES, configurable, clinically_validated = False.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from pathlib import Path

from app.core.enums import EvidenceStatus
from app.knowledge.indicator_repository import IndicatorRepository
from app.models.chakra import ChakraReport, ChakraResult, TraceItem

DEFAULT_STRENGTH = {"Strong": 1.0, "Medium": 0.6, "Weak": 0.3}
DEFAULT_INTENSITY = {"Mild": 0.4, "Moderate": 0.7, "Severe": 1.0}
DEFAULT_RELIABILITY = {"Confirmed": 1.0, "Resolved After Clarification": 1.0, "Provisional": 0.4,
                       "Unresolved": 0.1, "Historical": 0.1, "NEGATIVE": 0.1}
DEFAULT_CONFIDENCE_WEIGHTS = {"coverage": 0.30, "consistency": 0.30, "resolution": 0.25, "completeness": 0.15}
DEFAULT_BANDS = {"balanced_below": 0.40, "mild_below": 0.55, "moderate_below": 0.75}
DEFAULT_DIMINISHING = {"curve": "geometric", "geometric_base": 0.70,
                       "stepped_multipliers": [1.0, 0.75, 0.5, 0.25], "stepped_floor": 0.25}
DIRECTIONS = ("Deficient", "Excess")

STATUS_LABELS = {
    "BALANCED": "Balanced",
    "IMBALANCED_DEFICIENT": "Imbalanced — Deficient",
    "IMBALANCED_EXCESS": "Imbalanced — Excess",
    "IMBALANCED_DIRECTION_UNRESOLVED": "Imbalanced — Direction unclear",
    "CONFLICTED": "Imbalanced — Direction unclear / conflicted",
    "UNRESOLVED": "Not assessed properly",
}
IMBALANCED_STATUSES = ("IMBALANCED_DEFICIENT", "IMBALANCED_EXCESS", "IMBALANCED_DIRECTION_UNRESOLVED", "CONFLICTED")


def _load_rules(path) -> dict:
    """config/scoring_rules.json (spec values). Missing or unreadable -> built-in spec defaults."""
    candidates = [Path(path)] if path else []
    candidates.append(Path(__file__).resolve().parents[2] / "config" / "scoring_rules.json")
    for c in candidates:
        try:
            return json.loads(c.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
    return {}


def is_imbalanced(status: str) -> bool:
    return str(status or "") in IMBALANCED_STATUSES


def confidence_label(pct: float, high_from: float = 80, moderate_from: float = 60) -> str:
    return "High" if pct >= high_from else "Moderate" if pct >= moderate_from else "Low"


class ScoringEngine:
    def __init__(self, kb):
        from app.core.config import settings
        cfg = kb.scoring_config or {}
        rules = _load_rules(getattr(settings, "scoring_rules_path", None))
        self.rules = rules
        self.kb = kb
        # finalized spec values (config/scoring_rules.json) win over the KB's older proposed config
        self.strength = {**DEFAULT_STRENGTH, **cfg.get("strength_weights", {}), **rules.get("strength_weights", {})}
        self.intensity = {**DEFAULT_INTENSITY, **cfg.get("intensity_weights", {}), **rules.get("intensity_weights", {})}
        self.reliability = {**DEFAULT_RELIABILITY, **cfg.get("reliability_weights", {}),
                            **rules.get("reliability_weights", {})}
        self.conf_weights = ((rules.get("confidence") or {}).get("weights")
                             or (cfg.get("confidence") or {}).get("weights") or DEFAULT_CONFIDENCE_WEIGHTS)
        self.conf_labels = (rules.get("confidence") or {}).get("labels") or {"high_from": 80, "moderate_from": 60}
        direction = {**cfg.get("direction", {}), **rules.get("direction", {})}
        self.meaningful_threshold = float(direction.get("meaningful_threshold", 0.2))
        self.dominance_ratio = float(direction.get("dominance_ratio", 1.20))
        # Spec section 11: the overall band, not a directional gate, decides imbalance.
        self.bands = {**DEFAULT_BANDS, **rules.get("overall_bands", {})}
        self.imbalance_threshold = float(self.bands["balanced_below"])
        self.dr = {**DEFAULT_DIMINISHING, **rules.get("diminishing_returns", {})}
        agg = rules.get("aggregation") or {}
        self.overall_mode = agg.get("overall", "noisy_or_discounted")
        self.directional_mode = agg.get("directional", "weighted_sum")
        self.high_priority_single = float((rules.get("high_priority_single") or {}).get(
            "min_contribution", getattr(settings, "high_priority_single_score", 0.70)))
        self.insufficient_score_threshold = float(settings.insufficient_score_threshold)
        self.balanced_min_quadrants = int(settings.balanced_min_assessed_quadrants)
        self.completion_basis = getattr(settings, "quadrant_completion_basis", "suggested_and_selected")
        self.require_firm = bool(getattr(settings, "require_firm_evidence_for_direction", False))
        self.provisional_alone = bool(getattr(settings, "provisional_alone_can_establish_imbalance", True))
        # Legacy switches (OFF by default: the finalized spec scores Unresolved at 0.1).
        self.score_unresolved_as_provisional = bool(getattr(settings, "score_unresolved_as_provisional", False))
        # Intensity is NEVER scored as 0 and never silently Moderate. When the patient did not state
        # it (and the therapist has not clarified it yet) the evidence counts as Mild and is listed
        # as a pending detail.
        self.mild_weight = float(self.intensity.get("Mild", DEFAULT_INTENSITY["Mild"]))
        self.unstated_intensity_weight = max(
            float(getattr(settings, "unstated_intensity_weight", self.mild_weight) or 0.0), self.mild_weight)
        self.provisional_weight = float(self.reliability.get("Provisional", DEFAULT_RELIABILITY["Provisional"]))
        self.unresolved_weight = float(self.reliability.get("Unresolved", DEFAULT_RELIABILITY["Unresolved"]))
        self.confirmed_weight = float(self.reliability.get("Confirmed", DEFAULT_RELIABILITY["Confirmed"]))
        self.resolve_by_corroboration = bool(getattr(settings, "resolve_ambiguity_by_corroboration", False))
        self.intensity_from_baseline = bool(getattr(settings, "intensity_from_baseline", True))
        self.repo = IndicatorRepository(kb)
        self.chakras = kb.chakra_names
        self.n_quadrants = max(1, len(getattr(kb, "quadrants", []) or []) or 10)

    # ------------------------------------------------------------------ helpers
    def _reliability_weight(self, status_value: str) -> float:
        for key in (status_value, status_value.replace("_", " ").title()):
            if key in self.reliability:
                return float(self.reliability[key])
        return float(DEFAULT_RELIABILITY.get(status_value, 0.1))

    @staticmethod
    def _combine(values):
        """Plain noisy-OR (no discount); only used by the optional corroboration helper."""
        combined = 0.0
        for value in sorted(values, reverse=True):
            combined += value * (1 - combined)
        return combined

    def multiplier(self, n: int) -> float:
        """Diminishing-return multiplier for the n-th independent group (1-based), strongest first.
        geometric: base^(n-1) (spec section 18: 1, .70, .49, .343, .240, .168 ...)
        stepped  : 1, .75, .5, .25, then the .25 floor (spec section 8 wording)."""
        n = max(1, int(n))
        if str(self.dr.get("curve")) == "stepped":
            steps = list(self.dr.get("stepped_multipliers") or [1.0, 0.75, 0.5, 0.25])
            floor = float(self.dr.get("stepped_floor", 0.25))
            return float(steps[n - 1]) if n <= len(steps) else floor
        return float(self.dr.get("geometric_base", 0.70)) ** (n - 1)

    def _discounted(self, values):
        """[(group contribution c_i, multiplier m_i, effective c_i*m_i)] strongest first."""
        ordered = sorted((v for v in values if v > 0), reverse=True)
        return [(c, self.multiplier(i + 1), c * self.multiplier(i + 1)) for i, c in enumerate(ordered)]

    def _aggregate_overall(self, values) -> float:
        """Spec section 3: new = old + (1 - old) * contribution, applied to the diminishing-returns
        weighted group contributions (bounded in [0, 1])."""
        if self.overall_mode == "noisy_or":      # no discount
            effective = sorted((v for v in values if v > 0), reverse=True)
        else:
            effective = [e for _, _, e in self._discounted(values)]
        score = 0.0
        for e in effective:
            score += (1 - score) * e
        return min(1.0, score)

    def _aggregate_directional(self, values) -> float:
        """Spec section 8: directional support = c1*m1 + c2*m2 + ... (a weighted sum, NOT a vote)."""
        if self.directional_mode == "noisy_or_discounted":
            score = 0.0
            for _, _, e in self._discounted(values):
                score += (1 - score) * e
            return score
        return sum(e for _, _, e in self._discounted(values))

    def band(self, score: float) -> str:
        """Severity label from the OVERALL evidence score (spec section 2)."""
        if score < self.bands["balanced_below"]:
            return "minimal"
        if score < self.bands["mild_below"]:
            return "mild"
        if score < self.bands["moderate_below"]:
            return "moderate"
        return "severe"

    def completion(self, suggested, completed, n_assessed) -> dict:
        """Spec Step 4: were the suggested quadrants completed?  Falls back to the minimum number of
        assessed quadrants only when nothing was suggested or selected (e.g. a bare scorer call)."""
        required = sorted(set(suggested or []))
        done = set(completed or [])
        pending = [q for q in required if q not in done]
        if suggested is None and completed is None:
            complete = n_assessed >= self.balanced_min_quadrants
            basis = "assessed_quadrant_minimum"
        elif not required:
            complete = n_assessed >= self.balanced_min_quadrants
            basis = "assessed_quadrant_minimum (no suggested or selected quadrants)"
        else:
            complete = not pending
            basis = self.completion_basis
        return {"complete": bool(complete), "required": required, "completed": sorted(done & set(required)) if required else sorted(done),
                "pending": pending, "basis": basis}

    @staticmethod
    def _kind(ev) -> str:
        if getattr(ev, "superseded", False):
            return "superseded"
        if ev.polarity == "negative" or ev.status == EvidenceStatus.NEGATIVE:
            return "negative"
        if ev.currentness == "historical" or ev.status == EvidenceStatus.HISTORICAL:
            return "historical"
        if ev.polarity == "positive" and ev.currentness == "current":
            return "scorable"
        return "unscored"          # neutral/uncertain polarity or unknown currentness

    def _associations(self, ev, chakra):
        """KB records for this evidence + chakra. All associations are kept; a therapist
        clarification (Resolved After Clarification) is the only thing that narrows them."""
        records = [i for i in self.repo.get_by_id(ev.canonical_indicator_id) if i.chakra == chakra]
        if ev.status == EvidenceStatus.RESOLVED_AFTER_CLARIFICATION and ev.selected_chakra:
            records = [i for i in records if i.chakra == ev.selected_chakra]
        return records

    # Baseline construct -> (KB term keyword, rating -> intensity). Only the patient's own
    # self-rating of the SAME construct is used; nothing is inferred across constructs.
    @staticmethod
    def _baseline_intensity(term: str | None, baseline: dict | None):
        if not baseline or not term:
            return None, None
        t = (term or "").lower()

        def scale(value, inverted=False):
            try:
                v = round(float(value))
            except (TypeError, ValueError):
                return None
            if not 1 <= v <= 10:
                return None
            if inverted:
                v = 11 - v
            return "Severe" if v >= 7 else "Moderate" if v >= 4 else "Mild"

        if "anxiety" in t and baseline.get("anxiety") is not None:
            return scale(baseline["anxiety"]), f"baseline anxiety {baseline['anxiety']}/10"
        if "fatigue" in t and baseline.get("energy") is not None:
            level = scale(baseline["energy"], inverted=True)
            return (level if level != "Mild" else None), f"baseline energy {baseline['energy']}/10"
        if "insomnia" in t and baseline.get("sleep_quality"):
            level = {"poor": "Moderate", "fair": "Mild"}.get(str(baseline["sleep_quality"]).lower())
            return level, f"baseline sleep quality {baseline['sleep_quality']}"
        return None, None

    def _build_groups(self, evidence) -> dict[str, str]:
        """One group per underlying observation for the WHOLE session. Two records are the same
        observation when they share the extracted patient signal (alternative KB matches of one
        statement) OR the same canonical KB term (the same indicator repeated in later answers,
        or KB twin entries). Repetition is never counted as new, independent evidence."""
        parent: dict[str, str] = {}

        def find(x):
            parent.setdefault(x, x)
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[max(ra, rb)] = min(ra, rb)

        for ev in evidence:
            node = f"ev:{ev.evidence_id}"
            union(node, self.repo.group_key(ev.canonical_indicator_id))
            cluster = getattr(self.repo, "correlation_cluster", lambda _i: None)(ev.canonical_indicator_id)
            if cluster:
                # different KB terms naming the SAME underlying problem (spec section 5)
                union(node, cluster)
            if ev.correlation_group and ev.correlation_group.startswith("signal:"):
                # alternative KB matches of ONE statement: linked only within the same answer
                union(node, f"{ev.response_id}|{ev.correlation_group}")
            elif ev.correlation_group:
                union(node, ev.correlation_group)
        return {ev.evidence_id: find(f"ev:{ev.evidence_id}") for ev in evidence}

    def _group(self, ev) -> str:
        groups = getattr(self, "_groups", None) or {}
        return groups.get(ev.evidence_id) or ev.correlation_group or self.repo.group_key(ev.canonical_indicator_id)

    def _corroboration(self, evidence) -> dict[tuple, float]:
        """{(chakra, observation group): weight} of confirmed, unambiguous, current, positive,
        directional evidence. Kept per group so an ambiguous item can never be corroborated by
        its own observation (self-support)."""
        per_group: dict[tuple, float] = {}
        for ev in evidence:
            if self._kind(ev) != "scorable":
                continue
            if ev.status not in (EvidenceStatus.CONFIRMED, EvidenceStatus.RESOLVED_AFTER_CLARIFICATION):
                continue
            group = self._group(ev)
            for item in self.repo.get_by_id(ev.canonical_indicator_id):
                if item.state_raw not in DIRECTIONS:
                    continue
                if ev.status == EvidenceStatus.RESOLVED_AFTER_CLARIFICATION and ev.selected_chakra \
                        and item.chakra != ev.selected_chakra:
                    continue
                w = float(self.strength.get(item.association_rating, 0.0)) * max(float(
                    self.intensity.get(ev.intensity, self.unstated_intensity_weight)), self.mild_weight)
                key = (item.chakra, group)
                per_group[key] = max(per_group.get(key, 0.0), w)
        return per_group

    def _clarified_groups(self, evidence) -> set[str]:
        """Observation groups the therapist/patient already clarified. Twin entries of such a
        group that were NOT resolved (they do not map to the chosen chakra) must not score."""
        return {self._group(ev) for ev in evidence
                if ev.status == EvidenceStatus.RESOLVED_AFTER_CLARIFICATION and not getattr(ev, "superseded", False)}

    def _corroborated_targets(self, evidence, per_group: dict[tuple, float],
                              clarified: set[str]) -> dict[str, str | None]:
        """For each unclarified ambiguous observation (all twin KB entries of one patient
        statement together): the ONE chakra with the strongest independent confirmed support
        from OTHER observations. Ties or no support -> None (stays provisional)."""
        groups: dict[str, list] = defaultdict(list)
        for ev in evidence:
            if ev.status == EvidenceStatus.UNRESOLVED and not getattr(ev, "superseded", False):
                groups[self._group(ev)].append(ev)
        out = {}
        for group, members in groups.items():
            if group in clarified:
                continue
            support: dict[str, list[float]] = defaultdict(list)
            for (chakra, other_group), w in per_group.items():
                if other_group != group:
                    support[chakra].append(w)
            combined = {chakra: self._combine(vals) for chakra, vals in support.items()}
            options = {i.chakra for ev in members for i in self.repo.get_by_id(ev.canonical_indicator_id)
                       if i.state_raw in DIRECTIONS}
            target = self._pick_target(options, combined)
            for ev in members:
                out[ev.evidence_id] = target
        return out

    @staticmethod
    def _pick_target(options, support: dict[str, float]) -> str | None:
        ranked = sorted(((support.get(c, 0.0), c) for c in options), reverse=True)
        if not ranked or ranked[0][0] <= 0:
            return None
        if len(ranked) > 1 and abs(ranked[0][0] - ranked[1][0]) < 1e-9:
            return None
        return ranked[0][1]

    @staticmethod
    def _quote(ev, responses):
        if getattr(ev, "quote", None):
            return ev.quote
        text = (responses or {}).get(ev.response_id)
        return (text[:240] + "…") if text and len(text) > 240 else text

    # ---------------------------------------------------------------- confidence
    def _confidence(self, relevant, contradicted, n_assessed):
        """Spec section 13. Reported separately from severity and never a gate.
        coverage 30% | consistency 30% | resolution 25% | completeness 15%.
        resolution   : 100 all eligible evidence confirmed/clarified, 60 mixed, 0 none resolved.
        completeness : 100 all eligible evidence resolved, 40 when unresolved evidence exists,
                       0 when there is no relevant evidence (absence of evidence is never rewarded)."""
        w = self.conf_weights
        coverage = min(1.0, n_assessed / self.n_quadrants)
        if not relevant:
            return round(100 * w["coverage"] * coverage, 2), coverage
        consistency = 0.0 if contradicted else 1.0
        resolved_states = (EvidenceStatus.CONFIRMED, EvidenceStatus.RESOLVED_AFTER_CLARIFICATION)
        resolved = [e for e in relevant if e.status in resolved_states and not getattr(e, "contradiction_open", False)]
        if len(resolved) == len(relevant):
            resolution, completeness = 1.0, 1.0
        elif resolved:
            resolution, completeness = 0.6, 0.4
        else:
            resolution, completeness = 0.0, 0.4
        pct = 100 * (w["coverage"] * coverage + w["consistency"] * consistency
                     + w["resolution"] * resolution + w["completeness"] * completeness)
        return round(pct, 2), coverage

    # --------------------------------------------------------------------- score
    def score(self, evidence, *, contradictions=None, assessed_quadrants=None, responses=None,
              assessment_context=None, baseline=None, suggested_quadrants=None, completed_quadrants=None):
        log = logging.getLogger("anahat.scoring")
        contradictions = contradictions or []
        if baseline is None and assessment_context is not None:
            baseline = assessment_context.get("baseline")
        assessed = set(assessed_quadrants or [])
        n_assessed = len(assessed)
        completion = self.completion(suggested_quadrants, completed_quadrants, n_assessed)
        evidence = list(evidence or [])
        results: list[ChakraResult] = []
        if assessment_context is not None:
            log.info("FINAL SCORER RECEIVED COMPLETE CONTEXT: selected_quadrants=%s completed_quadrants=%s "
                     "responses=%s evidence=%s", assessment_context.get("selected_quadrants"),
                     assessment_context.get("completed_quadrants"),
                     len(assessment_context.get("responses") or []), len(assessment_context.get("evidence") or []))
        # evidence whose positive statement is contradicted by a denial of the same indicator
        contradicted_ids = {eid for c in contradictions if c.get("type") in ("polarity", "currentness")
                            for eid in (c.get("positive_evidence_ids") or [])}

        self._groups = self._build_groups(evidence)
        clarified_groups = self._clarified_groups(evidence)
        support = self._corroboration(evidence) if self.resolve_by_corroboration else {}
        corroborated_target = self._corroborated_targets(evidence, support, clarified_groups) if support else {}

        for chakra in self.chakras:
            trace: list[TraceItem] = []
            negative, historical, unresolved, nondirectional = [], [], [], []
            pending: list[dict] = []
            relevant = []                       # scorable items linked to this chakra
            contradiction_here = any(c.get("chakra") == chakra for c in contradictions if c.get("type") in ("polarity", "currentness"))

            for ev in evidence:
                kind = self._kind(ev)
                assoc = self._associations(ev, chakra)
                if not assoc or kind == "superseded":
                    continue
                if kind == "negative":
                    negative.append(ev.evidence_id); continue
                if kind == "historical":
                    historical.append(ev.evidence_id); continue
                if kind == "unscored":
                    unresolved.append(ev.evidence_id); continue

                # Prefer a directional KB record; otherwise keep the first record as a
                # PRESENCE-ONLY association (state Either / Varies / Conflicted ...).
                ind = next((item for item in assoc if item.state_raw in DIRECTIONS), None) or assoc[0]
                notes = []
                provisional = False
                corroborated_here = False
                unresolved_weight_applies = False
                if ev.status == EvidenceStatus.UNRESOLVED and self._group(ev) in clarified_groups:
                    # A twin KB entry of a statement that was already clarified to another chakra.
                    continue
                if ev.status == EvidenceStatus.UNRESOLVED:
                    if corroborated_target.get(ev.evidence_id) == chakra and ind.state_raw in DIRECTIONS:
                        corroborated_here = True
                        notes.append("ambiguous indicator attributed to this chakra at full weight: it has the "
                                     "strongest corroborating confirmed evidence in this session")
                    elif self.score_unresolved_as_provisional:
                        provisional = True
                        unresolved.append(ev.evidence_id)
                        notes.append("provisional: waiting for KB clarification, counted at the Provisional weight")
                    else:
                        unresolved_weight_applies = True
                        unresolved.append(ev.evidence_id)
                        notes.append(f"unresolved: counted at the Unresolved weight {self.unresolved_weight:g} "
                                     "until the KB clarification question is answered")
                elif ev.status == EvidenceStatus.PROVISIONAL:
                    provisional = True
                    notes.append("provisional: closely related (partial) match, counted at reduced weight")
                elif ev.status not in (EvidenceStatus.CONFIRMED, EvidenceStatus.RESOLVED_AFTER_CLARIFICATION):
                    continue
                intensity_label = ev.intensity
                intensity_assumed = False
                if not intensity_label and self.intensity_from_baseline:
                    derived, source = self._baseline_intensity(ev.indicator_term or ind.term, baseline)
                    if derived:
                        intensity_label = derived
                        notes.append(f"intensity {derived} taken from the patient's {source}")
                if not intensity_label:
                    pending.append({"evidence_id": ev.evidence_id, "indicator": ev.indicator_term,
                                    "missing": ["intensity"]})
                    intensity_label = "Mild"
                    intensity_assumed = True
                    iw_raw = self.unstated_intensity_weight
                    notes.append("intensity not stated: counted as Mild (never 0, never silently Moderate); "
                                 "ask the patient to clarify")
                else:
                    iw_raw = max(float(self.intensity.get(intensity_label, self.unstated_intensity_weight)),
                                 self.mild_weight)
                relevant.append(ev)
                sw = float(self.strength.get(ind.association_rating, 0.0))
                if corroborated_here:
                    rw = self.confirmed_weight
                elif unresolved_weight_applies:
                    rw = self.unresolved_weight
                elif provisional:
                    rw = self.provisional_weight
                else:
                    rw = self._reliability_weight(ev.status.value)
                # Spec section 6: an unresolved contradiction can never establish an imbalance / direction.
                if getattr(ev, "contradiction_open", False) or ev.evidence_id in contradicted_ids:
                    rw = min(rw, self.unresolved_weight)
                    unresolved.append(ev.evidence_id)
                    notes.append("contradiction not yet resolved: counted at the Unresolved weight; ask the "
                                 "patient to clarify which statement is right")
                iw = float(iw_raw)
                contribution = round(sw * iw * rw, 6)
                note = "; ".join(notes) or None
                directional = ind.state_raw in DIRECTIONS
                if not directional:
                    nondirectional.append(ev.evidence_id)
                trace.append(TraceItem(
                    evidence_id=ev.evidence_id, response_id=ev.response_id, quote=self._quote(ev, responses),
                    indicator_id=ev.canonical_indicator_id, term=ev.indicator_term or ind.term, domain=ind.domain,
                    kb_state=ind.state_raw, directional=directional, strength=ind.association_rating,
                    strength_weight=sw, intensity=intensity_label, intensity_weight=iw_raw,
                    intensity_assumed=intensity_assumed,
                    evidence_status=ev.status.value, reliability_weight=rw, contribution=contribution, note=note))

            # ---- collapse correlated evidence: one underlying problem = one independent group
            by_group: dict[str, list[int]] = defaultdict(list)
            ev_by_id = {e.evidence_id: e for e in evidence}
            for idx, t in enumerate(trace):
                by_group[self._group(ev_by_id[t.evidence_id])].append(idx)
            presence_vals, dir_vals = [], {d: [] for d in DIRECTIONS}
            counted_groups = 0
            for group, idxs in by_group.items():
                best = max(idxs, key=lambda i: (trace[i].contribution, trace[i].evidence_id))
                for i in idxs:
                    if i != best:
                        trace[i].note = ((trace[i].note + "; ") if trace[i].note else "") + \
                            "same underlying problem as another item: counted once"
                if trace[best].contribution > 0:
                    trace[best].counted = True
                    counted_groups += 1
                    presence_vals.append(trace[best].contribution)
                # direction: best per (group, kb_state) so twin entries cannot double count
                by_state: dict[str, int] = {}
                for i in idxs:
                    st = trace[i].kb_state
                    if st in DIRECTIONS and (st not in by_state or trace[i].contribution > trace[by_state[st]].contribution):
                        by_state[st] = i
                for st, i in by_state.items():
                    if trace[i].contribution > 0:
                        dir_vals[st].append(trace[i].contribution)

            overall = self._aggregate_overall(presence_vals)
            deficient = self._aggregate_directional(dir_vals["Deficient"])
            excess = self._aggregate_directional(dir_vals["Excess"])
            units = counted_groups
            contradiction_pending = contradiction_here or any(getattr(e, "contradiction_open", False) for e in relevant)
            # any listed contradiction on this chakra (also a Deficient-vs-Excess one) lowers consistency
            inconsistent = contradiction_pending or any(c.get("chakra") == chakra for c in contradictions)
            confidence, coverage = self._confidence(relevant, inconsistent, n_assessed)
            mapped_count = sum(1 for ev in evidence if self._associations(ev, chakra))

            def firm(state=None):
                return any(t.contribution > 0 and (t.reliability_weight or 0) >= self.confirmed_weight
                           and (state is None or t.kb_state == state) for t in trace)

            # ---- Step 4: overall evidence bands (spec section 2)
            reasons: list[str] = []
            direction, gray, code = None, False, ""
            direction_label = ""
            in_band = overall >= self.bands["balanced_below"]
            provisional_block = in_band and not self.provisional_alone and not firm()
            imbalanced = in_band and not provisional_block
            band = self.band(overall)
            minor_signals = []
            if imbalanced:
                reasons.append(f"Overall evidence score {overall:.2f} is in the {band.upper()} band "
                               f"(Mild {self.bands['balanced_below']:.2f}–<{self.bands['mild_below']:.2f}, "
                               f"Moderate <{self.bands['moderate_below']:.2f}, Severe from "
                               f"{self.bands['moderate_below']:.2f}).")
                # ---- direction (spec sections 7 and 10); only after the overall band is met
                d_ok = deficient >= self.meaningful_threshold
                e_ok = excess >= self.meaningful_threshold
                if self.require_firm:
                    d_ok = d_ok and firm("Deficient")
                    e_ok = e_ok and firm("Excess")
                if d_ok and e_ok:
                    stronger, weaker = max(deficient, excess), min(deficient, excess)
                    ratio = stronger / weaker
                    if ratio < self.dominance_ratio:
                        status, code = "CONFLICTED", "DIRECTION_CONFLICTED"
                        direction_label = "Direction unclear / conflicted"
                        reasons.append(f"Both directions are meaningful (Deficient {deficient:.2f}, Excess {excess:.2f}), "
                                       f"but dominance ratio {ratio:.3f} is below {self.dominance_ratio:.2f}; "
                                       "no direction selected.")
                    else:
                        direction = "Deficient" if deficient > excess else "Excess"
                        status, code = f"IMBALANCED_{direction.upper()}", f"DIRECTION_{direction.upper()}"
                        direction_label = direction
                        reasons.append(f"{direction} is dominant by ratio {ratio:.3f} (required {self.dominance_ratio:.2f}).")
                elif d_ok or e_ok:
                    direction = "Deficient" if d_ok else "Excess"
                    status, code = f"IMBALANCED_{direction.upper()}", f"DIRECTION_{direction.upper()}"
                    direction_label = direction
                    reasons.append(f"Only {direction} reached the meaningful directional threshold "
                                   f"{self.meaningful_threshold:.2f}.")
                else:
                    status, code = "IMBALANCED_DIRECTION_UNRESOLVED", "PRESENCE_DIRECTION_UNRESOLVED"
                    direction_label = "Direction unclear"
                    reasons.append("Imbalance is supported, but neither Deficient nor Excess reached "
                                   f"{self.meaningful_threshold:.2f} (the matched indicators carry no Deficient/Excess "
                                   "state, or only weak directional support): ask a direction clarification question.")
                gate_reason = f"Overall evidence score {overall:.2f} >= {self.bands['balanced_below']:.2f}."
                severity_band = band.capitalize()
            else:
                gate_reason = (f"Overall evidence score {overall:.2f} is below the "
                               f"{self.bands['balanced_below']:.2f} imbalance band." if not provisional_block else
                               f"Overall evidence score {overall:.2f} reaches the band but rests on provisional "
                               "or unresolved evidence only.")
                minor_signals = [{"term": t.term, "state": t.kb_state, "strength": t.strength,
                                  "intensity": t.intensity, "reliability": t.reliability_weight,
                                  "contribution": t.contribution, "status": t.evidence_status}
                                 for t in sorted(trace, key=lambda t: -t.contribution) if t.counted]
                if provisional_block:
                    status, code = "UNRESOLVED", "PROVISIONAL_ONLY"
                    severity_band = "Not assessed properly"
                    reasons.append(f"Overall evidence score {overall:.2f} reaches the {band.upper()} band, but only "
                                   "provisional or unresolved evidence supports it and "
                                   "provisional_alone_can_establish_imbalance is off: confirm it first.")
                elif contradiction_pending:
                    status, code = "UNRESOLVED", "CONFLICTING_EVIDENCE"
                    severity_band = "Not assessed properly"
                    reasons.append("A contradiction about the same problem is not resolved yet: clarification is "
                                   "needed before this chakra can be called.")
                elif completion["complete"]:
                    status, code = "BALANCED", "BELOW_BAND_QUADRANTS_COMPLETE"
                    severity_band = "Balanced"
                    reasons.append(f"Overall evidence score {overall:.2f} is below {self.bands['balanced_below']:.2f} "
                                   "and the suggested quadrants are complete: Balanced.")
                    if minor_signals:
                        reasons.append("Minor signals listed for the therapist: "
                                       + ", ".join(m["term"] for m in minor_signals if m.get("term")) + ".")
                else:
                    status, code = "UNRESOLVED", "NOT_ASSESSED"
                    severity_band = "Not assessed properly"
                    pend = completion["pending"]
                    reasons.append(f"Overall evidence score {overall:.2f} is below {self.bands['balanced_below']:.2f} "
                                   "but the suggested quadrants are not all complete"
                                   + (f" (pending: {', '.join(pend)})" if pend else "")
                                   + ": Not assessed properly. Absence of evidence is not balance.")
            if pending:
                reasons.append("Severity not yet stated for some evidence: it is counted as Mild until the patient says.")
            if unresolved:
                reasons.append("Some evidence is unresolved (clarification question pending): it counts at the Unresolved weight.")

            # ---- high-priority single evidence (spec section 12): a flag, never a gate
            high_priority = any(
                t.strength == "Strong" and t.intensity == "Severe" and (t.reliability_weight or 0) >= self.confirmed_weight
                and t.contribution >= self.high_priority_single and not t.intensity_assumed for t in trace)
            if high_priority:
                reasons.append("Contains a Strong + Severe + Confirmed indicator (contribution >= "
                               f"{self.high_priority_single:.2f}): high-priority evidence for therapist review.")
            counted_notes = " | ".join(t.note or "" for t in trace if t.counted)
            if "taken from the patient's baseline" in counted_notes:
                reasons.append("Intensity for part of this score comes from the patient's own baseline rating.")
            if "intensity not stated" in counted_notes:
                reasons.append("Part of this score counts intensity as Mild because the patient did not say how strong it is: ask them.")
            pending_clarification = [{"evidence_id": t.evidence_id, "term": t.term, "status": t.evidence_status,
                                      "weight": t.reliability_weight, "note": t.note}
                                     for t in trace if (t.reliability_weight or 0) < self.confirmed_weight and t.counted]
            if mapped_count == 0:
                evidence_state = "NO_MAPPED_EVIDENCE"
            elif not imbalanced:
                evidence_state = "MAPPED_EVIDENCE_BELOW_IMBALANCE_BAND"
            else:
                evidence_state = "MAPPED_EVIDENCE_IN_IMBALANCE_BAND"
            status_label = STATUS_LABELS[status]
            if code == "CONFLICTING_EVIDENCE":
                status_label = "Unresolved — clarification needed"
            elif code == "PROVISIONAL_ONLY":
                status_label = "Unresolved — needs confirmation"
            results.append(ChakraResult(
                chakra=chakra, score=round(overall, 4), presence_score=round(overall, 4),
                overall_score=round(overall, 4), deficient_score=round(deficient, 4),
                excess_score=round(excess, 4), direction=direction, status=status,
                severity=band, severity_band=severity_band, direction_label=direction_label,
                confidence_pct=confidence, independent_evidence_units=units,
                gate_passed=imbalanced, gate_threshold=self.imbalance_threshold, gate_reason=gate_reason,
                mapped_evidence_count=mapped_count, scored_evidence_count=len(relevant),
                reasons=reasons, evidence_ids=sorted({t.evidence_id for t in trace}),
                status_label=status_label, status_code=code,
                confidence_label=confidence_label(confidence, self.conf_labels.get("high_from", 80),
                                                  self.conf_labels.get("moderate_from", 60)),
                coverage_pct=round(100 * coverage, 1), high_priority=high_priority, direction_gray_zone=gray,
                negative_evidence_ids=sorted(set(negative)), historical_evidence_ids=sorted(set(historical)),
                unresolved_evidence_ids=sorted(set(unresolved)), nondirectional_evidence_ids=sorted(set(nondirectional)),
                pending_details=pending, trace=trace, minor_signals=minor_signals,
                pending_clarification=pending_clarification, quadrant_completion=dict(completion)))
            log.info("FINAL CHAKRA | %s | evidence_state=%s | overall=%.4f deficient=%.4f excess=%.4f | band=%s | "
                     "status=%s | units=%s confidence=%s | reasons=%s", chakra, evidence_state, overall, deficient,
                     excess, band, status, units, confidence, reasons)

        # ---- ranking: most affected imbalanced chakra first, then descending (spec: order matters) ----
        def sort_key(r):
            return (-r.overall_score, -max(r.deficient_score, r.excess_score), -r.independent_evidence_units, r.chakra)
        imbalanced_rs = sorted((r for r in results if is_imbalanced(r.status)), key=sort_key)
        others = sorted((r for r in results if not is_imbalanced(r.status)),
                        key=lambda r: (r.status == "BALANCED",) + sort_key(r))     # unresolved before balanced
        for i, r in enumerate(imbalanced_rs, start=1):
            r.rank = i
        results = imbalanced_rs + others
        ordered = [r.chakra for r in results]
        supported = [r.chakra for r in imbalanced_rs]
        directional = [r.chakra for r in imbalanced_rs if r.status in ("IMBALANCED_DEFICIENT", "IMBALANCED_EXCESS")]
        ranking = list(ordered)
        return ChakraReport(
            results=results, supported_chakras=supported, directional_chakras=directional, ranking=ranking,
            ordered=ordered, assessed_quadrants=sorted(assessed),
            coverage={"assessed_quadrants": n_assessed, "reference_quadrants": self.n_quadrants,
                      "balanced_requires": self.balanced_min_quadrants, "adequately_assessed": completion["complete"],
                      "suggested_quadrants_complete": completion["complete"],
                      "required_quadrants": completion["required"], "pending_quadrants": completion["pending"],
                      "completion_basis": completion["basis"]},
            audit={"spec": "ANAHAT_Finalized_Scoring_Rules_Final.docx",
                   "thresholds": {"overall_bands": dict(self.bands),
                                  "meaningful_directional_score": self.meaningful_threshold,
                                  "dominance_ratio": self.dominance_ratio,
                                  "insufficient_score": self.insufficient_score_threshold,
                                  "balanced_min_assessed_quadrants": self.balanced_min_quadrants,
                                  "confidence_is_gate": False, "coverage_is_gate": False,
                                  "separate_conflict_margin": "removed"},
                   "diminishing_returns": {**self.dr, "multipliers_first_six": [round(self.multiplier(i), 3) for i in range(1, 7)],
                                           "overall_aggregation": self.overall_mode,
                                           "directional_aggregation": self.directional_mode},
                   "weights": {"strength": self.strength, "intensity": self.intensity, "reliability": self.reliability,
                               "confidence": self.conf_weights},
                   "ordering": "imbalanced chakras by overall evidence score, highest first; then not assessed; then balanced",
                   "clinically_validated": False,
                   "note": "All thresholds and the diminishing-return curve are engineering baselines, configurable, "
                           "not clinically validated (spec section 17)."})
