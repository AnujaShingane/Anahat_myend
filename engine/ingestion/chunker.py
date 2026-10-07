from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import List

from ingestion.document_loader import LoadedDocument


TARGET_TOKENS = 800
MAX_TOKENS = 1000
OVERLAP_TOKENS = 120


@dataclass
class Chunk:
    chunk_id: str
    document_id: str
    source_file: str
    source_path: str
    chunk_index: int
    text: str


def estimate_tokens(text: str) -> int:
    """
    Approximate token count.

    This is intentionally conservative for the first
    implementation. Final benchmarking should use the
    tokenizer associated with the embedding model.
    """

    words = text.split()

    if not words:
        return 0

    return int(len(words) * 1.3)


def normalize_text(text: str) -> str:

    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Remove excessive whitespace
    text = re.sub(r"[ \t]+", " ", text)

    # Collapse excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def split_sentences(text: str) -> List[str]:

    sentences = re.split(
        r"(?<=[.!?])\s+",
        text,
    )

    return [
        sentence.strip()
        for sentence in sentences
        if sentence.strip()
    ]


def split_into_blocks(text: str) -> List[str]:

    blocks = re.split(
        r"\n\s*\n",
        text,
    )

    return [
        block.strip()
        for block in blocks
        if block.strip()
    ]


def build_chunks(
    document: LoadedDocument,
) -> List[Chunk]:

    text = normalize_text(document.text)

    if not text:
        return []

    blocks = split_into_blocks(text)

    chunks: List[str] = []
    current: List[str] = []

    current_tokens = 0

    for block in blocks:

        block_tokens = estimate_tokens(block)

        # Small enough to add to current chunk
        if (
            current
            and current_tokens + block_tokens <= TARGET_TOKENS
        ):
            current.append(block)
            current_tokens += block_tokens
            continue

        # Current chunk is ready
        if current:
            chunks.append("\n\n".join(current))

            # Keep overlap from the end
            overlap = []
            overlap_tokens = 0

            for item in reversed(current):

                item_tokens = estimate_tokens(item)

                if overlap_tokens + item_tokens > OVERLAP_TOKENS:
                    break

                overlap.insert(0, item)
                overlap_tokens += item_tokens

            current = overlap
            current_tokens = overlap_tokens

        # Block itself is too large
        if block_tokens > MAX_TOKENS:

            sentences = split_sentences(block)

            sentence_buffer = []
            sentence_tokens = 0

            for sentence in sentences:

                tokens = estimate_tokens(sentence)

                if (
                    sentence_buffer
                    and sentence_tokens + tokens > TARGET_TOKENS
                ):
                    chunks.append(
                        "\n".join(sentence_buffer)
                    )

                    sentence_buffer = []
                    sentence_tokens = 0

                sentence_buffer.append(sentence)
                sentence_tokens += tokens

            if sentence_buffer:
                current = sentence_buffer
                current_tokens = sentence_tokens

        else:
            current.append(block)
            current_tokens += block_tokens

    if current:
        chunks.append("\n\n".join(current))

    result = []

    for index, chunk_text in enumerate(chunks):

        chunk_id = create_chunk_id(
            document.document_id,
            index,
            chunk_text,
        )

        result.append(
            Chunk(
                chunk_id=chunk_id,
                document_id=document.document_id,
                source_file=document.source_file,
                source_path=document.source_path,
                chunk_index=index,
                text=chunk_text,
            )
        )

    return result


def create_chunk_id(
    document_id: str,
    index: int,
    text: str,
) -> str:

    content_hash = hashlib.sha256(
        text.encode("utf-8")
    ).hexdigest()[:16]

    return (
        f"{document_id}:"
        f"{index:05d}:"
        f"{content_hash}"
    )