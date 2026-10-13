from app.llm.schemas import SemanticExtraction, ExtractedConcept


def concept(text, **kw):
    return SemanticExtraction(concepts=[ExtractedConcept(concept=text, domain="symptom", **kw)])


def test_semantic_schema_preserves_negation():
    x = concept("stomach cramps", polarity="negative", currentness="current", certainty="certain")
    assert x.concepts[0].polarity == "negative"


def test_semantic_schema_preserves_historical_status():
    x = concept("stomach cramps", polarity="positive", currentness="historical", certainty="certain", historical_status="past")
    assert x.concepts[0].currentness == "historical"


def test_semantic_schema_preserves_uncertainty_and_context():
    x = concept("stomach tightening", polarity="positive", currentness="current", certainty="uncertain", context="stress", trigger="stress", uncertainty="patient unsure")
    assert x.concepts[0].certainty == "uncertain"
    assert x.concepts[0].trigger == "stress"


def test_multiple_concepts_are_allowed():
    x = SemanticExtraction(concepts=[
        ExtractedConcept(concept="exhaustion", domain="symptom", polarity="positive", currentness="current", certainty="certain", intensity="Severe"),
        ExtractedConcept(concept="sleep difficulty", domain="symptom", polarity="positive", currentness="current", certainty="probable", intensity="Moderate"),
    ])
    assert len(x.concepts) == 2


def test_generic_fine_statement_is_context_not_indicator():
    x = SemanticExtraction(concepts=[ExtractedConcept(concept="everything is fine", domain="context", polarity="neutral", currentness="current", certainty="certain")])
    assert all(c.domain not in {"symptom", "emotion", "behaviour"} for c in x.concepts)
