from functools import lru_cache
from typing import Sequence

from app.core.config import settings


@lru_cache(maxsize=2)
def _load_embedding_model(model_name: str):
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise RuntimeError('sentence-transformers is required for BGE-M3 retrieval') from exc
    return SentenceTransformer(model_name)


class BGE_M3_Embedder:
    def __init__(self):
        self.model = _load_embedding_model(settings.embedding_model)
    def encode_documents(self,texts:Sequence[str]):
        return self.model.encode(list(texts),normalize_embeddings=True,convert_to_numpy=True,show_progress_bar=False)
    def encode_query(self,text:str):
        return self.model.encode([text],normalize_embeddings=True,convert_to_numpy=True,show_progress_bar=False)[0]
    @property
    def dimension(self): return settings.embedding_dimension
