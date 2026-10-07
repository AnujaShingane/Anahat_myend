from __future__ import annotations

import json
from pathlib import Path


MANIFEST = Path(
    "knowledge_base/chunk_manifest.json"
)

OUTPUT = Path(
    "knowledge_base/priority_chunk_inspection.txt"
)


TARGET_FILES = {
    "general_reflective_question_bank.md",
    "home_based_mt_activities_by_population.md",
    "MASTER_PROMPT_FOR_CLAUDE_ANAHAT_FINAL_ENGINE.md",
    "GAP_CLOSURE_VALIDATION_REPORT.md",
    "VALIDATION_REPORT.md",
}


def main():

    chunks = json.loads(
        MANIFEST.read_text(
            encoding="utf-8"
        )
    )

    selected = [
        chunk
        for chunk in chunks
        if chunk["source_file"] in TARGET_FILES
    ]

    output = []

    output.append(
        "ANAHAT PRIORITY CHUNK INSPECTION"
    )

    output.append(
        f"Selected chunks: {len(selected)}"
    )

    output.append("")

    for chunk in selected:

        output.append("=" * 90)

        output.append(
            f"File: {chunk['source_file']}"
        )

        output.append(
            f"Chunk: {chunk['chunk_index']}"
        )

        output.append(
            f"Tokens: {chunk['estimated_tokens']}"
        )

        output.append(
            f"ID: {chunk['chunk_id']}"
        )

        output.append("-" * 90)

        output.append(
            chunk["text"]
        )

        output.append("")

    OUTPUT.write_text(
        "\n".join(output),
        encoding="utf-8",
    )

    print(
        f"Created: {OUTPUT}"
    )

    print(
        f"Selected chunks: {len(selected)}"
    )


if __name__ == "__main__":
    main()