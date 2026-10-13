import { useState } from 'react';
import { SAGE_DARK } from '../../../components/layout/TherapistDashboardLayout';

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${checked ? '' : 'bg-black/10'}`}
      style={checked ? { background: SAGE_DARK } : undefined}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Row({ title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b last:border-0 border-black/[0.04]">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="min-h-[3.5rem] overflow-hidden">
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{label}</p>
      <p className="mt-0.5 h-8 overflow-hidden break-words text-sm text-slate-800" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{value || '—'}</p>
    </div>
  );
}

export default function SettingsTab({ demographics = {}, prefs, onSavePrefs, onChangePassword, onLogout }) {
  const [local, setLocal] = useState(prefs);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const update = (patch) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onSavePrefs(next);
    setSavedMsg('Saved');
    setTimeout(() => setSavedMsg(''), 1500);
  };

  const submitPassword = async () => {
    if (!pw.current || !pw.next) { setPwMsg('Enter your current and new password.'); return; }
    if (pw.next !== pw.confirm) { setPwMsg("New passwords don't match."); return; }
    try {
      await onChangePassword(pw);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg('Password updated.');
    } catch (err) {
      setPwMsg(err.message || 'Could not update password.');
    }
    setTimeout(() => setPwMsg(''), 3000);
  };

  return (
    <div className="w-full space-y-5 pt-8">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Account, notifications, and privacy.</p>
      </div>

      <div className="w-full border-b border-black/10 bg-white p-5 md:p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Your details</h3>
        <p className="text-xs text-slate-500 mb-5">The information you gave when you registered. Patients see the professional parts on your booking card.</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          <Field label="Full name" value={demographics.name} />
          <Field label="Email" value={demographics.email} />
          <Field label="Contact number" value={demographics.phone} />
          <Field label="Age" value={demographics.age} />
          <Field label="Gender" value={demographics.gender} />
          <Field label="Years of experience" value={demographics.experienceYears != null ? `${demographics.experienceYears} years` : ''} />
          <Field label="Qualification" value={demographics.qualification} />
          <Field label="Session fee" value={demographics.fee != null && demographics.fee !== '' ? `₹${demographics.fee}` : ''} />
          <div className="col-span-2 xl:col-span-3"><Field label="Address" value={demographics.address} /></div>
          <div className="col-span-2 xl:col-span-3"><Field label="Specialization" value={demographics.specialization} /></div>
          {demographics.bio && <div className="col-span-2 xl:col-span-6"><Field label="Bio" value={demographics.bio} /></div>}
        </div>
      </div>

      <div className="w-full border-b border-black/10 bg-white p-5 md:p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Password</h3>
        <p className="text-xs text-slate-500 mb-4">Update your account password.</p>
        <div className="space-y-3">
          <input type="password" placeholder="Current password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
            className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
          <input type="password" placeholder="New password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
            className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
          <input type="password" placeholder="Confirm new password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
          <div className="flex items-center gap-3">
            <button onClick={submitPassword} className="px-5 py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: SAGE_DARK }}>Update Password</button>
            {pwMsg && <span className="text-xs font-semibold text-slate-500">{pwMsg}</span>}
          </div>
        </div>
      </div>

      <div className="w-full border-b border-black/10 bg-white p-5 md:p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Notifications</h3>
        <p className="text-xs text-slate-500 mb-2">Choose what you're notified about.</p>
        <Row title="Appointment requests" subtitle="New booking requests from patients">
          <Toggle checked={local.notifyRequests} onChange={(v) => update({ notifyRequests: v })} />
        </Row>
        <Row title="Session reminders" subtitle="Reminders before an upcoming session">
          <Toggle checked={local.notifyReminders} onChange={(v) => update({ notifyReminders: v })} />
        </Row>
        <Row title="Patient messages" subtitle="New messages during a consultation">
          <Toggle checked={local.notifyMessages} onChange={(v) => update({ notifyMessages: v })} />
        </Row>
      </div>

      <div className="w-full border-b border-black/10 bg-white p-5 md:p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Privacy</h3>
        <p className="text-xs text-slate-500 mb-2">Control what patients can see about you.</p>
        <Row title="Show profile to prospective patients" subtitle="Your name, specialization, and bio">
          <Toggle checked={local.profileVisible} onChange={(v) => update({ profileVisible: v })} />
        </Row>
        <Row title="Accepting new patients" subtitle="Whether new patients can be matched to you">
          <Toggle checked={local.acceptingNewPatients} onChange={(v) => update({ acceptingNewPatients: v })} />
        </Row>
      </div>
      {savedMsg && <p className="text-xs font-bold text-emerald-600 text-right">{savedMsg}</p>}

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-3">Account</h3>
        <button onClick={onLogout} className="text-sm font-bold text-red-500 hover:text-red-600">Logout</button>
      </div>
    </div>
  );
}
