import { useState, useRef } from 'react';
import { SAGE_DARK, SAGE, SAGE_SOFT } from '../../../components/layout/TherapistDashboardLayout';

// ---------------------------------------------------------------------------
// AI Report Assistant — a frontend-only panel that helps a therapist refine
// a report draft before saving/sharing it. All "suggestions" here are canned
// copy + light local text heuristics (no API calls, no backend changes).
// Wiring this up to a real AI service later just means swapping the helper
// functions below for actual API calls — the UI/props contract won't change.
// ---------------------------------------------------------------------------

const MUSIC_SUGGESTIONS = [
  'Continue guided breathing with instrumental music',
  'Introduce vocal improvisation next session',
  'Encourage daily mindful listening',
];
const HOME_PRACTICE_SUGGESTIONS = [
  '10 minutes mindful music listening',
  'Emotion journal after listening',
  'Daily breathing exercise',
];
const GOAL_SUGGESTIONS = [
  'Improve emotional expression',
  'Increase self-confidence',
  'Reduce anxiety during social interaction',
];
const OBSERVATION_SUGGESTION = "Consider mentioning the patient's increased participation during rhythm exercises.";

// Lightweight, local "polish" pass — not real AI, just tidy formatting.
export function tidyText(text) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return t;
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

// Lightweight, local simplification — swaps a few clinical phrases for
// plainer language. A starting point for the therapist to edit further,
// not a finished patient-facing document.
export function simplifyText(text) {
  const replacements = [
    [/consultation/gi, 'session'],
    [/therapeutic intervention/gi, 'activity'],
    [/patient exhibited/gi, 'the patient showed'],
    [/regulate affect/gi, 'manage emotions'],
    [/clinical(ly)?\s*/gi, ''],
  ];
  let out = text || '';
  replacements.forEach(([pattern, replacement]) => { out = out.replace(pattern, replacement); });
  return tidyText(out);
}

export default function AIReportAssistant({
  summary,
  notes,
  raga,
  onApplySummary,
  onInsertIntoNotes,
  highlightMissing,
}) {
  const [open, setOpen] = useState(true);
  const [showPatientFriendly, setShowPatientFriendly] = useState(false);
  const panelRef = useRef(null);

  const hasObservations = /observ|notice|showed|engaged|particip/i.test(notes || '');
  const hasHomework = /practice|homework|journal|listening exercise/i.test(notes || '');
  const hasRecommendation = !!raga || /recommend/i.test(notes || '');
  const hasGoal = /goal|next session/i.test(notes || '');

  const checklist = [
    { key: 'summary', label: 'Session summary included', ok: (summary || '').trim().length > 0 },
    { key: 'observations', label: 'Observations completed', ok: hasObservations },
    { key: 'homework', label: 'Homework / home practice added', ok: hasHomework },
    { key: 'recommendations', label: 'Recommendations available', ok: hasRecommendation },
    { key: 'goals', label: 'Next session goal defined', ok: hasGoal },
  ];

  const patientFriendlyText = summary ? simplifyText(summary) : '';
  const insertBullets = (bullets) => onInsertIntoNotes(bullets.map((b) => `• ${b}`).join('\n'));

  return (
    <div ref={panelRef} className="bg-white rounded-3xl border border-black/[0.06] shadow-sm shadow-black/[0.03] overflow-hidden h-fit">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left transition-colors"
        style={{ background: `linear-gradient(135deg, ${SAGE_SOFT} 0%, #F4EFE2 100%)` }}
      >
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0" style={{ color: SAGE_DARK }}>
            <SparkleIcon className="w-4 h-4" />
          </span>
          <div>
            <p className="font-serif font-bold text-base text-slate-900 leading-tight">AI Suggestions</p>
            <p className="text-xs text-slate-500 mt-0.5">Review these recommendations before sharing.</p>
          </div>
        </div>
        <ChevronIcon className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="p-5 space-y-3.5">
          <SuggestionCard
            icon={<DocIcon className="w-4 h-4" />} title="Improve Session Summary"
            body="This summary can be made clearer and more concise."
            actionLabel="Apply Suggestion"
            disabled={!(summary || '').trim()}
            onAction={() => onApplySummary(tidyText(summary))}
          />
          <SuggestionCard
            icon={<BulbIcon className="w-4 h-4" />} title="Clinical Observation Suggestion"
            body={OBSERVATION_SUGGESTION}
            actionLabel="Apply"
            onAction={() => onInsertIntoNotes(OBSERVATION_SUGGESTION)}
          />
          <SuggestionCard
            icon={<MusicIcon className="w-4 h-4" />} title="Suggested Music Therapy Recommendations"
            bullets={MUSIC_SUGGESTIONS}
            actionLabel="Insert"
            onAction={() => insertBullets(MUSIC_SUGGESTIONS)}
          />
          <SuggestionCard
            icon={<PinIcon className="w-4 h-4" />} title="Suggested Home Practice"
            bullets={HOME_PRACTICE_SUGGESTIONS}
            actionLabel="Insert"
            onAction={() => insertBullets(HOME_PRACTICE_SUGGESTIONS)}
          />
          <SuggestionCard
            icon={<TargetIcon className="w-4 h-4" />} title="Suggested Goal For Next Session"
            bullets={GOAL_SUGGESTIONS}
            actionLabel="Insert"
            onAction={() => insertBullets(GOAL_SUGGESTIONS)}
          />

          <div className={`rounded-2xl p-4 transition-shadow ${highlightMissing ? 'ring-2 ring-amber-400' : ''}`} style={{ background: SAGE_SOFT }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: SAGE_DARK }}>Review Checklist</p>
            <div className="space-y-2.5">
              {checklist.map((c) => (
                <div key={c.key} className={`flex items-center gap-2.5 text-sm ${c.ok ? 'text-slate-700' : 'text-amber-700 font-semibold'}`}>
                  {c.ok ? <CheckCircleIcon className="w-4 h-4 shrink-0" style={{ color: SAGE_DARK }} /> : <AlertIcon className="w-4 h-4 shrink-0 text-amber-500" />}
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {(!hasRecommendation || !hasHomework || !hasGoal) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              {!hasRecommendation && <WarningLine text="Recommendations are empty." />}
              {!hasHomework && <WarningLine text="Homework has not been added." />}
              {!hasGoal && <WarningLine text="Next session goal is missing." />}
            </div>
          )}

          <div className="rounded-2xl border border-black/[0.06] p-4 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center gap-2 mb-1">
              <HeartIcon className="w-4 h-4" style={{ color: SAGE_DARK }} />
              <p className="text-sm font-bold text-slate-800">Patient-Friendly Summary</p>
            </div>
            <p className="text-xs text-slate-500 mb-3">Generate a simplified version of the report that is easy for patients to understand.</p>
            {showPatientFriendly && patientFriendlyText && (
              <p className="text-sm text-slate-600 bg-black/[0.02] rounded-xl p-3 mb-3">{patientFriendlyText}</p>
            )}
            <button
              type="button"
              onClick={() => (showPatientFriendly ? onApplySummary(patientFriendlyText) : setShowPatientFriendly(true))}
              disabled={!(summary || '').trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 hover:opacity-90 transition-all"
              style={{ background: SAGE_DARK }}
            >
              {showPatientFriendly ? 'Use This Version' : 'Preview Patient-Friendly Version'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WarningLine({ text }) {
  return (
    <p className="flex items-center gap-2 text-xs text-amber-700">
      <AlertIcon className="w-3.5 h-3.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

function SuggestionCard({ icon, title, body, bullets, actionLabel, onAction, disabled }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] p-4 hover:shadow-md hover:border-black/10 hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: SAGE_SOFT, color: SAGE_DARK }}>{icon}</span>
        <p className="text-sm font-bold text-slate-800">{title}</p>
      </div>
      {body && <p className="text-xs text-slate-500 mb-3 pl-9">{body}</p>}
      {bullets && (
        <ul className="text-xs text-slate-500 mb-3 pl-9 space-y-1 list-disc list-outside">
          {bullets.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      <div className="pl-9">
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 hover:bg-black/[0.02]"
          style={{ borderColor: SAGE_DARK, color: SAGE_DARK }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small line icons (no emoji, no external icon package dependency)
// ---------------------------------------------------------------------------
export function SparkleIcon(props) { return (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 3l1.6 4.7L18 9.5l-4.4 1.8L12 16l-1.6-4.7L6 9.5l4.4-1.8L12 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" /></svg>); }
function ChevronIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>); }
function DocIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>); }
function BulbIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6h5.4c0-.6.3-1.2.8-1.6A6 6 0 0012 3z" /></svg>); }
function MusicIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z" /></svg>); }
function PinIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 21c-4-4-7-7.5-7-11a7 7 0 0114 0c0 3.5-3 7-7 11z" /><circle cx="12" cy="10" r="2.5" strokeWidth={1.75} /></svg>); }
function TargetIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="8" strokeWidth={1.75} /><circle cx="12" cy="12" r="4" strokeWidth={1.75} /><circle cx="12" cy="12" r="0.6" strokeWidth={1.75} fill="currentColor" /></svg>); }
function HeartIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 20s-7-4.4-9.5-9A5.5 5.5 0 0112 5.5 5.5 5.5 0 0121.5 11c-2.5 4.6-9.5 9-9.5 9z" /></svg>); }
function CheckCircleIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth={1.75} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.5 12.5l2.3 2.3L16 10" /></svg>); }
function AlertIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v4m0 3.5h.01M10.3 4.3l-8 14A1.5 1.5 0 003.6 21h16.8a1.5 1.5 0 001.3-2.2l-8-14a1.5 1.5 0 00-2.6 0z" /></svg>); }