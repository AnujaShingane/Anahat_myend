"""Adaptive (LLM-worded) follow-up questions for the quadrant phase.

Flow (one call per "next question"):

  KB/RAG question selected as before  ->  build closed context from the session
  -> local LLM words ONE patient-specific question  ->  backend validators
  -> valid: patient gets the generated question (KB question kept as fallback)
  -> anything wrong (timeout, bad JSON, unknown id, leading, duplicate, chakra word,
     sensitive topic in AI-only mode, ...): patient gets the KB question, and the
     response says so (fallback is never disguised as a generated question).

What the model sees:
  * the patient's latest answer and the question it answered, a little recent conversation,
    the opening concern, the selected quadrant's KB attributes, approved KB example questions,
    questions already asked;
  * "signals": evidence the existing pipeline already extracted and matched to canonical KB
    indicators, with the patient's own words and the details still missing;
  * for ambiguous indicators only, the KB disambiguation answer options as opaque
    interpretation ids ("S1-A", "S1-B" ...) with patient-safe theme text. The model never sees
    chakra names; the id -> chakra mapping stays on the server.

What the model never does: score, diagnose, choose a chakra, or create evidence. The answer to
a generated question goes through the unchanged extraction -> validation -> scoring pipeline,
and targeting an interpretation never adds weight to it.
"""
from __future__ import annotations

import copy
import hashlib
import json
import logging
import re
from app.services.session_memory import build_session_memory, reason_to_explore
import string
from pathlib import Path

from app.core.config import settings
from app.core.enums import AssessmentStage, EvidenceStatus
from app.services.question_validators import (
    norm_text,
    sensitive_topics_in,
    similarity,
    validate_generated_question,
)

log = logging.getLogger("anahat.dynamic_questions")

_FIELD_TO_GOAL = {"currentness": "current_or_historical", "intensity": "intensity",
                  "disambiguation": "distinguish_interpretations", "frequency": "frequency",
                  "duration": "duration", "trigger": "trigger", "impact": "daily_impact"}
_LANGUAGES = {"en": "English", "hi": "Hindi", "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada",
              "ta": "Tamil", "te": "Telugu", "bn": "Bengali"}
_CHAKRA_WORDS = re.compile(r"\b(?:root|sacral|solar plexus|heart|throat|third eye|crown)\s+chakra\b|\bchakras?\b",
                           re.IGNORECASE)
_ENGINE_ROOT = Path(__file__).resolve().parents[2]


def load_guidance(path: str | None = None) -> dict:
    candidates = []
    if path:
        p = Path(path)
        candidates += [p] if p.is_absolute() else [Path.cwd() / p, _ENGINE_ROOT / p]
    candidates.append(_ENGINE_ROOT / "config" / "dynamic_question_guidance.json")
    for c in candidates:
        if c.is_file():
            return json.loads(c.read_text(encoding="utf-8"))
    raise FileNotFoundError("dynamic_question_guidance.json not found")


class DynamicQuestionService:
    def __init__(self, kb, indicators, ambiguity, safety=None, deep_dive=None, *, generator=None,
                 guidance: dict | None = None):
        self.kb, self.indicators, self.ambiguity, self.safety = kb, indicators, ambiguity, safety
        self._deep_dive = deep_dive
        self._generator = generator
        self.guidance = guidance if guidance is not None else load_guidance(settings.dynamic_question_guidance_path)
        self.limits = self.guidance.get("limits") or {}
        self._themes = {c.get("name"): c.get("core_themes") or [] for c in getattr(kb, "chakra_master", []) or []}
        self._chakra_terms = [n for c in getattr(kb, "chakra_master", []) or []
                              for n in (c.get("name"), c.get("sanskrit")) if n]

    # ------------------------------------------------------------------ provider
    @property
    def generator(self):
        if self._generator is None:
            from app.llm.question_provider import build_question_generator
            self._generator = build_question_generator()
        return self._generator

    @staticmethod
    def enabled() -> bool:
        return bool(settings.dynamic_questions_enabled)

    @staticmethod
    def delivery_mode() -> str:
        mode = (settings.dynamic_question_delivery or "auto").strip().lower()
        return mode if mode in {"auto", "therapist_review"} else "auto"

    # ------------------------------------------------------------------ public entry point
    def adapt(self, ctx, quadrant: str, kb_question: dict | None, kb_candidates: list[dict], *,
              deep_dive: bool = False, asked_text: list[str] = ()) -> dict | None:
        """Return the question to show: a validated generated one, or the KB one annotated with
        why it was used. Never raises."""
        try:
            return self._adapt(ctx, quadrant, kb_question, kb_candidates, deep_dive=deep_dive,
                               asked_text=list(asked_text or ()))
        except Exception:  # noqa: BLE001 - the assessment must continue with the KB question
            log.exception("dynamic_question.unexpected_error quadrant=%s", quadrant)
            return self._fallback(ctx, kb_question, "internal_error")

    def _adapt(self, ctx, quadrant, kb_question, kb_candidates, *, deep_dive, asked_text):
        if not self.enabled():
            return kb_question
        state = ctx.patient_state
        # The question on screen stays the same until it is answered (re-fetching, switching
        # quadrants or a therapist review must not silently swap it for a new one).
        cache_key = self._active_key(quadrant, deep_dive)
        active = (state.get("dynamic_active") or {}).get(cache_key)
        # Safety and sensitivity are re-checked on EVERY request, before a stored question is
        # reused: an AMBER/RED or sensitive answer given anywhere in the session withdraws every
        # model-written question that is still waiting to be shown.
        skip = self._skip_reason(ctx) or self._sensitive_context_reason(ctx)
        if active and active.get("generated") and skip:
            self._withdraw_generated(ctx, skip)
            active = None
        if active:
            return copy.deepcopy(active)
        if kb_question is None and deep_dive:
            # Deep dive ends when the KB has nothing left; the model must not extend it forever.
            return None

        if skip:
            return self._remember(ctx, cache_key, self._fallback(ctx, kb_question, skip))

        context, server_map = self.build_context(ctx, quadrant, kb_question, kb_candidates, asked_text)
        context_topics = sensitive_topics_in(" ".join([context.get("latest_patient_answer") or "",
                                                       context.get("current_concern") or ""]), self.guidance)
        mode = self.delivery_mode()
        if context_topics and mode == "auto":
            return self._remember(ctx, cache_key, self._fallback(
                ctx, kb_question, "sensitive_topic_in_patient_context:" + ",".join(context_topics)))

        try:
            output, provider = self.generator.generate_question(context)
        except Exception as exc:  # noqa: BLE001 - every provider failure falls back to the KB
            reason = f"generator_failed:{getattr(exc, 'category', type(exc).__name__)}"
            log.warning("dynamic_question.fallback quadrant=%s reason=%s", quadrant, reason)
            return self._remember(ctx, cache_key, self._fallback(ctx, kb_question, reason))

        check, text = validate_generated_question(
            output, guidance=self.guidance,
            quadrant_attributes=server_map["attributes"],
            signal_ids=set(server_map["signals"]),
            interpretation_ids={iid: v["signal_id"] for iid, v in server_map["interpretations"].items()},
            interpretation_themes={iid: v["theme"] for iid, v in server_map["interpretations"].items()},
            asked_questions=server_map["all_asked"],
            patient_corpus=server_map["patient_corpus"],
            extra_chakra_terms=self._chakra_terms,
            quadrant=quadrant,
        )
        # Small models sometimes copy the worked example from the prompt verbatim.
        from app.llm.question_prompts import EXAMPLE_QUESTION, EXAMPLE_ANCHOR_WORDS
        if check.ok and similarity(text, EXAMPLE_QUESTION) >= 0.6 and not all(
                w in server_map["patient_corpus"].lower() for w in EXAMPLE_ANCHOR_WORDS):
            check.fail("copied_prompt_example")
        if not check.ok:
            log.info("dynamic_question.rejected quadrant=%s errors=%s", quadrant, check.errors)
            ctx.audit("DYNAMIC_QUESTION_REJECTED", quadrant=quadrant, provider=provider, errors=check.errors)
            return self._remember(ctx, cache_key, self._fallback(
                ctx, kb_question, "validation_failed:" + ",".join(check.errors), check=check.as_dict()))

        review_reasons = []
        if check.sensitive_topics:
            review_reasons.append("sensitive_topic:" + ",".join(check.sensitive_topics))
        if context_topics:
            review_reasons.append("sensitive_topic_in_patient_context:" + ",".join(context_topics))
        if check.sensitive_topics and mode == "auto":
            return self._remember(ctx, cache_key, self._fallback(
                ctx, kb_question, review_reasons[0], check=check.as_dict()))

        focus = output.focus_signal_id
        if not focus and output.candidate_interpretation_ids:
            focus = server_map["interpretations"][output.candidate_interpretation_ids[0]]["signal_id"]
        signal = server_map["signals"].get(focus) if focus else None
        interp_ids = list(output.candidate_interpretation_ids or [])
        if output.exploration_goal == "distinguish_interpretations" and signal and not interp_ids:
            interp_ids = list(signal["interpretation_ids"])
        chakras = sorted({server_map["interpretations"][i]["chakra"] for i in interp_ids
                          if server_map["interpretations"][i].get("chakra")})
        if len(chakras) >= 3:
            review_reasons.append("ambiguity_with_3_or_more_interpretations")

        qid = "DYN-" + hashlib.sha256(f"{quadrant}|{norm_text(text)}".encode("utf-8")).hexdigest()[:16]
        if qid in (state.get("dynamic_question_meta") or {}):
            ctx.audit("DYNAMIC_QUESTION_REJECTED", quadrant=quadrant, provider=provider,
                      errors=["duplicate_of_asked_question"])
            return self._remember(ctx, cache_key, self._fallback(
                ctx, kb_question, "validation_failed:duplicate_of_asked_question"))
        requires_review = mode == "therapist_review"
        public_meta = {
            "status": "GENERATED",
            "provider": provider,
            "question_type": output.question_type,
            "attribute": self._canonical_attribute(output.attribute, server_map["attributes"]),
            "exploration_goal": output.exploration_goal,
            "evidence_dimensions": list(output.evidence_dimensions or []),
            "indicator_ids_being_clarified": list(signal["indicator_ids"]) if signal else [],
            "candidate_interpretation_ids": interp_ids,
            "generation_confidence": round(float(output.generation_confidence), 3),
            # Computed by the backend, not reported by the model.
            "patient_facing_text_contains_chakra_term": check.patient_facing_text_contains_chakra_term,
            "leading_assumption_detected": check.leading_assumption_detected,
            "validation_warnings": check.warnings,
            "therapist_review_reasons": review_reasons,
            "requires_therapist_review": requires_review,
            "delivery_status": "PENDING_THERAPIST_REVIEW" if requires_review else "DELIVERED",
            "fallback_used": False,
        }
        question = {
            "id": qid, "question": text, "quadrant": quadrant,
            "source": "LLM adaptive question (validated; KB question kept as fallback)",
            "selection_method": "llm_adaptive",
            "generated": True,
            "attribute": public_meta["attribute"],
            "score": (kb_question or {}).get("score"),
            "fallback_question": self._public_kb(kb_question),
            "generation": public_meta,
        }
        # Server-side only (never returned by the API): which chakras the targeted
        # interpretations stand for. Kept for audit/therapist view; NOT used by scoring.
        state.setdefault("dynamic_question_meta", {})[qid] = {
            **public_meta, "quadrant": quadrant, "question_text": text, "focus_signal_id": focus,
            "signal_group": signal["group"] if signal else None,
            "interpretation_chakras": {i: server_map["interpretations"][i].get("chakra") for i in interp_ids},
            "disambiguation_pattern_ids": signal["disambiguation_pattern_ids"] if signal else [],
            "model_reason": output.reason, "fallback_question": self._public_kb(kb_question),
            "context_signal_ids": list(server_map["signals"]),
        }
        ctx.audit("DYNAMIC_QUESTION_GENERATED", question_id=qid, quadrant=quadrant, provider=provider,
                  exploration_goal=output.exploration_goal, attribute=public_meta["attribute"],
                  indicator_ids=public_meta["indicator_ids_being_clarified"],
                  interpretation_ids=interp_ids, review_reasons=review_reasons)
        log.info("dynamic_question.generated quadrant=%s id=%s goal=%s focus=%s", quadrant, qid,
                 output.exploration_goal, focus)
        return self._remember(ctx, cache_key, question)

    # ------------------------------------------------------------------ gating
    def _skip_reason(self, ctx) -> str | None:
        if ctx.stage == AssessmentStage.SAFETY_ESCALATION.value:
            return "safety_escalation"
        if ctx.patient_state.get("safety_amber_unacknowledged"):
            return "safety_amber_pending"
        if any(getattr(r, "safety_status", None) not in {None, "CLEAR", "not_checked"} for r in ctx.responses[-1:]):
            return "latest_answer_safety_not_clear"
        latest = self._latest_response(ctx)
        if latest is not None and self.safety is not None:
            if self.safety.assess(latest.raw_text).get("status") != "CLEAR":
                return "latest_answer_safety_not_clear"
        return None

    def _sensitive_context_reason(self, ctx) -> str | None:
        """AI-only mode: a sensitive topic in the latest answer or opening concern means KB questions."""
        if self.delivery_mode() != "auto":
            return None
        latest = self._latest_response(ctx)
        text = " ".join([getattr(latest, "raw_text", "") or "",
                         " ".join(ctx.patient_state.get("opening_responses") or [])])
        topics = sensitive_topics_in(text, self.guidance)
        return "sensitive_topic_in_patient_context:" + ",".join(topics) if topics else None

    @staticmethod
    def _withdraw_generated(ctx, reason):
        active = ctx.patient_state.get("dynamic_active") or {}
        meta = ctx.patient_state.get("dynamic_question_meta") or {}
        for key in [k for k, q in active.items() if q.get("generated")]:
            qid = active.pop(key).get("id")
            if qid in meta and meta[qid].get("delivery_status") in {"DELIVERED", "PENDING_THERAPIST_REVIEW",
                                                                    "APPROVED", "EDITED_BY_THERAPIST"}:
                meta[qid]["delivery_status"] = "WITHDRAWN"
                meta[qid]["withdrawn_reason"] = reason
            ctx.audit("DYNAMIC_QUESTION_WITHDRAWN", question_id=qid, reason=reason)

    # ------------------------------------------------------------------ context
    @staticmethod
    def _latest_response(ctx):
        for r in reversed(ctx.responses):
            if str(getattr(r, "question_id", "") or "").startswith("DD-"):
                continue
            if (getattr(r, "raw_text", "") or "").strip():
                return r
        return None

    def _question_text(self, ctx, question_id):
        if not question_id:
            return None
        text = (ctx.patient_state.get("question_text_by_id") or {}).get(question_id)
        if text:
            return text
        ids = ctx.patient_state.get("opening_question_ids") or []
        texts = ctx.patient_state.get("opening_questions") or []
        if question_id in ids and ids.index(question_id) < len(texts):
            return texts[ids.index(question_id)]
        return None

    def _patient_corpus(self, ctx) -> str:
        parts = [r.raw_text for r in ctx.responses if getattr(r, "raw_text", None)]
        parts += list(ctx.patient_state.get("opening_responses") or [])
        parts.append(ctx.patient_state.get("current_issue") or "")
        return "\n".join(p for p in parts if p)

    def _signals(self, ctx, latest_response_id):
        """Session evidence grouped into signals, latest answer first, ambiguous next."""
        groups: dict[str, list] = {}
        order: list[str] = []
        for ev in ctx.evidence:
            if ev.superseded or ev.status in {EvidenceStatus.NEGATIVE, EvidenceStatus.HISTORICAL}:
                continue
            key = ev.correlation_group or (self.indicators.group_key(ev.canonical_indicator_id)
                                           if hasattr(self.indicators, "group_key") else ev.canonical_indicator_id)
            if key not in groups:
                groups[key] = []
                order.append(key)
            groups[key].append(ev)

        def rank(key):
            evs = groups[key]
            from_latest = any(e.response_id == latest_response_id for e in evs)
            unresolved = any(e.status == EvidenceStatus.UNRESOLVED for e in evs)
            recency = max(i for i, k in enumerate(order) if k == key)
            return (not from_latest, not unresolved, -recency)

        return [(k, groups[k]) for k in sorted(order, key=rank)]

    def _interpretations(self, sid, indicator_ids, resolved: bool):
        """KB-only competing interpretations for an ambiguous signal."""
        chakras = sorted({rec.chakra for iid in indicator_ids for rec in self.indicators.get_by_id(iid) if rec.chakra})
        if resolved or len(chakras) < 2:
            return [], [], chakras
        best, best_cover = None, -1
        for iid in indicator_ids:
            for q in (self.ambiguity.for_indicator(iid) if self.ambiguity else []):
                cover = len(set(q.get("candidate_chakras") or []) & set(chakras))
                if cover > best_cover:
                    best, best_cover = q, cover
        out, used, pattern_ids = [], set(), []
        letters = iter(string.ascii_uppercase)
        if best:
            pattern_ids.append(best.get("id"))
            for opt in best.get("answer_options") or []:
                chakra = opt.get("points_to_chakra")
                if chakra in used or chakra not in chakras:
                    continue
                used.add(chakra)
                out.append({"id": f"{sid}-{next(letters)}", "theme": _CHAKRA_WORDS.sub("", opt.get("label") or "").strip(),
                            "chakra": chakra, "source": best.get("id")})
        for chakra in chakras:   # mapped chakras the KB question does not cover: KB core themes
            if chakra in used or not self._themes.get(chakra):
                continue
            out.append({"id": f"{sid}-{next(letters)}", "theme": ", ".join(self._themes[chakra]) + ".",
                        "chakra": chakra, "source": "chakra_master.core_themes"})
        return out, pattern_ids, chakras

    def build_context(self, ctx, quadrant, kb_question, kb_candidates, asked_text):
        """Returns (context sent to the model, server-side map used for validation)."""
        state = ctx.patient_state
        q = next((x for x in self.kb.quadrants if x.get("name") == quadrant), {}) or {}
        attributes = list(dict.fromkeys(q.get("attributes") or []))
        latest = self._latest_response(ctx)
        max_ans = int(self.limits.get("max_latest_answer_chars", 600))
        covered = state.get("dynamic_covered") or {}
        owned = set((self.guidance.get("goals_owned_by_structured_follow_up") or {}).get("goals") or [])

        signals_ctx, server_signals, server_interps = [], {}, {}
        for n, (group, evs) in enumerate(self._signals(ctx, getattr(latest, "response_id", None))
                                         [: int(self.limits.get("max_signals_in_context", 4))], start=1):
            sid = f"S{n}"
            indicator_ids = sorted({e.canonical_indicator_id for e in evs if e.canonical_indicator_id})
            resolved = any(e.status == EvidenceStatus.RESOLVED_AFTER_CLARIFICATION or e.selected_chakra for e in evs)
            interps, pattern_ids, _ = self._interpretations(sid, indicator_ids, resolved)
            main = evs[0]
            open_details = []
            if interps:
                open_details.append("distinguish_interpretations")
            if not main.context and not main.trigger:
                open_details.append("context")
            for ev in evs[:1]:
                if self._deep_dive is not None:
                    missing = self._deep_dive.missing_fields(ev)
                else:
                    missing = [f for f in ("frequency", "duration", "trigger", "impact") if not getattr(ev, f, None)]
                for f in missing:
                    goal = _FIELD_TO_GOAL.get(f)
                    if not goal or goal in open_details:
                        continue
                    if goal in owned and f in (ev.deep_dive_asked or []):
                        continue   # the structured follow-up already asks this one
                    open_details.append(goal)
            open_details.append("what_helps_or_worsens")
            open_details = [g for g in open_details if g not in set(covered.get(group, []))]
            from_latest = latest is not None and any(e.response_id == latest.response_id for e in evs)
            signals_ctx.append({
                "signal_id": sid,
                "patient_words": main.quote or main.indicator_term,
                "recognised_as": main.indicator_term,
                "from_latest_answer": from_latest,
                "interpretations": [{"id": i["id"], "theme": i["theme"]} for i in interps],
                "open_details": open_details,
            })
            server_signals[sid] = {"group": group, "indicator_ids": indicator_ids, "from_latest": from_latest,
                                   "interpretation_ids": [i["id"] for i in interps], "open_details": open_details,
                                   "disambiguation_pattern_ids": pattern_ids}
            for i in interps:
                server_interps[i["id"]] = {"signal_id": sid, "theme": i["theme"], "chakra": i["chakra"],
                                           "source": i["source"]}

        explored = set(state.get("dynamic_explored_attributes", {}).get(quadrant, []))
        unexplored = [a for a in attributes if a not in explored]
        recommended = self._recommend_focus(signals_ctx, latest, unexplored)

        all_asked = list(dict.fromkeys([*(state.get("opening_questions") or []), *(state.get("asked_questions") or []),
                                        *asked_text, *(state.get("question_text_by_id") or {}).values(),
                                        *[m.get("question_text") for m in (state.get("dynamic_question_meta") or {}).values()]]))
        all_asked = [a for a in all_asked if a]
        # The model sees the most recent ones; the duplicate check uses all of them.
        asked = all_asked[-int(self.limits.get("max_asked_questions_in_context", 15)):]

        refs = []
        for item in [kb_question, *(kb_candidates or [])]:
            text = (item or {}).get("question")
            if text and text not in refs and text not in asked:
                refs.append(text)
        refs = refs[: int(self.limits.get("max_reference_questions", 3))]

        recent = []
        for r in ctx.responses[-4:-1] if latest is not None else []:
            qt = self._question_text(ctx, r.question_id)
            if r.raw_text:
                recent.append({"question": qt, "answer": r.raw_text[:300]})

        concern = " ".join(state.get("opening_responses") or []) or (state.get("current_issue") or "")
        language = (ctx.demographics or {}).get("language") or "en"
        context = {
            "selected_area": quadrant,
            "area_attributes": attributes,
            "unexplored_attributes": unexplored,
            "latest_patient_answer": (latest.raw_text[:max_ans] if latest is not None else None),
            "question_that_was_answered": self._question_text(ctx, getattr(latest, "question_id", None)) if latest else None,
            "current_concern": concern[: int(self.limits.get("max_concern_chars", 600))] or None,
            "recent_conversation": recent,
            "signals": signals_ctx,
            "recommended_focus": recommended,
            "patient_background": self._background(ctx),
            "baseline_ratings_0_to_10": {k: v for k, v in (ctx.baseline or {}).items() if v not in (None, "")} or None,
            "session_memory": build_session_memory(ctx, quadrant),
            "approved_example_questions_for_this_area": refs,
            "already_asked": asked,
            "patient_language": _LANGUAGES.get(str(language).lower(), language),
            # KB adaptive_questioning.selection_priority, with chakra words removed (the model
            # must not be primed to think in chakra terms).
            "selection_priority": [
                " ".join(re.sub(r"\bchakras?\b", "", p, flags=re.IGNORECASE).split())
                for p in (((getattr(self.kb, "assessment_design", {}) or {}).get("adaptive_questioning") or {})
                          .get("selection_priority", []))],
        }
        server_map = {"attributes": attributes, "signals": server_signals, "interpretations": server_interps,
                      "patient_corpus": self._patient_corpus(ctx), "all_asked": all_asked}
        return context, server_map

    @staticmethod
    def _background(ctx):
        """Non-identifying form facts the question may rely on (age, work, family situation, main concerns)."""
        demo = ctx.demographics or {}
        out = {k: demo.get(k) for k in ("age", "gender", "occupation", "marital_status") if demo.get(k)}
        form = (ctx.patient_state.get("current_issue") or "")
        for line in form.splitlines():
            low = line.lower()
            if low.startswith(("main concerns", "notes from the form", "patient form notes", "sleep")):
                out.setdefault("form", []).append(line.strip()[:300])
        if not out.get("form") and form:
            out["form"] = [form[:300]]
        return out or None

    def _recommend_focus(self, signals_ctx, latest, unexplored):
        order = self.guidance.get("goal_order_for_a_new_signal") or []
        reason = reason_to_explore(getattr(latest, "raw_text", None)) if latest is not None else None
        if reason:
            # The patient gave a reason, fear or barrier: follow THAT before any checklist item.
            return {"signal_id": None, "goal": "explore_patient_reason",
                    "note": "the patient said why / what stops them; ask what they think would happen or what "
                            "that is like for them, using their own words. Do not assume the cause.",
                    "patient_words": reason}
        latest_signals = [s for s in signals_ctx if s["from_latest_answer"]]
        for s in latest_signals:
            if "distinguish_interpretations" in s["open_details"]:
                return {"signal_id": s["signal_id"], "goal": "distinguish_interpretations"}
        for s in latest_signals + [s for s in signals_ctx if not s["from_latest_answer"]]:
            for goal in order:
                if goal in s["open_details"]:
                    return {"signal_id": s["signal_id"], "goal": goal}
        if latest is not None:
            return {"signal_id": None, "goal": "context",
                    "note": "explore the situation the patient just described"}
        return {"signal_id": None, "goal": "attribute_exploration",
                "attribute": unexplored[0] if unexplored else None}

    # ------------------------------------------------------------------ answers + review
    def record_answer(self, ctx, question_id: str | None, response_id: str, quadrant: str | None = None):
        """A patient answered in `quadrant`: the question on screen there is done. For a generated
        question, also mark what it covered so it is not asked again."""
        active = ctx.patient_state.get("dynamic_active") or {}
        for key in [k for k, q in active.items()
                    if (question_id and q.get("id") == question_id) or (quadrant and k.split("|")[0] == quadrant)]:
            active.pop(key, None)
        meta = (ctx.patient_state.get("dynamic_question_meta") or {}).get(question_id) if question_id else None
        if not meta:
            return
        meta["answered_response_id"] = response_id
        if meta.get("signal_group") and meta.get("exploration_goal"):
            ctx.patient_state.setdefault("dynamic_covered", {}).setdefault(meta["signal_group"], [])
            covered = ctx.patient_state["dynamic_covered"][meta["signal_group"]]
            if meta["exploration_goal"] not in covered:
                covered.append(meta["exploration_goal"])
        if meta.get("attribute"):
            explored = ctx.patient_state.setdefault("dynamic_explored_attributes", {}).setdefault(meta["quadrant"], [])
            if meta["attribute"] not in explored:
                explored.append(meta["attribute"])
        ctx.audit("DYNAMIC_QUESTION_ANSWERED", question_id=question_id, response_id=response_id,
                  exploration_goal=meta.get("exploration_goal"))

    def review(self, ctx, question_id: str, action: str, edited_text: str | None = None, therapist_note=None):
        """Therapist approves / edits / rejects a pending generated question."""
        meta = (ctx.patient_state.get("dynamic_question_meta") or {}).get(question_id)
        if not meta:
            raise ValueError("Unknown generated question")
        if meta.get("delivery_status") != "PENDING_THERAPIST_REVIEW":
            raise ValueError(f"Question is not awaiting review (status: {meta.get('delivery_status')})")
        action = (action or "").strip().lower()
        active = ctx.patient_state.setdefault("dynamic_active", {})
        key = next((k for k, q in active.items() if q.get("id") == question_id), None)
        current = (active.get(key) if key else None) or ctx.patient_state.get("current_question") or {}
        if action == "approve":
            meta["delivery_status"] = "APPROVED"
            question = dict(current) if current.get("id") == question_id else None
        elif action == "edit":
            text = " ".join((edited_text or "").split())
            from app.services.question_validators import validate_generated_question as _v
            from app.llm.question_schemas import GeneratedQuestion
            probe = GeneratedQuestion(status="QUESTION_GENERATED", question_text=text, generation_confidence=1.0)
            check, text = _v(probe, guidance=self.guidance, quadrant_attributes=[], signal_ids=set(),
                             interpretation_ids={}, interpretation_themes={}, asked_questions=[],
                             patient_corpus=self._patient_corpus(ctx), extra_chakra_terms=self._chakra_terms)
            hard = [e for e in check.errors if not e.startswith("presupposes_unstated_feeling")]
            if hard:
                raise ValueError("Edited question is not acceptable: " + ", ".join(hard))
            meta.update(delivery_status="EDITED_BY_THERAPIST", question_text=text)
            ctx.patient_state.setdefault("question_text_by_id", {})[question_id] = text
            question = {**current, "question": text} if current.get("id") == question_id else None
        elif action == "reject":
            meta["delivery_status"] = "REJECTED_BY_THERAPIST"
            fb = meta.get("fallback_question")
            question = None
            if key:
                active.pop(key, None)
            if fb and fb.get("id"):
                ctx.patient_state.setdefault("question_text_by_id", {})[fb["id"]] = fb["question"]
                ctx.patient_state.setdefault("question_mode_by_id", {})[fb["id"]] = \
                    ctx.patient_state.get("question_mode_by_id", {}).get(question_id, "normal")
                question = {**fb, "quadrant": meta.get("quadrant"), "generated": False,
                            "generation": {"status": "FALLBACK", "fallback_used": True,
                                           "fallback_reason": "rejected_by_therapist"}}
        else:
            raise ValueError("action must be approve, edit or reject")
        if question is not None and question.get("generated"):
            question["generation"] = {**(question.get("generation") or {}),
                                      "delivery_status": meta["delivery_status"], "requires_therapist_review": False}
        if key and question is not None:
            active[key] = copy.deepcopy(question)       # rejected -> the KB fallback stays on screen
        ctx.patient_state["current_question"] = question
        ctx.audit("DYNAMIC_QUESTION_REVIEWED", question_id=question_id, action=action, therapist_note=therapist_note)
        return {"question_id": question_id, "delivery_status": meta["delivery_status"], "question": question}

    def answer_block_reason(self, ctx, question_id) -> str | None:
        """Why a generated question may not be answered (None = it may)."""
        meta = (ctx.patient_state.get("dynamic_question_meta") or {}).get(question_id)
        if not meta:
            return None
        status = meta.get("delivery_status")
        if status == "PENDING_THERAPIST_REVIEW":
            return "This question is waiting for therapist review and cannot be answered yet"
        if status == "REJECTED_BY_THERAPIST":
            return "This question was rejected by the therapist; answer the replacement question instead"
        if status == "WITHDRAWN":
            return "This question was withdrawn after a safety or sensitivity check; ask for the next question"
        return None

    def is_pending_review(self, ctx, question_id) -> bool:
        meta = (ctx.patient_state.get("dynamic_question_meta") or {}).get(question_id)
        return bool(meta and meta.get("delivery_status") == "PENDING_THERAPIST_REVIEW")

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _canonical_attribute(attribute, attributes):
        if not attribute:
            return None
        return next((a for a in attributes if a.strip().lower() == attribute.strip().lower()), None)

    @staticmethod
    def _public_kb(kb_question):
        if not kb_question:
            return None
        return {"id": kb_question.get("id"), "question": kb_question.get("question"),
                "source": kb_question.get("source")}

    def _fallback(self, ctx, kb_question, reason, check=None):
        ctx.audit("DYNAMIC_QUESTION_FALLBACK", reason=reason)
        if kb_question is None:
            return None
        out = dict(kb_question)
        out["generated"] = False
        out["generation"] = {"status": "FALLBACK", "fallback_used": True, "fallback_reason": reason,
                             **({"validation": check} if check else {})}
        return out

    @staticmethod
    def _active_key(quadrant, deep_dive):
        return f"{quadrant}|{'dd' if deep_dive else 'n'}"

    @staticmethod
    def _remember(ctx, key, question):
        if question is not None:
            ctx.patient_state.setdefault("dynamic_active", {})[key] = copy.deepcopy(question)
        return question
