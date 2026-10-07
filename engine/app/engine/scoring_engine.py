"""Deterministic chakra scoring. NO LLM is involved anywhere in this module.

Pipeline per chakra (PDF Parts 32-47):
  evidence -> KB association (chakra / state / strength) -> contribution
  (strength x intensity x reliability) -> collapse correlated evidence into
  independent units -> diminishing-returns aggregation -> presence gate ->
  direction (separately) -> status.

Design rules enforced here (each has a test in tests/unit/test_scoring_spec.py):
  * A chakra is BALANCED only after adequate assessment. "Not assessed" is UNRESOLVED.
  * Presence and direction are different questions (never presence = def + exc).
  * The same underlying observation is scored once, however often it is repeated.
  * Negative / historical / unresolved / unscored evidence never adds to a score.
  * Missing severity is never invented: the item is listed as a pending detail
    (which triggers a deep-dive question) and contributes nothing until answered.
  * Source states that are not exactly Deficient/Excess ("Either", "Varies",
    "Conflicted", "Excess to Deficient", ...) add PRESENCE only. They are never
    reinterpreted into a direction. A chakra supported only by presence is reported
    as "Imbalanced - Direction unresolved" (needs a follow-up, never a guess).
  * Evidence still waiting for a KB clarification (UNRESOLVED) counts at the reduced
    "Provisional" reliability weight instead of being thrown away, and a missing
    intensity is scored at a low floor weight AND stays listed as a pending detail.
    Both are flagged in the trace/reasons and can be switched off in settings.
  * All numeric thresholds are ENGINEERING BASELINES, configurable, and reported
    in the audit block with clinically_validated = False.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from app.core.enums import EvidenceStatus
from app.knowledge.indicator_repository import IndicatorRepository
from app.models.chakra import ChakraReport, ChakraResult, TraceItem

DEFAULT_STRENGTH = {"Strong": 1.0, "Medium": 0.6, "Weak": 0.3}
DEFAULT_INTENSITY = {"Mild": 0.4, "Moderate": 0.7, "Severe": 1.0}
DEFAULT_RELIABILITY = {"Confirmed": 1.0, "Resolved After Clarification": 1.0, "Provisional": 0.4,
                       "Unresolved": 0.1, "Historical": 0.1, "NEGATIVE": 0.1}
DEFAULT_CONFIDENCE_WEIGHTS = {"coverage": 0.30, "consistency": 0.30, "resolution": 0.25, "completeness": 0.15}
DIRECTIONS = ("Deficient", "Excess")

STATUS_LABELS = {
    "BALANCED": "Balanced",
    "IMBALANCED_DEFICIENT": "Imbalanced — Deficient",
    "IMBALANCED_EXCESS": "Imbalanced — Excess",
    "IMBALANCED_DIRECTION_UNRESOLVED": "Imbalanced — Direction unresolved",
    "CONFLICTED": "Conflicted — Deficient and Excess",
    "UNRESOLVED": "Unresolved",
}


def band(score: float) -> str:
    return "minimal" if score < .20 else "mild" if score < .45 else "moderate" if score < .70 else "severe"


def confidence_label(pct: float) -> str:
    return "High" if pct >= 80 else "Moderate" if pct >= 60 else "Low"


class ScoringEngine:
    def __init__(self, kb):
        from app.core.config import settings
        cfg = kb.scoring_config or {}
        self.kb = kb
        self.strength = cfg.get("strength_weights", DEFAULT_STRENGTH)
        self.intensity = cfg.get("intensity_weights", DEFAULT_INTENSITY)
        self.reliability = cfg.get("reliability_weights", DEFAULT_RELIABILITY)
        self.conf_weights = (cfg.get("confidence") or {}).get("weights") or DEFAULT_CONFIDENCE_WEIGHTS
        direction = cfg.get("direction", {})
        self.meaningful_threshold = float(direction.get("meaningful_threshold", 0.2))
        # Meaningful directional evidence is the only numeric imbalance gate.
        # Confidence and coverage describe support, but cannot block a result.
        self.imbalance_threshold = self.meaningful_threshold
        self.dominance_ratio = 1.20
        self.insufficient_score_threshold = float(settings.insufficient_score_threshold)
        self.high_priority_single = float(settings.high_priority_single_score)
        self.balanced_min_quadrants = int(settings.balanced_min_assessed_quadrants)
        # Evidence that is not yet fully specified must not vanish silently.
        self.score_unresolved_as_provisional = bool(getattr(settings, "score_unresolved_as_provisional", True))
        self.unstated_intensity_weight = float(getattr(settings, "unstated_intensity_weight", 0.4))
        self.provisional_weight = float(self.reliability.get("Provisional", DEFAULT_RELIABILITY["Provisional"]))
        self.confirmed_weight = float(self.reliability.get("Confirmed", DEFAULT_RELIABILITY["Confirmed"]))
        self.resolve_by_corroboration = bool(getattr(settings, "resolve_ambiguity_by_corroboration", True))
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
        """Diminishing returns: combined = combined + new * (1 - combined)."""
        combined = 0.0
        for value in sorted(values, reverse=True):
            combined += value * (1 - combined)
        return combined

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
                w = float(self.strength.get(item.association_rating, 0.0)) * float(
                    self.intensity.get(ev.intensity, self.unstated_intensity_weight))
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
        w = self.conf_weights
        coverage = min(1.0, n_assessed / self.n_quadrants)
        if not relevant:
            # KB correction: no relevant evidence => Low. Never award consistency /
            # resolution / completeness for having found nothing.
            return round(100 * w["coverage"] * coverage, 2), coverage
        consistency = 0.0 if contradicted else 1.0
        resolved = [e for e in relevant if e.status in (EvidenceStatus.CONFIRMED,
                                                          EvidenceStatus.RESOLVED_AFTER_CLARIFICATION)]
        resolution = len(resolved) / len(relevant)

        def completeness_of(e):
            parts = [bool(e.intensity), bool(e.frequency or e.duration), bool(e.context or e.trigger or e.impact)]
            return sum(parts) / 3.0
        completeness = sum(completeness_of(e) for e in relevant) / len(relevant)
        pct = 100 * (w["coverage"] * coverage + w["consistency"] * consistency
                     + w["resolution"] * resolution + w["completeness"] * completeness)
        return round(pct, 2), coverage

    # --------------------------------------------------------------------- score
    def score(self, evidence, *, contradictions=None, assessed_quadrants=None, responses=None,
              assessment_context=None, baseline=None):
        contradictions = contradictions or []
        if baseline is None and assessment_context is not None:
            baseline = assessment_context.get("baseline")
        assessed = set(assessed_quadrants or [])
        n_assessed = len(assessed)
        adequately_assessed = n_assessed >= self.balanced_min_quadrants
        evidence = list(evidence or [])
        results = []
        if assessment_context is not None:
            logging.getLogger("anahat.scoring").info(
                "FINAL SCORER RECEIVED COMPLETE CONTEXT: demographics=%s baseline=%s opening_responses=%s "
                "selected_quadrants=%s completed_quadrants=%s responses=%s evidence=%s",
                assessment_context.get("demographics"), assessment_context.get("baseline"),
                len(assessment_context.get("opening_responses") or []),
                assessment_context.get("selected_quadrants"), assessment_context.get("completed_quadrants"),
                len(assessment_context.get("responses") or []), len(assessment_context.get("evidence") or []),
            )
        logging.getLogger("anahat.scoring").info(
            "FINAL EVIDENCE DIAGNOSTIC | total=%s | items=%s",
            len(evidence),
            [{
                "evidence_id": ev.evidence_id,
                "indicator_term": ev.indicator_term,
                "canonical_indicator_id": ev.canonical_indicator_id,
                "status": ev.status.value,
                "polarity": ev.polarity,
                "currentness": ev.currentness,
                "intensity": ev.intensity,
                "mapped": [{
                    "chakra": item.chakra,
                    "state_raw": item.state_raw,
                } for item in self.repo.get_by_id(ev.canonical_indicator_id)],
            } for ev in evidence],
        )

        mapping_diagnostics = []
        for ev in evidence:
            canonical_id = ev.canonical_indicator_id
            mapped = [chakra for chakra in self.chakras
                      if any(item.chakra == chakra for item in self.repo.get_by_id(canonical_id))]
            if mapped:
                mapping_reason = "canonical indicator has chakra associations"
            elif not canonical_id:
                mapping_reason = "no canonical indicator ID was attached to this evidence"
            elif not self.repo.get_by_id(canonical_id):
                mapping_reason = "canonical indicator ID is absent from the loaded indicator knowledge base"
            else:
                mapping_reason = "canonical indicator has no association to a configured chakra"
            mapping_diagnostics.append({
                "evidence_id": ev.evidence_id, "label": ev.indicator_term,
                "canonical_indicator_id": canonical_id, "mapped_chakras": mapped,
                "mapping_reason": mapping_reason, "status": ev.status.value,
                "polarity": ev.polarity, "currentness": ev.currentness,
                "intensity": ev.intensity, "superseded": ev.superseded,
            })
        logging.getLogger("anahat.scoring").info(
            "FINAL EVIDENCE -> CHAKRA MAPPING: %s", mapping_diagnostics
        )
        logging.getLogger("anahat.scoring").info(
            "IMBALANCE GATE CONFIG: directional_threshold=%s dominance_ratio=%s "
            "additional_blocking_conditions=%s confidence_role=%s coverage_role=%s",
            self.meaningful_threshold, self.dominance_ratio,
            "none beyond eligible current confirmed/resolved evidence and chakra/direction mapping",
            "reported after status; not a gate", "confidence component only; not a gate",
        )

        self._groups = self._build_groups(evidence)
        clarified_groups = self._clarified_groups(evidence)
        support = self._corroboration(evidence) if self.resolve_by_corroboration else {}
        corroborated_target = self._corroborated_targets(evidence, support, clarified_groups) if support else {}

        for chakra in self.chakras:
            trace: list[TraceItem] = []
            negative, historical, unresolved, nondirectional = [], [], [], []
            pending: list[dict] = []
            relevant = []                       # scorable items linked to this chakra
            contradicted = any(c.get("chakra") == chakra for c in contradictions)
            polarity_conflict = any(c.get("chakra") == chakra and c.get("type") == "polarity"
                                    for c in contradictions)

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
                if ev.status == EvidenceStatus.UNRESOLVED and self._group(ev) in clarified_groups:
                    # A twin KB entry of a statement that was already clarified to another chakra.
                    continue
                if ev.status == EvidenceStatus.UNRESOLVED:
                    if corroborated_target.get(ev.evidence_id) == chakra and ind.state_raw in DIRECTIONS:
                        corroborated_here = True
                        notes.append("ambiguous indicator attributed to this chakra at full weight: it has the "
                                     "strongest corroborating confirmed evidence in this session")
                    elif not self.score_unresolved_as_provisional:
                        unresolved.append(ev.evidence_id)
                        continue
                    else:
                        provisional = True
                        unresolved.append(ev.evidence_id)
                        notes.append("provisional: waiting for KB clarification, counted at reduced weight")
                elif ev.status == EvidenceStatus.PROVISIONAL:
                    provisional = True
                    notes.append("provisional: closely related (partial) match, counted at reduced weight")
                elif ev.status not in (EvidenceStatus.CONFIRMED, EvidenceStatus.RESOLVED_AFTER_CLARIFICATION):
                    continue
                intensity_label = ev.intensity
                if not intensity_label and self.intensity_from_baseline:
                    derived, source = self._baseline_intensity(ev.indicator_term or ind.term, baseline)
                    if derived:
                        intensity_label = derived
                        notes.append(f"intensity {derived} taken from the patient's {source}")
                if not intensity_label:
                    pending.append({"evidence_id": ev.evidence_id, "indicator": ev.indicator_term,
                                    "missing": ["intensity"]})
                    if self.unstated_intensity_weight <= 0:
                        unresolved.append(ev.evidence_id)
                        continue
                    iw_raw = self.unstated_intensity_weight
                    notes.append(f"intensity not stated: scored at floor weight {iw_raw:.2f}; ask the patient")
                else:
                    iw_raw = self.intensity.get(intensity_label, self.unstated_intensity_weight)
                relevant.append(ev)
                sw = float(self.strength.get(ind.association_rating, 0.0))
                if corroborated_here:
                    rw = self.confirmed_weight
                elif provisional:
                    rw = self.provisional_weight
                else:
                    rw = self._reliability_weight(ev.status.value)
                if rw == 0.0:
                    unresolved.append(ev.evidence_id); notes.append("unresolved: contributes 0 until clarified")
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
                    evidence_status=ev.status.value, reliability_weight=rw, contribution=contribution, note=note))

            # ---- collapse correlated evidence: one underlying observation = one unit
            by_group: dict[str, list[int]] = defaultdict(list)
            ev_by_id = {e.evidence_id: e for e in evidence}
            for idx, t in enumerate(trace):
                e = ev_by_id[t.evidence_id]
                by_group[self._group(e)].append(idx)
            presence_vals, dir_vals = [], {d: [] for d in DIRECTIONS}
            counted_groups = 0
            for group, idxs in by_group.items():
                best = max(idxs, key=lambda i: (trace[i].contribution, trace[i].evidence_id))
                for i in idxs:
                    if i != best:
                        trace[i].note = ((trace[i].note + "; ") if trace[i].note else "") + \
                            "same underlying observation as another item: counted once"
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

            presence = self._combine(presence_vals)
            deficient = self._combine(dir_vals["Deficient"])
            excess = self._combine(dir_vals["Excess"])
            units = counted_groups
            confidence, coverage = self._confidence(relevant, contradicted, n_assessed)

            reasons: list[str] = []
            direction, high_priority, gray = None, False, False
            has_open_items = bool(unresolved or pending)

            # A direction only counts when at least one FIRM item (confirmed, clarified or
            # corroborated: full reliability) supports THAT direction. Support made only of
            # provisional / unclarified evidence stays UNRESOLVED and asks for clarification.
            def firm(state=None):
                return any(t.contribution > 0 and (t.reliability_weight or 0) >= self.confirmed_weight
                           and (state is None or t.kb_state == state) for t in trace)
            raw_deficient_meaningful = deficient >= self.meaningful_threshold
            raw_excess_meaningful = excess >= self.meaningful_threshold
            deficient_meaningful = raw_deficient_meaningful and firm("Deficient")
            excess_meaningful = raw_excess_meaningful and firm("Excess")
            gate = deficient_meaningful or excess_meaningful
            mapped_count = sum(1 for ev in evidence if self._associations(ev, chakra))
            gate_failures = []
            if mapped_count == 0:
                gate_failures.append("no evidence has a canonical association with this chakra")
            if not gate:
                gate_failures.append(f"Deficient {deficient:.2f} and Excess {excess:.2f} are both below "
                                     f"the meaningful directional threshold {self.meaningful_threshold:.2f}")
            gate_reason = (
                "At least one eligible directional score reached the meaningful threshold."
                if gate else "; ".join(gate_failures)
            )

            # Presence-only support: evidence exists and is meaningful, but the KB gives no
            # Deficient/Excess for it. Report the chakra as imbalanced with direction unresolved.
            raw_presence_only = ((not gate) and not raw_deficient_meaningful and not raw_excess_meaningful
                                 and presence >= self.meaningful_threshold and not polarity_conflict)
            presence_only_pass = raw_presence_only and firm()
            if presence_only_pass:
                gate_reason = (f"Presence {presence:.2f} reached {self.meaningful_threshold:.2f} but the matched "
                               "indicators carry no Deficient/Excess state: direction unresolved.")
            provisional_only = (not gate and not presence_only_pass
                                and (raw_deficient_meaningful or raw_excess_meaningful or raw_presence_only))
            if provisional_only:
                gate_reason = ("Score reached the threshold, but only from provisional / unclarified evidence: "
                               "needs one confirmed indicator or a clarification answer.")
            if gate:
                if deficient_meaningful and excess_meaningful:
                    stronger, weaker = max(deficient, excess), min(deficient, excess)
                    ratio = stronger / weaker
                    if ratio < self.dominance_ratio:
                        status, code = "CONFLICTED", "DIRECTION_CONFLICTED"
                        reasons.append(f"Both directions are meaningful, but dominance ratio {ratio:.3f} "
                                       f"is below {self.dominance_ratio:.2f}; no direction selected.")
                    else:
                        direction = "Deficient" if deficient > excess else "Excess"
                        status, code = f"IMBALANCED_{direction.upper()}", f"DIRECTION_{direction.upper()}"
                        reasons.append(f"{direction} is dominant by ratio {ratio:.3f} (required "
                                       f"{self.dominance_ratio:.2f}).")
                elif deficient_meaningful:
                    direction, status, code = "Deficient", "IMBALANCED_DEFICIENT", "DIRECTION_DEFICIENT"
                else:
                    direction, status, code = "Excess", "IMBALANCED_EXCESS", "DIRECTION_EXCESS"
                if direction:
                    reasons.append(f"{direction} directional score passed the {self.meaningful_threshold:.2f} threshold.")
            elif presence_only_pass:
                status, code = "IMBALANCED_DIRECTION_UNRESOLVED", "PRESENCE_DIRECTION_UNRESOLVED"
                reasons.append(f"Presence {presence:.2f} passed the {self.meaningful_threshold:.2f} threshold, but "
                               "the indicators are non-directional (Either/Varies/Conflicted): ask a direction "
                               "clarification question before naming Deficient or Excess.")
            elif polarity_conflict and (presence > 0 or relevant):
                status, code = "UNRESOLVED", "CONFLICTING_EVIDENCE"
                reasons.append("Confirmed and denied statements about the same indicator conflict: "
                               "clarification required before this chakra can be called.")
            elif presence >= self.insufficient_score_threshold or has_open_items or mapped_count:
                status, code = "UNRESOLVED", "INSUFFICIENT_EVIDENCE"
                if presence < self.imbalance_threshold:
                    reasons.append(f"Presence {presence:.2f} is below the imbalance gate {self.imbalance_threshold:.2f}.")
                reasons.append(f"Neither direction reached {self.meaningful_threshold:.2f}.")
                if pending:
                    code = "MISSING_DETAILS"
                    reasons.append("Severity not yet stated for some evidence: ask before scoring.")
                if unresolved:
                    reasons.append("Some evidence is still unclarified or unscored, so it counts at reduced weight or not at all.")
                if provisional_only:
                    code = "PROVISIONAL_ONLY"
                    reasons.append("Possible imbalance supported only by provisional evidence: the therapist can "
                                   "confirm the evidence, or ask the clarification question, before it is called.")
                top_item = max(trace, key=lambda t: t.contribution, default=None)
                if (units == 1 and top_item and top_item.strength == "Strong" and top_item.intensity == "Severe"
                        and top_item.reliability_weight == 1.0 and top_item.contribution >= self.high_priority_single):
                    high_priority = True
                    reasons.append("Single strong, severe, confirmed indicator: HIGH PRIORITY for therapist "
                                   "review and corroboration; not declared imbalanced automatically.")
            else:
                if adequately_assessed:
                    status, code = "BALANCED", "ADEQUATELY_ASSESSED_NO_EVIDENCE"
                    reasons.append(f"Therapist assessed {n_assessed} relevant quadrant(s); no meaningful "
                                   "validated imbalance evidence was found. Assessing all quadrants is not required.")
                    if negative:
                        reasons.append(f"{len(negative)} explicit denial(s) recorded.")
                    if presence > 0:
                        reasons.append(f"Minor evidence ({presence:.2f}) is below the meaningful-evidence "
                                       f"threshold {self.insufficient_score_threshold:.2f}.")
                else:
                    status, code = "UNRESOLVED", "NOT_ASSESSED"
                    reasons.append("No quadrant has been assessed. Absence of evidence is NOT balance; "
                                   "the therapist chooses which quadrants are relevant to assess.")

            counted_notes = " | ".join(t.note or "" for t in trace if t.counted)
            if "provisional" in counted_notes:
                reasons.append("Part of this score rests on provisional (not yet clarified) evidence: confirm with "
                               "the KB disambiguation question.")
            if "corroborated" in counted_notes:
                reasons.append("An ambiguous indicator was counted for this chakra because other confirmed evidence "
                               "points to the same chakra; the therapist can still clarify it.")
            if "taken from the patient's baseline" in counted_notes:
                reasons.append("Intensity for part of this score comes from the patient's own baseline rating.")
            if "intensity not stated" in counted_notes:
                reasons.append("Part of this score uses a floor weight because intensity was not stated: ask how strong it is.")
            passed = gate or presence_only_pass
            score = max(presence, deficient, excess)
            if mapped_count == 0:
                evidence_state = "NO_MAPPED_EVIDENCE"
            elif not passed:
                evidence_state = "MAPPED_EVIDENCE_DID_NOT_PASS_GATE"
            else:
                evidence_state = "MAPPED_EVIDENCE_PASSED_PRESENCE_GATE"
            results.append(ChakraResult(
                chakra=chakra, score=round(score, 4), presence_score=round(presence, 4), deficient_score=round(deficient, 4),
                excess_score=round(excess, 4), direction=direction, status=status,
                severity=band(score), confidence_pct=confidence, independent_evidence_units=units,
                gate_passed=passed, gate_threshold=self.imbalance_threshold, gate_reason=gate_reason,
                mapped_evidence_count=mapped_count, scored_evidence_count=len(relevant),
                reasons=reasons, evidence_ids=sorted({t.evidence_id for t in trace}),
                status_label=STATUS_LABELS[status], status_code=code, confidence_label=confidence_label(confidence),
                coverage_pct=round(100 * coverage, 1), high_priority=high_priority, direction_gray_zone=gray,
                negative_evidence_ids=sorted(set(negative)), historical_evidence_ids=sorted(set(historical)),
                unresolved_evidence_ids=sorted(set(unresolved)), nondirectional_evidence_ids=sorted(set(nondirectional)),
                pending_details=pending, trace=trace))

            gate_logger = logging.getLogger("anahat.scoring")
            gate_logger.info(
                "FINAL CHAKRA GATE | %s | evidence_state=%s | mapped_evidence_count=%s "
                "scorable_evidence_count=%s | deficient=%s excess=%s threshold=%s "
                "| dominance_ratio_required=%s confidence_pct=%s | passed_gate=%s | final_status=%s "
                "| reason=%s | evidence=%s",
                chakra, evidence_state, mapped_count, len(relevant), round(deficient, 4), round(excess, 4),
                self.meaningful_threshold, self.dominance_ratio, confidence,
                status.startswith("IMBALANCED"), status, reasons,
                [{"evidence_id": item.evidence_id, "term": item.term, "status": item.evidence_status,
                  "intensity": item.intensity, "state": item.kb_state,
                  "contribution": item.contribution, "counted": item.counted, "note": item.note}
                 for item in trace],
            )

        # Strongest finding first (KB design reports the top findings to the therapist).
        supported = [r.chakra for r in sorted(results, key=lambda r: -r.score) if r.status.startswith("IMBALANCED")]
        directional = [r.chakra for r in results if r.status in ("IMBALANCED_DEFICIENT", "IMBALANCED_EXCESS")]
        ranking = [r.chakra for r in sorted(results, key=lambda r: (-r.presence_score, r.chakra))]
        logging.getLogger("anahat.scoring").debug(
            "chakra_score_diagnostics thresholds=%s chakras=%s supported_chakras=%s",
            {"meaningful_directional_score": self.meaningful_threshold,
             "dominance_ratio": self.dominance_ratio, "confidence_is_gate": False,
             "coverage_is_gate": False},
            [{"chakra": r.chakra, "presence": r.presence_score,
              "deficient": r.deficient_score, "excess": r.excess_score,
              "confidence_pct": r.confidence_pct, "independent_units": r.independent_evidence_units,
              "status": r.status, "passed_imbalance_gate": r.status.startswith("IMBALANCED"),
              "reasons": r.reasons}
             for r in results],
            supported,
        )
        return ChakraReport(
            results=results, supported_chakras=supported, directional_chakras=directional, ranking=ranking,
            assessed_quadrants=sorted(assessed),
            coverage={"assessed_quadrants": n_assessed, "reference_quadrants": self.n_quadrants,
                      "balanced_requires": self.balanced_min_quadrants, "adequately_assessed": adequately_assessed},
            audit={"thresholds": {"meaningful_directional_score": self.meaningful_threshold,
                                  "insufficient_score": self.insufficient_score_threshold,
                                  "balanced_min_assessed_quadrants": self.balanced_min_quadrants,
                                  "dominance_ratio": self.dominance_ratio,
                                  "confidence_is_gate": False, "coverage_is_gate": False},
                   "weights": {"strength": self.strength, "intensity": self.intensity, "reliability": self.reliability,
                               "confidence": self.conf_weights},
                   "clinically_validated": False,
                   "note": "All thresholds are engineering baselines, configurable, not clinically validated."})
