import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getWeeklyFeedback, submitWeeklyFeedback } from '../../services/api';
import { isWeeklyFeedbackDue } from '../../utils/derived';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { pickFiveStatements, FEELING_SCALE } from '../../constants/feelingScale';

const TEAL = '#0F8594';
const CREAM = '#F6F4EC';

export default function WeeklyFeedback() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };

  const [history, setHistory] = useState([]);
  const [due, setDue] = useState(true);
  const [values, setValues] = useState({});
  const [comments, setComments] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  // A stable set of 5 statements per calendar week, so reloading mid-form
  // doesn't shuffle the questions on the patient.
  const weekSeed = (() => {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    return `weekly-${d.getFullYear()}-w${week}`;
  })();
  const statements = pickFiveStatements(weekSeed);

  const refresh = () => {
    getWeeklyFeedback(user.id)
      .then((list) => { setHistory(list); setDue(isWeeklyFeedbackDue(list)); })
      .catch((err) => console.error('Failed to load weekly feedback:', err));
  };
  useEffect(refresh, [user.id]);

  const answered = statements.filter((s) => values[s]).length;
  const complete = answered === statements.length;

  const submit = () => {
    if (!complete) return;
    const answers = statements.map((statement) => ({ statement, value: values[statement] }));
    submitWeeklyFeedback(user.id, { answers, comments })
      .then(() => { refresh(); setValues({}); setComments(''); setJustSubmitted(true); })
      .catch((err) => console.error('Failed to submit weekly feedback:', err));
  };

  return (
    <PatientDashboardLayout active="feedback" user={user} onLogout={handleLogout}>
      {/* Header */}
      <div className="rounded-3xl p-7 md:p-9 mb-6 flex items-center justify-between gap-6 flex-wrap" style={{ background: 'linear-gradient(100deg, #D7E8BE 0%, #EDE9D8 45%, #F5D7B0 90%)' }}>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Weekly check-in</h1>
          <p className="text-slate-600 mt-2 text-sm md:text-base">Five quick statements. Your therapist reads every answer before your next session.</p>
        </div>
        <span className={`px-4 py-2 rounded-full text-xs font-bold ${due ? 'bg-white text-slate-800' : 'bg-white/70 text-emerald-700'}`}>
          {due ? 'Due this week' : 'Done for this week'}
        </span>
      </div>

      {due ? (
        <div className="bg-white border border-black/5 rounded-3xl shadow-sm overflow-hidden mb-6">
          <div className="px-6 md:px-8 pt-6">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
              <span>{answered} of {statements.length} answered</span>
              <span>{Math.round((answered / statements.length) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#F6F4EC] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(answered / statements.length) * 100}%`, background: TEAL }} />
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            {statements.map((statement, i) => (
              <div key={statement} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-black/5 pb-5 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style={{ background: values[statement] ? TEAL : '#CBD5E1' }}>{i + 1}</span>
                  <p className="font-semibold text-slate-900 text-sm">{statement}</p>
                </div>
                <select
                  value={values[statement] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [statement]: Number(e.target.value) }))}
                  className="w-full sm:w-52 px-3 py-2.5 bg-[#FBFAF6] border border-black/10 rounded-xl text-sm outline-none focus:border-[#0F8594]/40"
                >
                  <option value="" disabled>Choose one…</option>
                  {FEELING_SCALE.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.value} — {opt.label}</option>
                  ))}
                </select>
              </div>
            ))}

            <div>
              <p className="font-semibold text-slate-900 mb-2">Anything you&apos;d like your therapist to know? <span className="font-normal text-slate-400">(optional)</span></p>
              <textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="A win, a worry, a question…"
                className="w-full px-5 py-3.5 bg-[#FBFAF6] border border-black/5 rounded-2xl outline-none focus:border-[#0F8594]/40 focus:bg-white transition-all resize-none text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-4">
              {!complete && <span className="text-xs text-slate-400">Answer all {statements.length} statements to submit</span>}
              <button
                type="button"
                onClick={submit}
                disabled={!complete}
                className="px-7 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40 transition-all"
                style={{ background: TEAL }}
              >
                Send this week&apos;s check-in
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-3xl shadow-sm p-8 mb-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl" style={{ background: CREAM }}>{justSubmitted ? '🎉' : '✅'}</div>
          <div>
            <p className="font-bold text-slate-900">{justSubmitted ? 'Thank you — sent to your therapist.' : "You're all set for this week."}</p>
            <p className="text-sm text-slate-500 mt-1">Your next check-in opens 7 days after your last submission.</p>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white border border-black/5 rounded-3xl shadow-sm p-6 md:p-8">
          <h3 className="font-bold text-lg text-slate-900 mb-1">Your check-in history</h3>
          <p className="text-xs text-slate-500 mb-5">Most recent first.</p>
          <div className="relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-black/10" />
            <div className="space-y-4">
              {history.slice().reverse().map((h) => (
                <div key={h.id} className="relative">
                  <span className="absolute -left-[22px] top-3 w-3 h-3 rounded-full border-2 border-white" style={{ background: TEAL }} />
                  <div className="rounded-2xl px-5 py-4 border border-black/5" style={{ background: CREAM }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-600">{new Date(h.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {(h.answers || []).map((a) => (
                        <span key={a.statement}>{a.statement}: <b className="text-slate-800">{FEELING_SCALE.find((s) => s.value === a.value)?.label || a.value}</b></span>
                      ))}
                    </div>
                    {h.comments && <p className="text-sm text-slate-700 mt-2 italic">“{h.comments}”</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PatientDashboardLayout>
  );
}
