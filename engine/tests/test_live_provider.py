"""Opt-in LIVE test against the provider configured in .env.  RUN_LIVE_LLM_TESTS=1 pytest tests/test_live_provider.py -s

Skipped by default (no network/keys in CI). Uses the REAL schema and REAL ANAHAT prompt.
Note: model quality varies; a failure here is signal about the configured model, not necessarily a code bug.
"""
import os

import pytest

pytestmark = pytest.mark.skipif(os.getenv("RUN_LIVE_LLM_TESTS") != "1",
                                reason="set RUN_LIVE_LLM_TESTS=1 to call the real provider")


@pytest.fixture(scope="module")
def provider():
    from app.llm.resilient import build_llm_provider
    return build_llm_provider()


def test_live_positive_symptom_is_extracted(provider):
    from app.llm.schemas import SemanticExtraction
    from tests.helpers import POSITIVE_TEXT
    r = provider.extract_semantics(POSITIVE_TEXT, context={})
    assert isinstance(r, SemanticExtraction)
    assert any("back" in c.concept.lower() and c.polarity == "positive" and c.domain == "symptom" for c in r.concepts)


def test_live_negation_is_preserved(provider):
    from tests.helpers import NEGATIVE_TEXT
    r = provider.extract_semantics(NEGATIVE_TEXT, context={})
    assert not any("back" in c.concept.lower() and c.polarity == "positive" for c in r.concepts)
