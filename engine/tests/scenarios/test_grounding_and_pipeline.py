"""Evidence grounding, status handling, scoring guards, quadrant triggers and question context.

A deliberately LENIENT scripted validator is used (it answers "exact" for every retrieved candidate)
so these tests prove the engine's own grounding gate, not a model's mood."""
from app.core.enums import EvidenceStatus
from app.engine.grounding import CONFIRMED, PROVISIONAL, REJECTED, ground_candidate
from app.llm.schemas import CandidateJudgement, CandidateValidation
from app.services.question_service import QuestionService
from tests.scenarios.harness import concept, kb, make_session

STROKE, MIGRAINE, HIVES, VAGINITIS = "SYM-119", "SYM-103", "SYM-075", "SYM-133"
STOMACH, INSOMNIA, HEADACHES, SUPPRESSED, BP_HIGH = "SYM-118", "SYM-086", "SYM-065", "EMO-007", "SYM-016"


def run(text, concepts, table, validate=None):
    svc, sid = make_session({text: concepts}, table, validate=validate)
    out = svc.process_response(sid, text, None, None)
    ctx = svc._ctx(sid)
    return svc, sid, out, ctx


def terms(ctx):
    return {e.indicator_term for e in ctx.evidence if not e.twin_of}


def rejected_ids(out):
    return {r["indicator_id"] for r in out["rejected_candidates"]}


# ------------------------------------------------------------ Stage C: unsupported candidates
def test_general_overwhelm_never_becomes_a_physical_illness():
    text = "I often feel overwhelmed trying to balance my professional and family responsibilities."
    c = concept("I often feel overwhelmed", "overwhelmed", "emotion", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"overwhelmed": [(STROKE, 0.82), (VAGINITIS, 0.78), (HIVES, 0.7)],
                                         "I often feel overwhelmed": [(STROKE, 0.82)]})
    assert not (terms(ctx) & {"Stroke", "Vaginitis", "Hives"})
    assert {STROKE, VAGINITIS, HIVES} <= rejected_ids(out)
    assert all(r["reasons"] for r in out["rejected_candidates"])


def test_stress_affecting_sleep_supports_sleep_not_migraine():
    text = "I cannot sleep because I keep worrying. The constant pressure affects my sleep."
    c = concept("I cannot sleep", "difficulty sleeping", "symptom", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"difficulty sleeping": [(INSOMNIA, 0.8), (MIGRAINE, 0.7)],
                                         "I cannot sleep": [(INSOMNIA, 0.8), (MIGRAINE, 0.7)]})
    assert "Insomnia" in terms(ctx) and "Migraines" not in terms(ctx)
    assert MIGRAINE in rejected_ids(out)


def test_everyday_wording_matches_the_approved_indicator():
    text = "My stomach hurts after eating."
    c = concept("My stomach hurts", "stomach pain", "symptom", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"stomach pain": [(STOMACH, 0.8)], "My stomach hurts": [(STOMACH, 0.8)]})
    ev = next(e for e in ctx.evidence if e.indicator_term == "Stomach problems")
    assert ev.status in {EvidenceStatus.CONFIRMED, EvidenceStatus.UNRESOLVED}


def test_related_but_different_symptom_is_provisional_never_confirmed():
    text = "My stomach feels bloated."

    def validate(_t, _c, cands):
        return CandidateValidation(judgements=[CandidateJudgement(indicator_id=x["indicator_id"], match="partial")
                                               for x in cands])
    c = concept("My stomach feels bloated", "bloated stomach", "symptom", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"bloated stomach": [(STOMACH, 0.8)], "My stomach feels bloated": [(STOMACH, 0.8)]},
                             validate=validate)
    ev = next(e for e in ctx.evidence if e.indicator_term == "Stomach problems")
    assert ev.status == EvidenceStatus.PROVISIONAL


def test_weak_unlinked_candidate_is_rejected_even_when_validator_says_exact():
    text = "I have been feeling a bit off lately."
    c = concept("a bit off", "feeling off", "symptom", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"feeling off": [(MIGRAINE, 0.5)], "a bit off": [(MIGRAINE, 0.5)]})
    assert not ctx.evidence and MIGRAINE in rejected_ids(out)


# ------------------------------------------------------------ negation / history / emotion indicators
def test_negated_headache_is_recorded_as_negation_not_positive_evidence():
    text = "I do not have headaches."
    c = concept("I do not have headaches", "headaches", "symptom", polarity="negative", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"headaches": [(HEADACHES, 0.9)]})
    evs = [e for e in ctx.evidence if e.indicator_term == "Headaches"]
    assert evs and all(e.status == EvidenceStatus.NEGATIVE for e in evs)
    assert svc.final_result(sid)["chakras"] and not any(
        t.get("counted") for ch in svc.final_result(sid)["chakras"] for t in ch.get("trace", []))


def test_past_migraines_are_historical_not_current():
    text = "I used to have migraines several years ago."
    c = concept("I used to have migraines", "migraines", "symptom", currentness="historical", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"migraines": [(MIGRAINE, 0.9)]})
    evs = [e for e in ctx.evidence if e.indicator_term == "Migraines"]
    assert evs and all(e.status == EvidenceStatus.HISTORICAL for e in evs)


def test_keeping_worries_to_oneself_matches_an_approved_suppression_indicator():
    text = "I keep my worries to myself because I do not want my family to worry."
    c = concept("I keep my worries to myself", "keeps worries to self", "behaviour", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"keeps worries to self": [(SUPPRESSED, 0.8)],
                                         "I keep my worries to myself": [(SUPPRESSED, 0.8)]})
    assert "Suppressed Expression" in terms(ctx)


def test_several_indicators_in_one_answer_are_each_grounded():
    text = "My stomach hurts and I cannot sleep."
    cs = [concept("My stomach hurts", "stomach pain", "symptom", intensity=None),
          concept("I cannot sleep", "difficulty sleeping", "symptom", intensity=None)]
    table = {"stomach pain": [(STOMACH, 0.8), (STROKE, 0.6)], "My stomach hurts": [(STOMACH, 0.8)],
             "difficulty sleeping": [(INSOMNIA, 0.8), (MIGRAINE, 0.7)], "I cannot sleep": [(INSOMNIA, 0.8)]}
    svc, sid, out, ctx = run(text, cs, table)
    assert terms(ctx) == {"Stomach problems", "Insomnia"}


def test_grounding_function_rules():
    emo = {"concept": "overwhelmed", "evidence_quote": "I feel overwhelmed", "domain": "emotion"}
    assert ground_candidate(concept=emo, term="Stroke", indicator_domain="symptom", validator_match="exact",
                            similarity=0.9).verdict == REJECTED
    sym = {"concept": "stomach pain", "evidence_quote": "my stomach hurts", "domain": "symptom"}
    assert ground_candidate(concept=sym, term="Stomach problems", indicator_domain="symptom", validator_match="exact",
                            similarity=0.5).verdict == CONFIRMED
    assert ground_candidate(concept=sym, term="Stomach problems", indicator_domain="symptom", validator_match="partial",
                            similarity=0.5).verdict == PROVISIONAL
    assert ground_candidate(concept=sym, term="Stroke", indicator_domain="symptom", validator_match="retrieval_only",
                            similarity=0.9).verdict == REJECTED


# ------------------------------------------------------------ scoring guards
def test_rejected_candidates_add_nothing_to_the_final_scores():
    text = "I often feel overwhelmed at work."
    c = concept("I often feel overwhelmed", "overwhelmed", "emotion", intensity=None)
    svc, sid, out, ctx = run(text, [c], {"overwhelmed": [(STROKE, 0.9)], "I often feel overwhelmed": [(STROKE, 0.9)]})
    res = svc.final_result(sid)
    assert not ctx.evidence
    assert all(not ch["status"].startswith("IMBALANCED") for ch in res["chakras"])


def test_unstated_intensity_is_flagged_as_assumed_and_cant_say_is_not_recorded_as_reported():
    text = "I get angry quickly."
    c = concept("I get angry", "anger", "emotion", intensity=None)
    svc, sid, out, ctx = run(text, [c], {})
    item = out["intensity_follow_ups"][0]
    svc.answer_deep_dive(sid, item["evidence_id"], "intensity", "Mild", assumed=True)
    ev = next(e for e in ctx.evidence if e.indicator_term == "Anger")
    assert ev.intensity is None and ev.intensity_source == "assumed_default"
    traces = [t for ch in svc.final_result(sid)["chakras"] for t in ch.get("trace", []) if t.get("term") == "Anger"]
    assert traces and all(t.get("intensity_assumed") for t in traces)


def test_provisional_evidence_alone_cannot_establish_an_imbalance_when_the_guard_is_on(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "provisional_alone_can_establish_imbalance", False)
    text = "My stomach feels bloated."

    def partial(_t, _c, cands):
        return CandidateValidation(judgements=[CandidateJudgement(indicator_id=x["indicator_id"], match="partial")
                                               for x in cands])
    c = concept("My stomach feels bloated", "bloated stomach", "symptom", intensity="Severe")
    svc, sid, out, ctx = run(text, [c], {"bloated stomach": [(STOMACH, 0.8)], "My stomach feels bloated": [(STOMACH, 0.8)]},
                             validate=partial)
    res = svc.final_result(sid)
    assert not any(ch["status"].startswith("IMBALANCED") for ch in res["chakras"])


# ------------------------------------------------------------ quadrant recommendation
FORM = """46 yrs, Female \u00b7 Salaried \u00b7 married \u00b7 from Mumbai
Main concerns: Blood pressure concerns, Stress and burnout, Anxiety, Irregular or poor sleep, Fatigue and difficulty relaxing, Work and family responsibilities.
Sleep: Poor."""
BASE = {"stress": 8, "anxiety": 7, "mood": 5, "energy": 3, "sleep_quality": "Poor"}


def recommend(issue, baseline=None, **kw):
    return QuestionService(kb()).recommend_quadrants(current_issue=issue, baseline=baseline, limit=7, **kw)


def names(rec):
    return [r["quadrant"] for r in rec]


def test_current_case_prioritises_medical_lifestyle_work_family_physical_and_music():
    rec = recommend(FORM, BASE)
    assert {"Medical & Therapeutic Background", "Lifestyle", "Profession", "Family", "Physical Nature",
            "Music Therapy Profile"} <= set(names(rec))
    assert names(rec).index("Nature") > 5 if "Nature" in names(rec) else True
    assert all(r["reasons"] for r in rec)


def test_individual_triggers():
    assert "Medical & Therapeutic Background" in names(recommend("Main concerns: blood pressure."))
    assert "Lifestyle" in names(recommend("Main concerns: poor sleep."))
    assert "Physical Nature" in names(recommend("Main concerns: constant fatigue and low energy."))
    assert "Profession" in names(recommend("Main concerns: work pressure and deadlines."))
    assert "Family" in names(recommend("Main concerns: family responsibilities."))
    assert "Diet" in names(recommend("I skip meals and my appetite is poor."))
    assert "Music Therapy Profile" in names(recommend("I want to use music to relax."))


def test_priorities_change_with_the_patients_context():
    work_only = names(recommend("Main concerns: work pressure."))
    assert "Medical & Therapeutic Background" not in work_only and "Family" not in work_only
    negated = names(recommend("Main concerns: work pressure. I do not have any blood pressure problem."))
    assert "Medical & Therapeutic Background" not in negated


def test_medical_area_is_never_cut_by_the_result_limit():
    rec = QuestionService(kb()).recommend_quadrants(current_issue=FORM, baseline=BASE, limit=2)
    assert "Medical & Therapeutic Background" in names(rec)


def test_explored_areas_are_not_repeated_without_reason():
    done = names(QuestionService(kb()).recommend_quadrants(current_issue=FORM, baseline=BASE, limit=7,
                                                           exhausted={"Lifestyle"}))
    assert "Lifestyle" not in done
    started = QuestionService(kb()).recommend_quadrants(current_issue=FORM, baseline=BASE, limit=7, assessed={"Profession"})
    pro = next(r for r in started if r["quadrant"] == "Profession")
    assert pro["already_started"] and pro["relevance_score"] < 0.5
