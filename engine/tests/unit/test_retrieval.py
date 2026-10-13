import sys
from types import ModuleType

import app.retrieval.embeddings as embeddings
import app.retrieval.qdrant_client as qdrant_client
from app.retrieval.retriever import KnowledgeRetriever

class E:
    def encode_query(self,q): return [0.1,0.2]
class P:
    def __init__(self): self.score=.9; self.payload={'indicator_id':'SYM-001'}
class C:
    def query_points(self,**kwargs): return type('R',(),{'points':[P()]})()

def test_qdrant_query_points_path_preserves_payload_and_score():
    out=KnowledgeRetriever(client=C(),embedder=E()).search('stomach cramps',1)
    assert out[0].payload['indicator_id']=='SYM-001' and out[0].score==.9


def test_bge_embedding_model_is_loaded_once(monkeypatch):
    loaded = []

    class FakeSentenceTransformer:
        def __init__(self, model_name):
            loaded.append(model_name)

    fake_module = ModuleType('sentence_transformers')
    fake_module.SentenceTransformer = FakeSentenceTransformer
    monkeypatch.setitem(sys.modules, 'sentence_transformers', fake_module)
    embeddings._load_embedding_model.cache_clear()
    try:
        first = embeddings.BGE_M3_Embedder()
        second = embeddings.BGE_M3_Embedder()
        assert first.model is second.model
        assert loaded == [embeddings.settings.embedding_model]
    finally:
        embeddings._load_embedding_model.cache_clear()


def test_qdrant_client_is_reused(monkeypatch):
    created = []

    class FakeQdrantClient:
        def __init__(self, **kwargs):
            created.append(kwargs)

    fake_module = ModuleType('qdrant_client')
    fake_module.QdrantClient = FakeQdrantClient
    monkeypatch.setitem(sys.modules, 'qdrant_client', fake_module)
    qdrant_client._build_qdrant_client.cache_clear()
    try:
        first = qdrant_client.get_qdrant_client()
        second = qdrant_client.get_qdrant_client()
        assert first is second
        assert len(created) == 1
        assert created[0]['timeout'] == 10
    finally:
        qdrant_client._build_qdrant_client.cache_clear()
