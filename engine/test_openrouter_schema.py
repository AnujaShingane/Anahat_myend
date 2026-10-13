import json

from openai import OpenAI

from app.core.config import settings
from app.llm.prompts import build_extraction_prompt
from app.llm.schemas import SemanticExtraction


client = OpenAI(
    api_key=settings.openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
)

text = "The patient has severe lower back pain every day for the last two weeks."

prompt = build_extraction_prompt(text)

response = client.chat.completions.create(
    model=settings.llm_model,
    messages=[
        {
            "role": "system",
            "content": (
                "You are the ANAHAT semantic extraction component. "
                "Return ONLY valid JSON matching the provided schema. "
                "Extract the patient's actual information. "
                "Do not return an empty concepts list when a symptom "
                "is explicitly present."
            ),
        },
        {
            "role": "user",
            "content": (
                prompt
                + "\n\nRequired JSON schema:\n"
                + json.dumps(SemanticExtraction.model_json_schema())
            ),
        },
    ],
    temperature=0,
)

print("\nRAW MODEL RESPONSE:\n")
print(response.choices[0].message.content)