from qdrant_client.models import (
    Distance,
    VectorParams,
)

from app.retrieval.qdrant_client import get_qdrant_client
from app.core.config import settings


def create_collection():

    client = get_qdrant_client()

    collections = client.get_collections()

    existing = {
        collection.name
        for collection in collections.collections
    }

    if settings.qdrant_collection in existing:
        print(
            f"Collection already exists: "
            f"{settings.qdrant_collection}"
        )
        return

    client.create_collection(
        collection_name=settings.qdrant_collection,
        vectors_config=VectorParams(
            size=settings.embedding_dimension,
            distance=Distance.COSINE,
        ),
    )

    print(
        f"Created collection: "
        f"{settings.qdrant_collection}"
    )


if __name__ == "__main__":
    create_collection()
