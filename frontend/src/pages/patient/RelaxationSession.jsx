import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import { saveRelaxationSession, getSessionFeedback, submitSessionFeedback, getRelaxationPaymentStatus } from '../../services/api';
import { useRaagPlayer } from '../../hooks/useRaagPlayer';
import SessionFeelingFeedback from '../../components/SessionFeelingFeedback';
import { RELAXATION_ARTWORK_BY_CONCERN } from '../../constants/relaxationArtwork';

const TEAL = '#0F8594';
const ORANGE = '#F36F36';

// Every reason a person might need to unwind, each mapped to the raags that
// traditionally address it. Tracks are not uploaded yet, so the player is a
// faithful layout of the reference design with playback disabled.
export const CONCERNS = [
  { key: 'anger', label: 'Anger' },
  { key: 'frustration', label: 'Frustration' },
  { key: 'stress', label: 'Stress' },
  { key: 'anxiety', label: 'Anxiety' },
  { key: 'sadness', label: 'Sadness' },
  { key: 'overthinking', label: 'Overthinking' },
  { key: 'sleep', label: 'Sleep issues' },
  { key: 'restlessness', label: 'Restlessness' },
  { key: 'loneliness', label: 'Loneliness' },
  { key: 'fear', label: 'Fear' },
  { key: 'burnout', label: 'Burnout' },
  { key: 'motivation', label: 'Low motivation' },
  { key: 'grief', label: 'Grief' },
  { key: 'focus', label: 'Lack of focus' },
];

const newRelaxationSessionId = () => window.crypto?.randomUUID?.() || `relax-${Date.now()}-${Math.random()}`;

const RAAGS = {
  anger: [
    { name: 'Raag Darbari Kanada', note: 'Calms anger • Brings balance', length: '12:45', blurb: 'Let the deep and soulful notes of Darbari Kanada help you release tension and find inner peace.', hue: 25 },
    { name: 'Raag Bhairav', note: 'Soothes the mind • Reduces agitation', length: '10:32', blurb: 'A morning raag whose slow, grounded phrases settle a racing mind.', hue: 200 },
    { name: 'Raag Yaman', note: 'Brings peace • Stabilizes emotions', length: '11:20', blurb: 'Yaman opens the evening gently and steadies the heart.', hue: 260 },
    { name: 'Raag Jog', note: 'Releases inner tension • Encourages calm', length: '09:48', blurb: 'Jog blends warmth with restraint, easing built-up frustration.', hue: 120 },
    { name: 'Raag Malkauns', note: 'Deep relaxation • Emotional healing', length: '13:15', blurb: 'The late-night Malkauns sinks you into stillness.', hue: 230 },
  ],
  frustration: [
    { name: 'Raag Jog', note: 'Releases inner tension', length: '09:48', blurb: 'Jog blends warmth with restraint, easing built-up frustration.', hue: 120 },
    { name: 'Raag Darbari Kanada', note: 'Brings balance', length: '12:45', blurb: 'Deep, slow phrases that let irritation settle.', hue: 25 },
    { name: 'Raag Kafi', note: 'Lightens the mood', length: '10:05', blurb: 'A playful, folk-rooted raag that loosens a tight chest.', hue: 40 },
  ],
  stress: [
    { name: 'Raag Bhairavi', note: 'Grounding • Releases stress', length: '11:40', blurb: 'Bhairavi is the raag of surrender — let the day go.', hue: 340 },
    { name: 'Raag Bhimpalasi', note: 'Afternoon calm', length: '10:20', blurb: 'A mid-day raag that eases the pressure of a long day.', hue: 45 },
    { name: 'Raag Yaman', note: 'Stabilizes emotions', length: '11:20', blurb: 'Yaman opens the evening gently and steadies the heart.', hue: 260 },
  ],
  anxiety: [
    { name: 'Raag Bhupali', note: 'Clarity • Steadies breath', length: '09:30', blurb: 'Five notes, no hurry — Bhupali slows the breath.', hue: 190 },
    { name: 'Raag Ahir Bhairav', note: 'Soft morning warmth', length: '12:10', blurb: 'A tender dawn raag that reassures.', hue: 30 },
    { name: 'Raag Malkauns', note: 'Deep relaxation', length: '13:15', blurb: 'The late-night Malkauns sinks you into stillness.', hue: 230 },
  ],
  sadness: [
    { name: 'Raag Bhairav', note: 'Comfort • Reflection', length: '10:32', blurb: 'Bhairav sits with you without rushing you.', hue: 200 },
    { name: 'Raag Desh', note: 'Uplifting • Gentle joy', length: '09:55', blurb: 'The monsoon raag that brings a quiet smile back.', hue: 150 },
    { name: 'Raag Kafi', note: 'Lightens the mood', length: '10:05', blurb: 'Playful phrases that lift heaviness.', hue: 40 },
  ],
  overthinking: [
    { name: 'Raag Bhupali', note: 'Single-point focus', length: '09:30', blurb: 'Five notes, no hurry — Bhupali slows the breath.', hue: 190 },
    { name: 'Raag Malkauns', note: 'Quietens the mind', length: '13:15', blurb: 'The late-night Malkauns sinks you into stillness.', hue: 230 },
    { name: 'Raag Yaman', note: 'Stabilizes emotions', length: '11:20', blurb: 'Yaman opens the evening gently and steadies the heart.', hue: 260 },
  ],
  sleep: [
    { name: 'Raag Yaman', note: 'Night raag • Prepares for rest', length: '11:20', blurb: 'Yaman opens the evening gently and steadies the heart.', hue: 260 },
    { name: 'Raag Bageshree', note: 'Late-night calm', length: '12:30', blurb: 'A midnight raag that carries you toward sleep.', hue: 240 },
    { name: 'Raag Malkauns', note: 'Deep relaxation', length: '13:15', blurb: 'The late-night Malkauns sinks you into stillness.', hue: 230 },
  ],
  restlessness: [
    { name: 'Raag Bhairavi', note: 'Grounding', length: '11:40', blurb: 'Bhairavi is the raag of surrender — let the day go.', hue: 340 },
    { name: 'Raag Darbari Kanada', note: 'Slows everything down', length: '12:45', blurb: 'Deep, slow phrases that let restlessness settle.', hue: 25 },
  ],
  loneliness: [
    { name: 'Raag Bhairav', note: 'Warm companionship', length: '10:32', blurb: 'Bhairav sits with you without rushing you.', hue: 200 },
    { name: 'Raag Desh', note: 'Gentle joy', length: '09:55', blurb: 'The monsoon raag that brings a quiet smile back.', hue: 150 },
  ],
  fear: [
    { name: 'Raag Bhupali', note: 'Courage • Clarity', length: '09:30', blurb: 'Five notes, no hurry — Bhupali slows the breath.', hue: 190 },
    { name: 'Raag Ahir Bhairav', note: 'Reassurance', length: '12:10', blurb: 'A tender dawn raag that reassures.', hue: 30 },
  ],
  burnout: [
    { name: 'Raag Bhairavi', note: 'Restores • Releases', length: '11:40', blurb: 'Bhairavi is the raag of surrender — let the day go.', hue: 340 },
    { name: 'Raag Bhimpalasi', note: 'Afternoon calm', length: '10:20', blurb: 'A mid-day raag that eases the pressure of a long day.', hue: 45 },
    { name: 'Raag Bageshree', note: 'Late-night calm', length: '12:30', blurb: 'A midnight raag that carries you toward rest.', hue: 240 },
  ],
  motivation: [
    { name: 'Raag Desh', note: 'Bright • Forward-moving', length: '09:55', blurb: 'The monsoon raag that brings a quiet smile back.', hue: 150 },
    { name: 'Raag Bhupali', note: 'Fresh start', length: '09:30', blurb: 'Five notes, no hurry — a clean beginning.', hue: 190 },
  ],
  grief: [
    { name: 'Raag Bhairav', note: 'Holds sorrow gently', length: '10:32', blurb: 'Bhairav sits with you without rushing you.', hue: 200 },
    { name: 'Raag Bhairavi', note: 'Release', length: '11:40', blurb: 'Bhairavi is the raag of surrender — let it be felt.', hue: 340 },
  ],
  focus: [
    { name: 'Raag Bhupali', note: 'Single-point focus', length: '09:30', blurb: 'Five notes, no hurry — Bhupali sharpens attention.', hue: 190 },
    { name: 'Raag Bhimpalasi', note: 'Afternoon clarity', length: '10:20', blurb: 'A mid-day raag that clears the fog.', hue: 45 },
  ],
};

const CONCERN_TERMS = {
  anger: ['anger', 'angry', 'irritated', 'irritation', 'temper'],
  frustration: ['frustrated', 'frustration', 'impatient', 'blocked'],
  stress: ['stress', 'stressed', 'pressure', 'overwhelmed', 'workload', 'tension'],
  anxiety: ['anxiety', 'anxious', 'worry', 'worried', 'panic', 'nervous', 'calm', 'relax', 'unwind'],
  sadness: ['sad', 'sadness', 'low mood', 'down', 'heartbroken'],
  overthinking: ['overthinking', 'racing thoughts', 'rumination', 'cannot switch off'],
  sleep: ['sleep', 'insomnia', 'bedtime', 'night', 'rest', 'unwind before bed'],
  restlessness: ['restless', 'restlessness', 'agitated', 'fidgety'],
  loneliness: ['lonely', 'loneliness', 'isolated', 'alone'],
  fear: ['fear', 'afraid', 'scared', 'courage'],
  burnout: ['burnout', 'exhausted', 'drained', 'fatigue'],
  motivation: ['motivation', 'unmotivated', 'energy', 'fresh start'],
  grief: ['grief', 'grieving', 'loss', 'mourning'],
  focus: ['focus', 'concentration', 'concentrate', 'study', 'attention'],
};

export default function RelaxationSession() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const concernParam = searchParams.get('concern');
  const [concern, setConcern] = useState(() => CONCERNS.some((item) => item.key === concernParam) ? concernParam : '');
  const [practiceInput, setPracticeInput] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [matchedConcern, setMatchedConcern] = useState('');
  const [matchedRequest, setMatchedRequest] = useState('');
  const [searchError, setSearchError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listened, setListened] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState({ after: '', helped: '', note: '' });
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [beforeFeelingDone, setBeforeFeelingDone] = useState(null); // null = unknown yet
  const [afterFeelingDone, setAfterFeelingDone] = useState(false);
  const [feelingSaving, setFeelingSaving] = useState(false);
  const [sessionId, setSessionId] = useState(() => searchParams.get('sessionId') || newRelaxationSessionId());
  const [paidForSession, setPaidForSession] = useState(null);
  const autoplayAfterPayment = useRef(searchParams.get('play') === '1');

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getRelaxationPaymentStatus(user.id, sessionId)
      .then((status) => { if (!cancelled) setPaidForSession(!!status.paid); })
      .catch(() => { if (!cancelled) setPaidForSession(false); });
    return () => { cancelled = true; };
  }, [user?.id, sessionId]);

  const allRaags = useMemo(() => [...new Map(Object.values(RAAGS).flat().map((track) => [track.name, track])).values()], []);
  const raags = useMemo(() => {
    const focused = searchMode ? (matchedConcern ? RAAGS[matchedConcern] || [] : []) : (concern ? RAAGS[concern] || [] : []);
    const focusedNames = new Set(focused.map((track) => track.name));
    return [...focused, ...allRaags.filter((track) => !focusedNames.has(track.name))].slice(0, 5);
  }, [allRaags, concern, matchedConcern, searchMode]);
  const playerTracks = raags.length ? raags : RAAGS.anger;
  const player = useRaagPlayer(playerTracks);
  const current = playerTracks[Math.min(player.index, playerTracks.length - 1)];
  const concernLabel = searchMode
    ? CONCERNS.find((c) => c.key === matchedConcern)?.label || 'Your request'
    : CONCERNS.find((c) => c.key === concern)?.label || 'Choose a concern';
  const hasFocus = searchMode ? Boolean(matchedConcern) : Boolean(concern);
  const progress = player.duration ? player.elapsed / player.duration : 0;
  const imageConcern = searchMode ? matchedConcern : concern;
  const concernImage = RELAXATION_ARTWORK_BY_CONCERN[imageConcern] || '/assets/meditation-glow.jpg';

  useEffect(() => {
    if (CONCERNS.some((item) => item.key === concernParam) && concernParam !== concern) {
      setSessionId(newRelaxationSessionId());
      setPaidForSession(null);
      player.select(0, false);
      setConcern(concernParam);
      setSearchMode(false);
      setMatchedConcern('');
    }
  }, [concernParam, concern]);

  const requestPlayback = () => {
    if (player.playing || paidForSession) { player.toggle(); return; }
    openPaymentPage(player.index);
  };

  const openPaymentPage = (trackIndex) => {
    const key = searchMode ? matchedConcern : concern;
    const params = new URLSearchParams({ sessionId, concern: key || '', track: String(trackIndex) });
    navigate(`/relaxation/payment?${params.toString()}`);
  };

  const selectTrack = (index) => {
    if (paidForSession) {
      player.select(index);
      return;
    }
    player.setIndex(index);
    player.setElapsed(0);
    openPaymentPage(index);
  };

  const chooseConcern = (key) => {
    setSessionId(newRelaxationSessionId());
    setPaidForSession(null);
    setConcern(key);
    setSearchParams({ concern: key });
    setSearchMode(false);
    setMatchedConcern('');
    setMatchedRequest('');
    setSearchError('');
    player.select(0, false);
    setPickerOpen(false);
    if (user?.id) saveRelaxationSession(user.id, { reason: key, transcript: [] }).catch(() => {});
  };

  const searchPractices = () => {
    const query = practiceInput.trim().toLowerCase();
    if (!query) { setSearchError('Describe what you would like support with.'); return; }
    const matches = Object.entries(CONCERN_TERMS)
      .map(([key, terms]) => ({ key, score: terms.reduce((score, term) => score + (query.includes(term) ? 1 : 0), 0) }))
      .sort((a, b) => b.score - a.score);
    const best = matches[0]?.score ? matches[0].key : '';
    setSearchMode(true);
    setMatchedConcern(best);
    setMatchedRequest(practiceInput.trim());
    setSearchError(best ? '' : 'No focused practice matched that wording. Try a feeling, goal, or concern such as sleep, stress, or focus.');
    if (best) {
      setSessionId(newRelaxationSessionId());
      setPaidForSession(null);
      setConcern(best);
      setSearchParams({ concern: best });
      player.select(0, false);
      if (user?.id) saveRelaxationSession(user.id, { reason: best, transcript: [practiceInput.trim()] }).catch(() => {});
    }
  };

  // Once the patient has listened (a track finished, or ≥ 2 minutes), offer
  // the feedback form; it opens automatically when a track ends.
  useEffect(() => {
    if (player.playing && player.elapsed >= 120) setListened(true);
    if (!player.playing && player.duration && player.elapsed >= player.duration && !player.loop) { setListened(true); setFeedbackOpen(true); }
  }, [player.playing, player.elapsed, player.duration, player.loop]);

  const submitFeedback = () => {
    if (!feedback.after || !feedback.helped) return;
    saveRelaxationSession(user.id, { reason: concern, raag: current.name, transcript: [], feedback: { ...feedback, at: new Date().toISOString() } })
      .catch(() => {})
      .finally(() => { setFeedbackDone(true); setFeedbackOpen(false); });
  };

  // Before-Session "I feel ___" check-in — once per day is enough; we key it
  // off today's date so it doesn't block a patient re-entering the same
  // Relaxation page repeatedly within one sitting.
  const todaySeed = useMemo(() => new Date().toISOString().slice(0, 10), []);
  useEffect(() => {
    if (!user?.id) return;
    getSessionFeedback(user.id, { stage: 'before' })
      .then((rows) => setBeforeFeelingDone(rows.some((r) => r.createdAt?.slice(0, 10) === todaySeed && r.sessionType === 'relaxation')))
      .catch(() => setBeforeFeelingDone(true)); // fail open rather than block listening
  }, [user?.id, todaySeed]);

  useEffect(() => {
    if (!paidForSession || beforeFeelingDone !== true || !autoplayAfterPayment.current) return;
    const requestedTrack = Number(searchParams.get('track'));
    const trackIndex = Number.isInteger(requestedTrack) && requestedTrack >= 0 && requestedTrack < playerTracks.length ? requestedTrack : 0;
    player.select(trackIndex);
    autoplayAfterPayment.current = false;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('play');
    setSearchParams(nextParams, { replace: true });
  }, [paidForSession, beforeFeelingDone]);

  const submitBeforeFeeling = (answers) => {
    setFeelingSaving(true);
    submitSessionFeedback(user.id, { stage: 'before', appointmentId: null, answers, sessionType: 'relaxation' })
      .then(() => setBeforeFeelingDone(true))
      .catch((err) => console.error('Failed to submit before-session feeling check-in:', err))
      .finally(() => setFeelingSaving(false));
  };

  const submitAfterFeeling = (answers) => {
    setFeelingSaving(true);
    submitSessionFeedback(user.id, { stage: 'after', appointmentId: null, answers, sessionType: 'relaxation' })
      .then(() => setAfterFeelingDone(true))
      .catch((err) => console.error('Failed to submit after-session feeling check-in:', err))
      .finally(() => setFeelingSaving(false));
  };

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;
  if (paidForSession === null) return <PortalLoading />;

  if (beforeFeelingDone === false) {
    return (
      <PatientDashboardLayout active="relaxation" user={user} onLogout={logout}>
        <div className="max-w-2xl mx-auto py-6">
          <SessionFeelingFeedback stage="before" seed={`relaxation-${todaySeed}`} onSubmit={submitBeforeFeeling} submitting={feelingSaving} />
        </div>
      </PatientDashboardLayout>
    );
  }

  return (
    <PatientDashboardLayout active="relaxation" user={user} onLogout={logout}>
      {feedbackOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 overflow-y-auto py-8" onClick={() => setFeedbackOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-7 my-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Relaxation feedback</p>
            <h2 className="text-xl font-bold text-slate-900 mt-1">How do you feel after {current.name}?</h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">Two taps and an optional note — your therapist reads these.</p>
            <p className="text-xs font-bold text-slate-600 mb-2">Right now I feel</p>
            <div className="grid grid-cols-5 gap-2 mb-5">
              {[['Struggling', '😔'], ['Low', '🙁'], ['Okay', '😐'], ['Calm', '🙂'], ['Peaceful', '😌']].map(([v, e]) => { const on = feedback.after === v; return <button key={v} type="button" onClick={() => setFeedback((f) => ({ ...f, after: v }))} className={`rounded-2xl border py-3 flex flex-col items-center gap-1 ${on ? 'shadow-md' : 'border-black/5 bg-[#FBFAF6]'}`} style={on ? { background: '#E6F0EA', borderColor: TEAL } : undefined}><span className="text-2xl">{e}</span><span className="text-[11px] font-bold text-slate-600">{v}</span></button>; })}
            </div>
            <p className="text-xs font-bold text-slate-600 mb-2">Did this raag help with {concernLabel?.toLowerCase()}?</p>
            <div className="flex gap-2 mb-5">{['Yes', 'Somewhat', 'No'].map((v) => { const on = feedback.helped === v; return <button key={v} type="button" onClick={() => setFeedback((f) => ({ ...f, helped: v }))} className={`flex-1 rounded-xl border py-2.5 text-sm font-bold ${on ? 'text-white' : 'border-black/10 text-slate-600'}`} style={on ? { background: TEAL, borderColor: TEAL } : undefined}>{v}</button>; })}</div>
            <textarea rows={2} value={feedback.note} onChange={(e) => setFeedback((f) => ({ ...f, note: e.target.value }))} placeholder="Anything you noticed (optional)" className="w-full px-4 py-3 bg-[#FBFAF6] border border-black/5 rounded-2xl text-sm resize-none mb-5" />
            <div className="flex justify-end gap-2 mb-6">
              <button type="button" onClick={() => setFeedbackOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-500">Later</button>
              <button type="button" onClick={submitFeedback} disabled={!feedback.after || !feedback.helped} className="px-6 py-2.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40" style={{ background: TEAL }}>Send feedback</button>
            </div>

            {!afterFeelingDone && (
              <div className="border-t border-black/5 pt-5">
                <p className="text-xs font-bold text-slate-600 mb-3">A slightly longer After-Session check-in (optional but helpful for your therapist):</p>
                <SessionFeelingFeedback stage="after" seed={`relaxation-${todaySeed}`} onSubmit={submitAfterFeeling} submitting={feelingSaving} onSkip={() => setAfterFeelingDone(true)} />
              </div>
            )}
          </div>
        </div>
      )}
      <div className={`grid grid-cols-1 gap-4 -mt-2 ${player.playing ? 'lg:grid-cols-1' : 'lg:grid-cols-[320px_minmax(0,1fr)]'}`}>
        {/* Left column — concern + recommended raags */}
        <aside className={player.playing ? 'hidden' : ''}>
          <p className="text-base font-semibold text-slate-800 mb-3">Your concern</p>
          <div className="relative mb-7">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="w-full bg-white border border-black/10 rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left shadow-sm hover:border-black/20"
            >
              <span className="w-9 h-9 rounded-full flex items-center justify-center bg-[#F6F4EC]" style={{ color: TEAL }}>
                <LotusIcon className="w-4 h-4" />
              </span>
              <span className="flex-1 text-base font-semibold text-slate-900">{concernLabel}</span>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${pickerOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            {pickerOpen && (
              <div className="absolute z-20 mt-2 w-full bg-white border border-black/10 rounded-2xl shadow-xl max-h-72 overflow-y-auto py-1.5">
                {CONCERNS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => chooseConcern(c.key)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F6F4EC] ${c.key === concern ? 'font-bold' : 'text-slate-700'}`}
                    style={c.key === concern ? { color: TEAL } : undefined}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); searchPractices(); }} className="mb-7">
            <label htmlFor="practice-request" className="block text-sm font-semibold text-slate-800 mb-2">What would you like support with?</label>
            <div className="flex gap-2">
              <input
                id="practice-request"
                value={practiceInput}
                onChange={(e) => setPracticeInput(e.target.value)}
                placeholder="e.g. winding down before sleep"
                className="min-w-0 flex-1 px-3 py-2.5 rounded-xl bg-white border border-black/10 text-sm outline-none focus:border-[#0F8594]/40"
              />
              <button type="submit" className="px-3 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: TEAL }}>Find</button>
            </div>
            {searchError && <p role="status" className="text-xs text-amber-800 mt-2">{searchError}</p>}
          </form>

          <p className="text-base font-semibold text-slate-800 mb-3">Your tracks</p>
          {searchMode && matchedConcern && <p className="text-xs text-slate-500 mb-3">Matched to “{matchedRequest}”</p>}
          {hasFocus ? <div className="space-y-3">
            {raags.map((r, i) => {
              const active = i === player.index;
              return (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => selectTrack(i)}
                  className={`w-full text-left rounded-2xl border px-3 py-3 flex items-center gap-3 transition-all ${active ? 'border-[#0F8594]/30 bg-[#E6F0EA] shadow-sm' : 'border-black/5 bg-white hover:border-black/15'}`}
                >
                  <RaagArt hue={r.hue} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 truncate">Track {i + 1}</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">{r.length}</span>
                  </span>
                  {active && <BarsIcon className={`w-4 h-4 shrink-0 ${player.playing ? 'animate-pulse' : ''}`} style={{ color: TEAL }} />}
                </button>
              );
            })}
          </div> : <p className="rounded-xl bg-[#fff8f2] px-4 py-3 text-xs leading-relaxed text-slate-500">Enter what you would like help with, or choose a concern to see focused practices.</p>}
        </aside>

        {/* Right column — player */}
        {!hasFocus ? (
          <section className="min-h-[640px] flex flex-col items-center justify-center rounded-[28px] border border-black/5 bg-[#fff8f2] p-8 text-center">
            <h2 className="font-serif text-2xl text-slate-900">{searchMode ? 'No focused practice found' : 'Start with what you need'}</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">{searchMode ? `We could not match “${matchedRequest}” to a specific relaxation focus. Try describing a feeling or goal, or choose a concern from the list.` : 'Describe a feeling or goal, or choose a concern, to see practices selected for you.'}</p>
          </section>
        ) : (
          <section className={`relative min-h-[640px] overflow-hidden border-y border-black/5 flex flex-col ${player.playing ? 'min-h-[calc(100dvh-12rem)]' : ''}`}>
          <img src={concernImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,250,240,0.15) 0%, rgba(255,250,240,0.55) 55%, rgba(253,246,238,0.95) 100%)' }} />

          <div className="relative flex-1 flex flex-col p-6 md:p-10">
            {!player.playing && <div className="mt-auto max-w-lg">
              <p className="font-serif italic text-lg text-slate-700">Relaxation session</p>
              <h1 className="font-serif text-4xl md:text-5xl text-slate-900 mt-1">Track {player.index + 1}</h1>
            </div>}

            {/* Transport */}
            <div className="mt-10 mx-auto w-full max-w-lg">
              <div
                role="slider"
                aria-label="Seek"
                aria-valuenow={Math.round(progress * 100)}
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); player.seek((e.clientX - r.left) / r.width); }}
                className="h-2 rounded-full bg-slate-500/25 relative cursor-pointer"
              >
                <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${progress * 100}%`, background: TEAL }} />
                <span className="absolute -top-1 w-4 h-4 rounded-full shadow" style={{ left: `calc(${progress * 100}% - 8px)`, background: TEAL }} />
              </div>
              <div className="flex justify-between text-[11px] text-slate-600 mt-2">
                <span>{player.fmt(player.elapsed)}</span><span>{current.length}</span>
              </div>
              <div className="flex items-center justify-center gap-7 mt-5 text-slate-700">
                <button type="button" aria-label="Shuffle" aria-pressed={player.shuffle} onClick={() => player.setShuffle((v) => !v)} className={player.shuffle ? '' : 'opacity-50'} style={player.shuffle ? { color: TEAL } : undefined}><ShuffleIcon className="w-5 h-5" /></button>
                <button type="button" aria-label="Previous" onClick={player.prev} className="hover:scale-110 transition-transform"><PrevIcon className="w-6 h-6" /></button>
                <button type="button" aria-label={player.playing ? 'Pause' : 'Play Music'} onClick={requestPlayback} className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-105 transition-transform" style={{ background: player.playing ? '#292D32' : ORANGE }}>
                  {player.playing
                    ? <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                    : <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
                </button>
                <button type="button" aria-label="Next" onClick={player.next} className="hover:scale-110 transition-transform"><NextIcon className="w-6 h-6" /></button>
                <button type="button" aria-label="Repeat" aria-pressed={player.loop} onClick={() => player.setLoop((v) => !v)} className={player.loop ? '' : 'opacity-50'} style={player.loop ? { color: TEAL } : undefined}><RepeatIcon className="w-5 h-5" /></button>
              </div>
              {(listened || feedbackDone) && (
                <div className="flex justify-center mt-3">
                  {feedbackDone ? <span className="text-xs font-semibold" style={{ color: TEAL }}>Thank you — feedback sent to your therapist.</span>
                    : <button type="button" onClick={() => setFeedbackOpen(true)} className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: TEAL, color: TEAL }}>Finished listening? Share feedback</button>}
                </div>
              )}
            </div>

            {!player.playing && <div className="mt-8 flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-2"><LotusIcon className="w-4 h-4" /> Music heals. You&apos;re doing great.</span>
              <span className="flex items-center gap-2">
                <button type="button" aria-label={player.volume ? 'Mute' : 'Unmute'} onClick={() => player.setVolume(player.volume ? 0 : 0.6)}><VolumeIcon className="w-4 h-4" /></button>
                <input type="range" min={0} max={1} step={0.02} value={player.volume} onChange={(e) => player.setVolume(Number(e.target.value))} aria-label="Volume" className="w-24 accent-[#0F8594]" />
              </span>
            </div>}
          </div>
        </section>
        )}
      </div>
    </PatientDashboardLayout>
  );
}

function RaagArt({ hue }) {
  return (
    <span
      className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center text-white/90"
      style={{ background: `linear-gradient(145deg, hsl(${hue} 45% 62%), hsl(${(hue + 40) % 360} 40% 38%))` }}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-2v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-2c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
    </span>
  );
}

function LotusIcon({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20c-3-1.5-5.5-4-6-7.5C8 13 10 14.5 12 17c2-2.5 4-4 6-4.5-.5 3.5-3 6-6 7.5z" />
      <path d="M12 17c-1.5-3-1.5-7 0-10 1.5 3 1.5 7 0 10z" />
      <path d="M4 15c1 .2 2 .6 3 1.2M20 15c-1 .2-2 .6-3 1.2" />
    </svg>
  );
}
function BarsIcon(props) { return (<svg {...props} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="12" width="3" height="8" rx="1" /><rect x="10.5" y="7" width="3" height="13" rx="1" /><rect x="17" y="3" width="3" height="17" rx="1" /></svg>); }
function ShuffleIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>); }
function PrevIcon(props) { return (<svg {...props} viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM20 6l-10 6 10 6z" /></svg>); }
function NextIcon(props) { return (<svg {...props} viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM4 6l10 6-10 6z" /></svg>); }
function RepeatIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" /></svg>); }
function VolumeIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7" /></svg>); }
