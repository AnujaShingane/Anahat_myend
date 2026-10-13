import { useEffect, useRef, useState } from 'react';
import { usePatientSession } from '../../hooks/usePatientSession';
import { getPatientOnboarding, getMyProfile, updateContact, uploadAvatar, getAssignedTherapist, getCurrentTherapistId, getTherapistDetail, submitPatientOnboarding } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import { initialsOf } from '../../utils/initials';

const TEAL = '#0A6976';
const CREAM = '#F6F4EC';

// Contact number, photo, and the demographic fields below are all editable —
// only account identity (name/email) and therapist-assigned facts (concerns
// history, assigned therapist, join date) stay read-only.
const EDITABLE_KEYS = ['dob', 'gender', 'bloodGroup', 'maritalStatus', 'city', 'country', 'occupation', 'educationLevel', 'sleepPattern', 'additionalInfo'];

export default function Profile() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const { login } = useAuth();
  const [ob, setOb] = useState(null);
  const [pg, setPg] = useState(null);
  const [therapist, setTherapist] = useState(null);
  const [phone, setPhone] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    getPatientOnboarding(user.id).then((o) => setOb(o?.fields || {})).catch(() => setOb({}));
    getMyProfile().then((u) => { setPg(u); setPhone(u?.phone || ''); }).catch(() => {});
    getCurrentTherapistId(user.id).then((id) => (id ? getTherapistDetail(id) : getAssignedTherapist(user.id))).then(setTherapist).catch(() => {});
  }, [user?.id]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  const pp = pg?.patientProfile || {};
  const name = user?.name || ob?.fullName || '';
  const avatar = user?.avatarUrl || (pg?.avatarFileId ? `/api/profile/files/${pg.avatarFileId}` : null);
  const joined = pg?.createdAt ? new Date(pg.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const concerns = [...((ob?.concerns || []).filter((c) => c !== 'Other')), ob?.otherConcern].filter(Boolean).join(', ') || pp.disease;

  const savePhone = () => {
    updateContact(phone).then((u) => { login({ ...user, ...u }); setEditingPhone(false); setMsg('Contact number updated.'); setTimeout(() => setMsg(''), 2500); })
      .catch((e) => setMsg(e.message || 'Could not update.'));
  };
  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    uploadAvatar(f).then((u) => login({ ...user, ...u })).catch((err) => setMsg(err.message || 'Upload failed.'));
  };
  const startEditingDetails = () => {
    setForm({
      dob: ob?.dob || '', gender: ob?.gender || '', bloodGroup: ob?.bloodGroup || '', maritalStatus: ob?.maritalStatus || '',
      city: ob?.city || '', country: ob?.country || '', occupation: ob?.occupation || '', educationLevel: ob?.educationLevel || '',
      sleepPattern: ob?.sleepPattern || '', additionalInfo: ob?.additionalInfo || '',
    });
    setEditingDetails(true);
  };
  const saveDetails = () => {
    setSaving(true);
    submitPatientOnboarding(user.id, name, { ...ob, ...form })
      .then(() => { setOb((prev) => ({ ...prev, ...form })); setEditingDetails(false); setMsg('Profile updated.'); setTimeout(() => setMsg(''), 2500); })
      .catch((e) => setMsg(e.message || 'Could not update your profile.'))
      .finally(() => setSaving(false));
  };

  const sections = [
    { title: 'Personal', rows: [
      ['Full name', ob?.fullName || name], ['Date of birth', 'dob'], ['Age', pp.age], ['Gender', 'gender'],
      ['Blood group', 'bloodGroup'], ['Marital status', 'maritalStatus'],
    ] },
    { title: 'Contact', rows: [
      ['Email', user?.email], ['Phone', pg?.phone || ob?.phone], ['City', 'city'], ['Country', 'country'],
    ] },
    { title: 'Background', rows: [
      ['Occupation', 'occupation'],
      ['Education', 'educationLevel'],
      ['Sleep pattern', 'sleepPattern'], ['Heard about us via', ob?.referralSource === 'Other' ? ob?.otherReferralSource : ob?.referralSource],
    ] },
    { title: 'Therapy', rows: [
      ['Form filled for', ob?.formFor === 'care' ? `Someone in my care (${ob?.caregiverName || ''}, ${ob?.relationship || ''})` : ob?.formFor === 'self' ? 'Myself' : ''],
      ['Main concerns', concerns], ['Additional information', 'additionalInfo'],
      ['Therapist', therapist?.name], ['Member since', joined],
    ] },
  ];

  return (
    <PatientDashboardLayout active="profile" user={user} onLogout={logout}>
      {/* Header card */}
      <div className="relative rounded-3xl overflow-hidden mb-6 bg-white border border-black/5 shadow-sm">
        <div className="h-28" style={{ background: 'linear-gradient(100deg, #D7E8BE 0%, #EDE9D8 45%, #F5D7B0 90%)' }} />
        <div className="px-6 md:px-8 pb-6 -mt-12 flex flex-col md:flex-row md:items-end gap-5">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden flex items-center justify-center text-2xl font-bold text-white" style={{ background: TEAL }}>
              {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : initialsOf(name)}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border border-black/10 shadow flex items-center justify-center text-slate-600" aria-label="Change photo">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h1.2a2 2 0 001.6-.8l.8-1.2A2 2 0 0110.2 4h3.6a2 2 0 011.6.8l.8 1.2a2 2 0 001.6.8H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3.5" /></svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
          </div>
          <div className="flex-1 min-w-0 md:pb-1">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{name}</h1>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
          <div className="flex gap-2 md:pb-1">
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest" style={{ background: CREAM, color: TEAL }}>Patient</span>
            {user?.isProfileComplete && <span className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700">Verified</span>}
          </div>
        </div>
      </div>

      {msg && <p className="mb-4 text-sm font-semibold" style={{ color: TEAL }}>{msg}</p>}

      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs text-slate-500">Contact number, photo and the details below are all yours to update.</p>
        {editingDetails ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditingDetails(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 border border-black/10">Cancel</button>
            <button type="button" onClick={saveDetails} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-60" style={{ background: TEAL }}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        ) : (
          <button type="button" onClick={startEditingDetails} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: '#0F8594' }}>Edit profile</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((sec) => (
          <div key={sec.title} className="bg-white rounded-3xl border border-black/5 shadow-sm p-6 md:p-7">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-4">{sec.title}</h2>
            <dl className="divide-y divide-black/5">
              {sec.rows.map(([label, value]) => {
                const isEditableField = typeof value === 'string' && EDITABLE_KEYS.includes(value);
                const key = isEditableField ? value : null;
                const displayValue = isEditableField ? ob?.[key] : value;
                return (
                  <div key={label} className="py-3 grid grid-cols-[130px_1fr] gap-3 items-start">
                    <dt className="text-xs font-semibold text-slate-500 pt-0.5">{label}</dt>
                    <dd className="text-sm text-slate-800 break-words">
                      {label === 'Phone' ? (
                        editingPhone ? (
                          <span className="flex gap-2">
                            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number (add country code if outside India)" className="flex-1 px-3 py-1.5 rounded-lg border border-black/10 text-sm outline-none focus:border-[#0F8594]" />
                            <button type="button" onClick={savePhone} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: TEAL }}>Save</button>
                            <button type="button" onClick={() => setEditingPhone(false)} className="px-2 text-xs font-bold text-slate-500">Cancel</button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-3">
                            <span>{displayValue || <span className="text-slate-400">Not provided</span>}</span>
                            <button type="button" onClick={() => setEditingPhone(true)} className="text-xs font-bold" style={{ color: TEAL }}>Edit</button>
                          </span>
                        )
                      ) : isEditableField && editingDetails ? (
                        label === 'Additional information' ? (
                          <textarea rows={3} value={form[key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none resize-none focus:border-[#0F8594]" />
                        ) : label === 'Date of birth' ? (
                          <input type="date" value={form[key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-1.5 rounded-lg border border-black/10 text-sm outline-none focus:border-[#0F8594]" />
                        ) : (
                          <input value={form[key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-1.5 rounded-lg border border-black/10 text-sm outline-none focus:border-[#0F8594]" />
                        )
                      ) : (displayValue || <span className="text-slate-400">Not provided</span>)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </PatientDashboardLayout>
  );
}
