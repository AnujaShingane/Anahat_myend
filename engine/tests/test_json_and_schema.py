"""A valid JSON | B fenced JSON | C invalid JSON | D schema-invalid | K empty | M schema | N no fabrication."""
import hashlib
import json

import pytest

from app.core.exceptions import LLMInvalidResponseError
from app.llm.json_utils import parse_extraction_json, validate_extraction
from app.llm.prompts import EXTRACTION_SYSTEM_PROMPT, build_extraction_prompt
from app.llm.schemas import ExtractedConcept, SemanticExtraction
from tests.helpers import as_json, fenced, negative_payload, positive_payload


# ---- A. valid JSON -------------------------------------------------------------
def test_A_plain_valid_json():
    r = parse_extraction_json(as_json(positive_payload()))
    assert isinstance(r, SemanticExtraction)
    assert r.concepts[0].concept == "lower back pain"


def test_A_surrounding_whitespace_and_bom_are_ignored():
    r = parse_extraction_json("\ufeff  \n" + as_json(positive_payload()) + "\n\n  ")
    assert r.concepts[0].intensity == "Severe"


# ---- B. fenced JSON ------------------------------------------------------------
@pytest.mark.parametrize("text", [
    fenced(positive_payload(), "json"),
    fenced(positive_payload(), "JSON"),
    fenced(positive_payload(), ""),
    "```json\n" + as_json(positive_payload()),                       # closing fence missing
    "Here is the extraction:\n" + fenced(positive_payload()) + "\nHope this helps!",  # ONE fenced block + prose
    "  \n" + fenced(positive_payload()) + "  \n",
])
def test_B_fenced_json_variants_are_recovered(text):
    r = parse_extraction_json(text)
    assert r.concepts[0].concept == "lower back pain"


# ---- C. invalid JSON -----------------------------------------------------------
@pytest.mark.parametrize("text,category", [
    ("this is not json at all", "invalid_json"),
    ('{"concepts": [', "invalid_json"),                                   # truncated
    ("{'concepts': []}", "invalid_json"),                                 # python-style quotes
    ('[{"concepts": []}]', "invalid_json"),                               # top-level array
    ("The patient has pain. " + as_json(positive_payload()), "invalid_json"),   # bare JSON inside prose: NOT extracted
    (as_json(positive_payload()) + " and some trailing words", "invalid_json"),
    (fenced(positive_payload()) + "\n" + fenced(negative_payload()), "invalid_json"),  # 2 blocks: ambiguous
    ("```python\n" + as_json(positive_payload()) + "\n```", "invalid_json"),  # wrong language tag
])
def test_C_invalid_json_is_rejected(text, category):
    with pytest.raises(LLMInvalidResponseError) as ei:
        parse_extraction_json(text)
    assert ei.value.category == category


# ---- D. schema-invalid JSON ----------------------------------------------------
def _with(**concept_overrides):
    p = positive_payload()
    p["concepts"][0].update(concept_overrides)
    return p


@pytest.mark.parametrize("payload", [
    _with(polarity="maybe"),                     # enum violation
    _with(domain="chakra"),                      # enum violation
    _with(intensity="Extreme"),                  # enum violation
    _with(certainty="definitely"),               # enum violation
    _with(chakra="Muladhara"),                   # extra field forbidden: the model must not infer chakras
    _with(concept=""),                           # min_length
    {"concepts": [], "diagnosis": "sciatica"},   # extra top-level field forbidden: no diagnosis
    {"concepts": "back pain"},                   # wrong type
    {"concepts": [{"concept": "pain"}]},         # missing required fields
])
def test_D_schema_invalid_json_is_rejected(payload):
    with pytest.raises(LLMInvalidResponseError) as ei:
        parse_extraction_json(as_json(payload))
    assert ei.value.category == "schema_invalid"


def test_D_error_detail_never_echoes_model_or_patient_text():
    secret = "PATIENT-SECRET-PHRASE"
    with pytest.raises(LLMInvalidResponseError) as ei:
        parse_extraction_json(as_json(_with(polarity=secret)))
    assert secret not in str(ei.value)


# ---- K. empty responses --------------------------------------------------------
@pytest.mark.parametrize("raw", [None, "", "   \n\t ", "```json\n```"])
def test_K_empty_response_is_an_error_not_empty_concepts(raw):
    with pytest.raises(LLMInvalidResponseError):
        parse_extraction_json(raw)


# ---- M. SemanticExtraction validation ------------------------------------------
def test_M_schema_is_unchanged_and_strict():
    c = ExtractedConcept.model_fields
    assert set(c) == {"concept", "evidence_quote", "domain", "polarity", "currentness", "certainty", "intensity", "frequency",
                      "duration", "context", "trigger", "impact", "coping", "historical_status",
                      "uncertainty", "clarification_required", "clarification_reason"}
    assert set(SemanticExtraction.model_fields) == {"concepts", "overall_uncertainty",
                                                    "clarification_required", "safety_relevant"}
    schema = SemanticExtraction.model_json_schema()["$defs"]["ExtractedConcept"]["properties"]
    assert schema["domain"]["enum"] == ["symptom", "emotion", "behaviour", "context", "other"]
    assert schema["polarity"]["enum"] == ["positive", "negative", "neutral", "uncertain"]
    assert schema["currentness"]["enum"] == ["current", "historical", "unknown"]
    assert schema["certainty"]["enum"] == ["certain", "probable", "uncertain"]
    assert SemanticExtraction.model_config["extra"] == "forbid"
    assert ExtractedConcept.model_config["extra"] == "forbid"


def test_M_validate_extraction_revalidates_instances():
    ok = SemanticExtraction.model_validate(positive_payload())
    assert validate_extraction(ok) == ok
    tampered = SemanticExtraction.model_construct(concepts=[{"concept": "x", "polarity": "bogus"}])
    with pytest.raises(LLMInvalidResponseError):
        validate_extraction(tampered)


def test_M_valid_empty_extraction_is_preserved_not_filled_in():
    r = parse_extraction_json('{"concepts": []}')
    assert r.concepts == []  # a model may legitimately find nothing; we never invent concepts


# ---- N. prompt integrity / no fabrication --------------------------------------
def test_N_extraction_prompt_keeps_its_safety_rules():
    # The prompt was deliberately extended (verbatim quote, no invented severity). Guard the rules
    # that must never be dropped by a later edit.
    for phrase in ("Do not diagnose, infer chakras", "evidence_quote", "Preserve negation",
                   "Never invent intensity", "explicitly denies", "safety_relevant"):
        assert phrase in EXTRACTION_SYSTEM_PROMPT
