import json
from pathlib import Path
from pprint import pprint

p = Path("knowledge_base/ANAHAT_KnowledgeBase_v3")

files = [
    "structured/scoring_config.json",
    "structured/assessment/chakra_scoring_config_v2.json",
    "structured/fixed_opening_questions.json",
    "structured/assessment/fixed_opening_questions_v3.json",
    "structured/opening_questions.json",
    "structured/quadrant_question_bank.json",
    "structured/chakra_master.json",
    "structured/svara_chakra_mapping.json",
]

for file in files:
    path = p / file
    data = json.loads(path.read_text(encoding="utf-8"))

    print("\n" + "=" * 100)
    print(file)
    print("=" * 100)

    for key, value in data.items():
        if key.startswith("_"):
            continue

        if isinstance(value, (str, int, float, bool)) or value is None:
            print(f"\n{key}:")
            print(f"  {value}")

        elif isinstance(value, dict):
            print(f"\n{key}: dict with {len(value)} keys")
            pprint(value, width=120, sort_dicts=False)

        elif isinstance(value, list):
            print(f"\n{key}: list with {len(value)} items")

            for i, item in enumerate(value[:3]):
                print(f"\n  [{i}]")
                pprint(item, width=120, sort_dicts=False)

            if len(value) > 3:
                print(f"\n  ... {len(value)-3} more items ...")
