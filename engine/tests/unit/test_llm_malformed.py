import pytest
from app.llm.gemini_provider import GeminiProvider
from app.core.exceptions import LLMProviderError
class Resp:
    text='{"concepts":[{"bad":1}]}'
class Models:
    def generate_content(self,**kwargs): return Resp()
class Client:
    models=Models()

def test_malformed_structured_response_is_rejected():
    with pytest.raises(LLMProviderError): GeminiProvider(client=Client()).extract_semantics('hello')
