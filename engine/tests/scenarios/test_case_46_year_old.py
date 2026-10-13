"""End-to-end regression for the 46-year-old married salaried woman from Mumbai.

Retrieval is deliberately NOISY (it offers Stroke, Vaginitis, Hives and Migraines for emotional /
sleep statements) and the scripted validator is deliberately LENIENT (it answers "exact" to
everything). The pipeline must still record only what the patient actually said."""
from app.models.assessment import BaselineCreate
from tests.scenarios.harness import concept, make_session

FORM = ("46 yrs, Female \u00b7 Salaried \u00b7 married \u00b7 from Mumbai\n"
        "Main concerns: Blood pressure concerns, Stress and burnout, Anxiety, Irregular or poor sleep, "
        "Fatigue and difficulty relaxing, Work and family responsibilities.\nSleep: Poor.")
A1 = "I often feel overwhelmed trying to balance my professional and family responsibilities."
A2 = "The constant pressure affects my sleep. I cannot fall asleep because I keep worrying."
A3 = "I keep my worries to myself because I do not want my family to worry."
A4 = "My stomach hurts after eating."
A5 = "I feel tired all the time and I do not have headaches."
SCRIPT = {
    A1: [concept("I often feel overwhelmed", "overwhelmed", "emotion", intensity=None)],
    A2: [concept("I cannot fall asleep", "difficulty sleeping", "symptom", intensity=None),
         concept("I keep worrying", "anxiety", "emotion", intensity=None)],
    A3: [concept("I keep my worries to myself", "keeps worries to self", "behaviour", intensity=None)],
    A4: [concept("My stomach hurts", "stomach pain", "symptom", intensity=None)],
    A5: [concept("tired all the time", "fatigue", "symptom", intensity=None),
         concept("I do not have headaches", "headaches", "symptom", polarity="negative", intensity=None)],
}
NOISY = {
    "overwhelmed": [("SYM-119", 0.83), ("SYM-133", 0.79), ("SYM-075", 0.71)],
    "I often feel overwhelmed": [("SYM-119", 0.83), ("SYM-133", 0.79)],
    "difficulty sleeping": [("SYM-086", 0.8), ("SYM-103", 0.74)],
    "I cannot fall asleep": [("SYM-086", 0.8), ("SYM-103", 0.74)],
    "keeps worries to self": [("EMO-007", 0.8)], "I keep my worries to myself": [("EMO-007", 0.8)],
    "stomach pain": [("SYM-118", 0.8), ("SYM-119", 0.6)], "My stomach hurts": [("SYM-118", 0.8)],
    "fatigue": [("SYM-043", 0.85)], "tired all the time": [("SYM-043", 0.85)],
    "headaches": [("SYM-065", 0.9)], "I do not have headaches": [("SYM-065", 0.9)],
}
UNSUPPORTED = {"Stroke", "Vaginitis", "Hives", "Migraines"}


def build():
    svc, sid = make_session(SCRIPT, NOISY, baseline=False)
    svc.set_baseline(sid, BaselineCreate(stress=8, anxiety=7, mood=5, energy=3, sleep_quality="Poor"))
    ctx = svc._ctx(sid)
    ctx.demographics.update({"age": 46, "gender": "Female", "occupation": "Salaried", "marital_status": "married"})
    svc.submit_opening_response(sid, A1)
    outs = [svc.process_response(sid, a, None, None) for a in (A2, A3, A4, A5)]
    return svc, sid, ctx, outs


def test_only_what_the_patient_said_is_recorded():
    svc, sid, ctx, _ = build()
    recorded = {e.indicator_term for e in ctx.evidence if not e.twin_of}
    assert not (recorded & UNSUPPORTED), recorded
    assert {"Insomnia", "Suppressed Expression", "Stomach problems", "Fatigue"} <= recorded
    # the denied headache is kept as a negation, never as positive evidence
    assert all(e.status.value == "NEGATIVE" for e in ctx.evidence if e.indicator_term == "Headaches")


def test_every_rejection_is_traceable():
    svc, sid, ctx, _ = build()
    trace = ctx.patient_state.get("grounding_rejections", [])
    assert {t["term"] for t in trace} >= {"Stroke", "Migraines"}
    assert all(t["reasons"] and t["response_id"] for t in trace)


def test_final_scores_use_only_valid_evidence():
    svc, sid, ctx, _ = build()
    res = svc.final_result(sid)
    counted = {t["term"] for ch in res["chakras"] for t in ch.get("trace", []) if t.get("counted")}
    assert not (counted & UNSUPPORTED)
    allowed = {"Insomnia", "Anxiety", "Suppressed Expression", "Stomach problems", "Fatigue"}
    assert counted <= allowed, counted


def test_quadrant_suggestions_use_the_whole_context():
    svc, sid, ctx, _ = build()
    rec = svc.recommend_quadrants(sid, current_issue=FORM)
    names = {r["quadrant"] for r in rec}
    assert {"Medical & Therapeutic Background", "Lifestyle", "Profession", "Family", "Physical Nature",
            "Music Therapy Profile"} <= names
    assert all(r["reasons"] for r in rec)


def test_developer_trace_explains_each_decision_without_raw_text():
    svc, sid, ctx, _ = build()
    svc.recommend_quadrants(sid, current_issue=FORM)
    trace = svc.explain_trace(sid)
    blob = repr(trace)
    for text in (A1, A2, A3, A4):
        assert text not in blob                     # no raw patient answers
    assert trace["responses"][0]["extracted_concepts"]
    all_rej = [x for r in trace["responses"] for x in r["rejected_candidates"]]
    assert {x["term"] for x in all_rej} >= {"Stroke", "Migraines"}
    assert any(c["grounding"] for r in trace["responses"] for c in r["candidates"])
    assert trace["quadrant_recommendations"] and all(q["reasons"] for q in trace["quadrant_recommendations"])
