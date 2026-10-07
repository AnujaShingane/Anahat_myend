function PanelIcon(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>; }
function StopIcon(props) { return <svg {...props} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>; }

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { addDocument, anahat, getDocuments, getPatientOnboarding, updateAppointmentStatus } from '../../services/api';
import { initialsOf } from '../../utils/initials';
import SessionChatComposer from '../../components/chat/SessionChatComposer';

const TEAL = '#0F8594';
const TEAL_SOFT = '#E6F0EA';
const CREAM = '#F6F4EC';
const SLEEP = ['Poor', 'Fair', 'Good', 'Excellent'];
const FIXED_OPENING_SET_ID = 'A';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const ts = (d) => new Date(d || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const logAnalysisFallback = (stage, error) => {
  if (import.meta.env.DEV) console.error(`[ANAHAT] ${stage} analysis failed; using offline record`, {
    code: error?.code || 'UNKNOWN', message: error?.message || String(error)
  });
};

// ---------------------------------------------------------------------------
// Offline (in-person) session: ONE chat with Nadika.ai that carries the whole
// ANAHAT assessment. Therapist reads the suggested question aloud, types the
// patient's answer, Nadika analyses (via the backend → AI engine) and moves
// the flow on. Every step maps to the existing /api/anahat endpoints — no
// clinical logic lives here.
// ---------------------------------------------------------------------------

function demographicSummary(ob = {}, pp = {}) {
  const bits = [];
  if (pp.age || ob.dob) bits.push(`${pp.age ? `${pp.age} yrs` : ''}${ob.gender ? `, ${ob.gender}` : ''}`.replace(/^, /, ''));
  if (ob.occupation) bits.push(ob.occupation === 'Other' ? ob.otherOccupation : ob.occupation);
  if (ob.maritalStatus) bits.push(ob.maritalStatus.toLowerCase());
  if (ob.city) bits.push(`from ${ob.city}`);
  const concerns = [...(ob.concerns || []).filter((c) => c !== 'Other'), ob.otherConcern].filter(Boolean);
  const lines = [bits.filter(Boolean).join(' · ')];
  if (concerns.length) lines.push(`Main concerns: ${concerns.join(', ')}.`);
  if (ob.sleepPattern) lines.push(`Sleep: ${ob.sleepPattern}.`);
  if (ob.additionalInfo) lines.push(`Notes from the form: "${ob.additionalInfo}"`);
  if (ob.formFor === 'care') lines.push(`Form filled by ${ob.caregiverName || 'a caregiver'} (${ob.relationship || 'caregiver'}).`);
  return lines.filter(Boolean).join('\n');
}

export default function NadikaOfflineSession({ patientId, patientName, appointmentId }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState(null);
  const [ref, setRef] = useState(null);
  const [engineUp, setEngineUp] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [baseline, setBaseline] = useState({ stress: 5, anxiety: 5, mood: 5, energy: 5, sleep_quality: '' });
  const [pickedQ, setPickedQ] = useState([]);
  const [phase, setPhase] = useState('loading');
  const [current, setCurrent] = useState(null);
  const [quadrantCursor, setQuadrantCursor] = useState(0);
  const [results, setResults] = useState(null);
  const [contextText, setContextText] = useState('');
  const [openingQuestions, setOpeningQuestions] = useState([]);
  const [openingAnswers, setOpeningAnswers] = useState({});
  const [rx, setRx] = useState(null);
  const [rxSuggest, setRxSuggest] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [attachments, setAttachments] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [bootRetry, setBootRetry] = useState(0);

  const bottomRef = useRef(null);
  const docRef = useRef(null);
  const activeAIRequest = useRef(null);
  const booted = useRef(false);
  const initialMessagesAdded = useRef(false);

  docRef.current = doc;

  useEffect(() => {
    if (!patientId) return;
    getDocuments(patientId).then(setAttachments).catch(() => setAttachments([]));
  }, [patientId]);

  const uploadAttachment = async (file) => {
    if (!file) return;
    const updated = await addDocument(patientId, {
      file,
      name: file.name,
      size: file.size,
      category: 'Previous Report'
    });
    setAttachments(updated || []);
  };

  const askEngine = async (body) => {
    const controller = new AbortController();
    activeAIRequest.current = controller;
    setAiPending(true);

    try {
      return await anahat.submitResponse(doc.id, body, controller.signal);
    } finally {
      if (activeAIRequest.current === controller) {
        activeAIRequest.current = null;
        setAiPending(false);
      }
    }
  };

  useEffect(() => {
    const guideKey = user?.id ? `anahat_assessment_guide_${user.id}` : null;
    if (guideKey && !localStorage.getItem(guideKey)) setGuideOpen(true);
  }, [user?.id]);

  const closeGuide = () => {
    if (user?.id) localStorage.setItem(`anahat_assessment_guide_${user.id}`, 'done');
    setGuideOpen(false);
  };

  const resetSessionState = () => {
    docRef.current = null;
    setDoc(null);
    setRef(null);
    setEngineUp(null);
    setOnboarding(null);
    setChat([]);
    setInput('');
    setBusy('');
    setError('');
    setBaseline({
      stress: 5,
      anxiety: 5,
      mood: 5,
      energy: 5,
      sleep_quality: ''
    });
    setPickedQ([]);
    setPhase('loading');
    setCurrent(null);
    setQuadrantCursor(0);
    setResults(null);
    setContextText('');
    setOpeningQuestions([]);
    setOpeningAnswers({});
    setRx(null);
    setRxSuggest(null);
  };

  const say = (role, text, card, extra = {}) => {
    const entry = {
      id: uid(),
      role,
      text,
      card,
      at: new Date().toISOString(),
      ...extra
    };

    setChat((c) => [...c, entry]);
    return entry;
  };

  const persist = (entries) =>
    docRef.current &&
    anahat.appendChat(docRef.current.id, entries).catch(() => {});

  const nadika = (text, card) => {
    const e = say('nadika', text, card);
    persist(e);
    return e;
  };

  const me = (text, extra) => {
    const e = say('therapist', text, null, extra);
    persist(e);
    return e;
  };

  const run = async (label, fn) => {
    setBusy(label);
    setError('');

    try {
      return await fn();
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Something went wrong');
      }
      return null;
    } finally {
      setBusy('');
    }
  };

  // ---- boot: create/resume assessment, load reference + demographics ------

  useEffect(() => {
    const bootKey = `${patientId}:${appointmentId || ''}:${bootRetry}`;

    if (booted.current === bootKey) return;

    booted.current = bootKey;
    initialMessagesAdded.current = false;

    resetSessionState();

    anahat.health()
      .then((h) => setEngineUp(!!h.aiReady))
      .catch(() => setEngineUp(false));

    anahat.reference()
      .then(setRef)
      .catch(() => {});

    (async () => {
      const ob = await getPatientOnboarding(patientId).catch(() => null);
      setOnboarding(ob);

      const r = await run(
        'Opening your session',
        () => anahat.create({ patientId, appointmentId, force: true })
      );

      if (!r) {
        setPhase('error');
        return;
      }

      const d = r.assessment;

      docRef.current = d;
      setDoc(d);

      if (d.chatLog?.length) {
        setChat(d.chatLog.map((e) => ({
          ...e,
          id: e.id || uid()
        })));

        setOpeningAnswers(
          Object.fromEntries(
            d.chatLog
              .filter((e) => e.role === 'therapist' && e.openingQuestionId)
              .map((e) => [e.openingQuestionId, e.text])
          )
        );

        resumePhase(d);
        return;
      }

      const hour = new Date().getHours();
      const greet =
        hour < 12
          ? 'Good morning'
          : hour < 17
            ? 'Good afternoon'
            : 'Good evening';

      const first = (user?.name || 'there').split(' ')[0];
      const summary = demographicSummary(ob?.fields, d.baseline ? {} : {});

      if (!initialMessagesAdded.current) {
        initialMessagesAdded.current = true;

        say(
          'nadika',
          `${greet}, ${first}. Here is what ${patientName} shared on the demographic form.\n${summary || 'The demographic form is empty.'}`
        );

        if (d.baseline) {
          setBaseline(d.baseline);
          resumePhase(d);
        } else {
          setPhase('baseline');

          say(
            'nadika',
            'Before we begin, let’s record the baseline. Ask the patient to rate each of these right now and fill them in.',
            { type: 'baseline' }
          );
        }
      } else {
        if (d.baseline) setBaseline(d.baseline);
        resumePhase(d);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, appointmentId, bootRetry]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [chat.length, phase]);

  // Work out where a resumed assessment left off.

  const resumePhase = (d) => {
    if (d.status === 'completed') {
      setPhase('done');
      return;
    }

    if (d.prescriptionDraft) {
      setRx({
        ragas: d.prescriptionDraft.raga_candidates || [],
        activities: d.prescriptionDraft.activities || [],
        note: ''
      });
      setPhase('prescription');
      return;
    }

    if (d.finalChakraResult) {
      const chakra = d.finalChakraResult.chakras || d.chakraReport?.results || [];
      const ragas = d.recommendations?.raga?.candidates || [];
      const activities = d.recommendations?.activities || [];
      setResults({ chakra, ragas, activities });
      setPhase('ended');
      nadika(d.finalChakraResult.summary?.display_message || 'Final chakra evaluation complete.', {
        type: 'results', chakra, ragas, activities
      });
      return;
    }

    if (d.recommendations) {
      setPhase('ended');
      return;
    }

    if (!d.baseline) {
      setPhase('baseline');
      return;
    }

    if (!d.therapistContext) {
      setPhase('context');
      return;
    }

    if (!d.openingSetId) {
      setPhase('opening');
      return;
    }

    if (d.openingQuestions?.length && d.stage === 'opening') {
      const questions = d.openingQuestions.map((q) => ({
        id: q.id,
        text: q.text,
        opening: true
      }));

      const next = questions.find(
        (q) => !(d.askedQuestionIds || []).includes(q.id)
      );

      setOpeningQuestions(questions);

      if (next) {
        setCurrent(next);
        setPhase('opening');

        nadika(null, {
          type: 'opening',
          question: next,
          index: questions.indexOf(next),
          total: questions.length
        });

        return;
      }

      suggestQuadrants(d);
      return;
    }

    if (!d.scope?.length) {
      setPhase('scope');
      return;
    }

    setQuadrantCursor(0);
    afterQuadrant(d, d.scope[0]);
    return;

  };

  // ---- step handlers ------------------------------------------------------

  const submitBaseline = () =>
    run('Recording baseline', async () => {
      if (!baseline.sleep_quality) {
        throw new Error('Pick the patient’s sleep quality.');
      }

      const d = await anahat.setBaseline(doc.id, baseline);
      setDoc(d);

      me(
        `Baseline — stress ${baseline.stress}/10, anxiety ${baseline.anxiety}/10, mood ${baseline.mood}/10, energy ${baseline.energy}/10, sleep ${baseline.sleep_quality}.`
      );

      nadika(
        'Thank you. Now add your own context for this session — how the patient presents, anything you already know — and save it.',
        { type: 'context' }
      );

      setPhase('context');
    });

  const submitContext = (text) =>
    run('Saving context', async () => {
      if (!text.trim()) {
        throw new Error('Write a line of context first.');
      }

      const d = await anahat.setContext(doc.id, text);
      setDoc(d);

      me(text);

      const r = await anahat.selectOpening(
        doc.id,
        FIXED_OPENING_SET_ID
      );

      const assessment = r.assessment;

      const qs = (r.opening?.questions || []).map((q) => ({
        id: q.id,
        text: q.text,
        opening: true
      }));

      setDoc(assessment);
      setOpeningQuestions(qs);
      setCurrent(qs[0]);

      nadika(
        'I’ll ask one question at a time. Record the patient’s response to continue.'
      );

      nadika(null, {
        type: 'opening',
        question: qs[0],
        index: 0,
        total: qs.length
      });

      setPhase('opening');
    });

  // Put the next unasked question on screen (or move the flow on).

  const FOCUSED = 3;

  const quadrantQs = (d, q, all = false) =>
    (d.quadrantQuestions?.[q] || [])
      .slice(0, all ? undefined : FOCUSED)
      .map((x) => ({
        id: x.id,
        text: x.question,
        quadrant: q,
        hint: x.attribute
      }));

  const askNext = (d, list) => {
    const quadrant = list?.[0]?.quadrant || current?.quadrant || d.scope?.[quadrantCursor];
    afterQuadrant(d, quadrant, Boolean(current?.deep));
  };

  const promptEndSession = (quadrant = doc?.scope?.[quadrantCursor]) => {
    setPhase('decision');
    console.info('NORMAL PASS COMPLETE:', quadrant);
    console.info('WAITING FOR THERAPIST DECISION');
    console.info('AVAILABLE ACTIONS: END_SESSION, MOVE_QUADRANT, DEEP_DIVE');
    nadika('The three normal questions for ' + quadrant + ' are complete. Choose what to do next.', {
      type: 'decision', awaitingTherapistDecision: true, quadrant, assessmentStatus: 'awaiting_therapist_decision'
    });
  };

  const afterQuadrant = (d, requestedQuadrant = null, deepDive = false) =>
    run(deepDive ? 'Retrieving a deep dive question' : 'Retrieving the next assessment question', async () => {
      const currentQuadrant = requestedQuadrant || current?.quadrant || d.scope?.[quadrantCursor];
      const ordered = currentQuadrant ? [currentQuadrant] : (d.scope || []).slice(quadrantCursor, quadrantCursor + 1);

      for (const quadrant of ordered) {
        const page = await anahat.nextQuestions(d.id, quadrant, 1, deepDive && quadrant === currentQuadrant);
        console.info('CURRENT QUADRANT:', quadrant);
        console.info('NORMAL QUESTION COUNT:', page.question_count + '/3');
        console.info('DEEP DIVE ENABLED:', Boolean(deepDive && quadrant === currentQuadrant));
        if (deepDive && quadrant === currentQuadrant && page.reason) {
          promptEndSession(quadrant);
          return;
        }
        if (deepDive && !page.questions?.length && page.retrieval_status) {
          setPhase('decision');
          nadika('No further Deep Dive question was found for ' + quadrant + '. Choose whether to end the session or move to another quadrant.', {
            type: 'decision', awaitingTherapistDecision: true, deepDiveExhausted: true, quadrant,
            assessmentStatus: 'awaiting_therapist_decision'
          });
          return;
        }
        if (!page.questions?.length && page.retrieval_status) {
          console.error('QUESTION RETRIEVAL FAILED; QUADRANT MUST NOT BE MARKED COMPLETE:', quadrant, page.retrieval_status);
          setPhase('retrieval_failure');
          nadika('No relevant question could be retrieved for ' + quadrant + '. This quadrant remains incomplete; retry retrieval or review the selected scope.', {
            type: 'retrieval_failure', quadrant, status: page.retrieval_status
          });
          return;
        }
        if (page.normal_limit_reached) {
          setCurrent(null);
          promptEndSession(quadrant);
          return;
        }
        const hit = page.questions?.[0];
        if (hit) {
          console.info('RAG RETRIEVAL QUADRANT:', quadrant);
          console.info('RAG SELECTED QUESTION:', hit.question || hit.text);
          setDoc(d);
          setQuadrantCursor(d.scope.indexOf(quadrant));
          setCurrent(null);
          setPhase('question');
          nadika('RAG selected the next question for ' + quadrant + '.', {
            type: 'suggested',
            items: [{ id: hit.id, text: hit.question || hit.text, quadrant, rag: true, deep: deepDive }],
            quadrant
          });
          return;
        }
        console.error('Question retrieval produced no question; quadrant remains incomplete:', quadrant, page);
        setPhase('retrieval_failure');
        nadika('Question retrieval returned no question for ' + quadrant + '. This quadrant remains incomplete.', {
          type: 'retrieval_failure', quadrant, status: page.retrieval_status || 'NO_RELEVANT_QUESTION_FOUND'
        });
        return;
      }

      promptEndSession();
    });
  const [inlineAnswer, setInlineAnswer] = useState('');

  const selectSuggested = (q) => {
    setCurrent(q);
    setInlineAnswer('');
  };

  const submitInlineAnswer = () => {
    const text = inlineAnswer.trim();

    if (!text) return;

    setInlineAnswer('');
    submitAnswer(text);
  };

  // Free-form chat with the AI engine.

  const chatFreeform = (text) =>
    run('Asking Nadika', async () => {
      me(text);

      const quadrant =
        current?.quadrant ||
        doc?.scope?.[quadrantCursor] ||
        null;

      let r;

      try {
        r = await askEngine({
          text,
          questionId: null,
          question: null,
          quadrant,
          requestId: uid()
        });
      } catch (e) {
        if (
          ['ENGINE_NOT_CONFIGURED', 'ENGINE_ERROR'].includes(e.code) ||
          /not reachable|not fully configured/i.test(e.message)
        ) {
          logAnalysisFallback('freeform response', e);

          nadika(
            'The AI engine is not reachable right now, so I can only record this note without analysis.'
          );

          return;
        }

        throw e;
      }

      const d = r.assessment;

      setDoc(d);

      if (r.status === 'SAFETY_ESCALATION') {
        setPhase('safety');

        nadika(
          'Safety flag. What was said matched an immediate-risk signal. Please follow the Anahat safety protocol now; I will not analyse this further. Tell me when you have done so.',
          {
            type: 'safety',
            safety: r.safety
          }
        );

        return;
      }

      const concepts = saidConcepts(r);
      const recorded = evidenceTerms(r);

      if (recorded.length) {
        nadika(
          `Understood. Session evidence recorded: ${recorded.join(', ')}.`
        );
      } else if (concepts.length) {
        nadika(
          `Noted: ${concepts.join(', ')}. No knowledge-base indicator matched, so this is kept in the transcript but not scored.`
        );
      } else {
        nadika(
          'Noted — I did not find a specific indicator in that, but it is saved in the transcript.'
        );
      }
    });

  const submitAnswer = (text) =>
    run('Analysing the response', async () => {
      const q = current;

      if (q?.opening) {
        const answers = {
          ...openingAnswers,
          [q.id]: text
        };

        setOpeningAnswers(answers);

        me(text, {
          openingQuestionId: q.id,
          openingQuestion: q.text
        });

        const markedAsked = await anahat
          .markAsked(doc.id, q.id)
          .catch(() => [
            ...(doc.askedQuestionIds || []),
            q.id
          ]);

        const nextIndex = openingQuestions.findIndex(
          (item) => !answers[item.id]
        );

        if (nextIndex >= 0) {
          setDoc({
            ...doc,
            askedQuestionIds: markedAsked
          });

          const next = openingQuestions[nextIndex];

          setCurrent(next);
          setPhase('opening');

          nadika(null, {
            type: 'opening',
            question: next,
            index: nextIndex,
            total: openingQuestions.length
          });

          return;
        }

        const combined = openingQuestions
          .map(
            (item) =>
              `${item.text}: ${answers[item.id]}`
          )
          .join('\n');

        let openingResult;

        try {
          openingResult = await askEngine({
            text: combined,
            questionId: null,
            question: null,
            quadrant: null,
            requestId: uid()
          });
        } catch (e) {
          if (
            ['ENGINE_NOT_CONFIGURED', 'ENGINE_ERROR'].includes(e.code) ||
            /not reachable|not fully configured/i.test(e.message)
          ) {
            logAnalysisFallback(
              'opening response',
              e
            );

            openingResult =
              await anahat.recordOffline(
                doc.id,
                {
                  text: combined,
                  questionId: null,
                  question: null,
                  quadrant: null,
                  requestId: uid()
                }
              );

            nadika(
              'Recorded. The AI engine is not available right now, so these opening answers were saved without analysis.'
            );
          } else {
            throw e;
          }
        }

        const openedDoc = {
          ...openingResult.assessment,
          askedQuestionIds: markedAsked,
          therapistContext:
            openingResult.assessment?.therapistContext ||
            text
        };

        setDoc(openedDoc);

        if (
          openingResult.status ===
          'SAFETY_ESCALATION'
        ) {
          setPhase('safety');

          nadika(
            'Safety flag. What the patient said matched an immediate-risk signal. Please follow the Anahat safety protocol now; I will not analyse this further. Tell me when you have done so.',
            {
              type: 'safety',
              safety: openingResult.safety
            }
          );

          return;
        }

        // -------------------------------------------------------------------
        // The engine records extracted patient evidence directly and the
        // assessment continues to adaptive quadrant recommendations.

        if (
          openingResult.status &&
          openingResult.status !==
            'RECORDED_WITHOUT_ENGINE'
        ) {
          const concepts =
            (openingResult.extraction?.concepts || [])
              .map((c) => c.concept)
              .filter(Boolean);

          if (concepts.length) {
            nadika(`Opening session evidence recorded from: ${concepts.join(', ')}.`);
          } else if (
            openingResult.status ===
            'NO_VALID_INDICATOR'
          ) {
            nadika(
              `I understood: ${concepts.join(', ') || 'no clear concept'}. No canonical indicator matched — that is expected for warm-up questions.`
            );
          } else {
            nadika(
              `Understood: ${concepts.join(', ') || 'noted'}.`
            );
          }
        }

        setCurrent(null);
        setOpeningQuestions([]);

        // Preserve the existing adaptive recommendation engine.
        suggestQuadrants(openedDoc);

        return;
      }

      me(text);

      let r = null;

      try {
        r = await askEngine({
          text,
          questionId: q?.id || null,
          question: q?.text || null,
          quadrant: q?.quadrant || null,
          requestId: uid()
        });
      } catch (e) {
        if (
          ['ENGINE_NOT_CONFIGURED', 'ENGINE_ERROR'].includes(e.code) ||
          /not reachable|not fully configured/i.test(e.message)
        ) {
          logAnalysisFallback(
            'quadrant response',
            e
          );

          r = await anahat.recordOffline(
            doc.id,
            {
              text,
              questionId: q?.id || null,
              question: q?.text || null,
              quadrant: q?.quadrant || null,
              requestId: uid()
            }
          );

          nadika(
            'Recorded. The AI engine is not available right now, so this answer was saved without analysis — it stays in the transcript.'
          );
        } else {
          throw e;
        }
      }

      let d = r.assessment;

      if (q?.id) {
        const asked = await anahat
          .markAsked(doc.id, q.id)
          .catch(() => d.askedQuestionIds);

        d = {
          ...d,
          askedQuestionIds: asked
        };
      }

      setDoc(d);

      if (r.status === 'SAFETY_ESCALATION') {
        setPhase('safety');

        nadika(
          'Safety flag. What the patient said matched an immediate-risk signal. Please follow the Anahat safety protocol now; I will not analyse this further. Tell me when you have done so.',
          {
            type: 'safety',
            safety: r.safety
          }
        );

        return;
      }

      if (
        r.status &&
        r.status !== 'RECORDED_WITHOUT_ENGINE'
      ) {

        const concepts = saidConcepts(r);

        if (
          r.status ===
          'NO_VALID_INDICATOR'
        ) {
          nadika(
            `I understood: ${concepts.join(', ') || 'no clear concept'}. None of these matched a knowledge-base indicator — if it matters, ask a clarifying question in your own words; otherwise let’s continue.`
          );
        } else {
          const recorded = evidenceTerms(r);
          nadika(
            recorded.length
              ? `Understood. Session evidence recorded: ${recorded.join(', ')}.`
              : `Noted: ${concepts.join(', ') || 'response saved'}. No knowledge-base indicator was recorded from this answer.`
          );
        }
      }

      continueAfter(d, r);
    });

  const continueAfter = (d, response = null) => {
    const transition = response?.quadrant_transition;
    if (transition) {
      const hit = transition.questions?.[0];
      if (hit) {
        const nextQuadrant = transition.quadrant || hit.quadrant;
        setDoc(d);
        setQuadrantCursor(d.scope.indexOf(nextQuadrant));
        setCurrent(null);
        setPhase('question');
        nadika('Completed ' + transition.completed_quadrant + ' after three normal questions. Automatically moved to ' + nextQuadrant + '.', {
          type: 'suggested', quadrant: nextQuadrant, autoMovedFrom: transition.completed_quadrant,
          items: [{ id: hit.id, text: hit.question || hit.text, quadrant: nextQuadrant, rag: true, deep: false }]
        });
      } else {
        setDoc(d);
        if (transition.status === 'COVERAGE_COMPLETE' || transition.assessment_complete) {
          promptEndSession(transition.completed_quadrant);
        } else {
          setPhase('retrieval_failure');
          nadika('The prior quadrant is complete, but no eligible question was retrieved for ' + transition.quadrant + '. Choose a recovery action.', {
            type: 'retrieval_failure', quadrant: transition.quadrant,
            completedQuadrant: transition.completed_quadrant,
            status: transition.retrieval_status || transition.quadrant_status || 'RETRIEVAL_FAILED'
          });
        }
      }
      return;
    }
    if (
      phase === 'deep' ||
      (current?.quadrant && current?.deep)
    ) {
      deepDiveNext(
        d,
        current.quadrant
      );
      return;
    }

    if (current?.opening) {
      const nextIndex =
        openingQuestions.findIndex(
          (q) =>
            !(d.askedQuestionIds || []).includes(
              q.id
            )
        );

      if (nextIndex >= 0) {
        const next =
          openingQuestions[nextIndex];

        setCurrent(next);
        setPhase('opening');

        nadika(null, {
          type: 'opening',
          question: next,
          index: nextIndex,
          total: openingQuestions.length
        });

        return;
      }

      setCurrent(null);
      setOpeningQuestions([]);
      suggestQuadrants(d);
      return;
    }

    if (
      d.scope?.length &&
      current?.quadrant
    ) {
      askNext(
        d,
        quadrantQs(
          d,
          current.quadrant
        )
      );

      return;
    }

    if (!d.openingSetId) {
      setPhase('opening');
      return;
    }

    suggestQuadrants(d);
  };

  // Deep dive.

  const deepDiveNext = (d, quadrant) => {
    afterQuadrant(d, quadrant, true);
  };
  // Adaptive quadrant recommendation.
  //
  // DO NOT hard-code quadrants here.
  // The engine remains the source of truth for recommendation order.
  // -------------------------------------------------------------------------

  const suggestQuadrants = (d) =>
    run(
      'Suggesting assessment areas',
      async () => {
        const fields =
          onboarding?.fields || {};

        const concerns = [
          ...(Array.isArray(
            fields.concerns
          )
            ? fields.concerns
            : []
          ).filter(
            (c) => c !== 'Other'
          ),
          fields.otherConcern
        ].filter(Boolean);

        const demographicSignals = [
          fields.age
            ? `Age: ${fields.age}`
            : '',

          fields.gender
            ? `Gender: ${fields.gender}`
            : '',

          fields.occupation
            ? `Occupation: ${
                fields.occupation ===
                'Other'
                  ? fields.otherOccupation
                  : fields.occupation
              }`
            : '',

          fields.maritalStatus
            ? `Marital status: ${fields.maritalStatus}`
            : '',

          fields.city
            ? `City: ${fields.city}`
            : '',

          concerns.length
            ? `MAIN CONCERNS: ${concerns.join(', ')}`
            : '',

          fields.sleepPattern
            ? `SLEEP PATTERN: ${fields.sleepPattern}`
            : '',

          fields.additionalInfo
            ? `PATIENT FORM NOTES: ${fields.additionalInfo}`
            : ''
        ].filter(Boolean);

        const baselineSignals =
          d?.baseline
            ? [
                `Baseline stress: ${d.baseline.stress}/10`,
                `Baseline anxiety: ${d.baseline.anxiety}/10`,
                `Baseline mood: ${d.baseline.mood}/10`,
                `Baseline energy: ${d.baseline.energy}/10`,
                `Baseline sleep quality: ${d.baseline.sleep_quality || 'not recorded'}`
              ]
            : [];

        const therapistContext =
          d?.therapistContext
            ? [
                `THERAPIST CONTEXT: ${d.therapistContext}`
              ]
            : [];

        const summary = [
          'PATIENT ASSESSMENT INFORMATION',
          '',
          ...demographicSignals,
          '',
          ...baselineSignals,
          '',
          ...therapistContext
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 12000);

        const r =
          await anahat
            .analyseQuadrants(
              d.id,
              summary
            )
            .catch(
              (error) => {
                logAnalysisFallback(
                  'quadrant recommendation',
                  error
                );

                return {
                  recommended: []
                };
              }
            );

        // Preserve engine recommendation order.
        const rec =
          (r.recommended || [])
            .map(
              (x) =>
                x?.quadrant
            )
            .filter(Boolean);

        // Therapist explicitly chooses scope.
        setPickedQ([]);
        setPhase('scope');

        if (rec.length) {
          nadika(
            `Based on the patient's concerns, form information, baseline, therapist context, and responses so far, I suggest exploring: ${rec.join(', ')}. Select the assessment area(s) to continue — you can add more later.`,
            {
              type: 'scope',
              recommended: rec
            }
          );
        } else {
          nadika(
            'I could not identify strong assessment areas from the available patient information. Please select the areas that are relevant to the patient.',
            {
              type: 'scope',
              recommended: []
            }
          );
        }
      }
    );

  const applyScope = () =>
    run(
      'Loading questions',
      async () => {
        const add =
          pickedQ.filter(
            (q) =>
              !(doc.scope || []).includes(q)
          );

        if (!add.length) {
          throw new Error(
            'Select at least one new area.'
          );
        }

        const r =
          await anahat.selectQuadrants(
            doc.id,
            add
          );

        const d = r.assessment;

        setDoc(d);

        me(
          `Assessment areas: ${add.join(', ')}`
        );

        const idx =
          d.scope.indexOf(add[0]);

        setQuadrantCursor(idx);

        const qs =
          quadrantQs(
            d,
            add[0]
          );

        nadika('Starting question retrieval for ' + add[0] + '.');
        askNext(d, qs);
      }
    );

  const decision = (
    choice,
    suggestion,
    requestedQuadrant,
    addNewQuadrant = false
  ) =>
    run(
      'One moment',
      async () => {
        const d = doc;
        const cur =
          requestedQuadrant || d.scope[quadrantCursor];

        if (choice === 'retry') {
          afterQuadrant(d, cur);
          return;
        }

        if (choice === 'deep') {
          console.info('DEEP DIVE REQUESTED | CURRENT QUADRANT:', cur);
          me(
            `Deep dive in ${cur}`
          );

          deepDiveNext(
            d,
            cur
          );

          return;
        }

        if (choice === 'next') {
          if (addNewQuadrant) {
            await suggestQuadrants(d);
            return;
          }
          me(
            'Move to next selected quadrant'
          );

          const next = await anahat.completeQuadrant(d.id, cur);
          const hit = next.questions?.[0];
          if (!hit) {
            if (next.status === 'COVERAGE_COMPLETE' || next.assessment_complete) {
              setDoc(d);
              const available = (ref?.quadrants || []).some((quadrant) => !(d.scope || []).includes(quadrant));
              if (!available) {
                setPhase('decision');
                nadika('No additional quadrant is available to add. End the session or deep dive into ' + cur + '.', {
                  type: 'decision', awaitingTherapistDecision: true, noMoreQuadrants: true, quadrant: cur,
                  assessmentStatus: 'awaiting_therapist_decision'
                });
                return;
              }
              await suggestQuadrants(d);
              return;
            }
            setPhase('retrieval_failure');
            nadika('Question retrieval failed for the next selected quadrant. It remains incomplete.', {
              type: 'retrieval_failure', quadrant: next.quadrant || next.completed_quadrant,
              status: next.retrieval_status || next.quadrant_status || 'RETRIEVAL_FAILED'
            });
            return;
          }
          const nextQuadrant = next.quadrant || hit.quadrant;
          console.info('MOVING FROM QUADRANT:', cur);
          console.info('NEXT QUADRANT:', nextQuadrant);
          console.info('RESET QUESTION COUNT');
          console.info('RAG RETRIEVAL FOR:', nextQuadrant);
          setQuadrantCursor(d.scope.indexOf(nextQuadrant));
          setCurrent(null);
          setPhase('question');
          nadika('Moving to ' + nextQuadrant + '.', {
            type: 'suggested',
            quadrant: nextQuadrant,
            items: [{ id: hit.id, text: hit.question || hit.text, quadrant: nextQuadrant, rag: true, deep: false }]
          });
          return;
        }
        if (
          choice === 'accept' &&
          suggestion
        ) {
          me(
            `Add ${suggestion}`
          );

          const r =
            await anahat.selectQuadrants(
              d.id,
              [suggestion]
            );

          const nd =
            r.assessment;

          setDoc(nd);

          const idx =
            nd.scope.indexOf(
              suggestion
            );

          setQuadrantCursor(
            idx
          );

          nadika(
            `Starting question retrieval for ${suggestion}.`
          );

          askNext(
            nd,
            quadrantQs(
              nd,
              suggestion
            )
          );

          return;
        }

        if (
          choice === 'reject'
        ) {
          me('Not now');

          nadika(
            'Okay — choose one of the actions.',
            {
              type: 'decision'
            }
          );

          return;
        }

        if (choice === 'end') {
          me(
            'End Session'
          );

          await endAssessment();
        }
      }
    );

  const endAssessment = async () => {
    setPhase('ended');

    const d = doc;

    try {
      const rec = await anahat.endSession(d.id);

      const chakra =
        (
          rec.final_result?.chakras || rec.chakra_report?.results || []
        ).filter(
          (r) => r.status
        );

      const ragas =
        rec.raga?.candidates ||
        [];

      const activities =
        rec.activities || [];

      setResults({
        chakra,
        ragas,
        activities
      });

      const imb =
        chakra.filter(
          (r) =>
            /IMBALANCED/i.test(
              r.status
            )
        );

      nadika(
        imb.length
          ? `Assessment complete. ${imb.length} chakra${
              imb.length === 1
                ? ''
                : 's'
            } show${
              imb.length === 1
                ? 's'
                : ''
            } an imbalance. These findings and raag suggestions are for you only.`
          : 'No chakra imbalance identified from the confirmed evidence. No chakra-based Raag inference is available.',
        {
          type: 'results',
          chakra,
          ragas,
          activities
        }
      );
    } catch (e) {
      setPhase('decision');
      setError(e.message);
    }
  };

  const sufficiency = (
    choice
  ) =>
    run(
      'One moment',
      async () => {
        if (
          choice === 'continue'
        ) {
          me(
            'Continue the assessment'
          );

          setPhase(
            'decision'
          );

          nadika(
            'Choose where to continue.',
            {
              type: 'decision'
            }
          );

          return;
        }

        me(
          'Stop and score'
        );

        await endAssessment(
          true
        );
      }
    );

  const draftRx = () =>
    run(
      'Drafting prescription',
      async () => {
        const p =
          await anahat.draftPrescription(
            doc.id
          );

        const d =
          await anahat.get(
            doc.id
          );

        setDoc(d);

        setRx({
          ragas:
            p.raga_candidates ||
            [],
          activities:
            p.activities ||
            [],
          note: ''
        });

        nadika(
          'Prescription draft. Untick anything you do not want prescribed, add a note, then approve.',
          {
            type: 'prescription',
            draft: p
          }
        );

        setPhase(
          'prescription'
        );
      }
    );

  const approveRx = () =>
    run(
      'Approving',
      async () => {
        const d =
          doc.prescriptionDraft
            ? doc
            : await anahat.get(
                doc.id
              );

        const draft =
          d.prescriptionDraft ||
          {};

        const edited =
          rx.ragas.length !==
            (
              draft.raga_candidates ||
              []
            ).length ||
          rx.activities.length !==
            (
              draft.activities ||
              []
            ).length;

        await anahat.reviewPrescription(
          d.id,
          {
            decision: edited
              ? 'EDIT'
              : 'APPROVE',
            note: rx.note,
            edits: edited
              ? {
                  raga_candidates:
                    rx.ragas,
                  activities:
                    rx.activities
                }
              : {}
          }
        );

        const fin =
          await anahat.finalize(
            d.id
          );

        setDoc(
          fin.assessment
        );

        me('Approved');

        nadika(
          'Prescription approved and saved. The report is in the patient’s Reports, the activities in their Daily Activities, and they have been notified.',
          {
            type: 'final',
            report:
              fin.assessment
                .finalReport,
            prescriptionId:
              fin.assessment
                .prescriptionId
          }
        );

        setPhase('done');
      }
    );

  const rejectRx = () =>
    run(
      'Recording',
      async () => {
        await anahat.reviewPrescription(
          doc.id,
          {
            decision: 'REJECT',
            note: rx?.note || ''
          }
        );

        me('Rejected');

        nadika(
          'Prescription rejected. You can still write the report from your own notes.',
          {
            type: 'results',
            chakra:
              results?.chakra ||
              [],
            ragas: [],
            activities: [],
            rejected: true
          }
        );

        setPhase(
          'ended'
        );
      }
    );

  const goReport = () =>
    navigate(
      `/therapist/report/${patientId}?assessment=${doc.id}${
        appointmentId
          ? `&appointment=${appointmentId}`
          : ''
      }`
    );

  const endSession = () =>
    run(
      'Closing session',
      async () => {
        if (appointmentId) {
          await updateAppointmentStatus(
            appointmentId,
            {
              status:
                'completed'
            }
          ).catch(
            () => {}
          );
        }

        nadika(
          'Session marked as attended. You can generate the report now or later from the patient record.'
        );

        setPhase('done');
      }
    );

  const onSend = () => {
    const text =
      input.trim();

    if (!text || busy)
      return;

    if (!doc?.id) {
      setError(
        'The assessment is not connected. Retry session setup before sending.'
      );
      return;
    }

    setInput('');

    if (
      phase === 'context'
    ) {
      return submitContext(
        text
      );
    }

    if (phase === 'deep') {
      if (
        /^done\.?$/i.test(
          text
        )
      ) {
        me('done');
        afterQuadrant(doc);
        return;
      }

      return submitAnswer(
        text
      );
    }

    if (
      phase === 'question' &&
      current
    ) {
      return submitAnswer(
        text
      );
    }

    if (phase === 'safety') {
      me(text);

      nadika(
        'Thank you. Continue only if it is safe to do so. I will now suggest assessment areas.',
        {
          type: 'decision'
        }
      );

      if (doc?.scope?.length) {
        afterQuadrant(doc);
      } else {
        suggestQuadrants(doc);
      }

      return;
    }

    chatFreeform(text);
  };

  const asked = new Set(
    doc?.askedQuestionIds || []
  );

  const placeholder = {
    context:
      'Write your context in the card above, or ask Nadika something…',

    question:
      current
        ? 'Type the patient’s answer to Nadika.ai…'
        : 'Pick a suggested question above, or ask Nadika anything…',

    deep:
      'Type the patient’s answer, "done", or ask Nadika anything…',

    safety:
      'Describe the action you took…',

    ended:
      'Ask Nadika anything, or use the options above…',

    done:
      'Session closed',

    loading:
      'Opening…'
  }[phase] ||
    'Ask Nadika anything, or use the options above…';

  const inputDisabled =
    !!busy ||
    ['done', 'loading'].includes(
      phase
    );

  const jumpToMessage = (
    id
  ) => {
    setHistoryOpen(false);

    document
      .getElementById(
        `nadika-message-${id}`
      )
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
  };

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-[#F7F6F2] text-slate-900">

      {guideOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assessment-guide-title"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">

            <p className="text-[11px] font-bold uppercase tracking-widest text-[#d65b38]">
              Nadika.ai guide · {guideStep + 1} of 3
            </p>

            <h2
              id="assessment-guide-title"
              className="mt-2 text-xl font-bold text-slate-900"
            >
              {
                [
                  'Ask the current question',
                  'Record the response',
                  'Review progress'
                ][guideStep]
              }
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {
                [
                  'Nadika presents one assessment question at a time. Read that prompt aloud to the patient.',
                  'Type the patient’s response in the answer field or chat composer and submit it. The next question appears after the response is recorded.',
                  'The header shows answered questions and assessment areas. Review any indicators Nadika flags, or use End Session when the assessment should stop.'
                ][guideStep]
              }
            </p>

            <div className="mt-6 flex items-center justify-between">

              <button
                type="button"
                onClick={closeGuide}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Skip guide
              </button>

              <div className="flex gap-2">

                {guideStep > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setGuideStep(
                        (step) =>
                          step - 1
                      )
                    }
                    className="rounded-md border border-black/10 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Back
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    guideStep === 2
                      ? closeGuide()
                      : setGuideStep(
                          (step) =>
                            step + 1
                        )
                  }
                  className="rounded-md bg-[#e85d35] px-4 py-2 text-xs font-semibold text-white"
                >
                  {guideStep === 2
                    ? 'Start assessment'
                    : 'Next'}
                </button>

              </div>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <button
          type="button"
          aria-label="Close conversation panel"
          onClick={() =>
            setHistoryOpen(false)
          }
          className="fixed inset-0 z-[125] bg-slate-950/30 lg:hidden"
        />
      )}

      <aside
        className={`${
          historyOpen
            ? 'fixed inset-y-0 left-0 z-[130] flex w-72 max-w-[85vw] shadow-2xl'
            : 'hidden'
        } lg:static lg:z-auto lg:flex lg:w-[292px] lg:max-w-none lg:shadow-none shrink-0 flex-col border-r border-black/[0.07] bg-white`}
      >

        <div className="flex h-[76px] shrink-0 items-center gap-3 border-b border-black/[0.06] px-5">

          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCE9DF] text-[#D65B38]">
            <Sparkle className="h-5 w-5" />
          </span>

          <div>
            <p className="text-sm font-bold tracking-wide text-slate-900">
              Nadika.ai
            </p>

            <p className="text-[11px] text-slate-500">
              ANAHAT assessment
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setHistoryOpen(false)
            }
            aria-label="Close panel"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            ×
          </button>

        </div>

        <div className="border-b border-black/[0.06] p-5">

          <button
            type="button"
            onClick={() =>
              navigate('/therapist')
            }
            className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <span aria-hidden="true">
              ←
            </span>
            Sessions
          </button>

          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Patient
          </p>

          <p className="mt-1 truncate text-base font-semibold text-slate-900">
            {patientName}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Assessment progress
            </span>

            <span className="text-xs font-semibold text-slate-700">
              {
                (
                  doc?.askedQuestionIds ||
                  []
                ).length
              } answered
            </span>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#E87945] transition-all"
              style={{
                width: `${Math.min(
                  100,
                  (
                    (
                      doc?.askedQuestionIds ||
                      []
                    ).length /
                    Math.max(
                      1,
                      (
                        doc?.askedQuestionIds ||
                        []
                      ).length + 4
                    )
                  ) * 100
                )}%`
              }}
            />
          </div>

          <p className="mt-2 text-[11px] capitalize text-slate-400">
            {phase.replaceAll('_', ' ')}
            {doc?.scope?.length
              ? ` · ${doc.scope.length} areas`
              : ''}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-4">

          <p className="px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Conversation
          </p>

          <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">

            {chat.length === 0 && (
              <p className="px-2 py-3 text-xs text-slate-400">
                Your assessment conversation will appear here.
              </p>
            )}

            {chat
              .slice(-40)
              .map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() =>
                    jumpToMessage(
                      entry.id
                    )
                  }
                  className="w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-[#F7F6F2]"
                >
                  <span className="block text-[10px] font-semibold text-slate-400">
                    {entry.role ===
                    'therapist'
                      ? 'You'
                      : 'Nadika'}{' '}
                    · {ts(entry.at)}
                  </span>

                  <span className="mt-0.5 block truncate text-xs text-slate-700">
                    {entry.text ||
                      entry.card?.type?.replaceAll(
                        '_',
                        ' '
                      ) ||
                      'Assessment step'}
                  </span>
                </button>
              ))}
          </div>
        </div>

        <div className="border-t border-black/[0.06] p-4">

          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Patient documents
            </p>

            <span className="text-[10px] text-slate-400">
              {attachments.length}
            </span>
          </div>

          {attachments.length === 0 ? (
            <p className="text-xs text-slate-400">
              No documents uploaded.
            </p>
          ) : (
            <div className="max-h-24 space-y-1 overflow-y-auto">
              {attachments
                .slice(0, 5)
                .map((file) => (
                  <a
                    key={
                      file.id ||
                      file.fileId ||
                      file.name
                    }
                    href={
                      file.url ||
                      '#'
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-slate-600 hover:text-[#D65B38]"
                  >
                    {file.name ||
                      file.filename ||
                      'Patient document'}
                  </a>
                ))}
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">

        <header className="flex h-[76px] shrink-0 items-center justify-between gap-3 border-b border-black/[0.07] bg-white px-4 sm:px-6 lg:px-8">

          <div className="flex min-w-0 items-center gap-3">

            <button
              type="button"
              onClick={() =>
                setHistoryOpen(true)
              }
              aria-label="Open conversation panel"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              <PanelIcon className="h-5 w-5" />
            </button>

            <div className="min-w-0">

              <p className="truncate text-sm font-semibold text-slate-900">
                Assessment with {patientName}
              </p>

              <p className="mt-0.5 text-xs text-slate-500">
                {(doc?.scope || []).length} areas ·{' '}
                {(doc?.evidence || []).length}{' '}
                indicators recorded
              </p>

            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">

            <span
              className={`hidden items-center gap-1.5 text-xs sm:flex ${
                engineUp
                  ? 'text-emerald-700'
                  : engineUp === false
                    ? 'text-amber-700'
                    : 'text-slate-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  engineUp
                    ? 'bg-emerald-500'
                    : engineUp === false
                      ? 'bg-amber-500'
                      : 'bg-slate-300'
                }`}
              />

              {engineUp
                ? 'AI online'
                : engineUp === false
                  ? 'AI unavailable'
                  : 'Connecting'}
            </span>

          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col">

          <div className="flex-1 overflow-y-auto px-4 py-7 sm:px-6 lg:px-8">

            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">

              {chat.map((m) => (
                <Message
                  key={m.id}
                  id={`nadika-message-${m.id}`}
                  m={m}
                  user={user}
                >
                  {m.card && (
                    <CardView
                      card={m.card}
                      asked={asked}
                      phase={phase}
                      current={current}
                      doc={doc}
                      reference={ref}
                      baseline={baseline}
                      setBaseline={setBaseline}
                      submitBaseline={
                        submitBaseline
                      }
                      contextText={
                        contextText
                      }
                      setContextText={
                        setContextText
                      }
                      submitContext={
                        submitContext
                      }
                      pickedQ={pickedQ}
                      setPickedQ={
                        setPickedQ
                      }
                      applyScope={
                        applyScope
                      }
                      decision={
                        decision
                      }
                      sufficiency={
                        sufficiency
                      }
                      rx={rx}
                      setRx={setRx}
                      draftRx={draftRx}
                      approveRx={
                        approveRx
                      }
                      rejectRx={
                        rejectRx
                      }
                      goReport={
                        goReport
                      }
                      endSession={
                        endSession
                      }
                      busy={busy}
                      selectSuggested={
                        selectSuggested
                      }
                      inlineAnswer={
                        inlineAnswer
                      }
                      setInlineAnswer={
                        setInlineAnswer
                      }
                      submitInlineAnswer={
                        submitInlineAnswer
                      }
                      suggestQuadrants={() =>
                        suggestQuadrants(
                          doc
                        )
                      }
                    />
                  )}
                </Message>
              ))}

              {aiPending && (
                <div className="flex items-center gap-2 pl-12 text-xs font-medium text-slate-500">
                  <span className="nadika-thinking-dot" />
                  Nadika is thinking
                </div>
              )}

              {busy &&
                !aiPending && (
                  <p className="pl-12 text-xs text-slate-400">
                    {busy}…
                  </p>
                )}

              {error && (
                <p className="pl-12 text-xs text-red-600">
                  {error}
                </p>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-black/[0.07] bg-white px-4 py-4 sm:px-6 lg:px-8">

            <div className="mx-auto max-w-4xl">

              {phase === 'error' &&
                !doc && (
                  <div className="mb-3 flex items-center justify-between gap-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span>
                      Session setup failed. Retry to connect before sending.
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setBootRetry(
                          (retry) =>
                            retry + 1
                        )
                      }
                      className="shrink-0 font-bold underline"
                    >
                      Retry setup
                    </button>
                  </div>
                )}

              {aiPending && (
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      activeAIRequest.current?.abort()
                    }
                    aria-label="Stop Nadika response"
                    title="Stop response"
                    className="flex h-8 items-center gap-2 rounded-md bg-slate-800 px-3 text-xs font-semibold text-white"
                  >
                    <StopIcon className="h-3.5 w-3.5" />
                    Stop
                  </button>
                </div>
              )}

              <SessionChatComposer
                value={input}
                onChange={setInput}
                onSend={onSend}
                onUpload={uploadAttachment}
                disabled={inputDisabled}
                placeholder={placeholder}
              />

              <p className="mt-2 text-center text-[10px] text-slate-400">
                Responses are recorded in the assessment transcript.
              </p>

            </div>
          </div>
        </section>
      </main>

      <style>{`
        @keyframes nadika-think {
          0%, 100% {
            opacity: .35;
            transform: scale(.82);
          }

          50% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .nadika-thinking-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #E87945;
          animation: nadika-think 1.1s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .nadika-thinking-dot {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function Message({
  id,
  m,
  user,
  children
}) {
  const isMe =
    m.role === 'therapist';

  return (
    <div
      id={id}
      className={`flex scroll-mt-8 gap-3 ${
        isMe
          ? 'justify-end'
          : ''
      }`}
    >

      {!isMe && (
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
          style={{
            background: TEAL
          }}
        >
          <Sparkle className="w-4 h-4" />
        </span>
      )}

      <div
        className={`max-w-[78%] ${
          isMe
            ? 'items-end'
            : ''
        } flex flex-col gap-2`}
      >

        {m.text && (
          <div
            className="rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line"
            style={{
              background: isMe
                ? TEAL_SOFT
                : CREAM,
              color: '#1e293b'
            }}
          >
            {m.text}
          </div>
        )}

        {children}

        <span className="text-[10px] text-slate-400 px-1">
          {ts(m.at)}
        </span>

      </div>

      {isMe && (
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-slate-700 shrink-0 bg-slate-200">
          {initialsOf(user?.name)}
        </span>
      )}
    </div>
  );
}

function CardView({
  card,
  asked,
  phase,
  current,
  doc,
  reference,
  baseline,
  setBaseline,
  submitBaseline,
  contextText,
  setContextText,
  submitContext,
  pickedQ,
  setPickedQ,
  applyScope,
  decision,
  sufficiency,
  rx,
  setRx,
  draftRx,
  approveRx,
  rejectRx,
  goReport,
  endSession,
  busy,
  selectSuggested,
  inlineAnswer,
  setInlineAnswer,
  submitInlineAnswer,
  suggestQuadrants
}) {
  const box =
    'rounded-2xl border border-black/5 bg-white p-4 shadow-sm';

  if (card.type === 'retrieval_failure') {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-amber-800">
          {card.quadrant} remains incomplete ({card.status}). No question was available to ask.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Opt on={phase === 'retrieval_failure'} onClick={() => decision('retry')}>
            Retry question retrieval
          </Opt>
          <Opt on={phase === 'retrieval_failure'} onClick={() => decision('next', null, card.completedQuadrant || card.quadrant, true)}>
            Move to / add a new quadrant
          </Opt>
          <Opt on={phase === 'retrieval_failure'} primary onClick={() => decision('end')}>
            End Session
          </Opt>
          {card.completedQuadrant && <Opt on={phase === 'retrieval_failure'} onClick={() => decision('deep', null, card.completedQuadrant)}>
            Deep dive into {card.completedQuadrant}
          </Opt>}
          {!card.completedQuadrant && <Opt on={phase === 'retrieval_failure'} onClick={suggestQuadrants}>
            Review assessment areas
          </Opt>}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Suggested questions
  // -------------------------------------------------------------------------

  if (card.type === 'suggested') {
    const items =
      card.items || [];

    const selected =
      current &&
      items.some(
        (q) =>
          q.id === current.id &&
          !asked.has(q.id)
      )
        ? current
        : null;

    return (
      <div className={box}>

        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
          <Sparkle
            className="w-3.5 h-3.5"
            style={{
              color: TEAL
            }}
          />

          {card.deep
            ? `Deep dive · ${card.quadrant} — suggested next questions`
            : `${card.quadrant} — suggested questions`}
        </p>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">

          {items.map((q) => {
            const done =
              asked.has(q.id);

            const on =
              selected?.id === q.id;

            return (
              <button
                key={q.id}
                type="button"
                disabled={
                  done ||
                  phase !==
                    'question'
                }
                onClick={() =>
                  selectSuggested(q)
                }
                className="shrink-0 w-64 text-left rounded-xl border px-3.5 py-3 text-sm disabled:opacity-50 transition-all"
                style={{
                  borderColor: on
                    ? TEAL
                    : 'rgba(0,0,0,0.08)',
                  background: on
                    ? TEAL_SOFT
                    : '#fff'
                }}
              >

                {q.hint && (
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest mb-1"
                    style={{
                      color: TEAL
                    }}
                  >
                    {q.hint}
                  </p>
                )}

                <p className="font-semibold text-slate-800 leading-snug">
                  {q.text}
                </p>

              </button>
            );
          })}

        </div>

        {selected && (
          <div className="mt-3 pt-3 border-t border-black/5">

            <p className="text-[11px] text-slate-500 mb-1.5">
              Ask this aloud, then record the patient's answer:
            </p>

            <textarea
              rows={2}
              value={inlineAnswer}
              onChange={(e) =>
                setInlineAnswer(
                  e.target.value
                )
              }
              placeholder="Patient's answer…"
              className="w-full px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none"
            />

            <button
              onClick={
                submitInlineAnswer
              }
              disabled={
                !!busy ||
                !inlineAnswer.trim()
              }
              className="mt-2 px-5 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40"
              style={{
                background: TEAL
              }}
            >
              Record answer
            </button>

          </div>
        )}

        {(current?.deep || card.autoMovedFrom) && <div className="mt-3 pt-3 border-t border-black/5 flex flex-wrap gap-2">

          <Opt
            on={
              phase ===
              'question'
            }
            onClick={() => decision('next', null, card.autoMovedFrom || card.quadrant, Boolean(card.autoMovedFrom))}
          >
            Move to / add a new quadrant
          </Opt>

          <Opt
            on={
              phase ===
              'question'
            }
            primary
            onClick={() => decision('end')}
          >
            End session
          </Opt>

          {card.autoMovedFrom && <Opt
            on={phase === 'question'}
            onClick={() => decision('deep', null, card.autoMovedFrom)}
          >
            Deep dive into {card.autoMovedFrom}
          </Opt>}

        </div>}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Therapist context
  // -------------------------------------------------------------------------

  if (card.type === 'context') {
    const done =
      !!doc?.therapistContext;

    return (
      <div className={box}>

        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Therapist context
        </p>

        {done ? (
          <p className="text-sm text-emerald-700 font-semibold">
            ✓ Saved
          </p>
        ) : (
          <>
            <textarea
              rows={3}
              value={contextText}
              onChange={(e) =>
                setContextText(
                  e.target.value
                )
              }
              placeholder="How the patient presents, what you already know…"
              className="w-full px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none"
            />

            <button
              onClick={() =>
                submitContext(
                  contextText
                )
              }
              disabled={
                !!busy ||
                !contextText.trim()
              }
              className="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
              style={{
                background: TEAL
              }}
            >
              Save
            </button>
          </>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Sufficiency
  // -------------------------------------------------------------------------

  if (card.type === 'sufficiency') {
    const on =
      phase ===
      'sufficiency';

    return (
      <div
        className={`${box} flex flex-wrap gap-2`}
      >
        <Opt
          on={on}
          onClick={() =>
            sufficiency(
              'continue'
            )
          }
        >
          Continue assessment
        </Opt>

        <Opt
          on={on}
          primary
          onClick={() =>
            sufficiency(
              'stop'
            )
          }
        >
          Stop and score
        </Opt>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Prescription
  // -------------------------------------------------------------------------

  if (card.type === 'prescription') {
    const d =
      card.draft || {};

    const on =
      phase ===
        'prescription' &&
      rx;

    const nameR = (r) =>
      r.raga ||
      r.name ||
      r.raga_name ||
      JSON.stringify(r);

    const nameA = (a) =>
      a.activity ||
      a.name ||
      a.title ||
      a.text ||
      JSON.stringify(a);

    const toggle = (
      key,
      it,
      name
    ) =>
      setRx((x) => ({
        ...x,
        [key]: x[key].some(
          (p) =>
            name(p) ===
            name(it)
        )
          ? x[key].filter(
              (p) =>
                name(p) !==
                name(it)
            )
          : [
              ...x[key],
              it
            ]
      }));

    return (
      <div className={box}>

        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Prescription review
        </p>
        <p className="text-xs font-bold text-slate-700 mb-1">
          Chakra imbalances
        </p>
        {rxImbalances(d).length === 0 ? (
          <p className="text-xs text-slate-500 mb-2">
            No chakra passed the imbalance gate.
          </p>
        ) : (
          <ul className="mb-2 space-y-1">
            {rxImbalances(d).map((c) => (
              <li
                key={c.chakra}
                className="flex items-center gap-2 text-sm"
              >
                <ChakraIcon
                  name={c.chakra}
                  size={22}
                />
                <span className="font-semibold text-slate-800">
                  {c.chakra}
                </span>
                <span className="text-xs text-slate-500">
                  {c.direction || 'direction unresolved'}
                  {c.severity ? ` · ${c.severity}` : ''}
                  {c.evidence?.length
                    ? ` · ${[...new Set(c.evidence)].join(', ')}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs font-bold text-slate-700 mb-1">
          Raags
        </p>
        {(d.raga_candidates || []).length === 0 ? (
          <p className="text-xs text-slate-500 mb-2">
            {d.raga_status === 'NO_APPROVED_RAGA_MAPPING'
              ? 'None proposed: no clinically approved chakra-to-raag mapping in the knowledge base yet.'
              : 'None proposed.'}
          </p>
        ) : (
          (d.raga_candidates || []).map(
            (r, i) => (
              <label
                key={i}
                className="flex items-center gap-2 text-sm py-0.5"
              >
                <input
                  type="checkbox"
                  disabled={!on}
                  checked={
                    !!rx?.ragas.some(
                      (p) =>
                        nameR(p) ===
                        nameR(r)
                    )
                  }
                  onChange={() =>
                    toggle(
                      'ragas',
                      r,
                      nameR
                    )
                  }
                  className="accent-[#0F8594]"
                />
                {nameR(r)}
              </label>
            )
          )
        )}

        <p className="text-xs font-bold text-slate-700 mt-2 mb-1">
          Activities
        </p>

        {(d.activities || []).length === 0 ? (
          <p className="text-xs text-slate-500 mb-2">
            None proposed.
          </p>
        ) : (
          (d.activities || []).map(
            (a, i) => (
              <label
                key={i}
                className="flex items-center gap-2 text-sm py-0.5"
              >
                <input
                  type="checkbox"
                  disabled={!on}
                  checked={
                    !!rx?.activities.some(
                      (p) =>
                        nameA(p) ===
                        nameA(a)
                    )
                  }
                  onChange={() =>
                    toggle(
                      'activities',
                      a,
                      nameA
                    )
                  }
                  className="accent-[#0F8594]"
                />
                {nameA(a)}
              </label>
            )
          )
        )}

        {on && (
          <textarea
            rows={2}
            value={rx.note}
            onChange={(e) =>
              setRx((x) => ({
                ...x,
                note: e.target.value
              }))
            }
            placeholder="Note for the patient (optional)"
            className="mt-3 w-full px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none"
          />
        )}

        <div className="flex gap-2 mt-3">

          <Opt
            on={on}
            primary
            onClick={approveRx}
          >
            Approve &amp; finalise
          </Opt>

          <Opt
            on={on}
            onClick={rejectRx}
          >
            Reject
          </Opt>

        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Final
  // -------------------------------------------------------------------------

  if (card.type === 'final') {
    const rep =
      card.report || {};

    return (
      <div className={box}>

        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-2">
          Final report saved
        </p>

        <p className="text-sm text-slate-700">
          Scope:{' '}
          {(rep.coverage?.scope || []).join(', ') ||
            '—'}{' '}
          ·{' '}
          {rep.coverage?.responses ||
            0}{' '}
          responses ·{' '}
          {rep.coverage?.evidenceUnits ||
            0}{' '}
          evidence units · Prescription{' '}
          {card.prescriptionId
            ? `#${String(
                card.prescriptionId
              ).slice(-6)}`
            : ''}
        </p>

        <div className="flex flex-wrap gap-2 mt-3">

          <button
            onClick={goReport}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{
              background: TEAL
            }}
          >
            Open report (PDF)
          </button>

          <button
            onClick={endSession}
            disabled={!!busy}
            className="px-5 py-2.5 rounded-xl text-xs font-bold border"
            style={{
              borderColor: TEAL,
              color: TEAL
            }}
          >
            Mark session attended
          </button>

        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Baseline
  // -------------------------------------------------------------------------

  if (card.type === 'baseline') {
    const done =
      !!doc?.baseline;

    return (
      <div className={box}>

        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">
          Baseline (1 = lowest, 10 = highest)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">

          {[
            'stress',
            'anxiety',
            'mood',
            'energy'
          ].map((k) => {
            const currentValue =
              done
                ? doc.baseline[k]
                : baseline[k];

            return (
              <div key={k}>

                <p className="text-xs font-semibold text-slate-600 capitalize mb-1.5">
                  {k}
                </p>

                <div className="flex gap-1 flex-wrap">

                  {Array.from(
                    {
                      length: 10
                    },
                    (_, i) =>
                      i + 1
                  ).map((n) => {
                    const on =
                      currentValue ===
                      n;

                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={done}
                        onClick={() =>
                          setBaseline(
                            (b) => ({
                              ...b,
                              [k]: n
                            })
                          )
                        }
                        className={`w-7 h-7 rounded-lg text-[11px] font-bold border flex items-center justify-center disabled:opacity-70 ${
                          on
                            ? 'text-white'
                            : 'border-black/10 text-slate-600'
                        }`}
                        style={
                          on
                            ? {
                                background:
                                  TEAL,
                                borderColor:
                                  TEAL
                              }
                            : undefined
                        }
                      >
                        {n}
                      </button>
                    );
                  })}

                </div>
              </div>
            );
          })}

        </div>

        <div className="flex flex-wrap gap-2 mb-3">

          {SLEEP.map(
            (s) => {
              const on =
                (done
                  ? doc.baseline
                      .sleep_quality
                  : baseline.sleep_quality) ===
                s;

              return (
                <button
                  key={s}
                  disabled={done}
                  onClick={() =>
                    setBaseline(
                      (b) => ({
                        ...b,
                        sleep_quality:
                          s
                      })
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    on
                      ? 'text-white'
                      : 'border-black/10 text-slate-600'
                  }`}
                  style={
                    on
                      ? {
                          background:
                            TEAL,
                          borderColor:
                            TEAL
                        }
                      : undefined
                  }
                >
                  Sleep: {s}
                </button>
              );
            }
          )}

        </div>

        {!done && (
          <button
            onClick={
              submitBaseline
            }
            disabled={!!busy}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{
              background: TEAL
            }}
          >
            Submit baseline
          </button>
        )}

        {done && (
          <p className="text-xs text-emerald-700 font-semibold">
            ✓ Baseline recorded
          </p>
        )}

      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Opening question
  // -------------------------------------------------------------------------

  if (card.type === 'opening') {
    const question =
      card.question;

    const active =
      phase === 'opening' &&
      current?.id ===
        question?.id &&
      !asked.has(
        question?.id
      );

    return (
      <div className={box}>

        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Opening question{' '}
          {card.index + 1} of{' '}
          {card.total}
        </p>

        <p className="text-sm leading-relaxed text-slate-800">
          {question?.text}
        </p>

        {active ? (
          <div className="mt-4 pt-3 border-t border-black/5">

            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Patient response
            </label>

            <textarea
              rows={2}
              value={inlineAnswer}
              onChange={(e) =>
                setInlineAnswer(
                  e.target.value
                )
              }
              placeholder="Record the patient’s answer…"
              className="w-full px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none"
            />

            <button
              onClick={
                submitInlineAnswer
              }
              disabled={
                !!busy ||
                !inlineAnswer.trim()
              }
              className="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
              style={{
                background: TEAL
              }}
            >
              Record answer
            </button>

          </div>
        ) : (
          asked.has(
            question?.id
          ) && (
            <p className="mt-3 text-xs font-semibold text-emerald-700">
              Response recorded in the conversation.
            </p>
          )
        )}

      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Scope / quadrant selection
  // -------------------------------------------------------------------------

  if (card.type === 'scope') {
    const all =
      reference?.quadrants ||
      [];

    const inScope =
      new Set(
        doc?.scope || []
      );

    return (
      <div className={box}>

        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Select assessment area(s)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">

          {all.map((q) => {
            const has =
              inScope.has(q);

            const on =
              pickedQ.includes(q);

            const rec =
              (
                card.recommended ||
                []
              ).includes(q);

            return (
              <label
                key={q}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer"
                style={{
                  borderColor: has
                    ? '#9ED9B4'
                    : on
                      ? TEAL
                      : 'rgba(0,0,0,0.08)',
                  background: has
                    ? '#E6F5EC'
                    : on
                      ? TEAL_SOFT
                      : '#fff'
                }}
              >

                <input
                  type="checkbox"
                  disabled={
                    has ||
                    phase !== 'scope'
                  }
                  checked={
                    has || on
                  }
                  onChange={() =>
                    setPickedQ(
                      (p) =>
                        on
                          ? p.filter(
                              (x) =>
                                x !==
                                q
                            )
                          : [
                              ...p,
                              q
                            ]
                    )
                  }
                  className="accent-[#0F8594]"
                />

                <span
                  className={
                    has
                      ? 'text-emerald-800'
                      : 'text-slate-800'
                  }
                >
                  {q}
                </span>

                {rec &&
                  !has && (
                    <span
                      className="ml-auto text-[10px] font-bold"
                      style={{
                        color: TEAL
                      }}
                    >
                      suggested
                    </span>
                  )}

                {has && (
                  <span className="ml-auto text-[10px] font-bold text-emerald-700">
                    in scope
                  </span>
                )}

              </label>
            );
          })}

        </div>

        {phase === 'scope' && (
          <button
            onClick={
              applyScope
            }
            disabled={
              !!busy ||
              !pickedQ.some(
                (q) =>
                  !inScope.has(q)
              )
            }
            className="mt-3 px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
            style={{
              background: TEAL
            }}
          >
            Continue with selected area(s)
          </button>
        )}

      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Decision
  // -------------------------------------------------------------------------

  if (card.type === 'decision') {
    const active =
      phase ===
      'decision';
    const awaitingTherapist = !!card.awaitingTherapistDecision;

    return (
      <div className={box}>

        <div className="flex flex-wrap gap-2">

          <Opt
            on={active && (awaitingTherapist || card.noNext)}
            primary
            onClick={() => decision('end')}
          >
            End Session
          </Opt>

          <Opt
            on={active && (awaitingTherapist || !card.noNext) && !card.noMoreQuadrants}
            onClick={() => decision('next')}
          >
            Move to / add a new quadrant
          </Opt>

          <Opt
            on={active && (awaitingTherapist || !card.noNext) && !card.deepDiveExhausted}
            onClick={() =>
              decision('deep')
            }
          >
            Deep dive into this quadrant
          </Opt>

        </div>

        {card.suggestion && (
          <div className="mt-3 pt-3 border-t border-black/5 flex items-center justify-between gap-3 flex-wrap text-sm">

            <span>
              <Sparkle
                className="w-3.5 h-3.5 inline mr-1"
                style={{
                  color: TEAL
                }}
              />
              Nadika suggests adding{' '}
              <b>
                {card.suggestion}
              </b>
            </span>

            <span className="flex gap-1.5">

              <Opt
                on={active}
                primary
                onClick={() =>
                  decision(
                    'accept',
                    card.suggestion
                  )
                }
              >
                Accept
              </Opt>

              <Opt
                on={active}
                onClick={() =>
                  decision(
                    'reject'
                  )
                }
              >
                Not now
              </Opt>

            </span>

          </div>
        )}

      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Safety
  // -------------------------------------------------------------------------

  if (card.type === 'safety') {
    return (
      <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-700">

        <p className="font-bold mb-1">
          Follow the safety protocol
        </p>

        <p className="text-xs">
          Signals:{' '}
          {(
            card.safety
              ?.matched_signals ||
            []
          ).join(', ') ||
            '—'}
          . Then describe the action you took in the box below.
        </p>

      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  if (card.type === 'results') {
    const imb =
      (card.chakra || [])
        .filter((r) =>
          /IMBALANCED/i.test(
            r.status
          )
        )
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    return (
      <div className={box}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-2">
          Therapist only · not shown to the patient
        </p>

        {card.empty ? (
          <p className="text-sm text-slate-600">
            No engine evidence — nothing to suggest.
          </p>
        ) : (
          <>
            <p className="text-xs font-bold text-slate-700 mb-2">
              Chakra imbalances
            </p>

            {imb.length === 0 ? (
              <p className="text-xs text-slate-500 mb-3">
                None passed the imbalance gate.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">

                {imb.map((r) => {
                  // Evidence strength = the chakra score (0-1): how strongly the confirmed evidence
                  // supports this imbalance. It is NOT a clinical severity. Confidence shown separately.
                  const severity =
                    Math.round(
                      Math.min(
                        1,
                        Number(r.score || 0)
                      ) * 100
                    );
                  const evidenceList = (r.trace || r.evidence || [])
                    .filter((t) => t.counted)
                    .map((t) => t.term)
                    .filter(Boolean);

                  return (
                    <div
                      key={
                        r.chakra
                      }
                      className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2.5"
                      style={{
                        background:
                          '#FBFAF6'
                      }}
                    >

                      <ChakraIcon
                        name={
                          r.chakra
                        }
                        size={36}
                      />

                      <div className="min-w-0 flex-1">

                        <p className="text-sm font-bold text-slate-800 truncate">
                          {r.chakra}
                        </p>

                        <p className="text-[11px] text-slate-500 mb-1">
                          {r.status}
                          {r.direction
                            ? ` · ${r.direction}`
                            : ''}
                        </p>

                        <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">

                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                severity
                              )}%`,
                              background:
                                severity >=
                                70
                                  ? '#DC2626'
                                  : severity >=
                                      40
                                    ? '#EA580C'
                                    : '#EAB308'
                            }}
                          />

                        </div>

                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Evidence strength{' '}
                          {severity}%
                          {' · '}Confidence{' '}
                          {Math.round(r.confidence_pct || 0)}%
                        </p>
                        {evidenceList.length > 0 && (
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                            Evidence: {[...new Set(evidenceList)].join(', ')}
                          </p>
                        )}

                      </div>
                    </div>
                  );
                })}

              </div>
            )}

            <p className="text-xs font-bold text-slate-700 mb-1">
              Raag recommendations
            </p>

            {(card.ragas || []).length === 0 ? (
              <p className="text-xs text-slate-500 mb-3">
                {imb.length
                  ? 'No raag proposed: the knowledge base has no clinically approved chakra-to-raag mapping yet. Choose raags yourself in the prescription.'
                  : 'No supported chakra → no raag inference.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mb-3">

                {card.ragas.map(
                  (r, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg text-xs"
                      style={{
                        background:
                          CREAM
                      }}
                    >
                      {r.raga ||
                        r.name ||
                        r.raga_name}
                      {r.chakra
                        ? ` · ${r.chakra}`
                        : ''}
                    </span>
                  )
                )}

              </div>
            )}

            {(card.activities ||
              []).length > 0 && (
              <>
                <p className="text-xs font-bold text-slate-700 mb-1">
                  Activities
                </p>

                <div className="flex flex-wrap gap-1.5 mb-3">

                  {card.activities.map(
                    (a, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg text-xs"
                        style={{
                          background:
                            CREAM
                        }}
                      >
                        {a.activity ||
                          a.name ||
                          a.title}
                      </span>
                    )
                  )}

                </div>
              </>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2 mt-2">

          {!card.empty &&
            !card.rejected &&
            phase === 'ended' && (
              <button
                onClick={
                  draftRx
                }
                disabled={!!busy}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white"
                style={{
                  background: TEAL
                }}
              >
                Review prescription
              </button>
            )}

          {(card.empty ||
            card.rejected) && (
            <button
              onClick={
                goReport
              }
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white"
              style={{
                background: TEAL
              }}
            >
              Write report
            </button>
          )}

          {phase !== 'done' && (
            <button
              onClick={
                endSession
              }
              disabled={!!busy}
              className="px-5 py-2.5 rounded-xl text-xs font-bold border"
              style={{
                borderColor:
                  TEAL,
                color: TEAL
              }}
            >
              Mark session attended
            </button>
          )}

        </div>
      </div>
    );
  }

  return null;
}

// Concepts the patient actually said in this answer (the engine rejects labels whose words are
// not in the answer, e.g. things the model picked up from the intake context), shown readably.
function saidConcepts(r) {
  const rejected = new Set(
    (r?.unverified_concepts || []).map((u) => u?.concept)
  );
  return [
    ...new Set(
      (r?.extraction?.concepts || [])
        .map((c) => c?.concept)
        .filter((c) => c && !rejected.has(c))
        .map((c) => String(c).replace(/_/g, ' '))
    )
  ];
}

// KB indicators the engine actually recorded as evidence for one response.
function evidenceTerms(r) {
  return [
    ...new Set(
      (r?.evidence || [])
        .map((e) => e?.indicator_term)
        .filter(Boolean)
    )
  ];
}

// Imbalanced chakras for the prescription card (engine summary, or derived from findings).
function rxImbalances(d = {}) {
  if (Array.isArray(d.chakra_imbalances)) return d.chakra_imbalances;
  return (d.findings || [])
    .filter((c) => /IMBALANCED/i.test(c?.status || ''))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .map((c) => ({
      chakra: c.chakra,
      direction: c.direction,
      severity: c.severity,
      evidence: (c.trace || []).filter((t) => t.counted).map((t) => t.term)
    }));
}

function Opt({
  on,
  primary,
  onClick,
  children
}) {
  return (
    <button
      disabled={!on}
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-40 ${
        primary
          ? 'text-white'
          : 'text-slate-700'
      }`}
      style={
        primary
          ? {
              background:
                TEAL,
              borderColor:
                TEAL
            }
          : {
              borderColor:
                'rgba(0,0,0,0.1)'
            }
      }
    >
      {children}
    </button>
  );
}

// Traditional chakra colors + petal counts.

const CHAKRA_INFO = {
  'Root Chakra': {
    color: '#DC2626',
    petals: 4
  },

  'Sacral Chakra': {
    color: '#EA580C',
    petals: 6
  },

  'Solar Plexus Chakra': {
    color: '#EAB308',
    petals: 10
  },

  'Heart Chakra': {
    color: '#16A34A',
    petals: 12
  },

  'Throat Chakra': {
    color: '#0284C7',
    petals: 16
  },

  'Third Eye Chakra': {
    color: '#4F46E5',
    petals: 2
  },

  'Crown Chakra': {
    color: '#9333EA',
    petals: 1000
  }
};

function ChakraIcon({
  name,
  size = 40
}) {
  const info =
    CHAKRA_INFO[name] || {
      color: '#94A3B8',
      petals: 8
    };

  const petals =
    Math.min(
      info.petals,
      16
    );

  const cx = 50;
  const cy = 50;
  const r = 34;

  const petalEls =
    Array.from(
      {
        length: petals
      },
      (_, i) => {
        const angle =
          (i / petals) *
          Math.PI *
          2;

        const px =
          cx +
          Math.cos(angle) *
            r;

        const py =
          cy +
          Math.sin(angle) *
            r;

        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={5.5}
            fill={
              info.color
            }
            opacity={0.55}
          />
        );
      }
    );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-label={name}
    >
      {petalEls}

      <circle
        cx={cx}
        cy={cy}
        r={20}
        fill="white"
        stroke={
          info.color
        }
        strokeWidth={2.5}
      />

      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={
          info.color
        }
      />
    </svg>
  );
}

function Sparkle(props) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14zM5 15l.7 2 2 .7-2 .7L5 20.5l-.7-2.1-2-.7 2-.7L5 15z" />
    </svg>
  );
}
