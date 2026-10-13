import pytest
from app.llm.gemini_provider import GeminiProvider
from app.core.exceptions import LLMProviderError

def test_missing_api_key_fails_explicitly(monkeypatch):
    monkeypatch.setattr('app.core.config.settings.gemini_api_key',None)
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    with pytest.raises(LLMProviderError): GeminiProvider()
