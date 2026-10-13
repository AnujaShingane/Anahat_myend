import { useMemo, useState } from 'react';
import { pickFiveStatements, FEELING_SCALE } from '../constants/feelingScale';

const TEAL = '#0F8594';

/**
 * Shared Before-Session / After-Session (and Relaxation) feedback form.
 * Shows 5 of the 20 "I feel ___" statements, each rated 1-4 on the same
 * scale everywhere it's used.
 *
 * Props:
 *  - stage: 'before' | 'after' (label only — parent decides when to render)
 *  - seed: string used to pick a stable set of 5 statements (e.g. appointmentId)
 *  - onSubmit(answers): answers = [{ statement, value }], called once all 5 are answered
 *  - onSkip(): optional — shown as a "Skip for now" link when provided
 *  - submitting: optional bool to disable the button while a request is in flight
 */
export default function SessionFeelingFeedback({ stage, seed, onSubmit, onSkip, submitting = false }) {
  const statements = useMemo(() => pickFiveStatements(seed), [seed]);
  const [values, setValues] = useState({});

  const answered = statements.filter((s) => values[s]).length;
  const complete = answered === statements.length;

  const submit = () => {
    if (!complete) return;
    onSubmit(statements.map((statement) => ({ statement, value: values[statement] })));
  };

  return (
    <div className="bg-white border border-black/5 rounded-3xl shadow-sm p-6 md:p-8 space-y-6">
      <div>
        <h3 className="font-serif font-bold text-xl text-slate-900">
          {stage === 'before' ? 'Before we begin' : 'How are you feeling now?'}
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {stage === 'before'
            ? 'A quick check-in before your session starts. For each statement, choose how much it applies to you right now.'
            : 'One more quick check-in now that the session has ended.'}
        </p>
      </div>

      <div className="space-y-5">
        {statements.map((statement) => (
          <div key={statement} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-black/5 pb-4 last:border-0 last:pb-0">
            <p className="text-sm font-medium text-slate-800">{statement}</p>
            <select
              value={values[statement] || ''}
              onChange={(e) => setValues((v) => ({ ...v, [statement]: Number(e.target.value) }))}
              className="w-full sm:w-52 px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm outline-none focus:border-[#0F8594]/40"
            >
              <option value="" disabled>Choose one…</option>
              {FEELING_SCALE.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.value} — {opt.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        {onSkip ? (
          <button type="button" onClick={onSkip} className="text-xs text-slate-400 underline">Skip for now</button>
        ) : <span />}
        <div className="flex items-center gap-3">
          {!complete && <span className="text-xs text-slate-400">Answer all {statements.length} to continue</span>}
          <button
            type="button"
            onClick={submit}
            disabled={!complete || submitting}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
            style={{ background: TEAL }}
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
