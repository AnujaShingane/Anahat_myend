"""Spec section 6 (contradiction -> clarification, never silent overwrite) and the requirement that
the result window lists the most affected imbalanced chakra first. Real KB + real service."""
from app.core.enums import EvidenceStatus
from tests.scenarios.harness import SOLAR_EXC, THROAT, card, concept, cover_all_quadrants, make_session, say

T = "Throat Chakra"
S = "Solar Plexus Chakra"


def _two_statements(first_freq, second_freq, first_int="Moderate", second_int="Moderate"):
    a, b = "I feel unheard at home, it happens every day", "Honestly nobody listens only now and then"
    script = {a: [concept("feel unheard", "feeling unheard", "emotion", intensity=first_int, frequency=first_freq)],
              b: [concept("nobody listens", "feeling unheard", "emotion", intensity=second_int, frequency=second_freq)]}
    return a, b, make_session(script, {"feeling unheard": [(THROAT["unheard"], .9)]})


def test_conflicting_frequency_is_kept_not_overwritten_and_a_polite_question_is_asked():
    a, b, (svc, sid) = _two_statements("every day", "a couple of days a week")
    say(svc, sid, a, confirm=False)
    out, _ = say(svc, sid, b, confirm=False)
    ev = svc._ctx(sid).evidence[0]
    assert ev.frequency == "every day"                                   # earlier answer NOT overwritten
    assert ev.contradiction_open and ev.attribute_conflicts[0]["attribute"] == "frequency"
    assert {h["value"] for h in ev.attribute_history if h["attribute"] == "frequency"} == {"every day", "a couple of days a week"}
    item = next(i for i in out["intensity_follow_ups"] if i["field"] == "conflict")
    assert "Just to make sure I have this right" in item["question"] and len(item["options"]) == 2
    assert out["conflict_follow_ups"]


def test_open_contradiction_cannot_set_an_imbalance_until_it_is_clarified_then_counts_once():
    a, b, (svc, sid) = _two_statements("every day", "a couple of days a week")
    say(svc, sid, a, confirm=False)
    out, _ = say(svc, sid, b, confirm=False)
    cover_all_quadrants(svc, sid)
    before = card(svc.final_result(sid), T)
    assert before["status"] == "UNRESOLVED" and before["status_code"] == "CONFLICTING_EVIDENCE"
    assert before["trace"][0]["reliability_weight"] == 0.1
    item = next(i for i in out["intensity_follow_ups"] if i["field"] == "conflict")
    svc.answer_deep_dive(sid, item["evidence_id"], "conflict", item["options"][0], raw_text="every day, honestly")
    ev = svc._ctx(sid).evidence[0]
    assert not ev.contradiction_open and ev.frequency == "every day" and ev.attribute_conflicts[0]["resolved"]
    after = card(svc.final_result(sid), T)
    assert after["status"].startswith("IMBALANCED") and after["independent_evidence_units"] == 1


def test_clarifying_to_the_later_statement_replaces_the_value():
    a, b, (svc, sid) = _two_statements("every day", "a couple of days a week")
    say(svc, sid, a, confirm=False)
    out, _ = say(svc, sid, b, confirm=False)
    item = next(i for i in out["intensity_follow_ups"] if i["field"] == "conflict")
    svc.answer_deep_dive(sid, item["evidence_id"], "conflict", item["options"][1])
    assert svc._ctx(sid).evidence[0].frequency == "a couple of days a week"


def test_compatible_repeat_is_not_a_contradiction():
    a, b, (svc, sid) = _two_statements("every day", "daily")
    say(svc, sid, a, confirm=False)
    out, _ = say(svc, sid, b, confirm=False)
    ev = svc._ctx(sid).evidence[0]
    assert not ev.contradiction_open and not ev.attribute_conflicts
    assert not [i for i in out["intensity_follow_ups"] if i["field"] == "conflict"]


def test_explicit_intensity_conflict_is_detected():
    a, b, (svc, sid) = _two_statements(None, None, first_int="Mild", second_int="Severe")
    say(svc, sid, a, confirm=False)
    out, _ = say(svc, sid, b, confirm=False)
    ev = svc._ctx(sid).evidence[0]
    assert ev.contradiction_open and ev.attribute_conflicts[0]["attribute"] == "intensity"
    assert ev.intensity == "Mild"                                          # not silently replaced


def test_final_result_lists_the_most_affected_chakra_first():
    t1, a1 = "I keep everything inside and never say what I feel", "My blood pressure is high and I get angry all the time"
    script = {t1: [concept("never say what I feel", "suppressed expression", "emotion", intensity="Mild")],
              a1: [concept("blood pressure is high", "high blood pressure", intensity="Severe"),
                   concept("angry all the time", "anger", "emotion", intensity="Severe")]}
    table = {"suppressed expression": [(THROAT["suppressed"], .9)], "high blood pressure": [(SOLAR_EXC["blood_pressure_high"], .9)],
             "anger": [(SOLAR_EXC["anger"], .9)]}
    svc, sid = make_session(script, table)
    for t in (t1, a1):
        say(svc, sid, t, confirm=False)
    cover_all_quadrants(svc, sid)
    res = svc.final_result(sid)
    names = [c["chakra"] for c in res["chakras"]]
    assert names[:2] == [S, T] and res["summary"]["imbalanced"] == [S, T]       # Solar (stronger) before Throat
    assert [c["rank"] for c in res["chakras"][:2]] == [1, 2]
    assert res["summary"]["ranked_imbalanced"][0]["chakra"] == S
    assert res["summary"]["ordered_chakras"] == names
    scores = [c["overall_score"] for c in res["chakras"] if c["rank"]]
    assert scores == sorted(scores, reverse=True)
    assert all(c["rank"] is None for c in res["chakras"][2:])
