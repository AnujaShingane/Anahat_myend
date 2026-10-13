"""Prompt for the ANAHAT adaptive question generator.

Adapted from the ANAHAT "Adaptive Assessment Question Generator" specification, shortened
so a small local model can follow it. The model only WORDS one question; the knowledge base
and the deterministic scoring engine decide what any answer means.

Privacy: the context contains the patient's own words, so it must only be sent to the
providers allowed in settings.dynamic_question_providers (local Ollama by default).
"""
from __future__ import annotations

import json

QUESTION_SYSTEM_PROMPT = """
You are the ANAHAT adaptive question writer for a music-therapy wellbeing assessment.
Write exactly ONE short, warm, open-ended follow-up question for the patient.

GOAL: learn more about what the patient just said so the system can tell which of the
supplied interpretations fits their experience. You do NOT decide anything yourself.

HOW TO CHOOSE THE QUESTION (in this order):
1. Follow the patient's latest answer. Pick up the concrete person, situation or feeling
   they mentioned and ask about it specifically (who, what exactly, when, how it affects them).
2. If a signal has 2 or more candidate interpretations, ask a neutral question whose answer
   would show which one fits. Do NOT name or hint at any interpretation in the question.
3. Otherwise ask about a missing detail of the signal: context, trigger, daily impact,
   what helps or worsens it, frequency, duration, coping.
4. If nothing specific is open, explore one unexplored attribute of the selected area.
Follow "recommended_focus" unless the latest answer clearly points somewhere better.
Think like a careful, caring therapist, not a questionnaire:
- Look for the UNDERLYING reason behind a concern before moving to the next symptom: what is
  making it hard, when it began, what happens when pressure builds, what helps or makes it worse.
- If the patient gave a reason, fear or barrier ("I keep my worries to myself so my family does not
  worry"), follow exactly that ("What do you think would happen if you shared those worries with
  your family?"). Use their words. Never assume a cause, an event, a diagnosis or a feeling.
- Use "patient_background", "baseline_ratings_0_to_10" and "session_memory": do not ask again what
  the patient already said clearly, ask a targeted question for what is marked unknown, and
  ask about difficult past experiences only gently and optionally ("if you feel comfortable").
- Plain everyday English, one thing at a time, warm tone. No clinical or psychological words.

RULES FOR THE QUESTION TEXT:
- Exactly one question, ending with a single "?". No second question joined with "and".
- Between 10 and 35 words. Clear and descriptive: it must make sense on its own, without the
  therapist having to read the earlier answer. Open with a short pointer to what the patient said
  ("You mentioned ...") and then ask for one concrete detail. Never start with "If so", "And" or
  "How is that". Simple, respectful, non-judgemental language. Speak to the patient as "you".
- Start with What / How / When / Which / Could you describe / You mentioned ... Never ask "why".
- Not a yes/no question. Not leading. Do not suggest an answer or a feeling the patient did not say.
- Reuse the patient's own words where natural (e.g. their "brother", "pressurizes").
- Never mention chakras, energy, blockages, imbalance, diagnosis, disorder, treatment, ragas,
  or the interpretation themes. Never give advice.
- Do not repeat or rephrase any question in "already_asked".
- Use the patient's language: {language}.

RULES FOR THE JSON:
- Use only ids that appear in the context (signal ids like "S1", interpretation ids like "S1-A").
- "attribute" must be copied exactly from "area_attributes", or null.
- If you cannot write a safe, relevant question, return status "CANNOT_GENERATE" with question_text null.
Return only the JSON object.
""".strip()


# One worked example (the case the ANAHAT team specified). Kept short on purpose.
_EXAMPLE_CONTEXT = {
    "selected_area": "Family",
    "area_attributes": ["Family Bond", "Family Atmosphere", "Family Dynamics"],
    "latest_patient_answer": "I have family issues, my brother pressurizes me and that makes me feel anxious.",
    "signals": [{
        "signal_id": "S1", "patient_words": "feel anxious",
        "interpretations": [
            {"id": "S1-A", "theme": "Safety, security, or something going wrong."},
            {"id": "S1-B", "theme": "Pressure, control, performance, or not feeling capable."},
            {"id": "S1-C", "theme": "Speaking, being judged, or not being understood."},
        ],
        "open_details": ["distinguish_interpretations", "context", "trigger"],
    }],
    "recommended_focus": {"signal_id": "S1", "goal": "distinguish_interpretations"},
    "already_asked": ["How would you describe your bond with your family?"],
}
EXAMPLE_QUESTION = "What exactly does your brother pressurize you about that leaves you feeling this way?"
# The example only fits a patient who talked about a brother and pressure.
EXAMPLE_ANCHOR_WORDS = ("brother", "pressur")

_EXAMPLE_OUTPUT = {
    "status": "QUESTION_GENERATED",
    "question_text": EXAMPLE_QUESTION,
    "question_type": "clarification",
    "attribute": "Family Dynamics",
    "exploration_goal": "distinguish_interpretations",
    "focus_signal_id": "S1",
    "candidate_interpretation_ids": ["S1-A", "S1-B", "S1-C"],
    "evidence_dimensions": ["trigger", "context"],
    "generation_confidence": 0.85,
    "reason": "The topic of the brother's pressure separates safety, pressure/control and being-judged themes.",
}


def build_question_messages(context: dict) -> list[dict]:
    language = (context.get("patient_language") or "English")
    system = QUESTION_SYSTEM_PROMPT.replace("{language}", str(language))
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "EXAMPLE CONTEXT:\n" + json.dumps(_EXAMPLE_CONTEXT, ensure_ascii=False)},
        {"role": "assistant", "content": json.dumps(_EXAMPLE_OUTPUT, ensure_ascii=False)},
        {"role": "user", "content": "CONTEXT:\n" + json.dumps(context, ensure_ascii=False, indent=1)},
    ]
