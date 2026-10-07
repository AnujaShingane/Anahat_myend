import { useState } from 'react';
import { PrimaryButton } from '../../../components/ui/Kit';
import { SAGE_DARK, SAGE } from '../../../components/layout/TherapistDashboardLayout';
import { initialsOf } from '../../../utils/initials';

const CREAM = '#F6F4EC';

// Therapist profile: header card with photo + name, then the details
// patients see on the booking card. Everything is pre-filled from the
// registration form; availability lives on the dashboard, not here.
export default function ProfileTab({
  name, level, specialty, experience, contactEmail, contactPhone, bio, avatarUrl, sessionFee,
  qualification, address, onSaveDetails, onAvatarChange,
}) {
  const [form, setForm] = useState({ specialty, experience, contactEmail, contactPhone, bio, sessionFee: sessionFee ?? '' });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = () => {
    onSaveDetails({ ...form, sessionFee: form.sessionFee === '' ? null : Number(form.sessionFee) });
    setSaved(true); setEditing(false);
    setTimeout(() => setSaved(false), 2500);
  };
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onAvatarChange(reader.result);
    reader.readAsDataURL(file);
  };

  const Field = ({ label, k, value, textarea, type }) => (
    <div className="py-3 grid grid-cols-[150px_1fr] gap-3 items-start">
      <dt className="text-xs font-semibold text-slate-500 pt-1">{label}</dt>
      <dd className={`overflow-hidden break-words text-sm text-slate-800 ${editing && textarea ? 'h-24' : 'h-11'}`}>
        {editing && k ? (
          textarea
            ? <textarea rows={3} value={form[k]} onChange={set(k)} className="h-24 w-full resize-none overflow-y-auto rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm outline-none focus:border-[#0F8594] focus:ring-2 focus:ring-[#0F8594]/20" />
            : <input type={type || 'text'} value={form[k]} onChange={set(k)} className="w-full px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm outline-none focus:border-[#0F8594] focus:ring-2 focus:ring-[#0F8594]/20" />
        ) : <span className="block h-full overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{value || form[k] || <span className="text-slate-400">Not provided</span>}</span>}
      </dd>
    </div>
  );

  return (
    <div className="w-full space-y-5 pt-8">
      <div className="td-animate-in min-h-[168px] w-full overflow-hidden border-b border-black/10 bg-white">
        <div className="h-24" style={{ background: 'linear-gradient(100deg, #D7E8BE 0%, #EDE9D8 45%, #F5D7B0 90%)' }} />
        <div className="px-6 md:px-8 pb-5 -mt-10 flex min-h-[112px] flex-col md:flex-row md:items-end gap-5">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden flex items-center justify-center text-2xl font-bold text-white" style={{ background: SAGE }}>
              {avatarUrl ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" /> : initialsOf(name)}
            </div>
            <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border border-black/10 flex items-center justify-center cursor-pointer shadow" title="Change photo">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h1.2a2 2 0 001.6-.8l.8-1.2A2 2 0 0110.2 4h3.6a2 2 0 011.6.8l.8 1.2a2 2 0 001.6.8H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3.5" /></svg>
              <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </label>
          </div>
          <div className="flex-1 min-w-0 md:pb-1">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{name}</h1>
            <p className="text-sm text-slate-500">{[qualification, address].filter(Boolean).join(' · ') || contactEmail}</p>
          </div>
          <div className="flex items-center gap-2 md:pb-1">
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest" style={{ background: CREAM, color: SAGE_DARK }}>{level}</span>
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 border border-black/10">Cancel</button>
                <PrimaryButton onClick={save} className="!py-2 !px-4 text-xs">Save</PrimaryButton>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: '#0F8594' }}>Edit details</button>
            )}
          </div>
        </div>
      </div>

      {saved && <p className="text-sm font-semibold" style={{ color: SAGE_DARK }}>Profile saved.</p>}

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="td-animate-in h-[320px] overflow-hidden border-b border-black/10 bg-white p-5 md:p-6">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Practice</h2>
          <dl className="divide-y divide-black/5">
            <Field label="Specialization" k="specialty" />
            <Field label="Experience" k="experience" />
            <Field label="Qualification" value={qualification} />
            <Field label="Session fee (₹)" k="sessionFee" type="number" />
          </dl>
        </div>
        <div className="td-animate-in h-[320px] overflow-hidden border-b border-black/10 bg-white p-5 md:p-6">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Contact</h2>
          <dl className="divide-y divide-black/5">
            <Field label="Email" k="contactEmail" />
            <Field label="Phone" k="contactPhone" />
            <Field label="Address" value={address} />
          </dl>
        </div>
        <div className="td-animate-in h-[200px] overflow-hidden border-b border-black/10 bg-white p-5 md:col-span-2 md:p-6">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">About</h2>
          <dl>
            <Field label="Short bio" k="bio" textarea />
          </dl>
        </div>
      </div>
    </div>
  );
}
