"""Indicator-matching recall fixes: looser WHERE it was too tight (similarity cliff, quote recovery,
retrieval query, everyday-language cues) while the precision gates stay in place."""
import json
from pathlib import Path

from app.engine.grounding import CONFIRMED, PROVISIONAL, REJECTED, ground_candidate, indicator_vocabulary
from app.knowledge.indicator_repository import normalize_term
from app.services.assessment_service import quote_is_verbatim, recover_verbatim_quote_fallback
from tests.scenarios.harness import concept, kb, make_session

INSOMNIA = "SYM-086"


def test_similarity_cliff_is_now_a_ramp_confirmed_provisional_rejected():
    c = {"concept": "words get stuck", "evidence_quote": "my words get stuck when I talk", "domain": "symptom"}
    kw = dict(concept=c, term="Stuttering", indicator_domain="symptom", validator_match="exact")
    assert ground_candidate(similarity=0.75, **kw).verdict == CONFIRMED          # unchanged
    assert ground_candidate(similarity=0.60, **kw).verdict == PROVISIONAL        # used to be REJECTED (< 0.65)
    assert ground_candidate(similarity=0.40, **kw).verdict == REJECTED           # still rejected


def test_precision_gates_are_unchanged():
    emo = {"concept": "overwhelmed", "evidence_quote": "I feel overwhelmed", "domain": "emotion"}
    assert ground_candidate(concept=emo, term="Stroke", indicator_domain="symptom", validator_match="exact",
                            similarity=0.9).verdict == REJECTED                  # emotion never becomes a physical illness
    sym = {"concept": "stomach pain", "evidence_quote": "my stomach hurts", "domain": "symptom"}
    assert ground_candidate(concept=sym, term="Stroke", indicator_domain="symptom", validator_match="retrieval_only",
                            similarity=0.9).verdict == REJECTED                  # retrieval alone never confirms


def test_fallback_quote_recovery_cuts_a_span_from_the_patients_own_words():
    text = "I can't sleep properly at night"
    span = recover_verbatim_quote_fallback(text, "trouble sleeping", "trouble sleeping")
    assert span and quote_is_verbatim(text, span) and "sleep" in span.lower()
    # nothing the patient did not say can ever be recovered
    assert recover_verbatim_quote_fallback("My family is supportive", "insomnia", "insomnia") is None
    # never across punctuation
    got = recover_verbatim_quote_fallback("Work is fine. I overthink everything, always.", "overthinking", "overthinking")
    assert got and "." not in got and "," not in got


def test_cue_vocabulary_covers_far_more_indicators_and_every_key_is_a_real_kb_term():
    vocab = json.loads((Path(__file__).resolve().parents[2] / "config" / "indicator_vocabulary.json").read_text("utf-8"))
    keys = {k for k in vocab if not k.startswith("_")}
    terms = {normalize_term(i.term) for i in kb().indicators}
    assert keys - {"depression"} <= terms               # adds no indicator ('depression' is a pre-existing reviewed key)
    assert len(keys) >= 80                                # was 31 of 168
    assert indicator_vocabulary("Guilt") and indicator_vocabulary("Shame")      # emotions that had no cues before


def test_paraphrase_with_a_non_verbatim_label_still_reaches_the_kb_indicator():
    text = "I can't sleep properly at night."
    c = concept("trouble sleeping", "insomnia", "symptom", intensity="Moderate")      # model quote is NOT verbatim
    svc, sid = make_session({text: [c]}, {"insomnia": [(INSOMNIA, 0.8)]})
    out = svc.process_response(sid, text, None, None)
    ev = svc._ctx(sid).evidence
    assert ev and ev[0].indicator_term == "Insomnia" and ev[0].quote and quote_is_verbatim(text, ev[0].quote)


def test_the_sentence_holding_the_quote_is_used_as_an_extra_retrieval_query():
    sentence = "Most nights I just lie there staring at the ceiling, unable to sleep."
    text = "Work is busy. " + sentence
    c = concept("unable to sleep", "sleep disturbance", "symptom", intensity="Moderate")
    # only the full sentence is known to the (scripted) vector search
    svc, sid = make_session({text: [c]}, {sentence: [(INSOMNIA, 0.8)]})
    svc.process_response(sid, text, None, None)
    assert [e.indicator_term for e in svc._ctx(sid).evidence] == ["Insomnia"]
