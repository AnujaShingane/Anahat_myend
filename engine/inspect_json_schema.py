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

        if isinstance(data, dict):
            count = len(data)
            top_type = "dict"
        elif isinstance(data, list):
            count = len(data)
            top_type = "list"
        else:
            count = 1
            top_type = type(data).__name__

        print(f"{file} | {count} top-level items | type={top_type}")

    except Exception as e:
        print(f"{file} | ERROR: {e}")
