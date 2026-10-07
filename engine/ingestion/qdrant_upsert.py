from qdrant_client.models import PointStruct

from app.retrieval.embeddings import BGE_M3_Embedder
from app.retrieval.qdrant_client import get_qdrant_client
from app.core.config import settings


def upsert_chunks(chunks):

    client = get_qdrant_client()
    embedder = BGE_M3_Embedder()

    texts = [
        chunk.text
        for chunk in chunks
    ]

    vectors = embedder.encode_documents(
        texts
    )

    points = []

    for chunk, vector in zip(
        chunks,
        vectors
    ):

        payload = {
            **chunk.metadata,
            "text": chunk.text,
            "embedding_model": settings.embedding_model,
            "vector_dimension": settings.embedding_dimension,
        }

        points.append(
            PointStruct(
                id=chunk.chunk_id,
                vector=vector.tolist(),
                payload=payload,
            )
        )

    client.upsert(
        collection_name=settings.qdrant_collection,
        points=points,
    )

    print(
        f"Upserted {len(points)} chunks"
    )