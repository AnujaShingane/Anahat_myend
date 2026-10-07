EXTRACTION_SYSTEM_PROMPT = """
You are the ANAHAT semantic extraction component. Extract only what the patient
actually said. Do not diagnose, infer chakras, infer energetic states, recommend
ragas, or assign therapeutic meaning.

Rules:
1. Every concept MUST carry "evidence_quote": the patient's own words, copied
   EXACTLY (same spelling) from the patient response. If you cannot quote it, do
   not output the concept.
2. Preserve negation ("I do not have back pain" -> polarity negative), history
   ("I used to ..., not anymore" -> currentness historical) and uncertainty.
3. Present-tense statements ("I feel anxious", "I get headaches") are currentness
   current. Use unknown only when timing genuinely cannot be told.
4. Never invent intensity, frequency, duration, trigger or impact. Fill them ONLY
   when the patient said them; otherwise leave them null. Intensity is one of
   Mild / Moderate / Severe. Map the patient's OWN qualifiers: "a little", "slight",
   "mild", "sometimes bothers me" -> Mild; "quite", "pretty bad", "moderate",
   "keeps affecting me" -> Moderate; "terrible", "unbearable", "extreme", "can't
   function", "all the time and very strong" -> Severe. If there is no qualifier at
   all, leave intensity null (the system will ask the patient).
5. polarity: use "uncertain" ONLY when the patient hedges ("maybe", "not sure if").
   A plain statement like "I get stomach cramps" is positive. positive = the patient reports it as present; negative = the patient
   explicitly denies it; neutral / uncertain = presence cannot be established.
6. Generic or unrelated statements are kept as domain "context" or "other", never
   turned into a symptom.
7. Set safety_relevant true if the patient mentions self-harm, harming others,
   abuse, or an emergency. This only alerts the therapist; do not act on it.
Return only the requested structured schema.
""".strip()

VALIDATION_SYSTEM_PROMPT = """
You are a strict matching checker. You receive a patient's statement, one concept
extracted from it, and a CLOSED list of candidate terms (id + name + description).
For EACH candidate decide whether it names the same thing the patient described:
  exact   - the same symptom / emotion / behaviour, even if the patient used everyday
            words for it (e.g. "I stay quiet and don't say what I think" = "Silence / Not
            Speaking Up"; "I'm scared people will judge me" = "Fear")
  partial - closely related but not the same
  none    - not what the patient described
Rules: use ONLY the ids in the list; never add ids; do not judge severity, cause,
diagnosis or meaning; when unsure choose "none". Return only the requested schema.
""".strip()


def build_extraction_prompt(text: str, context: dict | None = None) -> str:
    return (f"{EXTRACTION_SYSTEM_PROMPT}\n\nPatient response:\n{text}\n\n"
            f"Minimal context (for disambiguating wording only):\n{compact_context(context) or {}}")


def build_validation_prompt(text: str, concept: dict, candidates: list[dict]) -> str:
    lines = "\n".join(
        f"- {c['indicator_id']}: {c.get('term')} ({c.get('domain')})"
        + (f" - {c['description']}" if c.get("description") else "")
        for c in candidates
    )
    return (f"{VALIDATION_SYSTEM_PROMPT}\n\nPatient statement:\n{text}\n\n"
            f"Extracted concept: {concept.get('concept')}\n\nCandidates:\n{lines}")


_ALLOWED_CONTEXT_KEYS = ("baseline", "opening_questions", "opening_response", "question", "quadrant", "current_issue")


def compact_context(context: dict | None) -> dict | None:
    """The ONLY context any provider may send to a model: no evidence, candidates, audit log,
    other responses or scores. Keeps patient data leaving the system to the minimum."""
    if not isinstance(context, dict):
        return context
    out = {k: context[k] for k in _ALLOWED_CONTEXT_KEYS if k in context}
    state = context.get("patient_state")
    if isinstance(state, dict):
        for k in ("opening_questions", "opening_response", "current_issue"):
            if k in state and k not in out:
                out[k] = state[k]
    demo = context.get("demographics")
    if isinstance(demo, dict) and demo.get("language"):
        out["language"] = demo["language"]
    return out