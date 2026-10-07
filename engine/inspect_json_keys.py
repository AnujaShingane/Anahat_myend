import json
from pathlib import Path

p = Path("knowledge_base/ANAHAT_KnowledgeBase_v3")

files = [
    "structured/chakra_master.json",
    "structured/symptom_to_chakra.json",
    "structured/emotion_to_chakra.json",
    "structured/behaviour_to_chakra.json",
    "structured/scoring_config.json",
    "structured/svara_chakra_mapping.json",

    "structured/assessment/assessment_engine_design_v3.json",
    "structured/assessment/chakra_disambiguation_questions_v3.json",
    "structured/assessment/chakra_scoring_config_v2.json",

    "raaga/structured/raga_metadata.json",
    "raaga/structured/raga_safety_metadata.json",
    "raaga/structured/raga_time_of_day.json",
    "raaga/structured/raga_samay_chakra_time_wheel.json",
    "raaga/structured/raga_hindustani_carnatic_equivalents.json",
    "raaga/structured/carnatic_raga_metadata.json",
    "raaga/structured/chakra_raga_bridge.json",

    "governance/evidence_policy.json",
    "governance/safety_rules.json",
    "config/governance_rules.json",
]

for file in files:
    path = p / file

    try:
        data = json.loads(path.read_text(encoding="utf-8"))

        print("\n" + "=" * 90)
        print(file)
        print("=" * 90)

        print("TOP-LEVEL KEYS:")
        for key in data.keys():
            value = data[key]

            if isinstance(value, list):
                print(f"  {key}: list[{len(value)}]")

            elif isinstance(value, dict):
                print(f"  {key}: dict[{len(value)}]")

            else:
                print(f"  {key}: {type(value).__name__} = {value}")

    except Exception as e:
        print(f"\nERROR: {file}")
        print(e)
