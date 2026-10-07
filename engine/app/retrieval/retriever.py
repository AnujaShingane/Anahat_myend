from app.core.config import settings
from app.core.exceptions import RetrievalError

class KnowledgeRetriever:
    def __init__(self, client=None, embedder=None, collection_name=None):
        if client is None:
            from app.retrieval.qdrant_client import get_qdrant_client
            client = get_qdrant_client()
        if embedder is None:
            from app.retrieval.embeddings import BGE_M3_Embedder
            embedder = BGE_M3_Embedder()
        self.client = client
        self.embedder = embedder
        self.collection_name = collection_name or settings.qdrant_collection

    def search(self, query: str, top_k: int | None = None, query_filter=None):
        """query_filter: optional qdrant_client.models.Filter applied INSIDE Qdrant, so the
        top_k results are taken only from matching points (e.g. one quadrant's question bank)."""
        if not query.strip():
            return []
        try:
            vector = self.embedder.encode_query(query)
            limit = top_k or settings.retrieval_top_k
            vector_list = vector.tolist() if hasattr(vector, "tolist") else list(vector)
            if hasattr(self.client, "query_points"):
                result = self.client.query_points(
                    collection_name=self.collection_name,
                    query=vector_list,
                    limit=limit,
                    with_payload=True,
                    query_filter=query_filter,
                )
                return getattr(result, "points", result)
            return self.client.search(
                collection_name=self.collection_name,
                query_vector=vector_list,
                limit=limit,
                with_payload=True,
                query_filter=query_filter,
            )
        except Exception as exc:
            raise RetrievalError(f"Qdrant retrieval failed: {exc}") from exc

