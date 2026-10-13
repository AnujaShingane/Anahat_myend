import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getProfile, saveProfile } from '../../services/api';
import { CONSENT_SECTIONS, CONSENT_CHECKBOXES } from '../../constants/consent';
import PublicNav from '../../components/public/PublicNav';

const TEAL = '#0F8594';
const CREAM = '#F6F4EC';

export const consentKey = (userId) => `anahat_consent_${userId}`;

// Shown right after the demographic form. The patient must tick every box
// before the dashboard opens. Acceptance is stored on the extended profile
// (server) and mirrored locally so the layout gate doesn't flash.
export default function Consent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checks, setChecks] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    getProfile(user.id).then((p) => {
      if (p?.consentAcceptedAt) {
        localStorage.setItem(consentKey(user.id), p.consentAcceptedAt);
        navigate('/dashboard', { replace: true });
      }
    }).catch(() => {});
  }, [user?.id, navigate]);

  const allChecked = CONSENT_CHECKBOXES.every((c) => checks[c.key]);

  const submit = async () => {
    if (!allChecked) { setError('Please accept every point to continue.'); return; }
    setError('');
    setSaving(true);
    try {
      const at = new Date().toISOString();
      await saveProfile(user.id, { consentAcceptedAt: at });
      localStorage.setItem(consentKey(user.id), at);
      localStorage.removeItem(`anahat_onboarding_draft_${user.id}`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not save your consent. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FDF6EE] font-sans text-slate-900">
      <PublicNav tone="light" />
      <div className="flex-1 pt-28 pb-16">
      <div className="max-w-4xl mx-auto px-6">
        <button
          type="button"
          onClick={() => navigate('/onboarding')}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-[#0F8594] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
          Back to form
        </button>
      </div>
      <div className="max-w-4xl mx-auto px-6 pt-8 pb-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: TEAL }}>Consent form</h1>
          <p className="text-slate-500 text-sm mt-2">Please read carefully and accept each point below to open your dashboard.</p>
        </div>

        <div className="bg-white/85 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-black/10 p-6 md:p-10 space-y-8">
          {CONSENT_SECTIONS.map((sec, i) => (
            <section key={sec.title}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: TEAL }}>{i + 1}</div>
                <h2 className="text-base font-bold" style={{ color: TEAL }}>{sec.title}</h2>
              </div>
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                {sec.paragraphs.map((p) => <p key={p}>{p}</p>)}
                {sec.bullets && (
                  <ul className="list-disc pl-6 space-y-1">
                    {sec.bullets.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                )}
                {sec.after?.map((p) => <p key={p}>{p}</p>)}
              </div>
            </section>
          ))}

          <section className="rounded-2xl p-5 md:p-6" style={{ background: CREAM }}>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Your acceptance</h2>
            <div className="space-y-3">
              {CONSENT_CHECKBOXES.map((c) => (
                <label key={c.key} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!checks[c.key]}
                    onChange={(e) => setChecks((ch) => ({ ...ch, [c.key]: e.target.checked }))}
                    className="mt-1 w-4 h-4 accent-[#0F8594]"
                  />
                  <span className="text-sm text-slate-700 leading-relaxed">{c.label}</span>
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={submit}
                disabled={!allChecked || saving}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50 transition-all"
                style={{ background: TEAL }}
              >
                {saving ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
}
