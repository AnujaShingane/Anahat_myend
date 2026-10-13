# Adaptive (LLM-worded) questions

## What it does

After the patient answers, the next quadrant question is no longer only a fixed question-bank
line. The engine still picks the best KB/RAG question first, then the local LLM writes **one**
follow-up that picks up what the patient just said and helps tell apart the KB's competing
interpretations of it.

```
Patient : I have family issues, my brother pressurizes me that makes me feel anxious
Engine  : What exactly does your brother pressurize you about?
```

Why that question: "anxious" maps to the canonical indicator **Anxiety (EMO-008)**, which the KB
links to three chakras. KB disambiguation pattern **RCD-31** describes the three possibilities
in patient-safe words (safety/security · pressure/control/performance · speaking/being
judged). What the brother pressurizes about tells them apart. The model is never told which
chakra each option means.

## Flow

```
answer -> existing pipeline (safety -> extraction -> verbatim quote -> KB match -> evidence)
next question requested
  -> KB/RAG question selected exactly as before (kept as fallback)
  -> context built from the session: latest answer, question it answered, opening concern,
     quadrant attributes, already-asked questions, KB example questions, and "signals"
     (session evidence + missing details + KB interpretations as opaque ids S1-A, S1-B ...)
  -> local LLM returns one question as schema-constrained JSON
  -> backend validators (below)
  -> pass: patient sees the generated question      fail: patient sees the KB question
```

Answers to generated questions go through the **unchanged** extraction and scoring pipeline.
Asking about an interpretation never adds score to it; only validated patient evidence does
(covered by `test_generating_a_question_never_changes_the_score`).

## Backend checks (the model's self-report is never trusted)

| Check | Rejects |
|---|---|
| Structure | not exactly one `?`, compound "... and how ...", too long/short, yes/no, "why" |
| Leakage | "chakra", chakra names, Sanskrit names, energy/blockage/aura words |
| Diagnosis / advice | diagnose, disorder, imbalance, treatment, medication, "you should", raga ... |
| Leading | leading phrasings; feelings the patient never said ("unsafe"); listing the hidden themes |
| Membership | attribute not in the quadrant; unknown signal / interpretation ids |
| Repetition | near-duplicate of anything already asked (stemmed word overlap) |
| Prompt copy | the prompt's example question reused for a patient it doesn't fit |
| Confidence | below `limits.min_generation_confidence` |
| Safety | RED/AMBER on the latest answer, or unacknowledged AMBER: no generation at all |
| Sensitive topics | trauma, abuse, sexuality, addiction, medical history, severe symptoms (see delivery) |

Every fallback is visible: `generation.status = "FALLBACK"` with `fallback_reason`.

**Stable until answered.** Once a question is shown for a quadrant, the same question comes back
on every fetch (switching quadrants, refreshing, after a review) until the patient answers it,
so the model isn't called again and the screen doesn't change under the patient. The one
exception is safety: if any later answer is AMBER/RED or touches a sensitive topic (auto mode),
every waiting generated question is `WITHDRAWN`, and answers to it are refused.

## API changes (additive)

`POST /sessions/{id}/quadrants/select`, `GET /sessions/{id}/questions/next` and the automatic
quadrant advance may now return a question like:

```json
{
  "id": "DYN-3f2a...", "question": "What exactly does your brother pressurize you about?",
  "quadrant": "Family", "generated": true, "attribute": "Family Dynamics",
  "fallback_question": {"id": "Q-2-3", "question": "How would you describe your bond ..."},
  "generation": {
    "status": "GENERATED", "provider": "local", "exploration_goal": "distinguish_interpretations",
    "indicator_ids_being_clarified": ["EMO-008", "SYM-009"],
    "candidate_interpretation_ids": ["S1-A", "S1-B", "S1-C"],
    "generation_confidence": 0.85, "requires_therapist_review": false,
    "delivery_status": "DELIVERED", "fallback_used": false, "...": "..."
  }
}
```

`retrieval_status` is `LLM_ADAPTIVE` when a generated question is served. Answer it exactly like
any other question: `POST /sessions/{id}/responses` with `question_id = "DYN-..."`.

**Frontend:** show only `question`. Everything under `generation` is for the backend/audit. No
chakra name is ever in the API response; the id→chakra mapping is kept server-side in
`patient_state.dynamic_question_meta` and the audit log.

New: `POST /sessions/{id}/questions/{question_id}/review` with
`{"action": "approve" | "edit" | "reject", "edited_text": "...", "therapist_note": "..."}`.
It's only needed in `therapist_review` mode.

## Delivery modes (`DYNAMIC_QUESTION_DELIVERY`)

* `auto` (default, AI-only): validated questions go straight to the patient. If the patient's
  context or the question touches a sensitive topic, the KB question is used instead.
* `therapist_review`: every generated question is `PENDING_THERAPIST_REVIEW` until approved,
  edited (the edit is re-validated) or rejected (which switches to the KB question). Answers to a
  pending question are refused.

## Configuration (`.env`)

```
DYNAMIC_QUESTIONS_ENABLED=true
DYNAMIC_QUESTION_PROVIDERS=local          # add ",mistral" if wanted
DYNAMIC_QUESTION_ALLOW_REMOTE_PROVIDERS=false   # gemini/openrouter refused for patient words
DYNAMIC_QUESTION_MODEL=                   # e.g. llama3.2:3b (default LOCAL_LLM_MODEL)
DYNAMIC_QUESTION_TEMPERATURE=0.3
DYNAMIC_QUESTION_TIMEOUT_SECONDS=30
DYNAMIC_QUESTION_DELIVERY=auto
DYNAMIC_QUESTION_GUIDANCE_PATH=./config/dynamic_question_guidance.json
```

Policy (word lists, limits, sensitive topics, goal order) lives in
`config/dynamic_question_guidance.json`. It is outside `knowledge_base/` on purpose, so the
hash-verified KB stays untouched. It contains no chakra mappings: those always come from the KB.

## Files

| File | Role |
|---|---|
| `app/services/dynamic_question_service.py` | context building, gating, fallback, caching, review |
| `app/services/question_validators.py` | deterministic post-generation checks |
| `app/llm/question_prompts.py` | system prompt + one worked example |
| `app/llm/question_schemas.py` | `GeneratedQuestion` (separate from extraction schema) |
| `app/llm/question_provider.py` | Ollama / Mistral generators, privacy-restricted chain |
| `config/dynamic_question_guidance.json` | policy |
| `scripts/try_adaptive_question.py` | live check against your Ollama model |
| `tests/unit/test_dynamic_questions.py` | 44 tests (real KB, scripted model) |

Also changed: `assessment_service.py` (hook in `_rag_question`, answer bookkeeping, the asked
question is now passed to extraction so short answers like "about money" are understood),
`assessment_routes.py` (review route; question routes initialise the LLM lazily),
`config.py`, `.env.example`, `tests/conftest.py` (feature off by default in old tests).

## Try it

```
ollama pull llama3.2:3b
python scripts/try_adaptive_question.py --model llama3.2:3b
python scripts/try_adaptive_question.py --model llama3.2:3b --text "My boss shouts at me and I can't sleep" --quadrant Profession --answer "Mostly about deadlines he sets without asking me"
```

## Needs therapist / domain validation

* Sensitive-topic, forbidden-word and feeling-word lists in the guidance file.
* Whether `auto` delivery is acceptable for indicators with 3+ interpretations (currently
  delivered and flagged as `ambiguity_with_3_or_more_interpretations`).
* Wording quality of the chosen local model: run the script on 20–30 real-style answers and
  read the outputs and fallback reasons before going live.
