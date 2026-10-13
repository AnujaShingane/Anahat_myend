"""One test per rule of ANAHAT_Finalized_Scoring_Rules_Final.docx (section numbers in the names).
Real KB, real ScoringEngine, no network. Values are engineering baselines (spec section 17)."""
from contextlib import contextmanager

from app.core.config import settings
from app.core.enums import EvidenceStatus as S
from app.engine import attribute_conflict as ac
from app.engine.scoring_engine import ScoringEngine, is_imbalanced
from app.knowledge.indicator_repository import IndicatorRepository
from app.knowledge.loader import KnowledgeBase
from app.models.evidence import EvidenceRecord

KB = KnowledgeBase().load_directory("knowledge_base/ANAHAT_KnowledgeBase_v3")
REPO = IndicatorRepository(KB)
ALL = list(KB.quadrant_names)

# unambiguous single-chakra indicators (state, strength) used as fixtures
STRONG_THROAT_DEF = "BEH-007"      # Silence / Not Speaking Up      Throat  Deficient  Strong
STRONG_SOLAR_EXC = "SYM-016"       # Blood Pressure, High           Solar   Excess     Strong
STRONG_SOLAR_DEF = "SYM-043"       # Fatigue                        Solar   Deficient  Strong
STRONG_SOLAR_EXC2 = "BEH-003"      # Overworking                    Solar   Excess     Strong
MEDIUM_HEART_DEF = "SYM-029"       # Colds                          Heart   Deficient  Medium
MEDIUM_SOLAR_EXC = "SYM-039"       # Eczema                         Solar   Excess     Medium
WEAK_SACRAL_DEF = "SYM-082"        # Incurable diseases             Sacral  Deficient  Weak


@contextmanager
def setting(name, value):
    old = getattr(settings, name)
    setattr(settings, name, value)
    try:
        yield
    finally:
        setattr(settings, name, old)


def ev(eid, iid, intensity="Moderate", status=S.CONFIRMED, response="r1", **kw):
    return EvidenceRecord(
        evidence_id=eid, response_id=response, canonical_indicator_id=iid, indicator_term=REPO.term(iid),
        status=status, polarity="positive", currentness="current", certainty="certain", intensity=intensity,
        intensity_source="patient_words" if intensity else None, correlation_group=REPO.group_key(iid), **kw)


def score(evidence, **kw):
    kw.setdefault("assessed_quadrants", set(ALL))
    kw.setdefault("suggested_quadrants", None)
    kw.setdefault("completed_quadrants", ALL)
    return ScoringEngine(KB).score(evidence, **kw)


def chakra(report, name):
    return next(r for r in report.results if r.chakra == name)


T, S_, H, SA = "Throat Chakra", "Solar Plexus Chakra", "Heart Chakra", "Sacral Chakra"


# ---------------------------------------------------------------- section 2: overall bands
def test_s2_band_boundaries():
    e = ScoringEngine(KB)
    assert e.band(0.3999) == "minimal" and e.band(0.40) == "mild"
    assert e.band(0.5499) == "mild" and e.band(0.55) == "moderate"
    assert e.band(0.7499) == "moderate" and e.band(0.75) == "severe"


def test_s2_070_is_not_the_universal_imbalance_or_severe_threshold():
    r = chakra(score([ev("a", STRONG_THROAT_DEF, "Moderate")]), T)       # 1.0 x 0.7 x 1.0 = 0.70
    assert r.overall_score == 0.7 and r.severity_band == "Moderate"      # NOT Severe
    assert chakra(score([ev("a", STRONG_THROAT_DEF, "Mild")]), T).severity_band == "Mild"   # 0.40 is already imbalanced


def test_s2_below_040_is_balanced_only_when_suggested_quadrants_are_complete():
    weak = [ev("w", WEAK_SACRAL_DEF, "Moderate")]                         # 0.3 x 0.7 = 0.21
    done = chakra(score(weak, suggested_quadrants=["Nature", "Family"], completed_quadrants=["Nature", "Family"]), SA)
    assert done.status == "BALANCED" and done.severity_band == "Balanced"
    assert [m["term"] for m in done.minor_signals] == ["Incurable diseases"]            # minor signals are listed
    part = chakra(score(weak, suggested_quadrants=["Nature", "Family"], completed_quadrants=["Nature"]), SA)
    assert part.status == "UNRESOLVED" and part.status_code == "NOT_ASSESSED"
    assert part.severity_band == "Not assessed properly" and part.quadrant_completion["pending"] == ["Family"]
    assert "Family" in " ".join(part.reasons)


def test_s2_medium_moderate_is_mild_and_medium_severe_is_moderate():
    assert chakra(score([ev("a", MEDIUM_HEART_DEF, "Moderate")]), H).severity_band == "Mild"      # 0.42
    assert chakra(score([ev("a", MEDIUM_HEART_DEF, "Severe")]), H).severity_band == "Moderate"    # 0.60


# ---------------------------------------------------------------- section 3: unit contribution
def test_s3_weights_and_unit_contribution():
    e = ScoringEngine(KB)
    assert e.strength == {"Strong": 1.0, "Medium": 0.6, "Weak": 0.3}
    assert e.intensity == {"Mild": 0.4, "Moderate": 0.7, "Severe": 1.0}
    assert {k: e.reliability[k] for k in ("Confirmed", "Resolved After Clarification", "Provisional",
                                          "Unresolved", "Historical")} == {
        "Confirmed": 1.0, "Resolved After Clarification": 1.0, "Provisional": 0.4, "Unresolved": 0.1, "Historical": 0.1}
    item = chakra(score([ev("a", MEDIUM_HEART_DEF, "Moderate")]), H).trace[0]
    assert item.contribution == round(0.6 * 0.7 * 1.0, 6)


def test_s3_unresolved_evidence_counts_at_weight_point_one():
    unresolved = ev("u", STRONG_THROAT_DEF, "Severe", status=S.UNRESOLVED)
    r = chakra(score([unresolved]), T)
    assert r.trace[0].reliability_weight == 0.1 and r.overall_score == 0.1
    assert r.status == "BALANCED"                      # 0.1 never establishes an imbalance on its own
    assert r.pending_clarification                     # but it is flagged for clarification


def test_s3_historical_and_negative_never_add_to_a_score():
    hist = ev("h", STRONG_THROAT_DEF, "Severe", status=S.HISTORICAL)
    hist.currentness = "historical"
    neg = ev("n", STRONG_THROAT_DEF, "Severe", status=S.NEGATIVE)
    neg.polarity = "negative"
    r = chakra(score([hist, neg]), T)
    assert r.overall_score == 0 and r.deficient_score == 0 and r.excess_score == 0


# ---------------------------------------------------------------- section 4 / 16: intensity
def test_s4_missing_intensity_is_never_silently_moderate():
    r = chakra(score([ev("a", STRONG_THROAT_DEF, None)]), T)
    item = r.trace[0]
    assert item.intensity == "Mild" and item.intensity_assumed and item.intensity_weight == 0.4
    assert r.pending_details and r.pending_details[0]["missing"] == ["intensity"]


def test_s4_often_is_a_frequency_word_not_a_severity_word():
    from app.engine.intensity import infer_intensity
    assert infer_intensity("I often overthink things", quote="often overthink").label is None   # must ask
    assert infer_intensity("I usually can't sleep", quote="can't sleep").label is None
    got = infer_intensity("I often can't sleep and it is really exhausting", quote="can't sleep")
    assert got.label == "Moderate"                                           # from 'really' + impact, not 'often'


# ---------------------------------------------------------------- section 5: one problem = one group
def test_s5_repeated_mentions_and_twin_entries_are_one_group():
    twin = ev("t2", "EMO-008", "Severe", response="r2")
    twin.twin_of = "t1"
    r = chakra(score([ev("t1", "SYM-009", "Severe"), twin]), "Root Chakra")
    assert r.independent_evidence_units == 1


def test_s5_fear_and_anxiety_are_one_underlying_problem_but_other_problems_stay_independent():
    one = chakra(score([ev("f", "EMO-001", "Moderate", response="r1"), ev("a", "EMO-008", "Moderate", response="r2")]),
                 "Root Chakra")
    assert one.independent_evidence_units == 1                       # 'afraid' + 'worry' = ONE group (spec example)
    two = chakra(score([ev("a", STRONG_SOLAR_EXC), ev("b", STRONG_SOLAR_EXC2, response="r2")]), S_)
    assert two.independent_evidence_units == 2                       # different problems, same chakra: independent


# ---------------------------------------------------------------- section 8: diminishing returns
def test_s8_multipliers_geometric_default_and_stepped_option():
    e = ScoringEngine(KB)
    assert [round(e.multiplier(n), 3) for n in range(1, 7)] == [1.0, 0.7, 0.49, 0.343, 0.24, 0.168]
    stepped = ScoringEngine(KB)
    stepped.dr = {**stepped.dr, "curve": "stepped"}
    assert [stepped.multiplier(n) for n in range(1, 7)] == [1.0, 0.75, 0.5, 0.25, 0.25, 0.25]


def test_s8_overall_aggregation_is_noisy_or_over_discounted_groups_and_bounded():
    r = chakra(score([ev("a", STRONG_SOLAR_EXC, "Moderate"), ev("b", STRONG_SOLAR_EXC2, "Moderate", response="r2")]), S_)
    assert abs(r.overall_score - (0.7 + 0.3 * 0.49)) < 1e-3          # new = old + (1-old) * c * multiplier
    assert abs(r.excess_score - (0.7 + 0.7 * 0.7)) < 1e-3            # directional = c1*1 + c2*0.7 (weighted sum)
    many = chakra(score([ev(str(i), iid, "Severe", response=f"r{i}") for i, iid in enumerate(
        [STRONG_SOLAR_EXC, STRONG_SOLAR_EXC2, "EMO-004", MEDIUM_SOLAR_EXC])]), S_)
    assert many.overall_score <= 1.0


def test_s8_independent_confirmed_findings_can_outweigh_one_isolated_strong_one():
    strong = [ev("a", STRONG_THROAT_DEF, "Severe")]                                      # one Strong+Severe
    several = [ev(str(i), iid, "Moderate", response=f"r{i}")
               for i, iid in enumerate([STRONG_SOLAR_EXC, STRONG_SOLAR_EXC2, "EMO-004"])]  # three independent
    assert chakra(score(several), S_).excess_score > chakra(score(strong), T).deficient_score * 0.9
    weak_many = [ev(str(i), MEDIUM_SOLAR_EXC, "Mild", response=f"r{i}") for i in range(6)]  # same weak problem x6
    assert chakra(score(weak_many), S_).independent_evidence_units == 1                  # repeats never inflate


# ---------------------------------------------------------------- section 10: direction
def test_s10_only_one_direction_meaningful_selects_it():
    assert chakra(score([ev("a", STRONG_SOLAR_DEF, "Moderate")]), S_).status == "IMBALANCED_DEFICIENT"
    assert chakra(score([ev("a", STRONG_SOLAR_EXC, "Moderate")]), S_).status == "IMBALANCED_EXCESS"


def test_s10_dominance_ratio_is_the_only_conflict_rule():
    close = chakra(score([ev("d", STRONG_SOLAR_DEF, "Moderate"), ev("e", STRONG_SOLAR_EXC, "Moderate", response="r2")]), S_)
    assert close.status == "CONFLICTED" and close.direction is None and is_imbalanced(close.status)
    assert any("dominance ratio" in x for x in close.reasons)
    # Deficient 0.70 vs Excess 0.60: ratio 1.17 < 1.20 -> still conflicted (only the ratio decides)
    near = chakra(score([ev("d", STRONG_SOLAR_DEF, "Moderate"), ev("e", MEDIUM_SOLAR_EXC, "Severe", response="r2")]), S_)
    assert near.status == "CONFLICTED"
    # Deficient 0.70 vs Excess 0.42: ratio 1.67 >= 1.20 -> the stronger direction wins
    clear = chakra(score([ev("d", STRONG_SOLAR_DEF, "Moderate"), ev("e", MEDIUM_SOLAR_EXC, "Moderate", response="r2")]), S_)
    assert clear.status == "IMBALANCED_DEFICIENT" and clear.direction == "Deficient"


def test_s10_overall_band_decides_imbalance_before_direction_not_a_directional_gate():
    # no 0.45 / 60%-confidence / two-unit gate: one 0.42 Medium finding is already Imbalanced Mild
    r = chakra(score([ev("a", MEDIUM_HEART_DEF, "Moderate")], assessed_quadrants=set(), completed_quadrants=[]), H)
    assert r.status == "IMBALANCED_DEFICIENT" and r.independent_evidence_units == 1
    assert r.confidence_pct == 70.0          # coverage 0%: confidence is reported, it does not block the finding


# ---------------------------------------------------------------- section 12 / 13
def test_s12_strong_severe_confirmed_is_flagged_high_priority_but_it_is_not_a_threshold():
    assert chakra(score([ev("a", STRONG_THROAT_DEF, "Severe")]), T).high_priority is True
    assert chakra(score([ev("a", STRONG_THROAT_DEF, "Mild")]), T).high_priority is False
    assert chakra(score([ev("a", MEDIUM_HEART_DEF, "Moderate")]), H).status.startswith("IMBALANCED")


def test_s13_confidence_is_reported_separately_and_never_a_gate():
    unconfirmed = chakra(score([ev("a", MEDIUM_HEART_DEF, "Moderate", status=S.PROVISIONAL)]), H)
    confirmed = chakra(score([ev("a", MEDIUM_HEART_DEF, "Moderate")]), H)
    assert confirmed.confidence_pct > unconfirmed.confidence_pct
    assert chakra(score([]), H).confidence_pct <= 30                   # no evidence is never high confidence


# ---------------------------------------------------------------- section 6: contradictions
def test_s6_open_contradiction_cannot_establish_an_imbalance_or_direction():
    e = ev("a", STRONG_THROAT_DEF, "Severe")
    e.contradiction_open = True
    r = chakra(score([e]), T)
    assert r.trace[0].reliability_weight == 0.1 and not is_imbalanced(r.status)
    assert r.status == "UNRESOLVED" and r.status_code == "CONFLICTING_EVIDENCE"
    e.contradiction_open = False                                       # after clarification: scored once, normally
    assert is_imbalanced(chakra(score([e]), T).status)


def test_s6_frequency_conflict_is_detected_semantically_and_conservatively():
    assert ac.frequency_conflict("every night", "a couple of nights a week")
    assert not ac.frequency_conflict("every day", "daily")
    assert not ac.frequency_conflict("three times a week", "a few times a week")
    assert not ac.frequency_conflict("every night", "it varies")                  # cannot place -> never guess
    assert ac.duration_conflict("for two weeks", "for 3 years") and not ac.duration_conflict("two months", "8 weeks")
    assert ac.intensity_conflict("Mild", "patient_words", "Severe", "patient_words")
    assert not ac.intensity_conflict("Mild", "inferred", "Severe", "patient_words")
    q = ac.clarification_question("Insomnia", "frequency", "every night", "a couple of nights a week")
    assert "Just to make sure I have this right" in q and "every night" in q and "a couple of nights a week" in q


# ---------------------------------------------------------------- ordering (most affected first)
def test_ordering_most_affected_imbalanced_chakra_first_then_descending():
    evidence = [ev("a", MEDIUM_HEART_DEF, "Moderate"),                       # Heart   0.42  Mild
                ev("b", STRONG_THROAT_DEF, "Severe", response="r2"),         # Throat  1.00  Severe
                ev("c", STRONG_SOLAR_EXC, "Moderate", response="r3"),        # Solar   0.70  Moderate
                ev("d", WEAK_SACRAL_DEF, "Moderate", response="r4")]         # Sacral  0.21  below band
    rep = score(evidence)
    assert rep.ordered[:3] == [T, S_, H] and [r.rank for r in rep.results[:3]] == [1, 2, 3]
    assert rep.supported_chakras == [T, S_, H]
    scores = [r.overall_score for r in rep.results if r.rank]
    assert scores == sorted(scores, reverse=True)
    assert all(r.rank is None for r in rep.results[3:])
    assert chakra(rep, SA).status == "BALANCED"
    # not-assessed chakras come before balanced ones
    rep2 = score(evidence, suggested_quadrants=["Nature"], completed_quadrants=[])
    assert [r.status for r in rep2.results[3:]] == ["UNRESOLVED"] * 4


# ---------------------------------------------------------------- optional guards
def test_provisional_alone_guard_is_configurable():
    prov = [ev("p", STRONG_THROAT_DEF, "Severe", status=S.PROVISIONAL)]          # 1.0 x 1.0 x 0.4 = 0.40
    assert chakra(score(prov), T).status == "IMBALANCED_DEFICIENT"                # spec default
    with setting("provisional_alone_can_establish_imbalance", False):
        r = chakra(score(prov), T)
        assert r.status == "UNRESOLVED" and r.status_code == "PROVISIONAL_ONLY"


def test_audit_documents_the_rules_and_that_they_are_not_clinically_validated():
    rep = score([])
    assert rep.audit["clinically_validated"] is False
    assert rep.audit["thresholds"]["overall_bands"]["balanced_below"] == 0.40
    assert rep.audit["thresholds"]["separate_conflict_margin"] == "removed"
