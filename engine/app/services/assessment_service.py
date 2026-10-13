from __future__ import annotations

import copy
import hashlib
import logging
import re
import threading
import unicodedata
from uuid import uuid4

from app.api.llm_errors import clean_request_id
from app.core.config import settings
from app.core.enums import AssessmentStage, EvidenceStatus
from app.engine.patient_context import PatientContext
from app.engine.evidence_engine import EvidenceEngine
from app.engine.intensity import infer_intensity
from app.engine import attribute_conflict as attr_conflict
from app.engine import grounding as grounding_gate
from app.engine.scoring_engine import ScoringEngine, is_imbalanced
from app.engine.decision_engine import DecisionEngine
from app.models.evidence import EvidenceRecord
from app.knowledge.indicator_repository import IndicatorRepository, normalize_term
from app.knowledge.activity_repository import ActivityRepository
from app.retrieval.filters import candidate_is_usable
from app.services.activity_service import ActivityService
from app.services.ambiguity_service import AmbiguityService
from app.services.contradiction_service import ContradictionService
from app.services.deep_dive_service import DeepDiveService
from app.services.dynamic_question_service import DynamicQuestionService
from app.services.prescription_service import PrescriptionService
from app.services.question_service import QuestionService
from app.services.question_topics import merge_follow_up_fragments, question_fits
from app.services.raga_service import RagaService
from app.services.response_service import ResponseService
from app.services.safety_service import SafetyService
from app.services.contextual_reasoning import ContextualReasoningService
from app.llm.prompts import compact_context


_OPEN_REQUIRES_VALIDATION = [
    "confidence 'completeness' component definition",
    "AMBER safety phrase list and RED phrase list",
    "deep-dive question wording (neutral templates, not from a validated KB list)",
    "quadrant question text for Personal Interests, Profession, Medical & Therapeutic Background, Music Therapy Profile (no 1:1 KB question bank mapping)",
    "top-two-chakras (KB design) vs all-seven (spec): all seven are evaluated",
    "KB duplicate indicators (SYM-009/EMO-008 same term; SYM-069/070)",
    "handling of KB states 'Either', 'Varies', 'Excess to Deficient', 'Usually Excess' (kept non-directional, never reinterpreted)",
    "direction gray-zone handling (0.10-0.15)",
    "Emergency contact numbers in KB are marked 'requires live verification before production'",
]
NORMAL_QUADRANT_QUESTION_LIMIT = 3
# Retrieval is still ranked by semantic similarity; this only gives the
# metadata/quadrant validator enough candidates to find the requested bank.
QUESTION_RAG_RETRIEVAL_LIMIT = 100
# Question banks emotions / thoughts / beliefs / relationships / past / future_plans have no
# quadrant of their own; they are attached to the quadrant whose attributes they explore so
# RAG can actually use them (they were previously always rejected as "wrong_quadrant").
QUESTION_BANK_ALIGNMENT_BY_QUADRANT = {
    "Nature": {"nature", "emotions", "thoughts", "beliefs"},
    "Family": {"family", "relationships", "past"},
    "Social Circle": {"social_circle", "relationships"},
    "Personal Interests": {"personal_interests"},
    "Profession": {"profession", "career", "future_plans"},
    # The ingestion script maps healthy_habits.md into the Lifestyle
    # quadrant, while its frontmatter retains the source alignment.
    "Lifestyle": {"lifestyle", "healthy_habits"},
    "Diet": {"diet"},
    "Physical Nature": {"physical_nature"},
    "Medical & Therapeutic Background": {"medical_therapeutic_background"},
    "Music Therapy Profile": {"music_therapy_profile"},
}


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").lower()
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    return " ".join(re.sub(r"[^a-z0-9']+", " ", text).split())


def quote_is_verbatim(raw_text: str, quote: str | None) -> bool:
    """True only if the quote is a contiguous, word-aligned piece of the patient's raw words."""
    q = _norm(quote or "")
    if len(q) < 3:
        return False
    return f" {q} " in f" {_norm(raw_text)} "


_QUOTE_STOPWORDS = {"a", "an", "the", "of", "to", "and", "or", "in", "on", "at", "for", "with", "my", "i",
                    "me", "is", "am", "are", "be", "it", "that", "this", "issue", "issues", "problem",
                    "problems", "feeling", "feelings", "feel", "tendency"}


def _stem(word: str) -> str:
    """Very light English stemmer, only to line up inflections of the SAME word
    (overthinking/overthink, judgement/judged/judge, worries/worry). Never maps between words."""
    w = word.lower()
    for suffix in ("ments", "ment", "ings", "ing", "ies", "ied", "ed", "es", "s", "e"):
        if len(w) - len(suffix) >= 4 and w.endswith(suffix):
            w = w[: -len(suffix)] + ("y" if suffix in ("ies", "ied") else "")
            break
    return w


def recover_verbatim_quote(raw_text: str, *phrases: str | None) -> str | None:
    """Return a contiguous span of the patient's ORIGINAL words whose content words are the same
    words (up to inflection) as one of `phrases` (the model's quote, then its label). The span is
    always cut from raw_text, so a concept the patient did not actually say can never pass."""
    tokens = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"[A-Za-z']+", raw_text or "")]
    if not tokens:
        return None
    stems = [_stem(t[0]) for t in tokens]
    for phrase in phrases:
        words = [w for w in re.findall(r"[A-Za-z']+", (phrase or "").replace("_", " ").lower())
                 if w not in _QUOTE_STOPWORDS and len(w) >= 3]
        if not words:
            continue
        need = [_stem(w) for w in words]
        max_window = len(need) + 3
        best = None
        for i, st in enumerate(stems):
            if st != need[0]:
                continue
            # the remaining words must follow, in order, within a short window
            j, k = i, 1
            while k < len(need) and j + 1 < len(stems) and j + 1 - i < max_window:
                j += 1
                if stems[j] == need[k]:
                    k += 1
            if k == len(need):
                span = raw_text[tokens[i][1]:tokens[j][2]]
                if best is None or len(span) < len(best):
                    best = span
        if best and quote_is_verbatim(raw_text, best):
            return best
    return None


_GENERIC_LABEL_WORDS = {"trouble", "troubles", "difficulty", "difficulties", "difficult", "hard", "unable", "cannot",
                        "cant", "lack", "having", "getting", "sense", "tendency", "issue", "issues", "problem",
                        "problems", "feeling", "feelings", "feel", "being", "very", "much", "more", "less", "about"}


def recover_verbatim_quote_fallback(raw_text: str, *phrases: str | None) -> str | None:
    """Last resort when the model's quote is not verbatim AND the strict recovery found no span
    containing ALL of its content words (for example the label 'trouble sleeping' for the patient's
    'I can't sleep'). Take the single most distinctive content word of the label that the patient
    really said and return a short span of the patient's OWN words around it (at most two words each
    side, never across punctuation). Because the span is cut from raw_text a concept the patient did
    not say still cannot pass, and the later validator and grounding gates judge it as usual."""
    tokens = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"[A-Za-z']+", raw_text or "")]
    if not tokens:
        return None
    stems = [_stem(t[0]) for t in tokens]
    for phrase in phrases:
        words = [w for w in re.findall(r"[A-Za-z']+", (phrase or "").replace("_", " ").lower())
                 if w not in _QUOTE_STOPWORDS and w not in _GENERIC_LABEL_WORDS and len(w) >= 5]
        for w in sorted(set(words), key=len, reverse=True):          # longest = most distinctive
            st = _stem(w)
            for i, t in enumerate(stems):
                if t != st:
                    continue
                lo, hi = max(0, i - 2), min(len(tokens) - 1, i + 2)
                # never reach across punctuation
                while lo < i and re.search(r"[.!?;,:\n]", raw_text[tokens[lo][2]:tokens[lo + 1][1]]):
                    lo += 1
                while hi > i and re.search(r"[.!?;,:\n]", raw_text[tokens[hi - 1][2]:tokens[hi][1]]):
                    hi -= 1
                span = raw_text[tokens[lo][1]:tokens[hi][2]]
                if quote_is_verbatim(raw_text, span):
                    return span
    return None


def _is_canonical_question_bank(payload: dict, body: str = "") -> bool:
    metadata = {
        str(key).lower(): str(value).strip().lower()
        for key, value in payload.items()
        if value is not None
    }
    frontmatter = re.match(r"\s*---\s*\n(.*?)\n---", body or "", flags=re.DOTALL)
    if frontmatter:
        for line in frontmatter.group(1).splitlines():
            key, separator, value = line.partition(":")
            if separator:
                metadata.setdefault(key.strip().lower(), value.strip().lower())
    is_question_bank = (
        metadata.get("document_type") == "question_bank"
        or metadata.get("knowledge_category") == "assessment_question"
        or metadata.get("knowledge_type") == "assessment_question"
    )
    is_canonical = metadata.get("canonical_version") in {
        "true", "1", "1.0", "canonical", "v1"
    }
    source_metadata = " ".join(
        metadata.get(key, "")
        for key in ("source", "source_path", "source_file", "source_document")
    )
    return is_question_bank and is_canonical and (
        "question_bank" in source_metadata
        or metadata.get("document_type") == "question_bank"
        or metadata.get("knowledge_category") == "assessment_question"
    )


def _question_bank_rejection_reason(payload: dict, body: str = "") -> str | None:
    if not _is_canonical_question_bank(payload, body):
        return "metadata_not_canonical_question_bank"
    return None


class AssessmentService:
    _sessions = {}

    def __init__(self, kb=None, llm=None, retriever=None, embedder=None, question_generator=None,
                 contextual_reasoner=None):
        self.kb, self.llm, self.retriever = kb, llm, retriever
        self.embedder = embedder
        self.contextual_reasoner = contextual_reasoner or ContextualReasoningService.from_settings()
        if kb:
            self.indicators = IndicatorRepository(kb)
            self.evidence_engine = EvidenceEngine(self.indicators)
            self.scoring = ScoringEngine(kb)
            self.questions = QuestionService(kb, embedder=embedder)
            self.ambiguity = AmbiguityService(kb)
            self.contradictions = ContradictionService()
            self.safety = SafetyService(kb)
            self.activities = ActivityService(ActivityRepository(kb))
            self.ragas = RagaService(kb)
            self.prescriptions = PrescriptionService()
            self.decisions = DecisionEngine()
            self.deep_dive = DeepDiveService(self.ambiguity)
            # Adaptive question wording (LLM) on top of the KB/RAG selection. If its config
            # cannot be loaded the engine keeps serving KB questions exactly as before.
            try:
                self.dynamic = DynamicQuestionService(kb, self.indicators, self.ambiguity, self.safety,
                                                      self.deep_dive, generator=question_generator)
            except Exception:  # noqa: BLE001
                logging.getLogger("anahat.dynamic_questions").exception(
                    "Adaptive questions disabled: guidance could not be loaded")
                self.dynamic = None

    @classmethod
    def get(cls, session_id):
        return cls._sessions.get(session_id)

    def _ctx(self, sid):
        ctx = self._sessions.get(sid)
        if ctx is None:
            raise ValueError("Assessment session not found")
        return ctx

    def _q_state(self, ctx, quadrant):
        state = ctx.quadrants.setdefault(quadrant, {})
        state.setdefault("answered_question_ids", [])
        state.setdefault("response_ids", [])
        state.setdefault("normal_question_count", 0)
        state.setdefault("deep_dive_question_count", 0)
        state.setdefault("normal_completed", False)
        state.setdefault("deep_dive_active", False)
        state.setdefault("rag_exhausted", False)
        state.setdefault("retrieval_failed", False)
        state.setdefault("completed", False)
        return state

    def _guard_safety(self, ctx):
        """RED interrupts the assessment: nothing else is processed until a therapist clears it."""
        if ctx.stage == AssessmentStage.SAFETY_ESCALATION.value:
            return {"status": "SAFETY_ESCALATION",
                    "detail": "Assessment is paused for a safety escalation. A therapist must review and clear it first."}
        return None

    # ------------------------------------------------------------------ session-less, KB-only helpers
    def list_opening_styles(self):
        """Opening styles straight from the KB assessments folder (no session needed)."""
        return {"styles": self.questions.opening_styles(), "rules": self.questions.opening_rules()}

    def suggest_question(self, patient_text="", asked_ids=(), style=None):
        """Pick (never write) the next KB question for a live conversation.
        No patient words -> next unasked opening question of the therapist-chosen style
        (default style 'A', the first KB style: REQUIRES THERAPIST VALIDATION).
        Otherwise -> the best-matching quadrant's next unasked question."""
        asked = set(asked_ids or ())
        style = style or "A"
        text = (patient_text or "").strip()
        rec = self.questions.recommend_quadrants(current_issue=text, limit=1) if text else []
        if not rec or rec[0]["relevance_score"] <= 0:
            for q in self.questions.opening_questions(style):
                if q["id"] not in asked:
                    return {"id": q["id"], "text": q["text"], "quadrant": None, "source": f"KB opening style {style.upper()}",
                            "reason": "No specific area detected yet; continue with the opening questions." if text
                            else "Session just started; begin with the opening questions."}
            if not text:
                return None
        for r in (rec or []):
            page = self.questions.next_questions(r["quadrant"], asked, 1)
            if page["questions"]:
                q = page["questions"][0]
                return {"id": q["id"], "text": q["question"], "quadrant": r["quadrant"], "source": q["source"],
                        "reason": r["reasons"][0]}
        return None

    # ------------------------------------------------------------------ session + baseline
    def create_session(self, request):
        sid = str(uuid4()); ctx = PatientContext()
        ctx.demographics = {key: value for key, value in request.model_dump().items() if value is not None}
        ctx.patient_state.update({
            "selected_quadrants": None, "selected_quadrant_names": [], "completed_quadrants": [],
            "current_quadrant": None, "current_question": None, "asked_questions": [],
            "rag_retrieval_count": 0, "assessment_complete": False, "final_chakra_evaluated": False,
            "assessment_status": "in_progress",
        })
        ctx.stage = AssessmentStage.BASELINE.value
        ctx.audit("SESSION_CREATED", stage=ctx.stage)
        self._sessions[sid] = ctx
        from app.models.assessment import AssessmentResponse
        return AssessmentResponse(session_id=sid, status="created", current_stage=ctx.stage)

    def set_baseline(self, sid, baseline):
        ctx = self._ctx(sid)
        if ctx.baseline:
            raise ValueError("Baseline ratings are permanent and can only be recorded once")
        ctx.baseline = baseline.model_dump(); ctx.stage = AssessmentStage.OPENING.value
        ctx.audit("BASELINE_RECORDED"); return {"session_id": sid, "baseline": ctx.baseline, "stage": ctx.stage}

    # ------------------------------------------------------------------ opening (KB only)
    def get_opening_questions(self, sid, style=None):
        """Without `style`: the therapist-selectable styles. With `style`: that style's questions.
        Text always comes from the KB assessments folder through the engine, never from callers."""
        ctx = self._ctx(sid)
        if ctx.stage != AssessmentStage.OPENING.value:
            raise ValueError("Opening Questions can only be accessed during the opening stage")
        if not style:
            return {"session_id": sid, "title": "Opening Question Styles", "styles": self.questions.opening_styles(),
                    "rules": self.questions.opening_rules(), "stage": ctx.stage}
        questions = self.questions.opening_questions(style)
        ctx.patient_state["opening_style"] = style.upper()
        ctx.patient_state["opening_questions"] = [q["text"] for q in questions]
        ctx.patient_state["opening_question_ids"] = [q["id"] for q in questions]
        ctx.audit("OPENING_QUESTIONS_PRESENTED", style=style.upper())
        return {"session_id": sid, "title": "Opening Questions", "style": style.upper(),
                "questions": questions, "therapist_may_skip_or_stop": True, "stage": ctx.stage}

    def skip_opening(self, sid):
        ctx = self._ctx(sid)
        if ctx.stage != AssessmentStage.OPENING.value:
            raise ValueError("Opening can only be skipped during the opening stage")
        ctx.stage = AssessmentStage.QUADRANT_RECOMMENDATION.value
        ctx.audit("OPENING_SKIPPED_BY_THERAPIST")
        return {"status": "OK", "stage": ctx.stage}

    def submit_opening_response(self, sid, text, question_id=None):
        ctx = self._ctx(sid)
        if ctx.stage != AssessmentStage.OPENING.value:
            guard = self._guard_safety(ctx)
            if guard:
                return guard
            raise ValueError("Opening response can only be submitted during the opening stage")
        if not text or not text.strip():
            raise ValueError("Opening response cannot be empty")
        text = text.strip()
        response = ResponseService().create(text=text, question_id=question_id, quadrant=None)
        out = self._analyze(ctx, response, text, session_id=sid, weight_source="opening")
        ctx.patient_state["opening_response"] = text
        ctx.patient_state.setdefault("opening_responses", []).append(text)
        ctx.audit("OPENING_RESPONSE_SUBMITTED", response_id=response.response_id)
        if out["status"] != "SAFETY_ESCALATION":
            ctx.stage = AssessmentStage.QUADRANT_RECOMMENDATION.value
            out["stage"] = ctx.stage
            out["intensity_follow_ups"] = self._intensity_follow_ups(ctx, sid, response.response_id)
        return out

    # ------------------------------------------------------------------ shared analysis pipeline
    def _analyze(self, ctx, response, text, *, session_id, weight_source="current_issue", quadrant=None,
                 question_text=None):
        """safety -> LLM extraction -> quote check -> retrieval -> closed-set validation -> sanitized candidates.

        State is committed only at the very end, so any failure leaves the session untouched.
        Patient-reported, validated canonical indicators become confirmed session evidence."""
        safety = self.safety.assess(text)
        if safety["status"] == "ESCALATE":
            ctx.add_response(response); response.safety_status = safety["status"]
            ctx.stage = AssessmentStage.SAFETY_ESCALATION.value
            ctx.audit("SAFETY_ESCALATION", details=safety)
            ctx.audit("RAW_RESPONSE_STORED", response_id=response.response_id)
            return {"status": "SAFETY_ESCALATION", "response_id": response.response_id, "safety": safety}

        if self.llm is None or self.retriever is None:
            raise RuntimeError("LLM provider and retriever are required for semantic assessment")

        llm_ctx = (compact_context({**ctx.summary_min(), "quadrant": quadrant,
                                    # Short answers ("about money") only make sense with the question.
                                    **({"question": question_text} if question_text else {})})
                   if hasattr(ctx, "summary_min") else None)
        extraction = self.llm.extract_semantics(text, context=llm_ctx)
        # Some providers return an exact concept but omit its quote. Recover a
        # quote only when the concept itself occurs verbatim in the response;
        # this preserves the existing anti-hallucination evidence boundary.
        repaired_concepts = []
        for concept in extraction.concepts:
            if not quote_is_verbatim(text, concept.evidence_quote):
                # Missing or non-verbatim quote (small models often return the LABEL, e.g.
                # "overthinking", when the patient wrote "overthink"). Recover a quote ONLY from
                # the patient's own words; anything not actually said stays rejected.
                recovered = recover_verbatim_quote(text, concept.evidence_quote, concept.concept)
                if not recovered and settings.quote_recovery_fallback:
                    recovered = recover_verbatim_quote_fallback(text, concept.evidence_quote, concept.concept)
                if recovered:
                    logging.getLogger("anahat.evidence").info(
                        "QUOTE RECOVERED | concept=%s model_quote=%r -> patient_words=%r",
                        concept.concept, concept.evidence_quote, recovered)
                    concept = concept.model_copy(update={"evidence_quote": recovered})
            repaired_concepts.append(concept)
        # Intensity is read semantically from the patient's full answer when the model left it empty
        # (small local models usually do). It never invents: no usable cue -> stays empty -> the
        # therapist is asked. Sessions' earlier evidence for the same indicator is reused later.
        intensity_meta = {}
        filled_concepts = []
        for concept in repaired_concepts:
            if concept.domain in {"symptom", "emotion", "behaviour"} and concept.polarity != "negative":
                if concept.intensity:
                    intensity_meta[id(concept)] = ("patient_words", [])
                else:
                    inf = infer_intensity(text, concept.evidence_quote, concept.concept)
                    if inf.found:
                        concept = concept.model_copy(update={"intensity": inf.label})
                        intensity_meta[id(concept)] = ("inferred", inf.basis)
                        logging.getLogger("anahat.evidence").info(
                            "INTENSITY INFERRED | concept=%s -> %s | basis=%s", concept.concept, inf.label, inf.basis)
            filled_concepts.append(concept)
        repaired_concepts = filled_concepts
        extraction = extraction.model_copy(update={"concepts": repaired_concepts})
        if extraction.safety_relevant and safety["status"] == "CLEAR":
            safety = self.safety.assess(text, llm_safety_relevant=True)

        unverified, per_concept = [], []
        rejected_candidates = []     # retrieved but not supported by the patient's words (explainability)
        concept_mapping_diagnostics = []
        for concept in extraction.concepts:
            if concept.domain not in {"symptom", "emotion", "behaviour"}:
                logging.getLogger("anahat.evidence").info(
                    "CONCEPT CANONICAL MATCH | concept=%s normalized_term=%s attempted_ids=[] "
                    "matching_strategy=domain_gate match_result=not_scoreable_domain:%s",
                    concept.concept, normalize_term(concept.concept), concept.domain,
                )
                concept_mapping_diagnostics.append({
                    "concept": concept.concept, "domain": concept.domain,
                    "mapped_chakras": [], "reason": "concept domain is not scoreable symptom/emotion/behaviour",
                })
                continue
            if settings.require_evidence_quote and not quote_is_verbatim(text, concept.evidence_quote):
                logging.getLogger("anahat.evidence").info(
                    "CONCEPT CANONICAL MATCH | concept=%s normalized_term=%s attempted_ids=[] "
                    "matching_strategy=quote_gate match_result=missing_verbatim_quote",
                    concept.concept, normalize_term(concept.concept),
                )
                unverified.append({"concept": concept.concept, "reason": "evidence quote missing or not found in the patient's words"})
                concept_mapping_diagnostics.append({
                    "concept": concept.concept, "domain": concept.domain,
                    "mapped_chakras": [], "reason": "rejected because no verbatim patient quote was validated",
                })
                continue
            candidates = self._candidates_for(concept, text, rejected_candidates)
            src, basis = intensity_meta.get(id(concept), (None, []))
            for cand in candidates:
                if concept.intensity:
                    cand["concept"]["intensity_source"] = src or "patient_words"
                    cand["concept"]["intensity_basis"] = list(basis)
            per_concept.append((concept, candidates))
            validated = [candidate for candidate in candidates
                         if (candidate.get("validation") or {}).get("llm_validated")
                         and (candidate.get("validation") or {}).get("match") == "exact"]
            mapped_chakras = sorted({
                association.chakra
                for candidate in validated
                for association in self.indicators.get_by_id(
                    (candidate.get("payload") or {}).get("indicator_id")
                )
            })
            concept_mapping_diagnostics.append({
                "concept": concept.concept, "domain": concept.domain,
                "candidate_count": len(candidates), "validated_candidate_count": len(validated),
                "mapped_chakras": mapped_chakras,
                "reason": ("mapped through validated canonical indicator(s)" if mapped_chakras
                           else "no validated canonical indicator/chakra association found"),
            })

        # ---- commit ----
        response.safety_status = safety["status"]
        response.extraction = extraction.model_dump()
        ctx.add_response(response)
        ctx.audit("RAW_RESPONSE_STORED", response_id=response.response_id)
        if safety["status"] == "AMBER":
            ctx.patient_state["safety_amber_unacknowledged"] = True
            ctx.audit("SAFETY_AMBER", details=safety, response_id=response.response_id)

        seen, internal = set(), []
        for concept, cands in per_concept:
            for c in cands:
                iid = c["payload"].get("indicator_id")
                if iid in seen:
                    continue
                seen.add(iid); internal.append(c)
        ctx.candidates.extend(internal)
        # Patient statements in a completed assessment are confirmed session
        # evidence. Retrieval still only contributes validated canonical
        # candidates; the therapist does not have to re-confirm what the
        # patient has already reported.
        confirmed_evidence = []
        repeat_mentions, updated_evidence = [], []
        if hasattr(self, "evidence_engine"):
            # Which candidates become evidence, and at what reliability:
            #   exact LLM match                         -> CONFIRMED (ambiguous KB terms -> UNRESOLVED)
            #   best "partial" match (no exact found)   -> PROVISIONAL (reduced weight)
            #   validator unavailable, strong retrieval -> PROVISIONAL (reduced weight)
            rank = {EvidenceStatus.CONFIRMED: 2, EvidenceStatus.PROVISIONAL: 1}
            by_group = {}
            for concept, cands in per_concept:
                exact = [c for c in cands if (c.get("validation") or {}).get("llm_validated")
                         and (c.get("validation") or {}).get("match") == "exact"]
                chosen = [(c, EvidenceStatus.CONFIRMED) for c in exact]
                if not chosen and settings.record_partial_matches_as_provisional:
                    partial = [c for c in cands if (c.get("validation") or {}).get("match") in {"partial", "retrieval_only"}]
                    if partial:
                        best = max(partial, key=lambda c: c.get("score") or 0.0)
                        chosen = [(best, EvidenceStatus.PROVISIONAL)]
                for cand, status in chosen:
                    # One record per canonical term per answer (twin KB entries such as SYM-009 /
                    # EMO-008 'Anxiety' are created by confirm_candidate itself). If two concepts hit
                    # the same term, the strongest match wins (exact beats partial).
                    iid = (cand.get("payload") or {}).get("indicator_id")
                    group = self.indicators.group_key(iid) if hasattr(self.indicators, "group_key") else iid
                    if group not in by_group or rank[status] > rank[by_group[group][1]]:
                        by_group[group] = (cand, status)
            for candidate, planned_status in by_group.values():
                if candidate not in ctx.candidates:
                    ctx.candidates.append(candidate)
                candidate["recorded_status"] = planned_status.value
                # One indicator = one count. If this indicator is already recorded from an earlier
                # answer, merge the new mention into it instead of creating a second record.
                prior = self._prior_observation(ctx, candidate, response.response_id)
                if prior is not None:
                    note = self._merge_repeat(ctx, prior, candidate, response, planned_status)
                    repeat_mentions.append(note["summary"])
                    for ev_dump in note["updated"]:
                        if ev_dump not in updated_evidence:
                            updated_evidence.append(ev_dump)
                    candidate["recorded_status"] = "ALREADY_COUNTED"
                    continue
                recorded = self.confirm_candidate(
                    session_id,
                    response.response_id,
                    candidate["candidate_id"],
                    confirmed=True,
                    status=planned_status,
                    confirmation_actor="patient",
                )
                if recorded.get("evidence"):
                    concept_text = candidate.get("concept", {}).get("concept") or candidate.get("quote") or ""
                    concept_key = _norm(concept_text)
                    observation_hash = hashlib.sha256(concept_key.encode("utf-8")).hexdigest()[:16]
                    # Keep the extracted concept correlated across the entire session.
                    # This preserves contradiction handling and prevents repeated
                    # mentions or alternate KB matches from inflating independent units.
                    correlation_group = f"signal:{observation_hash}"
                    # Multiple RAG matches (for example Fatigue and Chronic
                    # Fatigue) can describe the same extracted patient signal.
                    # Keep the existing scorer's correlated-evidence collapse
                    # by assigning alternatives from one concept to one unit.
                    for evidence_item in ctx.evidence:
                        if (evidence_item.response_id == response.response_id
                                and evidence_item.candidate_id == candidate["candidate_id"]):
                            evidence_item.correlation_group = correlation_group
                    recorded_evidence = recorded["evidence"]
                    recorded_evidence["correlation_group"] = correlation_group
                    confirmed_evidence.append(recorded_evidence)
        logging.getLogger("anahat.evidence").debug(
            "patient_session_evidence_extracted concepts=%s candidates=%s evidence=%s",
            [{"concept": c.concept, "domain": c.domain, "polarity": c.polarity,
              "currentness": c.currentness, "intensity": c.intensity}
             for c in extraction.concepts],
            [{"indicator": self._term(c["payload"].get("indicator_id"), c["payload"]),
              "retrieval_score": c.get("score"), "validation": c.get("validation")}
             for c in internal],
            [{"indicator": e.get("indicator_term"), "status": e.get("status"),
              "chakra_associations": [i.chakra for i in self.indicators.get_by_id(e.get("canonical_indicator_id"))]}
             for e in confirmed_evidence],
        )
        logging.getLogger("anahat.evidence").info(
            "SESSION CONCEPT -> CHAKRA MAPPING | session_id=%s response_id=%s concepts=%s",
            session_id, response.response_id, concept_mapping_diagnostics,
        )
        ctx.stage = AssessmentStage.EVIDENCE_REVIEW.value

        public = [self._public(c) for c in internal]
        result = {"status": "OK" if public else "NO_VALID_INDICATOR", "response_id": response.response_id,
                  "extraction": extraction.model_dump(), "candidates": public, "candidate_count": len(public),
                  "unverified_concepts": unverified, "weight_source": weight_source,
                  "evidence": confirmed_evidence, "repeat_mentions": repeat_mentions,
                  "updated_evidence": updated_evidence, "rejected_candidates": rejected_candidates}
        if rejected_candidates:
            ctx.patient_state.setdefault("grounding_rejections", []).extend(
                {"response_id": response.response_id, **{k: v for k, v in r.items() if k != "patient_concept"}}
                for r in rejected_candidates)
        if safety["status"] == "AMBER":
            result["safety"] = safety
        return result

    # ------------------------------------------------------------------ one indicator = one count
    def _prior_observation(self, ctx, candidate, response_id):
        """Active evidence from an EARLIER answer for the same canonical indicator, if any.
        Negated or past mentions are not merged (contradiction handling owns those)."""
        con = candidate.get("concept") or {}
        if con.get("polarity") == "negative" or con.get("currentness") == "historical":
            return None
        iid = (candidate.get("payload") or {}).get("indicator_id")
        if not iid or not hasattr(self.indicators, "group_key"):
            return None
        group = self.indicators.group_key(iid)
        for ev in ctx.evidence:
            if (ev.response_id != response_id and not ev.superseded and ev.twin_of is None
                    and ev.status not in {EvidenceStatus.NEGATIVE, EvidenceStatus.HISTORICAL}
                    and self.indicators.group_key(ev.canonical_indicator_id) == group):
                return ev
        return None

    def _merge_repeat(self, ctx, prior, candidate, response, planned_status):
        """Fold a repeated mention into the first record: no second count, no second score.
        Only gaps are filled (intensity, frequency, duration, impact, trigger); a stronger
        explicit statement may replace an intensity that was only inferred."""
        con = candidate.get("concept") or {}
        members = [prior] + [e for e in ctx.evidence if e.twin_of == prior.evidence_id]
        filled = []
        conflicts = self._detect_attribute_conflicts(ctx, prior, members, candidate, con, response)
        for ev in members:
            for fld in ("frequency", "duration", "impact", "trigger", "coping"):
                if not getattr(ev, fld, None) and con.get(fld):
                    setattr(ev, fld, con[fld]); filled.append(fld)
            new_int, new_src = con.get("intensity"), con.get("intensity_source")
            replace = (not ev.intensity) or (ev.intensity_source == "inferred" and new_src == "patient_words")
            if new_int and replace and ev.intensity_source != "therapist":
                ev.intensity, ev.intensity_source = new_int, new_src
                ev.intensity_basis = list(con.get("intensity_basis") or []); filled.append("intensity")
            if response.response_id not in ev.mention_response_ids:
                ev.mention_response_ids.append(response.response_id)
                if candidate.get("quote"):
                    ev.mention_quotes.append(candidate["quote"])
        if prior.status == EvidenceStatus.PROVISIONAL and planned_status == EvidenceStatus.CONFIRMED:
            upgraded = (EvidenceStatus.UNRESOLVED if self.ambiguity.needs_clarification(prior.canonical_indicator_id)
                        else EvidenceStatus.CONFIRMED)
            for ev in members:
                ev.status = upgraded
        ctx.audit("REPEAT_MENTION_MERGED", evidence_id=prior.evidence_id, response_id=response.response_id,
                  filled=sorted(set(filled)), conflicts=[c["attribute"] for c in conflicts])
        return {"summary": {"evidence_id": prior.evidence_id, "term": prior.indicator_term,
                            "filled": sorted(set(filled))},
                "updated": [e.model_dump() for e in members]}

    # ------------------------------------------------------------------ contradictions (spec section 6)
    def _detect_attribute_conflicts(self, ctx, prior, members, candidate, con, response):
        """A later statement about the SAME problem that contradicts the stored frequency, duration or
        intensity. Nothing is overwritten: both statements are kept in attribute_history, the evidence
        is marked contradiction_open (scored at the Unresolved weight) and a polite clarification
        question is created. Resolved once, as ONE evidence unit, by answering that question."""
        found = []
        quote = (candidate.get("quote") or "").strip()
        checks = []
        for attribute in ("frequency", "duration"):
            old_v, new_v = getattr(prior, attribute, None), con.get(attribute)
            fn = attr_conflict.frequency_conflict if attribute == "frequency" else attr_conflict.duration_conflict
            if old_v and new_v and fn(old_v, new_v):
                checks.append((attribute, old_v, new_v))
        if attr_conflict.intensity_conflict(prior.intensity, prior.intensity_source,
                                            con.get("intensity"), con.get("intensity_source")):
            checks.append(("intensity", prior.intensity, con.get("intensity")))
        for attribute, old_v, new_v in checks:
            if any(c["attribute"] == attribute and not c.get("resolved") for c in prior.attribute_conflicts):
                continue          # already waiting for the patient's clarification
            earlier_quote = (prior.quote or "").strip() or str(old_v)
            conflict = {
                "conflict_id": "CF-" + uuid4().hex[:10], "attribute": attribute, "resolved": False,
                "earlier": {"value": old_v, "response_id": prior.response_id, "quote": earlier_quote},
                "later": {"value": new_v, "response_id": response.response_id, "quote": quote or str(new_v)},
                "question": attr_conflict.clarification_question(
                    prior.indicator_term or "this", attribute,
                    str(old_v) if attribute != "intensity" else f"{old_v}",
                    str(new_v) if attribute != "intensity" else f"{new_v}"),
            }
            for ev in members:
                ev.attribute_history.append({"attribute": attribute, "value": old_v, "role": "earlier",
                                             "response_id": prior.response_id})
                ev.attribute_history.append({"attribute": attribute, "value": new_v, "role": "later",
                                             "response_id": response.response_id})
                ev.attribute_conflicts.append(dict(conflict))
                ev.contradiction_open = True
            found.append(conflict)
            ctx.audit("ATTRIBUTE_CONFLICT_DETECTED", evidence_id=prior.evidence_id, attribute=attribute)
        return found

    def _conflict_follow_ups(self, ctx, sid, response_id):
        """Clarification questions for contradictions created by THIS answer."""
        out, seen = [], set()
        for ev in ctx.evidence:
            if ev.superseded or ev.twin_of or not ev.contradiction_open:
                continue
            for c in ev.attribute_conflicts:
                if c.get("resolved") or c["later"]["response_id"] != response_id or c["conflict_id"] in seen:
                    continue
                seen.add(c["conflict_id"])
                members = [ev.evidence_id] + [e.evidence_id for e in ctx.evidence if e.twin_of == ev.evidence_id]
                out.append({
                    "evidence_id": ev.evidence_id, "evidence_ids": members, "term": ev.indicator_term,
                    "terms": [ev.indicator_term], "quote": c["later"].get("quote"), "field": "conflict",
                    "attribute": c["attribute"], "conflict_id": c["conflict_id"], "question": c["question"],
                    "options": [f'Earlier: {c["earlier"]["value"]}', f'Later: {c["later"]["value"]}'],
                    "scored_as_until_answered": "Unresolved weight",
                    "answer_endpoint": f"/sessions/{sid}/deep-dive/answer"})
        return out

    def _resolve_attribute_conflict(self, ctx, ev, value, raw_text=None):
        """Apply the clarified interpretation to the evidence (and its KB twins) as ONE unit."""
        choice = (value or "").strip().lower()
        pick = "earlier" if choice.startswith("earlier") else "later" if choice.startswith("later") else None
        if pick is None:
            raise ValueError("value must be 'earlier' or 'later' (or the option text)")
        open_conf = [c for c in ev.attribute_conflicts if not c.get("resolved")]
        if not open_conf:
            raise ValueError("There is no open contradiction on this evidence")
        members = [ev] + [e for e in ctx.evidence if e.twin_of == ev.evidence_id or e.evidence_id == ev.twin_of]
        for member in members:
            for c in member.attribute_conflicts:
                if c.get("resolved"):
                    continue
                chosen = c[pick]["value"]
                if c["attribute"] in ("frequency", "duration"):
                    setattr(member, c["attribute"], chosen)
                elif c["attribute"] == "intensity":
                    member.intensity, member.intensity_source = chosen, "therapist"
                    member.intensity_basis = [f"clarified by the patient after a contradiction ({pick} statement)"]
                c["resolved"], c["resolved_to"] = True, pick
                if raw_text:
                    c["clarification_text"] = raw_text.strip()
            member.contradiction_open = any(not c.get("resolved") for c in member.attribute_conflicts)
        ctx.audit("ATTRIBUTE_CONFLICT_RESOLVED", evidence_id=ev.evidence_id, resolved_to=pick)
        return members

    def _term(self, iid, payload):
        t = self.indicators.term(iid) if hasattr(self.indicators, "term") else None
        return t or payload.get("ailment") or payload.get("term") or iid

    @staticmethod
    def _quote_names_indicator(quote, terms) -> bool:
        """True when the patient's quoted words contain a content word of the KB term (up to
        inflection: 'overthink' ~ 'Overthinking', 'anxious' is NOT 'Anxiety')."""
        quote_words = [w.lower() for w in re.findall(r"[A-Za-z']+", quote or "") if len(w) >= 3]
        quote_stems = {_stem(w) for w in quote_words}

        def same_word(a, b):
            # same stem, or same 5-letter start for longer words (silent~silence, lonely~loneliness)
            return _stem(a) == _stem(b) or (len(a) >= 5 and len(b) >= 5 and a[:5] == b[:5])

        for term in terms:
            words = [w for w in re.findall(r"[A-Za-z']+", (term or "").lower())
                     if w not in _QUOTE_STOPWORDS and w not in {"not", "low", "lack"} and len(w) >= 4]
            if any(_stem(w) in quote_stems or any(same_word(w, q) for q in quote_words) for w in words):
                return True
        return False

    def _describe(self, iid):
        """What the matching checker is told about a KB indicator: its identity only (term and the
        sub-forms written into the term). The KB `meaning`/`comment` is a chakra INTERPRETATION
        ("Stroke: overwhelm to consciousness"), not a definition of the symptom, so it must never be
        used to decide whether the patient described the indicator."""
        records = self.indicators.get_by_id(iid) if hasattr(self.indicators, "get_by_id") else []
        if not records:
            return None
        variants = sorted(v for v in self.indicators.term_variants(records[0].term) if v != records[0].term.lower())
        return ("Also written as: " + ", ".join(variants)) if variants else None

    def _apply_grounding(self, concept, cands, rejected):
        """Deterministic second opinion on every semantic candidate (see app/engine/grounding.py)."""
        if not settings.grounding_enabled or not cands:
            return cands
        kept = []
        log = logging.getLogger("anahat.evidence")
        for c in cands:
            iid = c["payload"].get("indicator_id")
            term = self._term(iid, c["payload"])
            match = (c.get("validation") or {}).get("match")
            if match not in {"exact", "partial", "retrieval_only"}:
                kept.append(c)          # no validator verdict: it can never become evidence, nothing to gate
                continue
            variants = self.indicators.term_variants(term) if hasattr(self.indicators, "term_variants") else None
            d = grounding_gate.ground_candidate(
                concept=concept.model_dump(), term=term or "", indicator_domain=c["payload"].get("domain")
                or (self.indicators.domain(iid) if hasattr(self.indicators, "domain") else None),
                validator_match=match, similarity=c.get("score"), variants=variants,
                confirm_similarity=settings.grounding_confirm_similarity,
                provisional_similarity=settings.grounding_provisional_similarity)
            c["grounding"] = d.as_trace()
            log.info("GROUNDING | indicator=%s verdict=%s validator=%s similarity=%s overlap=%s reason=%s",
                     iid, d.verdict, match, None if c.get("score") is None else round(c["score"], 3),
                     d.lexical_overlap, d.reasons[:1])
            if d.verdict == grounding_gate.REJECTED:
                rejected.append({"indicator_id": iid, "term": term, "status": "REJECTED", "reasons": d.reasons,
                                 "similarity": d.as_trace()["similarity"], "validator_match": match,
                                 "patient_concept": concept.concept})
                continue
            if match in {"exact", "partial", "retrieval_only"} and d.verdict == grounding_gate.PROVISIONAL:
                c["validation"] = {**(c.get("validation") or {}), "match": "partial"}   # plausible, not confirmed
            kept.append(c)
        # Explained-away rule: when one candidate is named by the patient's own words, neighbouring KB
        # records that share no words with the statement are retrieval noise, not extra findings.
        if any((c.get("grounding") or {}).get("lexical_overlap") for c in kept):
            survivors = []
            for c in kept:
                g = c.get("grounding")
                if g and not g.get("lexical_overlap"):
                    iid = c["payload"].get("indicator_id")
                    rejected.append({"indicator_id": iid, "term": self._term(iid, c["payload"]), "status": "REJECTED",
                                     "reasons": ["the statement is already explained by an indicator named in the patient's words"],
                                     "similarity": g.get("similarity"), "validator_match": g.get("validator_match"),
                                     "patient_concept": concept.concept})
                    continue
                survivors.append(c)
            kept = survivors
        return kept

    def _candidates_for(self, concept, text, rejected=None):
        rejected = rejected if rejected is not None else []
        direct_matches, matching_strategy = self.indicators.find_for_concept(concept.concept)
        if direct_matches:
            by_id = {}
            for indicator in direct_matches:
                by_id.setdefault(indicator.indicator_id, []).append(indicator)
            direct = []
            for iid, records in by_id.items():
                first = records[0]
                payload = {
                    "indicator_id": iid,
                    "term": first.term,
                    "domain": first.domain,
                    "chakra": sorted({record.chakra for record in records}),
                    "indicator_strength_by_chakra": {
                        record.chakra: record.association_rating for record in records
                    },
                }
                direct.append({
                    "candidate_id": str(uuid4()), "score": 1.0, "payload": payload,
                    "concept": concept.model_dump(), "quote": concept.evidence_quote,
                    "validation": {
                        "llm_validated": True, "match": "exact",
                        "reason": f"matched via {matching_strategy}",
                    },
                })
            # The model's LABEL matched a KB term, but the label is the model's interpretation.
            # Auto-confirm only when the patient's quoted words themselves name the indicator;
            # otherwise the quote must pass the same closed-set check as every semantic match
            # (e.g. label "feeling unheard" + quote "some past experiences still affect me").
            supported = self._quote_names_indicator(concept.evidence_quote, [c["payload"]["term"] for c in direct])
            if not supported:
                direct = self._apply_grounding(concept, self._validate(text, concept, direct), rejected)
                matching_strategy += "+quote_not_explicit_llm_validated"
            logging.getLogger("anahat.evidence").info(
                "CONCEPT CANONICAL MATCH | concept=%s normalized_term=%s attempted_ids=%s "
                "matching_strategy=%s match_result=%s",
                concept.concept, normalize_term(concept.concept),
                sorted(by_id), matching_strategy,
                ",".join(f"{c['payload']['indicator_id']}:{(c.get('validation') or {}).get('match')}" for c in direct)
                or "rejected_by_validator",
            )
            return direct

        queries = [concept.concept]
        if concept.evidence_quote and _norm(concept.evidence_quote) != _norm(concept.concept):
            queries.append(concept.evidence_quote)
        if settings.retrieval_use_sentence_query and concept.evidence_quote:
            # the whole sentence holding the quote carries context the label alone lacks
            sentence = next((sn.strip() for sn in re.split(r"(?<=[.!?;\n])\s+", text or "")
                             if _norm(concept.evidence_quote) in _norm(sn)), "")
            if sentence and len(sentence) <= 200 and _norm(sentence) not in {_norm(q) for q in queries}:
                queries.append(sentence)
        best = {}
        attempted_ids = []
        for query in queries:
            for r in self.retriever.search(query):
                if not candidate_is_usable(r, score_threshold=settings.retrieval_score_threshold):
                    continue
                payload = getattr(r, "payload", {}) or {}
                iid = payload.get("indicator_id")
                if iid:
                    attempted_ids.append(iid)
                if not (iid and self.indicators.validate_candidate(iid, payload)):
                    continue
                score = float(getattr(r, "score", 0.0))
                if iid not in best or score > best[iid]["score"]:
                    best[iid] = {"candidate_id": str(uuid4()), "score": score, "payload": payload,
                                 "concept": concept.model_dump(), "quote": concept.evidence_quote,
                                 "validation": {"llm_validated": False, "match": None}}
        cands = sorted(best.values(), key=lambda x: -x["score"])[:settings.retrieval_top_k]
        cands = self._apply_grounding(concept, self._validate(text, concept, cands), rejected)
        matched_ids = [
            c["payload"].get("indicator_id") for c in cands
            if (c.get("validation") or {}).get("match") == "exact"
        ]
        logging.getLogger("anahat.evidence").info(
            "CONCEPT CANONICAL MATCH | concept=%s normalized_term=%s attempted_ids=%s "
            "matching_strategy=semantic_retrieval_then_llm_validation match_result=%s",
            concept.concept, normalize_term(concept.concept),
            list(dict.fromkeys(attempted_ids)),
            "matched:" + ",".join(matched_ids) if matched_ids else "no_match",
        )
        # Every extracted patient concept is processed above; keep the existing
        # bounded, validated RAG shortlist for each concept to avoid recording
        # broad lower-ranked matches as evidence.
        return cands[:settings.candidate_display_limit]

    def _validate(self, text, concept, cands):
        fn = getattr(self.llm, "validate_candidates", None)
        if not cands or not callable(fn):
            return cands
        listing = [{"indicator_id": c["payload"]["indicator_id"],
                    "term": self._term(c["payload"]["indicator_id"], c["payload"]),
                    "domain": c["payload"].get("domain"),
                    "description": self._describe(c["payload"]["indicator_id"])} for c in cands]
        try:
            verdict = fn(text, concept.model_dump(), listing)
        except Exception as exc:  # noqa: BLE001 - degrade, but never silently lose the patient's signal
            best = max(cands, key=lambda c: c.get("score") or 0.0)
            keep = (best.get("score") or 0.0) >= settings.validator_failure_min_similarity
            logging.getLogger("anahat.evidence").warning(
                "CANDIDATE VALIDATION FAILED | concept=%s error=%s | best=%s score=%.3f | %s",
                concept.concept, type(exc).__name__, best["payload"].get("indicator_id"),
                best.get("score") or 0.0,
                "kept as PROVISIONAL (strong retrieval match)" if keep else "dropped (similarity too low)",
            )
            if keep:
                best["validation"] = {"llm_validated": False, "match": "retrieval_only",
                                      "reason": "validator unavailable; strong retrieval similarity"}
                return [best]
            return []
        allowed = {c["payload"]["indicator_id"] for c in cands}
        judged = {j.indicator_id: j for j in verdict.judgements if j.indicator_id in allowed}  # ids outside the list are ignored
        kept = []
        for c in cands:
            j = judged.get(c["payload"]["indicator_id"])
            if j is None or j.match == "none":
                continue
            c["validation"] = {"llm_validated": True, "match": j.match, "reason": j.reason}
            kept.append(c)
        kept.sort(key=lambda c: (c["validation"]["match"] != "exact", -c["score"]))
        return kept

    def _public(self, c):
        iid = c["payload"]["indicator_id"]
        con = c["concept"]
        amb = getattr(self, "ambiguity", None)
        out = {"candidate_id": c["candidate_id"], "indicator_id": iid, "term": self._term(iid, c["payload"]),
               "domain": c["payload"].get("domain") or con.get("domain"), "quote": c.get("quote"),
               "patient_concept": con.get("concept"), "polarity": con.get("polarity"),
               "currentness": con.get("currentness"), "intensity": con.get("intensity"),
               "match": c["validation"].get("match"), "llm_validated": c["validation"]["llm_validated"],
               "clarification_required": bool(amb.needs_clarification(iid)) if amb else False,
               "requires_confirmation": False,
               "evidence_recorded": bool(c.get("recorded_status")),
               "evidence_status": c.get("recorded_status")}
        if settings.expose_candidate_internals:
            out["score"], out["payload"] = c["score"], c["payload"]
        return out

    # ------------------------------------------------------------------ quadrants + questions
    def _exhausted(self, ctx):
        done = set()
        for name, st in ctx.quadrants.items():
            if st.get("completed") or self.questions.next_questions(name, st["answered_question_ids"], 1)["exhausted"]:
                done.add(name)
        return done

    def assessed_quadrants(self, ctx):
        n = settings.min_responses_per_quadrant_assessed
        return {name for name, st in ctx.quadrants.items()
                if st.get("completed") or len(st.get("answered_question_ids", [])) >= n or len(st.get("response_ids", [])) >= n}

    _INTAKE_SKIP_LINE = re.compile(
        r"^\s*(patient assessment information|gender|age|occupation|marital status|city|sleep pattern|"
        r"baseline [a-z ]+)\s*:?", re.IGNORECASE)

    def _intake_text(self, current_issue):
        """Patient form notes / concerns / therapist context from the intake summary. Demographic
        and baseline lines are dropped (baseline is used separately, never as a quoted concept)."""
        keep = [ln for ln in (current_issue or "").splitlines()
                if ln.strip() and not self._INTAKE_SKIP_LINE.match(ln)]
        return "\n".join(keep).strip()

    def _analyse_intake(self, sid, ctx, current_issue):
        """Score what the patient wrote on the intake form. Runs once per session; never blocks
        quadrant recommendation and never changes the assessment stage."""
        if (not settings.analyse_intake_as_evidence or ctx.patient_state.get("intake_analysed")
                or not current_issue or self.llm is None or self.retriever is None):
            return
        text = self._intake_text(current_issue)
        ctx.patient_state["intake_analysed"] = True
        if len(text) < 20:
            return
        safety = self.safety.assess(text) if getattr(self, "safety", None) else {"status": "CLEAR"}
        if safety.get("status") == "ESCALATE":
            ctx.patient_state["intake_safety_flag"] = safety
            ctx.audit("INTAKE_SAFETY_FLAG", details=safety)
            logging.getLogger("anahat.evidence").warning(
                "INTAKE SAFETY FLAG | intake text matched a risk signal; not analysed as evidence. "
                "Therapist must review the intake form.")
            return
        stage_before = ctx.stage
        try:
            response = ResponseService().create(text=text, question_id="INTAKE", quadrant=None)
            out = self._analyze(ctx, response, text, session_id=sid, weight_source="intake")
            logging.getLogger("anahat.evidence").info(
                "INTAKE ANALYSED AS EVIDENCE | evidence=%s",
                [e.get("indicator_term") for e in out.get("evidence", [])])
            if out.get("status") != "SAFETY_ESCALATION":
                ctx.stage = stage_before
        except Exception:  # noqa: BLE001 - intake evidence is a bonus; recommendation must still work
            ctx.stage = stage_before
            logging.getLogger("anahat.evidence").exception("Intake analysis failed; continuing without it")

    def recommend_quadrants(self, sid, current_issue=None, opening_answers=None):
        ctx = self._ctx(sid)
        if current_issue and ctx.stage != AssessmentStage.OPENING.value:
            self._analyse_intake(sid, ctx, current_issue)
            if not ctx.patient_state.get("current_issue"):
                ctx.patient_state["current_issue"] = current_issue
        cached = ctx.patient_state.get("selected_quadrants")
        if cached is not None:
            # Refresh suggestions only when the patient has said something new since the last
            # recommendation, so "move to / add a quadrant" reflects the answers so far.
            if len(ctx.responses) <= ctx.patient_state.get("quadrant_rec_response_count", 0):
                return copy.deepcopy(cached)
            completed = {q for q, st in ctx.quadrants.items() if st.get("completed")}
            concepts = [c["concept"] for r in ctx.responses for c in (r.extraction or {}).get("concepts", [])
                        if c.get("polarity") != "negative" and c.get("domain") in {"symptom", "emotion", "behaviour"}]
            issue = " ".join([ctx.patient_state.get("current_issue") or "",
                              *[r.raw_text for r in ctx.responses[-6:]]])
            try:
                rec = self.questions.recommend_quadrants(
                    current_issue=issue, opening_answers=ctx.patient_state.get("opening_responses", []),
                    baseline=ctx.baseline, demographics=ctx.demographics, concepts=concepts,
                    exhausted=completed | self._exhausted(ctx), assessed=self.assessed_quadrants(ctx))
            except Exception:  # noqa: BLE001 - keep the previous suggestion
                logging.getLogger("anahat.quadrants").exception("Quadrant refresh failed")
                return copy.deepcopy(cached)
            rec = self._apply_contextual_quadrant_plan(ctx, rec, issue)
            ctx.patient_state["selected_quadrants"] = copy.deepcopy(rec)
            ctx.patient_state["quadrant_rec_response_count"] = len(ctx.responses)
            logging.getLogger("anahat.quadrants").info("REFRESHED QUADRANT SUGGESTIONS: %s",
                                                       [item["quadrant"] for item in rec])
            return rec
        if ctx.stage == AssessmentStage.OPENING.value:
            raise ValueError("Complete the opening responses or explicitly skip opening before quadrant recommendation")
        concepts, texts = [], []
        for r in ctx.responses:
            texts.append(r.raw_text)
            for c in (r.extraction or {}).get("concepts", []):
                if c.get("polarity") != "negative" and c.get("domain") in {"symptom", "emotion", "behaviour"}:
                    concepts.append(c["concept"])
        full_issue = current_issue or ctx.patient_state.get("current_issue") or " ".join(texts)
        all_openings = ctx.patient_state.get("opening_responses", [])
        if opening_answers:
            all_openings = [*all_openings, *([opening_answers] if isinstance(opening_answers, str) else list(opening_answers))]
        recommendation_logger = logging.getLogger("anahat.quadrants")
        recommendation_logger.info("QUADRANT RECOMMENDATION INPUT: DEMOGRAPHICS=%s | BASELINE=%s | OPENING RESPONSES=%s",
                                   ctx.demographics, ctx.baseline, all_openings)
        rec = self.questions.recommend_quadrants(
            current_issue=full_issue,
            opening_answers=all_openings,
            baseline=ctx.baseline, demographics=ctx.demographics, concepts=concepts,
            exhausted=self._exhausted(ctx), assessed=self.assessed_quadrants(ctx))
        rec = self._apply_contextual_quadrant_plan(ctx, rec, full_issue, all_openings)
        ctx.patient_state["current_issue"] = full_issue
        ctx.patient_state["selected_quadrants"] = copy.deepcopy(rec)
        ctx.patient_state["quadrant_rec_response_count"] = len(ctx.responses)
        recommendation_logger.info("SUGGESTED QUADRANTS: %s", [item["quadrant"] for item in rec])
        recommendation_logger.info("QUADRANT RECOMMENDATION EVIDENCE: %s", self.questions.last_recommendation_input)
        recommendation_logger.info("QUADRANT SCORES AND MATCH REASONS: %s", self.questions.last_recommendation_debug)
        recommendation_logger.info("QUADRANT RECOMMENDATION DETAILS: %s", rec)
        logging.getLogger("anahat.assessment.progress").info("RECOMMENDED QUADRANTS: %s", [item["quadrant"] for item in rec])
        ctx.audit("QUADRANT_RECOMMENDATION", recommendations=rec)
        return rec

    def _apply_contextual_quadrant_plan(self, ctx, recommendations, concerns, opening_answers=None):
        reasoner = getattr(self, "contextual_reasoner", None)
        if not reasoner or not getattr(reasoner, "available", True):
            return recommendations
        definitions = [{"quadrant_id": str(q.get("quadrant_id")), "name": q.get("name"),
                        "attributes": list(q.get("attributes") or [])} for q in self.kb.quadrants]
        demographic_fields = {"age", "gender", "language", "occupation", "marital_status",
                              "disability_type", "mental_age"}
        profile = {key: value for key, value in (ctx.demographics or {}).items()
                   if key in demographic_fields and value is not None}
        preferences = (ctx.demographics or {}).get("communication_preferences")
        if isinstance(preferences, dict):
            profile["communication_preferences"] = {
                key: value for key, value in preferences.items()
                if str(key).strip().lower() not in {"id", "patient_id", "name"} and value is not None
            }
        try:
            decision = reasoner.analyze_profile(
                profile=profile, concerns="\n".join(filter(None, [concerns,
                    "Opening responses: " + str(opening_answers) if opening_answers else ""])),
                quadrants=definitions)
            plan = decision.model_dump() if hasattr(decision, "model_dump") else decision
            by_name = {str(item.get("quadrant")): item for item in plan.get("quadrants", [])}
            known = {q["name"]: q["quadrant_id"] for q in definitions}
            if set(by_name) != set(known) or any(
                    str(by_name[name].get("quadrant_id")) != qid for name, qid in known.items()):
                raise ValueError("contextual plan did not match the KB quadrant definitions")
            ctx.patient_state["contextual_assessment"] = plan
            ctx.patient_state["contextual_assessment_status"] = "openai"
            existing = {item["quadrant"]: item for item in recommendations}
            ranked = []
            status_score = {"priority": 0.9, "relevant": 0.7, "conditional": 0.45}
            for quadrant in plan["quadrants"]:
                status = quadrant["status"]
                if status not in status_score:
                    continue
                item = existing.get(quadrant["quadrant"])
                if item is None:
                    item = {"quadrant": quadrant["quadrant"], "relevance_score": status_score[status],
                            "method": "llm_contextual_plan", "reasons": [quadrant["rationale"]],
                            "already_started": False, "missing_information": []}
                else:
                    item = copy.deepcopy(item)
                    item["relevance_score"] = max(float(item.get("relevance_score", 0)), status_score[status])
                    item["reasons"] = [quadrant["rationale"], *item.get("reasons", [])]
                ranked.append((status_score[status], item))
            ranked.sort(key=lambda pair: (-pair[0], -pair[1].get("relevance_score", 0)))
            return [item for _, item in ranked]
        except Exception:  # noqa: BLE001 - existing recommendations remain the explicit fallback
            logging.getLogger("anahat.quadrants").exception("Contextual planning failed; using KB recommendations")
            ctx.patient_state["contextual_assessment_status"] = "fallback"
            return recommendations

    def select_quadrant(self, sid, quadrant):
        ctx = self._ctx(sid)
        if ctx.patient_state.get("final_chakra_evaluated"):
            raise ValueError("The assessment has ended")
        if quadrant not in self.kb.quadrant_names:
            raise ValueError(f"Unknown quadrant: {quadrant}")
        if not ctx.patient_state.get("contextual_assessment"):
            self._apply_contextual_quadrant_plan(
                ctx, [], ctx.patient_state.get("current_issue") or "",
                ctx.patient_state.get("opening_responses"))
        plan = ctx.patient_state.get("contextual_assessment") or {}
        planned = next((item for item in plan.get("quadrants", []) if item.get("quadrant") == quadrant), None)
        if ctx.patient_state.get("contextual_assessment_status") == "openai" and planned and planned.get("status") in {"inapplicable", "deferred"}:
            raise ValueError(f"Quadrant is currently {planned['status']}: {planned.get('rationale', '')}")
        st = self._q_state(ctx, quadrant)
        selected = ctx.patient_state.setdefault("selected_quadrant_names", [])
        if quadrant not in selected:
            selected.append(quadrant)
            ctx.patient_state["selected_quadrant_names"] = selected
        ctx.patient_state["assessment_complete"] = False
        ctx.patient_state["final_chakra_evaluated"] = False
        logging.getLogger("anahat.assessment.progress").info("SELECTED QUADRANTS: %s", selected)
        ctx.stage = AssessmentStage.PERSONALIZED_QUESTIONS.value
        ctx.patient_state["current_quadrant"] = quadrant
        ctx.patient_state["assessment_status"] = "in_progress"
        ctx.audit("QUADRANT_SELECTED", quadrant=quadrant)
        return {**self._next_for(ctx, quadrant), "stage": ctx.stage}

    def _next_for(self, ctx, quadrant, limit=1, *, deep_dive=False):
        st = self._q_state(ctx, quadrant)
        page = self._rag_question(ctx, quadrant, limit, deep_dive=deep_dive)
        ctx.patient_state["current_question"] = page["questions"][0] if page.get("questions") else None
        logging.getLogger("anahat.assessment.progress").info(
            "CURRENT QUADRANT: %s | NORMAL QUESTION COUNT: %s/3 | DEEP DIVE ENABLED: %s | DEEP DIVE QUESTION COUNT: %s | CURRENT QUESTION: %s | COMPLETED QUADRANTS: %s | REMAINING QUADRANTS: %s",
            quadrant, st["normal_question_count"], st["deep_dive_active"], st["deep_dive_question_count"], ctx.patient_state["current_question"],
            [q for q, state in ctx.quadrants.items() if state.get("completed")],
            [q for q in ctx.patient_state.get("selected_quadrant_names", []) if not self._q_state(ctx, q).get("completed")],
        )
        if st.get("completed"):
            page.update(questions=[], exhausted=True)
        # The state machine, not the RAG result, owns the three-question
        # normal pass. Never query RAG again for a normally completed quadrant.
        if not deep_dive and st["normal_question_count"] >= NORMAL_QUADRANT_QUESTION_LIMIT:
            page.update(questions=[], exhausted=True, normal_limit_reached=True)
        if page["exhausted"] and not page.get("normal_limit_reached"):
            others = self.questions.recommend_quadrants(
                current_issue=" ".join(r.raw_text for r in ctx.responses), exhausted=self._exhausted(ctx),
                assessed=self.assessed_quadrants(ctx),
                concepts=[c["concept"] for r in ctx.responses for c in (r.extraction or {}).get("concepts", [])])
            others = self._apply_contextual_quadrant_plan(
                ctx, others, " ".join([ctx.patient_state.get("current_issue") or "",
                                       *(r.raw_text for r in ctx.responses)]),
                ctx.patient_state.get("opening_responses"))
            page["recommended_quadrants"] = others
            remaining = set(self.kb.quadrant_names) - self._exhausted(ctx)
            page["message"] = ("All questions for this quadrant are answered. Choose another quadrant, or view the result."
                               if others else ("No additional area is strongly indicated by the available responses. "
                                               "Choose another area if clinically appropriate, or view the result."
                                               if remaining else "Every quadrant is covered. You can view the final result."))
            page["all_quadrants_covered"] = not remaining
        page["assessment_status"] = ctx.patient_state.get("assessment_status", "in_progress")
        return page

    def _rag_question(self, ctx, quadrant, limit=1, *, deep_dive=False):
        """Retrieve validated question-bank chunks from the existing vector index.

        The selected result is the question actually returned to the client; the
        attribute queue is only used to identify outstanding needs and is never
        used as a fallback sequence.
        """
        state = self._q_state(ctx, quadrant)
        canonical = self.questions._quadrant(quadrant)
        logger = logging.getLogger("anahat.assessment.rag")
        logger.info("REQUESTED QUADRANT: %s | NORMALIZED QUADRANT: %s | QUESTION BANK CATEGORY: %s",
                    quadrant, canonical.get("name") if canonical else None,
                    canonical.get("name") if canonical else None)
        count = state["deep_dive_question_count"] if deep_dive else state["normal_question_count"]
        if deep_dive and state["normal_question_count"] < NORMAL_QUADRANT_QUESTION_LIMIT:
            return {"quadrant": quadrant, "questions": [], "remaining": 0, "total": count,
                    "exhausted": True, "normal_limit_reached": False, "question_count": count,
                    "deep_dive": True, "reason": "Deep dive is available after the normal three-question pass."}
        if (state.get("completed") and not deep_dive) or (not deep_dive and count >= NORMAL_QUADRANT_QUESTION_LIMIT):
            state["normal_completed"] = state["normal_completed"] or count >= NORMAL_QUADRANT_QUESTION_LIMIT
            return {"quadrant": quadrant, "questions": [], "remaining": 0, "total": count,
                    "exhausted": True, "normal_limit_reached": not deep_dive and count >= NORMAL_QUADRANT_QUESTION_LIMIT,
                    "question_count": count, "deep_dive": deep_dive}
        if deep_dive:
            state["deep_dive_active"] = True
            ctx.patient_state["assessment_status"] = "deep_dive_active"
            state["completed"] = False
            ctx.patient_state["assessment_complete"] = False
            ctx.patient_state["final_chakra_evaluated"] = False
            logging.getLogger("anahat.assessment.progress").info(
                "DEEP DIVE RAG RETRIEVAL | CURRENT QUADRANT: %s | DEEP DIVE QUESTION COUNT: %s",
                quadrant, state["deep_dive_question_count"] + 1,
            )
        asked = list(state.get("answered_question_ids", []))
        question_text_by_id = ctx.patient_state.setdefault("question_text_by_id", {})
        asked_text = [question_text_by_id[qid] for qid in asked if qid in question_text_by_id]
        ctx.patient_state["asked_questions"] = list(dict.fromkeys(
            [*ctx.patient_state.get("asked_questions", []), *asked_text]
        ))
        session_asked = {_norm(t) for t in ctx.patient_state.get("asked_questions", [])}
        answer_by_question = {r.question_id: r.raw_text for r in ctx.responses if r.question_id in asked}
        # Every non-negative, non-superseded finding counts here (not only CONFIRMED),
        # otherwise ambiguous/unresolved evidence never steers the next question.
        evidence = list(dict.fromkeys(
            e.indicator_term for e in ctx.evidence
            if e.indicator_term and not e.superseded
            and e.status not in {EvidenceStatus.NEGATIVE, EvidenceStatus.HISTORICAL}))
        remaining = self.questions.next_questions(quadrant, asked, 100)
        missing = [q.get("attribute", "") for q in remaining["questions"]]
        latest_text, latest_concepts = self._latest_patient_signal(ctx)
        recent_answers = [a for a in answer_by_question.values() if a][-2:]
        # The query is led by what the patient JUST said. Demographics, baseline and the
        # full transcript used to drown that signal, so the same bank questions kept winning.
        if latest_text:
            lead = [f"Latest patient answer: {latest_text[:500]}",
                    f"Symptoms, emotions or behaviours the patient just described: {latest_concepts}"]
        else:
            lead = [f"Opening responses: {ctx.patient_state.get('opening_responses', [])}"]
        contextual_plan = ctx.patient_state.get("contextual_assessment") or {}
        quadrant_plan = next((item for item in contextual_plan.get("quadrants", [])
                              if item.get("quadrant") == quadrant), {})
        query = "\n".join([
            *lead,
            f"Current quadrant: {quadrant}",
            f"Contextual retrieval focus: {quadrant_plan.get('retrieval_query', '')}",
            f"Findings so far: {evidence[-6:]}",
            f"Earlier answers in this quadrant: {recent_answers}",
        ])
        rag_query = "\n".join([query, f"Assessment attributes still open: {missing[:5]}"])
        logger.info("RAG QUERY QUADRANT: %s | RAG QUERY: %s", quadrant, rag_query)
        question_retriever = getattr(self, "question_retriever", None) or self.retriever
        retrieval_error = False
        retrieval_failure_detail = None
        rejected = {"wrong_source": 0, "wrong_quadrant": 0, "already_asked": 0,
                    "duplicate": 0, "no_question_text": 0}
        if question_retriever:
            # Filter INSIDE Qdrant: only canonical question-bank points aligned to this quadrant
            # compete on similarity. Without it, long reference-document chunks filled the top-N
            # and every question was rejected afterwards (wrong_source / wrong_quadrant).
            qdrant_filter = self._question_bank_filter(quadrant)
            try:
                points = question_retriever.search(
                    rag_query,
                    top_k=max(QUESTION_RAG_RETRIEVAL_LIMIT, limit * 8),
                    query_filter=qdrant_filter,
                )
            except TypeError:
                # Existing injected/test retrievers may expose an older search contract.
                try:
                    try:
                        points = question_retriever.search(rag_query, top_k=max(QUESTION_RAG_RETRIEVAL_LIMIT, limit * 8))
                    except TypeError:
                        points = question_retriever.search(rag_query)
                except Exception:  # noqa: BLE001 - use the validated KB fallback
                    retrieval_error = True
                    retrieval_failure_detail = "question_retriever_exception"
                    points = []
                    logger.exception("Question-bank RAG retrieval failed for quadrant %s", quadrant)
            except Exception:  # noqa: BLE001 - use the validated KB fallback
                retrieval_error = True
                retrieval_failure_detail = "question_retriever_exception"
                points = []
                logger.exception("Question-bank RAG retrieval failed for quadrant %s", quadrant)
            if qdrant_filter is not None and not points and not retrieval_error:
                logger.warning("RAG FILTERED SEARCH RETURNED NOTHING for %s: check that question-bank points carry "
                               "document_type/quadrant_alignment payload (scripts/ingest_question_bank.py). "
                               "Retrying unfiltered.", quadrant)
                try:
                    points = question_retriever.search(rag_query, top_k=max(QUESTION_RAG_RETRIEVAL_LIMIT, limit * 8))
                except Exception:  # noqa: BLE001
                    points = []
        else:
            points = []
            retrieval_failure_detail = "question_retriever_not_configured"
        candidates = []
        ctx.patient_state["rag_retrieval_count"] = ctx.patient_state.get("rag_retrieval_count", 0) + 1
        for point in points:
            payload = getattr(point, "payload", None) or (point.get("payload", {}) if isinstance(point, dict) else {})
            body = payload.get("text", "")
            # Only question-bank documents are eligible, and candidate question
            # prompts must be recoverable from the returned chunk itself.
            source = str(
                payload.get("source")
                or payload.get("source_path")
                or payload.get("source_file")
                or payload.get("source_document")
                or ""
            ).lower()
            source_rejection = _question_bank_rejection_reason(payload, body)
            if source_rejection:
                rejected["wrong_source"] += 1
                logger.debug(
                    "RAG QUESTION REJECTED | reason=%s source=%s document_type=%s "
                    "knowledge_category=%s canonical_version=%s",
                    source_rejection, source, payload.get("document_type"),
                    payload.get("knowledge_category"), payload.get("canonical_version"),
                )
                continue
            alignment = payload.get("quadrant_alignment") or payload.get("quadrant") or payload.get("subdomain")
            if not alignment:
                match = re.search(r"^quadrant_alignment:\s*([^\r\n]+)", body, flags=re.MULTILINE | re.IGNORECASE)
                alignment = match.group(1).strip() if match else None
            if not alignment:
                source_file = str(payload.get("source_file") or payload.get("source_path") or "")
                alignment = re.sub(r"\.md$", "", source_file.replace("\\", "/").rsplit("/", 1)[-1], flags=re.IGNORECASE)
            alignment = re.sub(r"[^a-z0-9]+", "_", str(alignment).lower()).strip("_")
            if alignment not in QUESTION_BANK_ALIGNMENT_BY_QUADRANT.get(quadrant, set()):
                rejected["wrong_quadrant"] += 1
                logger.debug("Skipping question-bank chunk with nonmatching quadrant alignment: requested=%s metadata=%s source=%s",
                             quadrant, alignment, source)
                continue
            found_question = False
            raw_lines = [re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", ln).strip() for ln in body.splitlines()]
            # "If so, ..." fragments are joined to the question before them (an orphan is dropped)
            for line in merge_follow_up_fragments([ln for ln in raw_lines if "?" in ln and len(ln) >= 12]):
                found_question = True
                fits, why = question_fits(quadrant, line, alignment)
                if not fits:
                    rejected["off_topic"] = rejected.get("off_topic", 0) + 1
                    logger.info("RAG QUESTION REJECTED | reason=%s quadrant=%s question=%s", why, quadrant, line)
                    continue
                # ids are scoped to the quadrant: the same KB line can sit in two banks (relationships.md
                # feeds Family and Social Circle) and must not look "already asked" in the other one
                qid = "RAG-" + hashlib.sha256(f"{quadrant}|{_norm(line)}".encode("utf-8")).hexdigest()[:16]
                if (qid in asked or any(_norm(line) == _norm(old) for old in asked_text)
                        or _norm(line) in session_asked):
                    rejected["already_asked"] += 1
                    logger.debug("RAG QUESTION REJECTED | reason=already_asked question_id=%s", qid)
                    continue
                if any(_norm(line) == _norm(c["question"]) for c in candidates):
                    rejected["duplicate"] += 1
                    logger.debug("RAG QUESTION REJECTED | reason=duplicate question_id=%s", qid)
                    continue
                candidates.append({"id": qid, "question": line, "quadrant": quadrant,
                                   "source": source or "question_bank", "score": float(getattr(point, "score", 0) or 0)})
                logger.debug(
                    "RAG QUESTION ACCEPTED | question_id=%s requested_quadrant=%s "
                    "alignment=%s source=%s",
                    qid, quadrant, alignment, source,
                )
            if not found_question:
                rejected["no_question_text"] += 1
        candidates.sort(key=lambda item: item["score"], reverse=True)
        selected = candidates[0] if candidates else None
        retrieval_status = "RETRIEVED" if selected else None
        fallback_reason = None
        if selected is None:
            if retrieval_error or not question_retriever:
                fallback_reason = retrieval_failure_detail
            elif not points:
                fallback_reason = "question_retriever_returned_no_chunks"
            else:
                fallback_reason = "all_retrieved_chunks_rejected: " + ", ".join(
                    f"{name}={count}" for name, count in rejected.items()
                )
            # If RAG has no eligible result, rank unanswered KB items from this
            # exact quadrant using the same patient/session query.
            fallback = [item for item in (remaining.get("questions") or [])
                        if item.get("id") not in asked
                        and not any(_norm(item.get("question")) == _norm(old) for old in asked_text)]
            if fallback:
                ranked_fallback, fallback_method = self.questions.rank_fallback_questions(query, fallback)
                item, fallback_score = ranked_fallback[0]
                selected = {"id": item["id"], "question": item["question"], "quadrant": quadrant,
                            "source": item.get("source", "KB question bank fallback"),
                            "score": fallback_score, "selection_method": fallback_method}
                retrieval_status = "FALLBACK_RETRIEVED"
                logger.warning(
                    "RAG NO ELIGIBLE QUESTION | requested_quadrant=%s reason=%s points=%s rejected=%s | "
                    "EXACT_QUADRANT_FALLBACK method=%s score=%s question_id=%s question=%s",
                    quadrant, fallback_reason, len(points), rejected, fallback_method, fallback_score,
                    selected["id"], selected["question"],
                )
            else:
                retrieval_status = "RETRIEVAL_FAILED" if retrieval_error or not question_retriever else "NO_RELEVANT_QUESTION_FOUND"
                logger.error(
                    "RAG NO ELIGIBLE QUESTION AND NO SAME-QUADRANT FALLBACK | requested_quadrant=%s "
                    "reason=%s points=%s rejected=%s",
                    quadrant, fallback_reason, len(points), rejected,
                )
        reasoner = getattr(self, "contextual_reasoner", None)
        if selected is not None and reasoner and getattr(reasoner, "available", True):
            selectable = list(candidates)
            if not any(item.get("id") == selected.get("id") for item in selectable):
                selectable.append(selected)
            try:
                decision = reasoner.select_question(
                    context={
                        "profile": ctx.demographics,
                        "developmental_stage": contextual_plan.get("developmental_stage"),
                        "current_concern": ctx.patient_state.get("current_issue"),
                        "quadrant": quadrant,
                        "quadrant_status": quadrant_plan.get("status"),
                        "latest_answer": latest_text,
                        "recent_answers": recent_answers,
                        "asked_questions": asked_text[-12:],
                        "supported_indicators": evidence[-8:],
                    },
                    candidates=[{"id": item["id"], "question": item["question"],
                                 "quadrant": item.get("quadrant"), "score": item.get("score")}
                                for item in selectable],
                )
                decision_data = decision.model_dump() if hasattr(decision, "model_dump") else decision
                selected_id = decision_data.get("selected_question_id")
                if decision_data.get("action") in {"explore", "reconsider_deferred", "advance"}:
                    selected = None
                    retrieval_status = "LLM_ADVANCE"
                else:
                    chosen = next((item for item in selectable if item.get("id") == selected_id), None)
                    if chosen:
                        selected = dict(chosen)
                        selected["ask_to"] = decision_data.get("ask_to", "patient")
                ctx.patient_state["contextual_question_decision"] = {
                    **decision_data, "provider": "openai", "quadrant": quadrant,
                }
                ctx.patient_state["contextual_question_decision_status"] = "openai"
                ctx.patient_state["question_recipient"] = decision_data.get("ask_to", "patient")
            except Exception:  # noqa: BLE001 - retain the existing ranked KB choice
                ctx.patient_state["contextual_question_decision_status"] = "fallback"
                ctx.patient_state["question_recipient"] = "patient"
                logger.exception("Contextual question selection failed; using ranked KB result")
        dynamic = getattr(self, "dynamic", None)
        if dynamic is not None and (selected is not None or self._latest_patient_signal(ctx)[0]):
            kb_selected = selected
            selected = dynamic.adapt(ctx, quadrant, kb_selected, candidates, deep_dive=deep_dive,
                                     asked_text=asked_text)
            if selected is not None and selected.get("generated"):
                retrieval_status = "LLM_ADAPTIVE" if kb_selected else "LLM_ADAPTIVE_NO_KB_FALLBACK"
        if not deep_dive:
            intentional_advance = retrieval_status == "LLM_ADVANCE"
            state["rag_exhausted"] = selected is None and not intentional_advance
            state["retrieval_failed"] = selected is None and not intentional_advance
        elif selected is None:
            state["deep_dive_exhausted"] = True
            state["deep_dive_active"] = False
            ctx.patient_state["assessment_status"] = "awaiting_therapist_decision"
        if selected:
            question_text_by_id[selected["id"]] = selected["question"]
            ctx.patient_state.setdefault("question_mode_by_id", {})[selected["id"]] = "deep_dive" if deep_dive else "normal"
            ctx.patient_state["current_question"] = selected
            if deep_dive:
                logging.getLogger("anahat.assessment.progress").info(
                    "CURRENT QUADRANT: %s | DEEP DIVE QUESTION COUNT: %s | QUESTION: %s",
                    quadrant, state["deep_dive_question_count"] + 1, selected["question"],
                )
            else:
                logging.getLogger("anahat.assessment.progress").info(
                    "CURRENT QUADRANT: %s | QUESTION COUNT: %s/3 | QUESTION: %s",
                    quadrant, state["normal_question_count"] + 1, selected["question"],
                )
        logger.info("RETRIEVED QUESTION COUNT: %s | RETRIEVAL STATUS: %s", int(selected is not None), retrieval_status)
        if selected is None:
            logger.error("QUESTION RETRIEVAL FAILED | QUADRANT MUST NOT BE MARKED COMPLETE: %s", quadrant)
        logger.info("RAG QUERY:\\n%s\\nCURRENT QUADRANT:\\n%s\\nRETRIEVED QUESTIONS:\\n%s\\nSELECTED QUESTION:\\n%s\\nQUESTIONS ALREADY ASKED:\\n%s\\nEVIDENCE AVAILABLE:\\n%s\\nNEXT QUESTION:\\n%s",
                    rag_query, quadrant, candidates, selected, asked, evidence, selected)
        return {"quadrant": quadrant, "questions": [selected] if selected else [],
                "remaining": max(0, len(missing) - (1 if selected else 0)), "total": len(missing),
                "exhausted": selected is None, "retrieval_candidates": candidates,
                "question_count": count, "normal_limit_reached": not deep_dive and count >= NORMAL_QUADRANT_QUESTION_LIMIT,
                "deep_dive": deep_dive, "retrieval_status": retrieval_status,
                "retrieval_failure_reason": fallback_reason,
                "quadrant_status": "INCOMPLETE" if selected else retrieval_status,
                "assessment_status": ctx.patient_state.get("assessment_status", "in_progress")}

    @staticmethod
    def _question_bank_filter(quadrant):
        alignments = sorted(QUESTION_BANK_ALIGNMENT_BY_QUADRANT.get(quadrant, set()))
        if not alignments:
            return None
        try:
            from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue
        except ImportError:  # tests without qdrant-client: post-filtering below still applies
            return None
        return Filter(must=[
            FieldCondition(key="document_type", match=MatchValue(value="question_bank")),
            FieldCondition(key="quadrant_alignment", match=MatchAny(any=alignments)),
        ])

    @staticmethod
    def _latest_patient_signal(ctx):
        """Text and extracted concepts of the patient's most recent real answer."""
        for r in reversed(ctx.responses):
            if str(getattr(r, "question_id", "") or "").startswith("DD-"):
                continue
            text = (getattr(r, "raw_text", "") or "").strip()
            if not text:
                continue
            concepts = [c.get("concept") for c in ((getattr(r, "extraction", None) or {}).get("concepts") or [])
                        if c.get("domain") in {"symptom", "emotion", "behaviour"}
                        and c.get("polarity") != "negative" and c.get("concept")]
            return text, concepts
        return "", []

    def _next_follow_up(self, ctx, sid, response_id):
        """The one question that would unblock scoring for what the patient just said.

        Order follows deep_dive: currentness, intensity, disambiguation. Wording quotes the
        patient's own words. Nothing is guessed; the answer goes to POST /deep-dive/answer."""
        if getattr(self, "deep_dive", None) is None:
            return None
        if ctx.patient_state.get("safety_amber_unacknowledged") or ctx.stage == AssessmentStage.SAFETY_ESCALATION.value:
            return None
        res = self.deep_dive.open_items(ctx.evidence)
        by_id = {e.evidence_id: e for e in ctx.evidence}
        seen_groups = set()
        for it in res["items"]:
            if not it.get("blocking"):
                continue
            ev = by_id[it["evidence_id"]]
            if ev.response_id != response_id or ev.twin_of:
                continue
            group = ev.correlation_group or ev.evidence_id
            if group in seen_groups:
                continue
            seen_groups.add(group)
            field = it["field"]
            quote = (ev.quote or "").strip()
            lead = f'You mentioned "{quote}". ' if quote else ""
            options = None
            if field == "currentness":
                question, options = lead + it["question"], ["current", "historical"]
            elif field == "intensity":
                question, options = lead + it["question"], ["Mild", "Moderate", "Severe"]
            else:
                question = it.get("question") or "Can you tell me a little more about this?"
                options = [o.get("label") for q in (it.get("questions") or []) for o in q.get("answer_options", [])] or None
            self.deep_dive.mark_presented(ev, field)
            ctx.audit("FOLLOW_UP_PRESENTED", evidence_id=ev.evidence_id, field=field)
            return {"type": "deep_dive", "evidence_id": ev.evidence_id, "field": field, "term": ev.indicator_term,
                    "quote": quote or None, "question": question, "options": options, "blocking": True,
                    "answer_endpoint": f"/sessions/{sid}/deep-dive/answer",
                    "answer_payload": {"evidence_id": ev.evidence_id, "field": field,
                                       "value": "<one of options>" if options else "<answer>",
                                       "raw_text": "<the patient's own words>"}}
        return None

    def next_questions(self, sid, quadrant=None, limit=3, deep_dive=False):
        ctx = self._ctx(sid)
        quadrant = quadrant or ctx.patient_state.get("current_quadrant")
        if not quadrant:
            raise ValueError("No quadrant selected yet")
        if quadrant not in self.kb.quadrant_names:
            raise ValueError(f"Unknown quadrant: {quadrant}")
        return self._next_for(ctx, quadrant, limit, deep_dive=deep_dive)

    THERAPIST_QUESTION_MAX_CHARS = 500

    def register_therapist_question(self, sid, text, quadrant=None):
        """The therapist types their own question. It is recorded so that the patient's answer is
        linked to it (and the question is given to extraction for context), scored through the
        normal pipeline, shown to the adaptive generator as already asked, and never counted as
        one of the quadrant's three normal questions."""
        ctx = self._ctx(sid)
        guard = self._guard_safety(ctx)
        if guard:
            raise ValueError(guard["detail"])
        if ctx.patient_state.get("final_chakra_evaluated"):
            raise ValueError("The assessment has ended")
        text = " ".join((text or "").split())
        if not text:
            raise ValueError("Question text is required")
        if len(text) > self.THERAPIST_QUESTION_MAX_CHARS:
            raise ValueError(f"Question is too long (max {self.THERAPIST_QUESTION_MAX_CHARS} characters)")
        if quadrant is not None and quadrant not in self.kb.quadrant_names:
            raise ValueError(f"Unknown quadrant: {quadrant}")
        state = ctx.patient_state
        n = len(state.setdefault("therapist_questions", {})) + 1
        qid = "TQ-" + hashlib.sha256(f"{n}|{quadrant}|{_norm(text)}".encode("utf-8")).hexdigest()[:16]
        state["therapist_questions"][qid] = {"question": text, "quadrant": quadrant, "order": n}
        state.setdefault("question_text_by_id", {})[qid] = text
        state.setdefault("question_mode_by_id", {})[qid] = "therapist"
        if quadrant:
            self._q_state(ctx, quadrant)
        ctx.audit("THERAPIST_QUESTION_ASKED", question_id=qid, quadrant=quadrant)
        return {"id": qid, "question": text, "quadrant": quadrant, "source": "Therapist's own question",
                "therapist_question": True, "counts_toward_quadrant_pass": False}

    def _intensity_follow_ups(self, ctx, sid, response_id):
        """Evidence from this answer whose intensity is genuinely unknown (the semantic reader found
        no cue). One item per patient statement: indicators that share the same quote are asked once
        and the answer is applied to all of them. Until answered they score as Mild, never 0."""
        if getattr(self, "deep_dive", None) is None or ctx.stage == AssessmentStage.SAFETY_ESCALATION.value:
            return []
        groups, order = {}, []
        for ev in ctx.evidence:
            if (ev.response_id != response_id or ev.superseded or ev.twin_of or ev.intensity
                    or ev.status in {EvidenceStatus.NEGATIVE, EvidenceStatus.HISTORICAL}):
                continue
            quote = (ev.quote or "").strip()
            key = _norm(quote) if quote else (ev.correlation_group or ev.evidence_id)
            if key not in groups:
                groups[key] = []
                order.append(key)
            groups[key].append(ev)
        out = []
        for key in order:
            evs = groups[key]
            first = evs[0]
            for ev in evs:
                self.deep_dive.mark_presented(ev, "intensity")
            quote = (first.quote or "").strip()
            terms = list(dict.fromkeys(e.indicator_term for e in evs if e.indicator_term))
            out.append({
                "evidence_id": first.evidence_id, "evidence_ids": [e.evidence_id for e in evs],
                "term": terms[0] if terms else first.indicator_term, "terms": terms,
                "quote": quote or None, "field": "intensity",
                "question": (f'You mentioned "{quote}". ' if quote else "")
                            + "How strong is this for you: mild, moderate, or severe?",
                "options": ["Mild", "Moderate", "Severe"],
                "scored_as_until_answered": "Mild",
                "answer_endpoint": f"/sessions/{sid}/deep-dive/answer",
            })
        return out

    # ------------------------------------------------------------------ developer explainability
    def explain_trace(self, sid):
        """Per-response decision trail for developers: what was extracted, which KB candidates were
        retrieved, how each was judged (validator + grounding), what became evidence, where the
        intensity came from, why areas were suggested. Raw patient text and quotes are NOT included
        (response ids and concept labels only), following the existing privacy rules."""
        ctx = self._ctx(sid)
        rejections = ctx.patient_state.get("grounding_rejections", [])
        responses = []
        for r in ctx.responses:
            extraction = r.extraction or {}
            cands = [c for c in ctx.candidates if (c.get("concept") or {}).get("concept") in
                     {x.get("concept") for x in extraction.get("concepts", [])}]
            responses.append({
                "response_id": r.response_id, "question_id": r.question_id, "safety_status": r.safety_status,
                "extracted_concepts": [{k: c.get(k) for k in ("concept", "domain", "polarity", "currentness", "certainty", "intensity")}
                                       for c in extraction.get("concepts", [])],
                "candidates": [{"indicator_id": (c.get("payload") or {}).get("indicator_id"),
                                "term": self._term((c.get("payload") or {}).get("indicator_id"), c.get("payload") or {}),
                                "retrieval_score": None if c.get("score") is None else round(float(c["score"]), 3),
                                "validator": (c.get("validation") or {}).get("match"),
                                "grounding": c.get("grounding"), "recorded_status": c.get("recorded_status")}
                               for c in cands],
                "rejected_candidates": [x for x in rejections if x.get("response_id") == r.response_id],
                "evidence": [{"evidence_id": e.evidence_id, "term": e.indicator_term, "status": e.status.value,
                              "polarity": e.polarity, "currentness": e.currentness, "intensity": e.intensity,
                              "intensity_source": e.intensity_source, "intensity_basis": e.intensity_basis,
                              "mentions": len(e.mention_response_ids) + 1}
                             for e in ctx.evidence if e.response_id == r.response_id and not e.twin_of],
            })
        selected = ctx.patient_state.get("selected_quadrants") or []
        return {"session_id": sid, "responses": responses,
                "quadrant_recommendations": [{"quadrant": q.get("quadrant"), "priority": q.get("priority"),
                                              "method": q.get("method"), "triggers": q.get("triggers"),
                                              "reasons": q.get("reasons")} for q in selected if isinstance(q, dict)],
                "audit_events": [e for e in ctx.audit_events
                                 if e.get("event") in {"REPEAT_MENTION_MERGED", "DYNAMIC_QUESTION_GENERATED",
                                                       "DYNAMIC_QUESTION_REJECTED", "DEEP_DIVE_ANSWERED"}]}

    # ------------------------------------------------------------------ therapist guidance per quadrant
    def quadrant_guidance(self, sid_or_ctx, quadrant):
        """Advice for the therapist about ONE quadrant, from what the patient actually said in it.
        Nothing is decided here: the therapist chooses (move on / deep dive / related quadrant).

          * 2-3 questions and nothing worrying came up      -> suggest moving to the next quadrant
          * an issue showed up                              -> keep asking follow-ups; after 3 questions
                                                               suggest a deep dive in this quadrant
          * another quadrant looks relevant to what was said -> suggested alongside
        """
        ctx = self._ctx(sid_or_ctx) if isinstance(sid_or_ctx, str) else sid_or_ctx
        st = self._q_state(ctx, quadrant)
        n, deep = st["normal_question_count"], st["deep_dive_question_count"]
        rids = set(st["response_ids"])
        groups = {}
        for ev in ctx.evidence:
            if ev.superseded or ev.twin_of or ev.status in {EvidenceStatus.NEGATIVE, EvidenceStatus.HISTORICAL}:
                continue
            if ev.response_id in rids or rids & set(ev.mention_response_ids):
                groups.setdefault(ev.correlation_group or ev.evidence_id, ev)
        terms = list(dict.fromkeys(e.indicator_term for e in groups.values() if e.indicator_term))
        described = []
        for r in ctx.responses:
            if r.response_id in rids:
                for c in ((getattr(r, "extraction", None) or {}).get("concepts") or []):
                    if (c.get("domain") in {"symptom", "emotion", "behaviour"} and c.get("polarity") == "positive"
                            and c.get("currentness") != "historical" and c.get("concept")):
                        described.append(str(c["concept"]).replace("_", " "))
        described = list(dict.fromkeys(described))
        issue = bool(terms or described)
        shown = (terms or described)[:4]
        related = []
        if issue:
            try:
                texts = " ".join(r.raw_text for r in ctx.responses if r.response_id in rids)
                recs = self.questions.recommend_quadrants(
                    current_issue=texts, concepts=described, exhausted=self._exhausted(ctx) | {quadrant},
                    assessed=self.assessed_quadrants(ctx), limit=2)
                related = [{"quadrant": x["quadrant"], "reason": (x.get("reasons") or [""])[0]}
                           for x in recs if x["quadrant"] != quadrant and x.get("relevance_score", 0) > 0]
            except Exception:  # noqa: BLE001 - advice must never break an answer
                logging.getLogger("anahat.assessment.progress").exception("related quadrant advice failed")
        if n == 0:
            suggestion, message = "continue", ""
        elif deep > 0 and n >= NORMAL_QUADRANT_QUESTION_LIMIT:
            suggestion = "move_on"
            message = (f"We have asked {deep} deep-dive question{'s' if deep != 1 else ''} in {quadrant}. "
                       "I suggest moving on unless you want to keep exploring this area.")
        elif not issue and n >= 2:
            suggestion = "move_on"
            message = (f"After {n} questions nothing in {quadrant} points to a problem, so I suggest moving to the next area."
                       + (" You can still ask one more question here if you want." if n < NORMAL_QUADRANT_QUESTION_LIMIT else ""))
        elif issue and n >= NORMAL_QUADRANT_QUESTION_LIMIT:
            suggestion = "deep_dive"
            message = (f"The patient's answers in {quadrant} suggest something is going on here ({', '.join(shown)}). "
                       "I think we should ask more questions in this area; I suggest a deep dive.")
        elif issue:
            suggestion = "continue"
            message = (f"Something came up in {quadrant} ({', '.join(shown)}). "
                       "I'll keep asking follow-up questions about it.")
        else:
            suggestion = "continue"
            message = ""
        if related and suggestion in {"continue", "deep_dive"}:
            message += (" " if message else "") + "Also consider " + " / ".join(x["quadrant"] for x in related) + \
                       ", which looks relevant to what the patient said."
        return {"quadrant": quadrant, "questions_asked": n, "deep_dive_questions_asked": deep,
                "signal": "issue_found" if issue else "no_issue_found", "issue_terms": shown,
                "suggestion": suggestion, "message": message.strip(), "related_quadrants": related,
                # During a deep dive the therapist is only interrupted after a couple of deep questions
                "decision_required": (deep >= 2) or (deep == 0 and (n >= NORMAL_QUADRANT_QUESTION_LIMIT
                                                                   or (suggestion == "move_on" and n >= 2)))}

    def review_generated_question(self, sid, question_id, action, edited_text=None, therapist_note=None):
        """Therapist approve / edit / reject of an LLM-worded question (therapist_review mode)."""
        ctx = self._ctx(sid)
        if getattr(self, "dynamic", None) is None:
            raise ValueError("Adaptive questions are not enabled")
        return self.dynamic.review(ctx, question_id, action, edited_text, therapist_note)

    def complete_quadrant(self, sid, quadrant, early=False):
        ctx = self._ctx(sid)
        if quadrant not in self.kb.quadrant_names:
            raise ValueError(f"Unknown quadrant: {quadrant}")
        state = self._q_state(ctx, quadrant)
        if state["normal_question_count"] < NORMAL_QUADRANT_QUESTION_LIMIT and not (early and state["normal_question_count"] >= 1):
            if state.get("retrieval_failed"):
                raise ValueError("Question retrieval failed; this quadrant remains incomplete and cannot be completed")
            raise ValueError("A quadrant needs three normal answers before completion")
        state["completed"] = True
        state["deep_dive_active"] = False
        completed = [q for q, state in ctx.quadrants.items() if state.get("completed")]
        pending = [q for q in ctx.patient_state.get("selected_quadrant_names", []) if q not in completed]
        ctx.patient_state["completed_quadrants"] = completed
        ctx.patient_state["assessment_complete"] = False
        ctx.patient_state["assessment_status"] = "in_progress" if pending else "awaiting_therapist_decision"
        ctx.audit("QUADRANT_MARKED_COMPLETE", quadrant=quadrant)
        logging.getLogger("anahat.assessment.progress").info(
            "COMPLETED QUADRANTS: %s | REMAINING SELECTED QUADRANTS: %s",
            completed, pending,
        )
        if pending:
            logging.getLogger("anahat.assessment.progress").info("MOVING TO NEXT SELECTED QUADRANT: %s", pending[0])
        selected = ctx.patient_state.get("selected_quadrant_names", [])
        pending = [q for q in selected if not self._q_state(ctx, q).get("completed")]
        if not pending:
            logging.getLogger("anahat.assessment.progress").info("WAITING FOR THERAPIST DECISION")
            logging.getLogger("anahat.assessment.progress").info("AVAILABLE ACTIONS: END_SESSION, MOVE_QUADRANT, DEEP_DIVE")
            return {"status": "COVERAGE_COMPLETE", "assessment_complete": False,
                    "quadrant_status": "COMPLETED", "completed_quadrant": quadrant,
                    "assessment_status": "awaiting_therapist_decision",
                    "completed_quadrants": completed, "message": "No selected quadrant remains. Choose another area or explicitly end the session."}
        ctx.patient_state["current_quadrant"] = pending[0]
        return {**self._next_for(ctx, pending[0], 1), "completed_quadrant": quadrant,
                "completed_quadrant_status": "COMPLETED"}

    # ------------------------------------------------------------------ responses
    def process_response(self, sid, text, question_id=None, quadrant=None, *, request_id=None):
        ctx = self._ctx(sid)
        if ctx.patient_state.get("final_chakra_evaluated"):
            raise ValueError("The assessment has ended")
        request_id = clean_request_id(request_id)

        payload = {"text": text, "question_id": question_id, "quadrant": quadrant}
        if request_id is not None:
            prior = ctx.processed_requests.get(request_id)
            if prior is not None:
                if prior["payload"] != payload:
                    raise ValueError("different patient response for the same request_id")
                replay = copy.deepcopy(prior["result"]); replay["idempotent_replay"] = True
                return replay
            inflight = ctx._inflight_requests.get(request_id)
            if inflight is not None:
                inflight.wait()
                prior = ctx.processed_requests.get(request_id)
                if prior is not None:
                    replay = copy.deepcopy(prior["result"]); replay["idempotent_replay"] = True
                    return replay
                raise ValueError("request still in progress")
            event = threading.Event()
            ctx._inflight_requests[request_id] = event

        try:
            guard = self._guard_safety(ctx)
            if guard:
                return guard
            dynamic = getattr(self, "dynamic", None)
            blocked = dynamic.answer_block_reason(ctx, question_id) if dynamic is not None and question_id else None
            if blocked:
                raise ValueError(blocked)
            response = ResponseService().create(text=text, question_id=question_id, quadrant=quadrant)
            mode_by_id = ctx.patient_state.get("question_mode_by_id") or {}
            is_therapist_q = bool(question_id) and mode_by_id.get(question_id) == "therapist"
            stage_before = ctx.stage
            # Short answers ("about money") only make sense with the question. Passed for the
            # therapist's own questions and when adaptive questions are on; otherwise the
            # extraction input is unchanged.
            asked_text = ((ctx.patient_state.get("question_text_by_id") or {}).get(question_id)
                          if question_id and (settings.dynamic_questions_enabled or is_therapist_q) else None)
            result = self._analyze(ctx, response, text, session_id=sid, quadrant=quadrant,
                                   question_text=asked_text)
            if is_therapist_q and result.get("status") != "SAFETY_ESCALATION":
                # A therapist's own question is a side step: its answer is scored like any other,
                # but it never moves the assessment's stage (e.g. out of the opening).
                ctx.stage = stage_before
                result["therapist_question"] = True
                ctx.patient_state.setdefault("therapist_questions", {}).setdefault(question_id, {})[
                    "answered_response_id"] = response.response_id
                ctx.audit("THERAPIST_QUESTION_ANSWERED", question_id=question_id, response_id=response.response_id)
            if dynamic is not None and result.get("status") != "SAFETY_ESCALATION" \
                    and not str(question_id or "").startswith("DD-"):
                # A therapist's side question leaves the adaptive question that is waiting on
                # screen untouched, so the session resumes exactly where it was.
                dynamic.record_answer(ctx, question_id, response.response_id,
                                      None if is_therapist_q else quadrant)
            if result.get("status") != "SAFETY_ESCALATION":
                try:
                    result["follow_up"] = self._next_follow_up(ctx, sid, response.response_id)
                except Exception:  # noqa: BLE001 - a follow-up hint must never break answer processing
                    logging.getLogger("anahat.assessment.progress").exception("follow-up selection failed")
                    result["follow_up"] = None
                conflict_items = self._conflict_follow_ups(ctx, sid, response.response_id)
                result["conflict_follow_ups"] = conflict_items
                # contradictions are asked first, then missing intensity (same one-at-a-time card)
                result["intensity_follow_ups"] = [*conflict_items,
                                                  *self._intensity_follow_ups(ctx, sid, response.response_id)]
            logging.getLogger("anahat.assessment.progress").info(
                "ANSWER RECEIVED: %s | EVIDENCE EXTRACTED: %s | UNRESOLVED AREAS: %s",
                text, result.get("evidence", []), result.get("unverified_concepts", []),
            )
            if quadrant and quadrant in ctx.quadrants:
                st = ctx.quadrants[quadrant]
                st["response_ids"].append(response.response_id)
                if question_id and question_id not in st["answered_question_ids"]:
                    st["answered_question_ids"].append(question_id)
                    question_text = ctx.patient_state.get("question_text_by_id", {}).get(question_id)
                    if question_text:
                        ctx.patient_state["asked_questions"] = list(dict.fromkeys(
                            [*ctx.patient_state.get("asked_questions", []), question_text]
                        ))
                    mode = ctx.patient_state.get("question_mode_by_id", {}).get(question_id, "normal")
                    ctx.patient_state["current_quadrant"] = quadrant
                    if mode == "therapist":
                        # Extra question from the therapist: scored, but it does not use up one of
                        # the quadrant's three normal questions or a deep-dive slot.
                        logging.getLogger("anahat.assessment.progress").info(
                            "THERAPIST QUESTION ANSWERED | QUADRANT: %s | QUESTION: %s", quadrant, question_text)
                    elif mode == "deep_dive":
                        st["deep_dive_question_count"] += 1
                        ctx.patient_state["assessment_status"] = "deep_dive_active"
                        logging.getLogger("anahat.assessment.progress").info(
                            "DEEP DIVE REQUESTED | CURRENT QUADRANT: %s | DEEP DIVE QUESTION COUNT: %s",
                            quadrant, st["deep_dive_question_count"],
                        )
                    else:
                        st["normal_question_count"] += 1
                        st["normal_completed"] = st["normal_question_count"] >= NORMAL_QUADRANT_QUESTION_LIMIT
                        ctx.patient_state["assessment_status"] = (
                            "awaiting_therapist_decision"
                            if st["normal_question_count"] >= NORMAL_QUADRANT_QUESTION_LIMIT
                            else "in_progress"
                        )
                        logging.getLogger("anahat.assessment.progress").info(
                            "CURRENT QUADRANT: %s | QUESTION COUNT: %s/%s | QUESTION: %s | ANSWER RECORDED: %s",
                            quadrant, st["normal_question_count"], NORMAL_QUADRANT_QUESTION_LIMIT, question_text, text,
                        )
                        if st["normal_question_count"] == NORMAL_QUADRANT_QUESTION_LIMIT and not settings.auto_advance_quadrants:
                            ctx.patient_state["assessment_status"] = "awaiting_therapist_decision"
                            result["quadrant_progress"] = {
                                "quadrant": quadrant, "normal_question_count": st["normal_question_count"],
                                "deep_dive_question_count": st["deep_dive_question_count"], "completed": False,
                                "awaiting_therapist_decision": True}
                        elif st["normal_question_count"] == NORMAL_QUADRANT_QUESTION_LIMIT:
                            progress = logging.getLogger("anahat.assessment.progress")
                            progress.info("NORMAL 3-QUESTION PASS COMPLETE: %s", quadrant)
                            transition = self.complete_quadrant(sid, quadrant)
                            result["quadrant_transition"] = transition
                            result["quadrant_progress"] = {
                                "quadrant": quadrant, "normal_question_count": st["normal_question_count"],
                                "deep_dive_question_count": st["deep_dive_question_count"],
                                "completed": st["completed"],
                                "next_quadrant": transition.get("quadrant"),
                                "next_question": (transition.get("questions") or [None])[0],
                            }
                            progress.info(
                                "AUTOMATIC QUADRANT ADVANCE: completed=%s next_quadrant=%s next_question=%s",
                                quadrant, transition.get("quadrant"), result["quadrant_progress"]["next_question"],
                            )
            if quadrant and quadrant in ctx.quadrants and result.get("status") != "SAFETY_ESCALATION":
                try:
                    result["quadrant_guidance"] = self.quadrant_guidance(ctx, quadrant)
                except Exception:  # noqa: BLE001
                    logging.getLogger("anahat.assessment.progress").exception("quadrant guidance failed")
            if request_id is not None:
                ctx.processed_requests[request_id] = {"payload": payload, "result": result}
            return result
        finally:
            if request_id is not None:
                event = ctx._inflight_requests.pop(request_id, None)
                if event is not None:
                    event.set()

    def acknowledge_safety(self, sid, therapist_note=None, resume=False):
        """Therapist acknowledges an AMBER alert, or clears a RED escalation (resume=True)."""
        ctx = self._ctx(sid)
        ctx.patient_state["safety_amber_unacknowledged"] = False
        was_red = ctx.stage == AssessmentStage.SAFETY_ESCALATION.value
        if was_red:
            if not resume:
                raise ValueError("A RED safety escalation stays in force until a therapist explicitly clears it (resume=true)")
            ctx.stage = AssessmentStage.QUADRANT_RECOMMENDATION.value
        ctx.audit("SAFETY_ACKNOWLEDGED", note=therapist_note, cleared_red=was_red)
        return {"status": "OK", "stage": ctx.stage}

    # ------------------------------------------------------------------ evidence
    def confirm_candidate(self, sid, response_id, candidate_id, confirmed=True,
                          status=EvidenceStatus.CONFIRMED, therapist_note=None,
                          selected_chakra=None, confirmation_actor="therapist"):
        ctx = self._ctx(sid)
        candidate = next((c for c in ctx.candidates if c["candidate_id"] == candidate_id), None)
        if not candidate:
            raise ValueError("Candidate not found")
        if not any(r.response_id == response_id for r in ctx.responses):
            raise ValueError("Response not found")
        if confirmation_actor not in {"patient", "therapist"}:
            raise ValueError("confirmation_actor must be patient or therapist")
        if not confirmed:
            ctx.audit("CANDIDATE_REJECTED", candidate_id=candidate_id, actor=confirmation_actor)
            return {"status": "REJECTED", "candidate_id": candidate_id}
        existing = next((e for e in ctx.evidence if e.candidate_id == candidate_id), None)
        if existing is None and hasattr(self.indicators, "group_key"):
            # Same patient answer + same canonical term (KB twin entries such as SYM-009 / EMO-008
            # 'Anxiety'): the twin evidence already exists, so do not record the observation twice.
            group = self.indicators.group_key(candidate["payload"]["indicator_id"])
            existing = next((e for e in ctx.evidence
                             if e.response_id == response_id and not e.superseded and e.twin_of is None
                             and self.indicators.group_key(e.canonical_indicator_id) == group), None)
        if (existing is not None and existing.status == EvidenceStatus.PROVISIONAL
                and confirmation_actor == "therapist" and status == EvidenceStatus.CONFIRMED):
            # A therapist confirming a provisional (partial) match makes it real evidence. Ambiguous
            # KB terms still need the chakra clarification, so they become UNRESOLVED instead.
            upgraded = (EvidenceStatus.UNRESOLVED if self.ambiguity.needs_clarification(existing.canonical_indicator_id)
                        else EvidenceStatus.CONFIRMED)
            for e in [existing] + [e for e in ctx.evidence if e.twin_of == existing.evidence_id]:
                e.status = upgraded
                e.confirmation = {**e.confirmation, "therapist_confirmed": True, "therapist_note": therapist_note}
            ctx.audit("PROVISIONAL_EVIDENCE_CONFIRMED", evidence_id=existing.evidence_id, status=upgraded.value)
            return {"status": "CONFIRMED", "evidence": existing.model_dump(),
                    "clarification_required": upgraded == EvidenceStatus.UNRESOLVED,
                    "clarifications": self.ambiguity.for_indicator(existing.canonical_indicator_id),
                    "twin_evidence_ids": [e.evidence_id for e in ctx.evidence if e.twin_of == existing.evidence_id]}
        if existing:
            ambiguity = getattr(self, "ambiguity", None)
            clarification_required = existing.status == EvidenceStatus.UNRESOLVED
            clarifications = ambiguity.for_indicator(existing.canonical_indicator_id) if clarification_required and ambiguity else []
            twin_ids = [e.evidence_id for e in ctx.evidence if e.twin_of == existing.evidence_id]
            return {"status": "ALREADY_CONFIRMED", "evidence": existing.model_dump(),
                    "clarification_required": clarification_required, "clarifications": clarifications,
                    "twin_evidence_ids": twin_ids}
        iid = candidate["payload"]["indicator_id"]
        if self.ambiguity.needs_clarification(iid) and status == EvidenceStatus.CONFIRMED:
            status = EvidenceStatus.UNRESOLVED
        conf = {f"{confirmation_actor}_confirmed": True, "therapist_note": therapist_note}
        # A chakra chosen at confirmation time is NOT accepted: the chakra only counts once it is
        # resolved through the KB disambiguation step (resolve_ambiguity).
        ev = self.evidence_engine.build_evidence(response_id=response_id, candidate=candidate,
                                                 extraction=candidate["concept"], status=status,
                                                 confirmation=conf, selected_chakra=None)
        if ev is None:
            raise ValueError("Candidate is not a canonical indicator")
        ctx.evidence.append(ev)
        twins = []
        for tid in self.indicators.twins(iid):
            tw = self.evidence_engine.build_evidence(response_id=response_id, candidate=candidate,
                                                     extraction=candidate["concept"], status=status,
                                                     confirmation=conf, indicator_id=tid, twin_of=ev.evidence_id)
            if tw is not None:
                ctx.evidence.append(tw); twins.append(tw.evidence_id)
        ctx.audit("EVIDENCE_CONFIRMED", evidence_id=ev.evidence_id, indicator_id=ev.canonical_indicator_id,
                  status=ev.status.value, actor=confirmation_actor, twin_evidence_ids=twins)
        out = {"status": "CONFIRMED", "evidence": ev.model_dump(),
               "clarification_required": status == EvidenceStatus.UNRESOLVED,
               "clarifications": self.ambiguity.for_indicator(ev.canonical_indicator_id),
               "twin_evidence_ids": twins}
        if selected_chakra:
            out["warning"] = "selected_chakra ignored at confirmation; use the disambiguation step"
        return out

    def resolve_ambiguity(self, sid, evidence_id, selected_chakra, therapist_note=None):
        ctx = self._ctx(sid)
        ev = next((e for e in ctx.evidence if e.evidence_id == evidence_id), None)
        if not ev:
            raise ValueError("Evidence not found")
        valid = {i.chakra for i in self.indicators.get_by_id(ev.canonical_indicator_id)}
        if selected_chakra not in valid:
            raise ValueError("Selected chakra is not an authoritative association for this indicator")
        group = [ev] + [e for e in ctx.evidence if e.twin_of == ev.evidence_id]
        for e in group:
            if selected_chakra in {i.chakra for i in self.indicators.get_by_id(e.canonical_indicator_id)}:
                e.status = EvidenceStatus.RESOLVED_AFTER_CLARIFICATION; e.selected_chakra = selected_chakra
                e.confirmation = {**e.confirmation, "therapist_note": therapist_note, "resolved_after_clarification": True}
        ctx.clarifications.append({"evidence_id": evidence_id, "selected_chakra": selected_chakra, "therapist_note": therapist_note})
        ctx.audit("AMBIGUITY_RESOLVED", evidence_id=evidence_id, selected_chakra=selected_chakra)
        return ev

    def resolve_contradiction(self, sid, keep_evidence_id, therapist_note=None):
        """Therapist keeps one side. The other side is marked superseded (kept for audit, never scored)."""
        ctx = self._ctx(sid)
        self.score(sid)  # refresh contradictions
        keep = next((e for e in ctx.evidence if e.evidence_id == keep_evidence_id), None)
        if not keep:
            raise ValueError("Evidence not found")
        hit = next((c for c in ctx.contradictions
                    if keep_evidence_id in (c.get("positive_evidence_ids") or []) + (c.get("negative_evidence_ids") or [])
                    + (c.get("historical_evidence_ids") or []) + (c.get("evidence_ids") or [])), None)
        if not hit:
            raise ValueError("Evidence is not part of an open contradiction")
        involved = set((hit.get("positive_evidence_ids") or []) + (hit.get("negative_evidence_ids") or [])
                       + (hit.get("historical_evidence_ids") or []) + (hit.get("evidence_ids") or []))
        keep_group = {keep_evidence_id} | {e.evidence_id for e in ctx.evidence if e.twin_of == keep_evidence_id or e.evidence_id == keep.twin_of}
        for e in ctx.evidence:
            if e.evidence_id in involved and e.evidence_id not in keep_group:
                e.superseded, e.superseded_by = True, keep_evidence_id
        ctx.audit("CONTRADICTION_RESOLVED", kept=keep_evidence_id, note=therapist_note)
        return {"status": "RESOLVED", "kept": keep_evidence_id, "superseded": sorted(involved - keep_group)}

    # ------------------------------------------------------------------ deep dive
    def deep_dive_items(self, sid, therapist_stop=False):
        ctx = self._ctx(sid)
        guard = self._guard_safety(ctx)
        if guard:
            return guard
        blocked = bool(ctx.patient_state.get("safety_amber_unacknowledged"))
        res = self.deep_dive.open_items(ctx.evidence, therapist_stop=therapist_stop or ctx.stop_requested, safety_blocked=blocked)
        by_id = {e.evidence_id: e for e in ctx.evidence}
        for it in res["items"]:
            self.deep_dive.mark_presented(by_id[it["evidence_id"]], it["field"])
        if res["items"]:
            ctx.stage = AssessmentStage.DEEP_DIVE.value
        ctx.audit("DEEP_DIVE_PRESENTED", count=len(res["items"]), stop_reason=res.get("stop_reason"))
        return res

    def answer_deep_dive(self, sid, evidence_id, field, value, raw_text=None, assumed=False):
        ctx = self._ctx(sid)
        ev = next((e for e in ctx.evidence if e.evidence_id == evidence_id), None)
        if not ev:
            raise ValueError("Evidence not found")
        if ev.superseded:
            raise ValueError("Evidence was superseded")
        if raw_text and raw_text.strip():  # the patient's own words are kept, never replaced by the structured value
            rec = ResponseService().create(text=raw_text.strip(), question_id=f"DD-{field}", quadrant=None)
            rec.safety_status = self.safety.assess(raw_text)["status"]
            ctx.add_response(rec)
            if rec.safety_status == "ESCALATE":
                ctx.stage = AssessmentStage.SAFETY_ESCALATION.value
                ctx.audit("SAFETY_ESCALATION", response_id=rec.response_id)
                return {"status": "SAFETY_ESCALATION", "response_id": rec.response_id}
        if field == "disambiguation":
            patient_answer = (raw_text or "").strip()
            selected_chakra = self.ambiguity.resolve_patient_answer(
                ev.canonical_indicator_id, patient_answer
            )
            self.resolve_ambiguity(sid, evidence_id, selected_chakra,
                                   therapist_note="Mapped from the patient's KB clarification response.")
            ctx.audit("PATIENT_DISAMBIGUATION_MAPPED",
                      evidence_id=evidence_id, selected_chakra=selected_chakra)
            return {"status": "OK", "selected_chakra": selected_chakra,
                    "evidence": ev.model_dump()}
        if field == "conflict":
            changed = self._resolve_attribute_conflict(ctx, ev, value, raw_text)
            return {"status": "OK", "evidence": ev.model_dump(), "updated_evidence": [e.model_dump() for e in changed]}
        changed = [ev]
        if field == "intensity" and assumed:
            # "Patient can't say": Mild is only the system default. It is NOT recorded as something the
            # patient reported; scoring keeps flagging it as an assumed intensity.
            ev.intensity, ev.intensity_source, ev.intensity_basis = None, "assumed_default", ["patient could not say"]
        else:
            self.deep_dive.apply_answer(ev, field, value)
            if field == "intensity":
                ev.intensity_source, ev.intensity_basis = "therapist", []
        if field in {"intensity", "currentness"}:
            # Twin KB entries and alternative matches of the SAME patient statement share the answer.
            for other in ctx.evidence:
                same_signal = (other.response_id == ev.response_id and (other.correlation_group or "").startswith("signal:")
                               and other.correlation_group == ev.correlation_group)
                same_quote = bool(ev.quote) and other.response_id == ev.response_id and _norm(other.quote or "") == _norm(ev.quote)
                if other is not ev and not other.superseded and (other.twin_of == ev.evidence_id or same_signal or same_quote):
                    if field == "intensity" and assumed:
                        other.intensity, other.intensity_source, other.intensity_basis = None, "assumed_default", ["patient could not say"]
                    else:
                        self.deep_dive.apply_answer(other, field, value)
                        if field == "intensity":
                            other.intensity_source, other.intensity_basis = "therapist", []
                    changed.append(other)
        ctx.audit("DEEP_DIVE_ANSWERED", evidence_id=evidence_id, field=field)
        return {"status": "OK", "evidence": ev.model_dump(), "updated_evidence": [e.model_dump() for e in changed]}

    # ------------------------------------------------------------------ scoring / decision / result
    def score(self, sid, *, complete_context=None):
        ctx = self._ctx(sid)
        if (ctx.patient_state.get("selected_quadrant_names")
                and not ctx.patient_state.get("final_chakra_evaluated")):
            raise ValueError("Final chakra scoring is available only through End Session")
        contradictions = self.contradictions.find(ctx.evidence, self.indicators)
        ctx.contradictions = contradictions
        response_records = (complete_context or {}).get("responses") or ctx.responses
        if complete_context is not None and len((complete_context.get("evidence") or [])) != len(ctx.evidence):
            raise RuntimeError("Final assessment context does not contain the complete session evidence list")
        scoring_evidence = (
            [EvidenceRecord.model_validate(item) for item in complete_context["evidence"]]
            if complete_context is not None else ctx.evidence
        )
        response_map = {
            (r.get("response_id") if isinstance(r, dict) else r.response_id):
            (r.get("raw_text", "") if isinstance(r, dict) else r.raw_text)
            for r in response_records
        }
        report = self.scoring.score(scoring_evidence, contradictions=contradictions,
                                    assessed_quadrants=self.assessed_quadrants(ctx),
                                    responses=response_map, assessment_context=complete_context,
                                    baseline=ctx.baseline,
                                    suggested_quadrants=self._suggested_quadrants(ctx),
                                    completed_quadrants=self._completed_quadrants(ctx))
        ctx.stage = AssessmentStage.CHAKRA_SCORING.value
        ctx.audit("CHAKRA_SCORED", supported=report.supported_chakras)
        return report

    # ------------------------------------------------------------------ Step 4 quadrant completion
    def _suggested_quadrants(self, ctx):
        """Quadrants that must be complete before a chakra with a low overall score may be called
        Balanced (spec Step 4): every quadrant the engine suggested plus every quadrant the therapist
        selected (settings.quadrant_completion_basis). None when nothing was suggested or selected."""
        selected = list(ctx.patient_state.get("selected_quadrant_names") or [])
        names = list(selected)
        if getattr(settings, "quadrant_completion_basis", "suggested_and_selected") == "suggested_and_selected":
            for item in ctx.patient_state.get("selected_quadrants") or []:
                name = item.get("quadrant") if isinstance(item, dict) else item
                if name and name in self.kb.quadrant_names and name not in names:
                    names.append(name)
        return names or None

    def _completed_quadrants(self, ctx):
        """Quadrants that are complete: marked complete, normal three-question pass done, or every
        question answered."""
        done = {q for q, st in ctx.quadrants.items()
                if st.get("completed") or st.get("normal_question_count", 0) >= NORMAL_QUADRANT_QUESTION_LIMIT}
        try:
            done |= set(self._exhausted(ctx))
        except Exception:  # noqa: BLE001 - completion must never break scoring
            logging.getLogger("anahat.scoring").exception("Could not read exhausted quadrants")
        return sorted(done)

    def decision(self, sid, therapist_stop=False):
        ctx = self._ctx(sid)
        selected = ctx.patient_state.get("selected_quadrant_names", [])
        pending = [q for q in selected if not self._q_state(ctx, q).get("completed")]
        if pending and not therapist_stop:
            current = ctx.patient_state.get("current_quadrant")
            quadrant = current if current in pending else pending[0]
            next_page = self._next_for(ctx, quadrant, 1)
            logging.getLogger("anahat.assessment.progress").info(
                "CHAKRA EVIDENCE STATUS: evaluation deferred until selected coverage completes; pending=%s", pending,
            )
            return {"action": "CONTINUE_ASSESSMENT", "reason": "Selected quadrants still have assessment coverage to complete.",
                    "supported_chakras": [], "unresolved_chakras": [], "recommended_quadrants": pending,
                    "next_question": (next_page.get("questions") or [None])[0], "stage": ctx.stage}
        report = self.score(sid)
        assessed = self.assessed_quadrants(ctx)
        d = self.decisions.decide(report, assessed_quadrants=assessed, therapist_stop=therapist_stop)
        d.recommended_quadrants = [r["quadrant"] for r in self.recommend_quadrants(sid)]
        if therapist_stop:
            ctx.stop_requested = True; ctx.stage = AssessmentStage.COMPLETED.value
        else:
            ctx.stage = AssessmentStage.DEEP_DIVE.value if report.supported_chakras else AssessmentStage.QUADRANT_RECOMMENDATION.value
        ctx.audit("THERAPIST_ASSESSMENT_DECISION", decision=d.action, stop=therapist_stop)
        return {**d.as_dict(), "stage": ctx.stage, "chakra_report": report.model_dump()}

    def final_result(self, sid):
        """Return the stored final evaluation; never trigger one before End Session."""
        ctx = self._ctx(sid)
        if (ctx.patient_state.get("selected_quadrant_names")
                and not ctx.patient_state.get("final_chakra_evaluated")):
            raise ValueError("Final chakra evaluation is available only after End Session")
        if ctx.patient_state.get("final_chakra_result"):
            return copy.deepcopy(ctx.patient_state["final_chakra_result"])
        return self._build_final_result(sid)

    def _build_final_result(self, sid, report=None):
        """Everything the result window needs. Decision SUPPORT for the therapist, not a diagnosis."""
        ctx = self._ctx(sid)
        pending_quadrants = [q for q in ctx.patient_state.get("selected_quadrant_names", [])
                             if not self._q_state(ctx, q).get("completed")]
        if pending_quadrants and not ctx.patient_state.get("end_session_requested"):
            raise ValueError("Final chakra evaluation is available only after an explicit End Session request")
        stage_before = ctx.stage
        report = report or self.score(sid)
        logging.getLogger("anahat.assessment.progress").info("FINAL CHAKRA RESULTS: %s", report.model_dump())
        ctx.stage = stage_before
        cards = []
        for r in report.results:
            cards.append({
                "chakra": r.chakra, "status": r.status, "status_label": r.status_label, "status_code": r.status_code,
                "score": r.score, "evidence_count": r.scored_evidence_count,
                "scored_evidence_count": r.scored_evidence_count,
                "mapped_evidence_count": r.mapped_evidence_count,
                "evidence": [item.model_dump() for item in r.trace],
                "gate_passed": r.gate_passed, "gate_threshold": r.gate_threshold,
                "gate_reason": r.gate_reason, "reason": "; ".join(r.reasons),
                "direction": r.direction, "severity": r.severity,
                "rank": r.rank, "overall_score": r.overall_score, "severity_band": r.severity_band,
                "direction_label": r.direction_label, "minor_signals": r.minor_signals,
                "pending_clarification": r.pending_clarification, "quadrant_completion": r.quadrant_completion,
                "scores": {"overall": r.overall_score, "presence": r.presence_score,
                           "deficient": r.deficient_score, "excess": r.excess_score},
                "confidence_pct": r.confidence_pct, "confidence_label": r.confidence_label,
                "coverage_pct": r.coverage_pct, "independent_evidence_units": r.independent_evidence_units,
                "high_priority": r.high_priority, "direction_gray_zone": r.direction_gray_zone,
                "reasons": r.reasons, "pending_details": r.pending_details,
                "counts": {"evidence": len(r.evidence_ids), "negative": len(r.negative_evidence_ids),
                           "historical": len(r.historical_evidence_ids), "unresolved": len(r.unresolved_evidence_ids),
                           "non_directional": len(r.nondirectional_evidence_ids)},
                "trace": [t.model_dump() for t in r.trace],
            })
        def names(*codes):
            return [c["chakra"] for c in cards if c["status"] in codes]
        # cards already arrive most-affected first (scorer ranking); keep that order explicit.
        cards.sort(key=lambda c: (c["rank"] is None, c["rank"] or 0))   # stable: unranked keep scorer order
        ranked = [{"rank": c["rank"], "chakra": c["chakra"], "overall_score": c["overall_score"],
                   "severity_band": c["severity_band"], "direction": c["direction"],
                   "direction_label": c["direction_label"], "status": c["status"]}
                  for c in cards if c["rank"] is not None]
        all_names = [q for q in self.kb.quadrant_names]
        assessed = sorted(self.assessed_quadrants(ctx))
        dd = self.deep_dive.open_items(ctx.evidence)
        return {
            "session_id": sid, "stage": ctx.stage, "is_diagnosis": False, "therapist_approval_required": True,
            "summary": {
                "imbalanced": [c["chakra"] for c in cards if c["rank"] is not None],
                "ranked_imbalanced": ranked,
                "ordered_chakras": [c["chakra"] for c in cards],
                "display_message": "No chakra imbalance identified from the confirmed evidence."
                if not ranked else "Chakra evaluation complete. Most affected chakra first.",
                "balanced": names("BALANCED"),
                "unresolved": names("UNRESOLVED"),
                "conflicted": names("CONFLICTED"),
                "needs_therapist_review": [c["chakra"] for c in cards if c["high_priority"] or c["direction_gray_zone"]],
            },
            "chakras": cards,
            "coverage": {**report.coverage, "assessed_quadrants": assessed,
                         "not_yet_assessed_quadrants": [q for q in all_names if q not in assessed]},
            "open_items": {
                "contradictions": ctx.contradictions,
                "pending_deep_dive": [i for i in dd["items"] if i["blocking"]],
                "unresolved_evidence": [e.evidence_id for e in ctx.evidence if e.status == EvidenceStatus.UNRESOLVED and not e.superseded],
                "attribute_conflicts": [
                    {"evidence_id": e.evidence_id, "term": e.indicator_term, **c}
                    for e in ctx.evidence if not e.superseded and not e.twin_of
                    for c in e.attribute_conflicts if not c.get("resolved")],
                "safety_amber_unacknowledged": bool(ctx.patient_state.get("safety_amber_unacknowledged")),
                "safety_red_active": ctx.stage == AssessmentStage.SAFETY_ESCALATION.value,
                "intake_safety_flag": ctx.patient_state.get("intake_safety_flag"),
            },
            "scoring_audit": report.audit,
            "requires_domain_validation": _OPEN_REQUIRES_VALIDATION,
            "disclaimer": "Decision-support only. Scores show how much confirmed patient evidence points to each chakra; "
                          "they are not a diagnosis. A therapist must review and approve.",
        }

    def finalize_session(self, sid):
        """Evaluate the complete, accumulated session only on explicit End Session."""
        ctx = self._ctx(sid)
        logger = logging.getLogger("anahat.assessment.progress")
        # A RED safety escalation pauses everything, including End Session, until a therapist clears it.
        guard = self._guard_safety(ctx)
        if guard:
            return guard
        if ctx.patient_state.get("final_chakra_result") and ctx.patient_state.get("final_recommendations"):
            return {"status": "COMPLETED",
                    "final_result": copy.deepcopy(ctx.patient_state["final_chakra_result"]),
                    "chakra_report": copy.deepcopy(ctx.patient_state["final_recommendations"]["chakra_report"]),
                    "raga": copy.deepcopy(ctx.patient_state["final_recommendations"]["raga"]),
                    "activities": copy.deepcopy(ctx.patient_state["final_recommendations"]["activities"]),
                    "assessment_context_summary": copy.deepcopy(ctx.patient_state["assessment_context_summary"])}

        # An explicit End Session may close the current quadrant's completed
        # three-question pass. Leave every other selected quadrant untouched.
        current_quadrant = ctx.patient_state.get("current_quadrant")
        if current_quadrant:
            current_state = self._q_state(ctx, current_quadrant)
            if current_state["normal_question_count"] >= NORMAL_QUADRANT_QUESTION_LIMIT:
                current_state["completed"] = True
                current_state["deep_dive_active"] = False
                ctx.patient_state["completed_quadrants"] = [
                    q for q, state in ctx.quadrants.items() if state.get("completed")
                ]
                logger.info("CURRENT QUADRANT CLOSED ON EXPLICIT END SESSION: %s", current_quadrant)

        deep_ids = {qid for qid, mode in ctx.patient_state.get("question_mode_by_id", {}).items() if mode == "deep_dive"}
        deep_response_count = sum(
            1 for response in ctx.responses
            if response.question_id in deep_ids or str(response.question_id or "").startswith("DD-")
        )
        opening_response_count = len(ctx.patient_state.get("opening_responses", []))
        quadrant_response_count = sum(1 for response in ctx.responses if response.quadrant is not None)
        baseline_data_count = sum(
            1 for value in (ctx.baseline or {}).values()
            if value not in (None, "", [], {})
        )
        logger.info("END SESSION REQUESTED | SESSION ID: %s", sid)
        logger.info("TOTAL PATIENT RESPONSES: %s", len(ctx.responses))
        logger.info("TOTAL OPENING RESPONSES: %s", opening_response_count)
        logger.info("TOTAL BASELINE DATA: %s", baseline_data_count)
        logger.info("TOTAL QUADRANT RESPONSES: %s", quadrant_response_count)
        logger.info("TOTAL DEEP-DIVE RESPONSES: %s", deep_response_count)
        logger.info("TOTAL EXTRACTED EVIDENCE: %s", len(ctx.evidence))
        completed = [q for q, state in ctx.quadrants.items() if state.get("completed")]
        logger.info("QUADRANTS COVERED: %s | DEEP DIVE RESPONSES: %s", completed, deep_response_count)
        # Before final scoring, ask every blocking clarification inside the same chat flow.
        # Do not silently score unresolved ambiguity as a final/balanced result. One question
        # is returned at a time; after the patient answers, the UI calls End Session again.
        open_followups = self.deep_dive.open_items(ctx.evidence)["items"]
        blocking_followups = [item for item in open_followups if item.get("blocking")]
        if blocking_followups:
            item = blocking_followups[0]
            ev = next((e for e in ctx.evidence if e.evidence_id == item["evidence_id"]), None)
            if ev is not None and item.get("field") == "disambiguation":
                questions = item.get("questions") or self.ambiguity.for_indicator(ev.canonical_indicator_id)
                question = next((q.get("question") for q in questions if q.get("question")), None)
                options = [o.get("label") for q in questions for o in (q.get("answer_options") or []) if o.get("label")]
                if question:
                    self.deep_dive.mark_presented(ev, "disambiguation")
                    ctx.audit("FINAL_CLARIFICATION_REQUIRED", evidence_id=ev.evidence_id, field="disambiguation")
                    return {"status": "NEEDS_CLARIFICATION", "assessment_complete": False,
                            "message": "One clarification is needed before final scoring.",
                            "clarification": {"type": "deep_dive", "evidence_id": ev.evidence_id,
                                "field": "disambiguation", "term": ev.indicator_term,
                                "quote": ev.quote or None, "question": question, "options": options,
                                "blocking": True}}
            # A blocking item without a valid KB question must not be silently finalized.
            return {"status": "NEEDS_CLARIFICATION", "assessment_complete": False,
                    "message": "Clarification is required before final scoring.",
                    "clarification": {"type": "deep_dive", "evidence_id": item["evidence_id"],
                        "field": item["field"], "term": item.get("term"),
                        "quote": item.get("quote"), "question": item.get("question"),
                        "options": (["current", "historical"] if item.get("field") == "currentness" else
                                    ["Mild", "Moderate", "Severe"] if item.get("field") == "intensity" else None),
                        "blocking": True}}
        if open_followups:
            logger.warning(
                "END SESSION WITH OPEN FOLLOW-UPS | blocking=%s optional=%s | scoring anyway",
                len(blocking_followups), len(open_followups) - len(blocking_followups),
            )
        logger.info("BUILDING COMPLETE ASSESSMENT CONTEXT")
        full_context = {
            "demographics": copy.deepcopy(ctx.demographics), "baseline": copy.deepcopy(ctx.baseline),
            "demographic_and_therapist_context": copy.deepcopy(ctx.patient_state.get("current_issue", "")),
            "opening_responses": copy.deepcopy(ctx.patient_state.get("opening_responses", [])),
            "selected_quadrants": list(ctx.patient_state.get("selected_quadrant_names", [])),
            "completed_quadrants": list(ctx.patient_state.get("completed_quadrants", [])),
            "responses": [r.model_dump() if hasattr(r, "model_dump") else copy.deepcopy(r) for r in ctx.responses],
            "evidence": [e.model_dump() if hasattr(e, "model_dump") else copy.deepcopy(e) for e in ctx.evidence],
        }
        logger.debug("FINAL CHAKRA SCORING CONTEXT: %s", full_context)  # full patient text: debug only
        # Integrity trace by quadrant makes it visible that the final pass
        # includes history from every part of the session.
        response_quadrants = {r.response_id: r.quadrant for r in ctx.responses}
        evidence_by_quadrant = {}
        for item in ctx.evidence:
            rid = getattr(item, "response_id", None) if not isinstance(item, dict) else item.get("response_id")
            quadrant = response_quadrants.get(rid, "opening_or_unassigned")
            evidence_by_quadrant[quadrant] = evidence_by_quadrant.get(quadrant, 0) + 1
            # later answers that repeated this indicator still show which quadrants it came up in
            for mid in (getattr(item, "mention_response_ids", None) or []):
                mq = response_quadrants.get(mid, "opening_or_unassigned")
                evidence_by_quadrant.setdefault(mq, 0)
        logger.info("FINAL EVIDENCE BY QUADRANT: %s", evidence_by_quadrant)
        ctx.patient_state["final_assessment_context"] = full_context
        if (len(full_context["responses"]) != len(ctx.responses)
                or len(full_context["evidence"]) != len(ctx.evidence)):
            raise RuntimeError("Final session integrity check failed while aggregating responses and evidence")
        logger.info("RUNNING FINAL CHAKRA EVALUATION")
        ctx.patient_state["final_chakra_evaluated"] = True
        ctx.patient_state["assessment_complete"] = True
        ctx.patient_state["end_session_requested"] = True
        ctx.patient_state["assessment_status"] = "finalizing"
        report = self.score(sid, complete_context=full_context)
        result = self._build_final_result(sid, report=report)
        logger.info("========== FINAL CHAKRA DEBUG ==========")
        logger.info("Total session responses: %s", len(full_context["responses"]))
        logger.info("Total evidence items: %s", len(full_context["evidence"]))
        for chakra_result in report.results:
            trace_evidence = [
                {"evidence_id": item.evidence_id, "term": item.term, "status": item.evidence_status,
                 "intensity": item.intensity, "intensity_assumed": item.intensity_assumed,
                 "chakra_state": item.kb_state,
                 "contribution": item.contribution, "counted": item.counted, "note": item.note}
                for item in chakra_result.trace
            ]
            logger.info(
                "%s: score=%s evidence_count=%s mapped_evidence_count=%s evidence=%s confidence=%s threshold=%s "
                "independent_units=%s gate_passed=%s status=%s reason=%s gate_reason=%s",
                chakra_result.chakra, chakra_result.score, len(chakra_result.trace),
                chakra_result.mapped_evidence_count, trace_evidence, chakra_result.confidence_pct,
                chakra_result.gate_threshold,
                chakra_result.independent_evidence_units,
                chakra_result.gate_passed, chakra_result.status, chakra_result.reasons,
                chakra_result.gate_reason,
            )
        logger.info("Final supported chakras: %s", report.supported_chakras)
        logger.info("=========================================")
        logger.info("FINAL CHAKRA RESULTS: %s", result["chakras"])
        if report.supported_chakras:
            logger.info("RUNNING RAAG INFERENCE | SUPPORTED CHAKRAS: %s", report.supported_chakras)
            recommendations = self.recommendations(sid, report=report)
        else:
            logger.info("SKIPPING RAAG INFERENCE | NO SUPPORTED CHAKRA")
            recommendations = {
                "chakra_report": report.model_dump(),
                "raga": {"candidates": [], "status": "SKIPPED_NO_SUPPORTED_CHAKRA"},
                "activities": [],
            }
            ctx.stage = AssessmentStage.RAGA_REVIEW.value
        ctx.patient_state["final_chakra_result"] = copy.deepcopy(result)
        ctx.patient_state["final_recommendations"] = copy.deepcopy(recommendations)
        ctx.patient_state["assessment_context_summary"] = {
            "total_responses": len(ctx.responses), "total_evidence_items": len(ctx.evidence),
            "selected_quadrants": full_context["selected_quadrants"],
            "completed_quadrants": completed, "deep_dive_responses": deep_response_count,
            "evidence_by_quadrant": evidence_by_quadrant,
        }
        ctx.patient_state["assessment_status"] = "completed"
        logger.info("FINAL ASSESSMENT COMPLETE | responses=%s evidence=%s", len(ctx.responses), len(ctx.evidence))
        return {"status": "COMPLETED", "blocking_followups_count": len(blocking_followups),
                "open_followups_count": len(open_followups),
                "final_result": result, "chakra_report": recommendations["chakra_report"],
                "raga": recommendations["raga"], "activities": recommendations["activities"],
                "assessment_context_summary": {"total_responses": len(ctx.responses),
                    "total_evidence_items": len(ctx.evidence), "selected_quadrants": full_context["selected_quadrants"],
                    "completed_quadrants": completed, "deep_dive_responses": deep_response_count,
                    "evidence_by_quadrant": evidence_by_quadrant}}

    def recommendations(self, sid, current_time_label=None, preferences=None, report=None):
        ctx = self._ctx(sid)
        if (ctx.patient_state.get("selected_quadrant_names")
                and not ctx.patient_state.get("final_chakra_evaluated")):
            raise ValueError("Raag inference is available only after final chakra evaluation at End Session")
        saved = ctx.patient_state.get("final_recommendations")
        if report is None and saved:
            return copy.deepcopy(saved)
        report = report or self.score(sid)
        logging.getLogger("anahat.assessment.progress").info(
            "RAAG INFERENCE: %s", "START" if report.supported_chakras else "SKIPPED (no supported chakra)"
        )
        activities = self.activities.candidates_for_chakras(report.supported_chakras)
        ragas = self.ragas.candidates(approved_chakras=report.supported_chakras, current_time_label=current_time_label, preferences=preferences)
        logging.getLogger("anahat.scoring").debug(
            "raag_candidates supported_chakras=%s candidates=%s",
            report.supported_chakras, ragas.get("candidates", []),
        )
        ctx.stage = AssessmentStage.RAGA_REVIEW.value
        ctx.audit("RECOMMENDATIONS_PREPARED", activity_count=len(activities), raga_count=len(ragas["candidates"]))
        return {"chakra_report": report.model_dump(), "raga": ragas, "activities": activities, "therapist_approval_required": True}

    def prescription(self, sid):
        ctx = self._ctx(sid)
        final_result = ctx.patient_state.get("final_chakra_result")
        rec = ctx.patient_state.get("final_recommendations")
        if not final_result:
            raise ValueError("Prescription is available only after End Session has completed")
        rec = rec or {}
        raga = rec.get("raga") or {}
        candidates = raga.get("candidates") or []
        activities = rec.get("activities") or []
        ctx.stage = AssessmentStage.PRESCRIPTION.value
        draft = self.prescriptions.draft(patient_id=ctx.demographics["patient_id"], findings=final_result["chakras"],
                                         raga_candidates=candidates, activities=activities)
        # The chakra findings the prescription is based on, in a form that is easy to show.
        draft["chakra_imbalances"] = sorted([
            {"chakra": c["chakra"], "status": c["status"], "status_label": c.get("status_label"),
             "direction": c.get("direction"), "severity": c.get("severity"), "score": c.get("score"),
             "confidence_pct": c.get("confidence_pct"), "reason": c.get("reason"),
             "evidence": [t.get("term") for t in c.get("trace", []) if t.get("counted")]}
            for c in final_result["chakras"] if is_imbalanced(c.get("status"))
        ], key=lambda x: -(x.get("score") or 0))
        draft["chakra_summary"] = final_result.get("summary", {})
        draft["raga_status"] = raga.get("status") or ("AVAILABLE" if candidates else "NO_APPROVED_RAGA_MAPPING")
        draft["raga_governance_notes"] = raga.get("governance_notes", [])
        return draft