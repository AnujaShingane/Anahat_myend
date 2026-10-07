from abc import ABC, abstractmethod
from app.llm.schemas import SemanticExtraction


class LLMProvider(ABC):
    @abstractmethod
    def extract_semantics(self, text: str, *, context: dict | None = None) -> SemanticExtraction:
        raise NotImplementedError

    # Optional capability. Providers that cannot do closed-set validation leave this as is;
    # the service then keeps the retrieved candidates but marks them "not LLM-validated".
    validate_candidates = None
