from app.llm.schemas import SemanticExtraction

def test_strict_schema_rejects_unknown_authority_fields():
    try:
        SemanticExtraction.model_validate({"concepts":[],"chakra":"Root Chakra"})
        assert False
    except Exception:
        assert True

def test_semantic_schema_preserves_temporal_and_polarity():
    x=SemanticExtraction.model_validate({"concepts":[{"concept":"stomach cramps","domain":"symptom","polarity":"negative","currentness":"historical","certainty":"certain","intensity":None,"frequency":"sometimes","duration":None,"context":"stress","trigger":"stress","impact":None,"coping":None,"historical_status":"used to have","uncertainty":None,"clarification_required":False,"clarification_reason":None}]})
    c=x.concepts[0]; assert c.polarity=="negative" and c.currentness=="historical" and c.context=="stress"
