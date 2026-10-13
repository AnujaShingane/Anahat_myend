from __future__ import annotations

from typing import Sequence

from sentence_transformers import SentenceTransformer


class BGE_M3_Embedder:

    def __init__(
        self,
        model_name: str = "BAAI/bge-m3",
        device: str | None = None,
    ):

        kwargs = {}

        if device:
            kwargs["device"] = device

        self.model = SentenceTransformer(
            model_name,
            **kwargs,
        )

        self.model_name = model_name

    def encode_documents(
        self,
        texts: Sequence[str],
    ):

        return self.model.encode(
            list(texts),
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=True,
        )

    def encode_query(self, text: str):

        return self.model.encode(
            [text],
            normalize_embeddings=True,
            convert_to_numpy=True,
        )[0]

    @property
    def dimension(self) -> int:
        return 1024