from __future__ import annotations

import logging
import re


class QuestionService:
    """Everything the patient is asked comes from the validated KB.

    - Opening questions: KB `assessment/fixed_opening_questions_v3.json` (styles A-J). The
      therapist picks a style; the engine never rewrites the text.
    - Quadrant questions: KB question-bank wording when it maps 1:1 onto the quadrant's
      attributes, otherwise a neutral attribute prompt (flagged for validation).
    - Questions are tracked per attribute, so a quadrant can be *exhausted* and the engine then
      recommends the next one instead of running out of questions.
    """

    def __init__(self, kb, embedder=None):
        self.kb = kb
        self.embedder = embedder
        self._profile_vectors = None
        self.last_recommendation_debug = []
        self.last_recommendation_input = []

    # ------------------------------------------------------------------ opening
    def opening_styles(self) -> list[dict]:
        return [{"id": s.get("id"), "name": s.get("name"), "recommended_for": s.get("recommended_for", []),
                 "question_count": len(s.get("questions", []))}
                for s in (self.kb.opening_styles or {}).get("styles", [])]

    def opening_rules(self) -> dict:
        return (self.kb.opening_styles or {}).get("rules", {})

    def opening_style(self, style_id: str) -> dict | None:
        for s in (self.kb.opening_styles or {}).get("styles", []):
            if str(s.get("id")).upper() == str(style_id).upper():
                return s
        return None

    def opening_questions(self, style_id: str) -> list[dict]:
        style = self.opening_style(style_id)
        if not style:
            raise ValueError(f"Unknown opening style: {style_id}")
        return [{"id": q["id"], "text": q["text"], "style": style["id"]} for q in style.get("questions", [])]

    def baseline_questions(self):
        return self.kb.opening_questions.get("baseline_rating_questions", {}).get("ratings", [])

    # ------------------------------------------------------------------ quadrant questions
    def _quadrant(self, name):
        return next((q for q in self.kb.quadrants if q.get("name") == name), None)

    def attribute_queue(self, quadrant_name: str) -> list[dict]:
        q = self._quadrant(quadrant_name)
        if not q:
            return []
        kb_texts = (getattr(self.kb, "quadrant_question_text", {}) or {}).get(quadrant_name)
        possible = {(x.get("attribute") or "").strip().lower(): x.get("possible_responses")
                    for x in q.get("attributes_with_responses") or []}
        seen, queue = set(), []
        for idx, attr in enumerate(q.get("attributes") or []):
            key = str(attr).strip().lower()
            if key in seen:      # KB repeats a few attributes; asked once at runtime, KB untouched
                continue
            seen.add(key)
            from_kb = bool(kb_texts) and idx < len(kb_texts)
            queue.append({
                "id": f"Q-{q.get('quadrant_id')}-{idx + 1}",
                "quadrant": quadrant_name,
                "attribute": attr,
                "possible_responses": possible.get(key),
                "question": kb_texts[idx] if from_kb else f"How would you describe your experience with {str(attr).lower()}?",
                "source": "KB question bank" if from_kb else "attribute prompt (REQUIRES DOMAIN VALIDATION: no 1:1 KB question text)",
            })
        return queue

    def next_questions(self, quadrant_name: str, answered_ids=(), limit: int = 3) -> dict:
        answered = set(answered_ids or ())
        queue = self.attribute_queue(quadrant_name)
        remaining = [x for x in queue if x["id"] not in answered]
        return {"quadrant": quadrant_name, "questions": remaining[:limit], "remaining": len(remaining),
                "total": len(queue), "exhausted": not remaining}

    # kept for callers of the old name
    def personalized_questions(self, quadrant_name: str, limit=3, answered_ids=()):
        return self.next_questions(quadrant_name, answered_ids, limit)["questions"]

    # ------------------------------------------------------------------ routing
    def recommend_quadrants(self, *, current_issue=None, opening_answers=None, baseline=None,
                            demographics=None, concepts=None, exhausted=None, assessed=None, limit=3):
        """Rank quadrants still worth asking about.

        Patient-provided concerns and notes, opening responses, extracted concepts, and
        baseline ratings all contribute evidence. Recommendations are suggestions: a quadrant
        is returned only when the available signals support it. The KB remains the source of
        quadrant profiles; no default quadrant is added.
        """
        exhausted = set(exhausted or ())
        assessed = set(assessed or ())
        evidence = self._recommendation_evidence(current_issue, opening_answers, baseline, demographics, concepts)
        self.last_recommendation_input = evidence
        candidates = [q for q in self.kb.quadrants if q.get("name") not in exhausted]
        method = "bge_m3_semantic"
        if self.embedder is not None and any(x["text"] for x in evidence if x["vote"]):
            scored, debug = self._semantic_evidence(candidates, evidence)
            if debug and all(item["semantic_similarity"] is None for item in debug):
                method = "keyword_fallback (KB attributes)"
        else:
            method = "keyword_fallback (KB attributes)"
            scored, debug = self._keyword_evidence(candidates, evidence)
        self.last_recommendation_debug = debug
        self._log_recommendation_debug(debug, method)
        out = []
        for q, score, reason, matched in scored:
            name = q.get("name")
            out.append({"quadrant": name, "relevance_score": round(score, 3), "method": method,
                        "reasons": [reason], "_support_count": len(matched),
                        "already_started": name in assessed,
                        "missing_information": (q.get("attributes") or [])[:3]})
        out.sort(key=lambda x: (-x["_support_count"], -x["relevance_score"]))
        for item in out:
            item.pop("_support_count")
        return out[:limit]

    @staticmethod
    def _recommendation_evidence(current_issue, opening_answers, baseline, demographics, concepts):
        evidence = []

        def add(label, value, vote=True):
            text = QuestionService._flat(value).strip()
            if text:
                evidence.append({"label": label, "text": text, "vote": vote})

        # The full unstructured form is retained as a query; structured summaries are
        # split into actual concern/response blocks so headers and unrelated words do
        # not make every KB profile appear similarly relevant.
        text = QuestionService._flat(current_issue).strip()
        if text:
            labels = {"main concerns", "concerns", "sleep pattern", "sleep patterns",
                      "patient form notes", "additional patient notes", "therapist context",
                      "patient response", "opening response"}
            ignored = {"age", "gender", "occupation", "marital status", "city"}
            found = False
            current_label, current_body = "patient information", []

            def flush():
                body = " ".join(current_body).strip()
                if not body:
                    return
                if current_label in {"main concerns", "concerns"}:
                    for concern in re.split(r"[,;|]", body):
                        add("patient concern: " + concern.strip(), concern)
                elif current_label in labels:
                    add(current_label, body)
                elif current_label == "patient information" and not found:
                    add(current_label, body)

            for line in text.splitlines():
                line = line.strip()
                if not line:
                    continue
                match = re.match(r"^([^:]{2,80}):\s*(.*)$", line)
                if not match:
                    if line.upper() not in {"PATIENT ASSESSMENT INFORMATION", "RECENT ASSESSMENT CONVERSATION"}:
                        current_body.append(line)
                    continue
                label, body = match.group(1).strip().lower(), match.group(2).strip()
                if label.startswith("baseline "):
                    found = True
                    if body:
                        add(label, body, vote=False)
                    flush()
                    current_label, current_body = "baseline", []
                elif label.startswith("patient response to "):
                    found = True
                    flush()
                    current_label, current_body = "patient response", ([body] if body else [])
                elif label in ignored:
                    found = True
                    flush()
                    # Demographics stay in context but do not vote a quadrant in by themselves.
                    add("demographic context " + label, body, vote=False)
                    current_label, current_body = "section", []
                elif label in labels:
                    found = True
                    flush()
                    current_label, current_body = label, ([body] if body else [])
                elif label in {"patient assessment information", "recent assessment conversation"}:
                    found = True
                    flush()
                    current_label, current_body = "section", []
                else:
                    current_body.append(line)
            flush()

        if isinstance(opening_answers, dict):
            for answer in opening_answers.values():
                add("opening response", answer)
        elif isinstance(opening_answers, (list, tuple)):
            for answer in opening_answers:
                add("opening response", answer)
        elif opening_answers:
            add("opening response", opening_answers)
        for concept in concepts or []:
            if isinstance(concept, dict):
                concept = concept.get("concept") or concept.get("text")
            add("extracted patient concept", concept)
        if isinstance(baseline, dict):
            baseline_text = "; ".join(f"{key}: {value}" for key, value in baseline.items())
            add("baseline ratings", baseline_text, vote=True)
        elif baseline:
            add("baseline ratings", baseline, vote=True)
        if isinstance(demographics, dict):
            for key, value in demographics.items():
                if key == "communication_preferences" and isinstance(value, dict):
                    for detail, detail_value in value.items():
                        if detail not in {"name", "patient_id"}:
                            add("demographic context " + str(detail), detail_value, vote=False)
                elif key not in {"patient_id", "language"}:
                    add("demographic context " + str(key), value, vote=False)
        return evidence

    def _semantic_evidence(self, quadrants, evidence):
        try:
            import numpy as np
            if self._profile_vectors is None:
                names = [q["name"] for q in self.kb.quadrants]
                vecs = self.embedder.encode_documents(
                    [f"{q['name']}: " + ", ".join(q.get("attributes") or []) for q in self.kb.quadrants])
                self._profile_vectors = dict(zip(names, vecs))
            voters = {q["name"]: [] for q in quadrants}
            all_scores = {q["name"]: [] for q in quadrants}
            associations = {q["name"]: [] for q in quadrants}
            items = [item for item in evidence if item["vote"]]
            if items:
                names = [q["name"] for q in quadrants]
                vectors = np.asarray(self.embedder.encode_documents([item["text"] for item in items]))
                profiles = np.asarray([self._profile_vectors[name] for name in names])
                scores = vectors @ profiles.T
                for row_index, item in enumerate(items):
                    order = np.argsort(scores[row_index])[::-1]
                    best = int(order[0])
                    best_score = float(scores[row_index, best])
                    second_score = float(scores[row_index, int(order[1])]) if len(order) > 1 else 0.0
                    margin = best_score - second_score
                    rank_by_index = {int(col): rank + 1 for rank, col in enumerate(order)}
                    for col, name in enumerate(names):
                        value = float(scores[row_index, col])
                        all_scores[name].append(value)
                        associations[name].append({"label": item["label"], "score": value,
                                                    "rank": rank_by_index[col],
                                                    "margin_to_best": best_score - value,
                                                    "signal_winner": names[best] if best_score >= 0.42 and margin >= 0.015 else None})
                    # A signal votes only when it has a sufficiently strong and clear
                    # nearest KB profile; weak alternatives never fill the top N.
                    if best_score >= 0.42 and margin >= 0.015:
                        voters[names[best]].append((item["label"], best_score))
            debug, output = [], []
            for q in quadrants:
                name = q["name"]
                matches = voters[name]
                score = (sum(x[1] for x in matches) / len(matches) if matches
                         else max(all_scores[name], default=0.0))
                labels = list(dict.fromkeys(x[0] for x in matches))
                reason = ("Clear nearest KB profile for " + ", ".join(labels) if labels
                          else "No patient signal was a clear, sufficiently strong nearest KB profile.")
                strongest = max(associations[name], key=lambda x: x["score"], default={})
                debug.append({"quadrant": name, "score": round(score, 4), "matched_signals": labels,
                              "matched_keywords": [], "semantic_similarity": round(score, 4), "reason": reason,
                              "strongest_signal": strongest.get("label"),
                              "rank_for_signal": strongest.get("rank"),
                              "margin_to_signal_winner": round(strongest.get("margin_to_best", 0.0), 4),
                              "signal_winner": strongest.get("signal_winner")})
                if matches:
                    output.append((q, score, reason, labels))
            return output, debug
        except Exception:  # noqa: BLE001 - routing must never crash an assessment
            logging.getLogger("anahat.quadrants").exception("quadrant_semantic_scoring_failed")
            return self._keyword_evidence(quadrants, evidence)

    def _keyword_evidence(self, quadrants, evidence):
        res, debug = [], []
        items = [item for item in evidence if item["vote"]]
        for q in quadrants:
            attrs = " ".join(q.get("attributes") or []).lower()
            attr_terms = {self._stem(x) for x in re.findall(r"[a-z]{4,}", attrs)}
            matched = set()
            labels = []
            for item in items:
                words = {self._stem(x) for x in re.findall(r"[a-z]{4,}", item["text"].lower())}
                terms = words & attr_terms
                matched.update(terms)
                # Do not combine unrelated fragments (for example ``work`` from an
                # opening answer and ``stress`` from baseline) into false KB support.
                if len(terms) >= 2:
                    labels.append(item["label"])
            score = len(matched) / max(1, len(attr_terms))
            reason = "KB attribute terms matched: " + ", ".join(sorted(matched)) if matched else "No patient wording matched a KB attribute."
            debug.append({"quadrant": q.get("name"), "score": round(score, 4),
                          "matched_signals": list(dict.fromkeys(labels)), "matched_keywords": sorted(matched),
                          "semantic_similarity": None, "reason": reason})
            if labels:
                res.append((q, score, reason, debug[-1]["matched_signals"]))
        return res, debug

    def rank_fallback_questions(self, query, questions):
        """Rank only eligible questions already scoped to the requested quadrant."""
        questions = list(questions or [])
        if not questions:
            return [], "no_eligible_question_in_requested_quadrant"
        if self.embedder is not None:
            try:
                import numpy as np
                texts = [query, *[
                    f"{item.get('attribute', '')}: {item.get('question', '')}"
                    for item in questions
                ]]
                vectors = np.asarray(self.embedder.encode_documents(texts))
                scores = vectors[1:] @ vectors[0]
                ranked = sorted(zip(questions, scores.tolist()), key=lambda pair: pair[1], reverse=True)
                return [(item, float(score)) for item, score in ranked], "embedding_similarity"
            except Exception:  # noqa: BLE001 - local lexical rank is the final fallback
                logging.getLogger("anahat.assessment.rag").exception(
                    "Fallback question embedding rank failed; using keyword overlap"
                )
        stop = {"about", "after", "also", "and", "are", "can", "describe", "does", "for", "from",
                "have", "how", "into", "most", "often", "that", "the", "their", "them", "then",
                "there", "this", "through", "what", "when", "where", "which", "with", "would", "your"}
        query_terms = {self._stem(word) for word in re.findall(r"[a-z]{3,}", (query or "").lower())} - stop
        ranked = []
        for item in questions:
            terms = {self._stem(word) for word in re.findall(
                r"[a-z]{3,}", f"{item.get('attribute', '')} {item.get('question', '')}".lower()
            )} - stop
            score = len(query_terms & terms) / max(1, len(terms) ** 0.5)
            ranked.append((item, score))
        ranked.sort(key=lambda pair: (-pair[1], str(pair[0].get("id", ""))))
        return ranked, "keyword_overlap"

    @staticmethod
    def _stem(token):
        token = token.lower()
        if token.endswith("ies") and len(token) > 5:
            return token[:-3] + "y"
        for suffix in ("ing", "ed", "es", "s"):
            if token.endswith(suffix) and len(token) > len(suffix) + 3:
                return token[:-len(suffix)]
        return token

    @staticmethod
    def _log_recommendation_debug(rows, method):
        from app.core.config import settings
        if settings.app_env != "development":
            return
        logger = logging.getLogger("anahat.quadrants")
        for row in rows:
            logger.info("quadrant_score method=%s quadrant=%s score=%s semantic_similarity=%s "
                        "matched_signals=%s matched_keywords=%s strongest_signal=%s rank_for_signal=%s "
                        "margin_to_signal_winner=%s signal_winner=%s reason=%s",
                        method, row["quadrant"], row["score"], row["semantic_similarity"],
                        row["matched_signals"], row["matched_keywords"], row.get("strongest_signal"),
                        row.get("rank_for_signal"), row.get("margin_to_signal_winner"),
                        row.get("signal_winner"), row["reason"])

    @staticmethod
    def _flat(value):
        if value is None:
            return ""
        if isinstance(value, dict):
            return " ".join(QuestionService._flat(v) for v in value.values())
        if isinstance(value, (list, tuple, set)):
            return " ".join(QuestionService._flat(v) for v in value)
        return str(value)

