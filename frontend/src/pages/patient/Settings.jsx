import { useEffect, useState } from 'react';
import { usePatientSession } from '../../hooks/usePatientSession';
import { getProfile, saveProfile, changePassword, getPatientOnboarding, getMyProfile } from '../../services/api';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import PremiumCard from '../../components/PremiumCard';

function Toggle({ checked, onChange }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${checked ? '' : 'bg-slate-200'}`}
            style={checked ? { background: '#0F8594' } : undefined}
        >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
        </button>
    );
}

function Row({ label, desc, checked, onChange }) {
    return (
        <div className="flex items-center justify-between py-3.5">
            <div className="pr-4">
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

function Info({ label, value }) {
    return (
        <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
            <p className="text-sm font-semibold text-slate-800 break-words">{value || '—'}</p>
        </div>
    );
}

function Section({ title, desc, children }) {
    return (
        <div className="bg-white border border-black/5 rounded-3xl shadow-sm p-6 md:p-8">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {desc && <p className="text-xs text-slate-500 mt-1 mb-2">{desc}</p>}
            <div className="divide-y divide-black/5 mt-2">{children}</div>
        </div>
    );
}

export default function Settings() {
    const { user, loading, error, reload, logout } = usePatientSession();

    // Seeded from the extended profile document where available; falls back
    // to sensible defaults. Persisted via PUT /api/patients/:id/profile.
    const [prefs, setPrefs] = useState({
        emailNotifications: true, smsNotifications: false, whatsappNotifications: false,
        appointmentReminders: true, weeklyDigest: true, productUpdates: false,
        whatsappSessionSummaries: false, twoFactorAuth: false, shareDataWithCaregivers: false,
    });
    const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    const [pwStatus, setPwStatus] = useState(null);
    const [onboarding, setOnboarding] = useState(null);
    const [pgProfile, setPgProfile] = useState(null);

    useEffect(() => {
        if (!user?.id) return;
        getPatientOnboarding(user.id).then((o) => setOnboarding(o?.fields || null)).catch(() => {});
        getMyProfile().then((u) => setPgProfile(u?.patientProfile || null)).catch(() => {});
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        getProfile(user.id).then((p) => { if (p?.preferences) setPrefs((prev) => ({ ...prev, ...p.preferences })); })
            .catch((err) => console.error('Failed to load settings:', err));
    }, [user?.id]);

    const set = (key) => (value) => setPrefs((p) => ({ ...p, [key]: value }));

    const savePreferences = async () => {
        try {
            setSaving(true);
            await saveProfile(user.id, { preferences: prefs });
            setSavedAt(new Date());
        } catch (err) {
            console.error('Error saving settings:', err);
        } finally {
            setSaving(false);
        }
    };

    const changePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!passwordForm.next || passwordForm.next !== passwordForm.confirm) {
            setPwStatus({ ok: false, message: 'New password and confirmation must match.' });
            return;
        }
        try {
            await changePassword(passwordForm.current, passwordForm.next);
            setPwStatus({ ok: true, message: 'Password updated.' });
            setPasswordForm({ current: '', next: '', confirm: '' });
        } catch (err) {
            setPwStatus({ ok: false, message: err.message });
        }
    };

    if (loading) return <PortalLoading />;
    if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

    return (
        <PatientDashboardLayout active="settings" user={user} onLogout={logout}>
            <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage your account, privacy, and notification preferences.</p>
                </div>
                <button
                    onClick={savePreferences}
                    disabled={saving}
                    className="px-6 py-2.5 rounded-full text-sm font-bold text-white hover:opacity-90 transition-all disabled:opacity-50"
                    style={{ background: '#0F8594' }}
                >
                    {saving ? 'Saving…' : savedAt ? 'Saved ✓' : 'Save Changes'}
                </button>
            </div>

            <div className="space-y-5">
                <PremiumCard userId={user.id} />
                <Section title="Your demographic information" desc="What you told us on the registration form. Contact your therapist if anything needs to change.">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-5 py-4">
                        <Info label="Form filled for" value={onboarding?.formFor === 'care' ? 'Someone in my care' : onboarding?.formFor === 'self' ? 'Myself' : ''} />
                        {onboarding?.formFor === 'care' && <Info label="Caregiver" value={onboarding?.caregiverName} />}
                        {onboarding?.formFor === 'care' && <Info label="Relationship" value={onboarding?.relationship} />}
                        <Info label="Full name" value={onboarding?.fullName || user?.name} />
                        <Info label="Date of birth" value={onboarding?.dob} />
                        <Info label="Age" value={pgProfile?.age} />
                        <Info label="Gender" value={onboarding?.gender || pgProfile?.gender} />
                        <Info label="Blood group" value={onboarding?.bloodGroup} />
                        <Info label="Phone" value={onboarding?.phone} />
                        <Info label="Email" value={onboarding?.email || user?.email} />
                        <Info label="City" value={onboarding?.city} />
                        <Info label="Country" value={onboarding?.country === 'Other' ? onboarding?.otherCountry : onboarding?.country} />
                        <Info label="Occupation" value={onboarding?.occupation === 'Other' ? onboarding?.otherOccupation : onboarding?.occupation} />
                        <Info label="Education" value={onboarding?.educationLevel === 'Other' ? onboarding?.otherEducationLevel : onboarding?.educationLevel} />
                        <Info label="Marital status" value={onboarding?.maritalStatus} />
                        <Info label="Sleep pattern" value={onboarding?.sleepPattern} />
                        <Info label="Heard about us via" value={onboarding?.referralSource === 'Other' ? onboarding?.otherReferralSource : onboarding?.referralSource} />
                        <div className="col-span-2 md:col-span-3"><Info label="Main concerns" value={[...(onboarding?.concerns || []).filter((c) => c !== 'Other'), onboarding?.otherConcern].filter(Boolean).join(', ')} /></div>
                        {onboarding?.additionalInfo && <div className="col-span-2 md:col-span-3"><Info label="Additional information" value={onboarding.additionalInfo} /></div>}
                    </div>
                </Section>

                <Section title="Account Settings" desc="Your basic account information.">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3.5">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Full Name</p>
                            <p className="text-sm font-semibold text-slate-800">{user?.full_name || user?.name || 'Not provided'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Email</p>
                            <p className="text-sm font-semibold text-slate-800">{user?.email || 'Not provided'}</p>
                        </div>
                    </div>
                </Section>

                <Section title="Privacy & Security">
                    <Row label="Two-Factor Authentication" desc="Add an extra layer of security to your account." checked={prefs.twoFactorAuth} onChange={set('twoFactorAuth')} />
                    <Row label="Share Data With Caregivers" desc="Allow linked caregivers to view your progress and reports." checked={prefs.shareDataWithCaregivers} onChange={set('shareDataWithCaregivers')} />
                </Section>

                <Section title="Notification Preferences">
                    <Row label="Appointment Reminders" desc="Get reminded before upcoming sessions." checked={prefs.appointmentReminders} onChange={set('appointmentReminders')} />
                    <Row label="Weekly Digest" desc="A weekly summary of your progress." checked={prefs.weeklyDigest} onChange={set('weeklyDigest')} />
                    <Row label="Product Updates" desc="News about new features and improvements." checked={prefs.productUpdates} onChange={set('productUpdates')} />
                </Section>

                <Section title="Email Preferences">
                    <Row label="Email Notifications" desc="Receive notifications via email." checked={prefs.emailNotifications} onChange={set('emailNotifications')} />
                </Section>

                <Section title="WhatsApp Preferences">
                    <Row label="WhatsApp Notifications" desc="Receive reminders and updates on WhatsApp." checked={prefs.whatsappNotifications} onChange={set('whatsappNotifications')} />
                    <Row label="Session Summaries" desc="Get a summary of each session sent to WhatsApp." checked={prefs.whatsappSessionSummaries} onChange={set('whatsappSessionSummaries')} />
                </Section>

                <Section title="Password">
                    <form onSubmit={changePasswordSubmit} className="py-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <input type="password" placeholder="Current password" value={passwordForm.current}
                                onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
                                className="border border-black/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-slate-400" />
                            <input type="password" placeholder="New password" value={passwordForm.next}
                                onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
                                className="border border-black/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-slate-400" />
                            <input type="password" placeholder="Confirm new password" value={passwordForm.confirm}
                                onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
                                className="border border-black/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-slate-400" />
                        </div>
                        {pwStatus && (
                            <p className={`text-xs font-semibold ${pwStatus.ok ? 'text-emerald-600' : 'text-red-600'}`}>{pwStatus.message}</p>
                        )}
                        <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-bold border border-black/10 text-slate-700 hover:bg-slate-50 transition-all">
                            Update Password
                        </button>
                    </form>
                </Section>

                <Section title="Appearance" desc="Theme options — coming soon.">
                    <div className="py-3.5">
                        <select disabled className="border border-black/10 rounded-xl px-4 py-2.5 text-sm text-slate-400 bg-slate-50 cursor-not-allowed">
                            <option>Light (default)</option>
                        </select>
                    </div>
                </Section>

                <Section title="Language" desc="Interface language — coming soon.">
                    <div className="py-3.5">
                        <select disabled className="border border-black/10 rounded-xl px-4 py-2.5 text-sm text-slate-400 bg-slate-50 cursor-not-allowed">
                            <option>English (default)</option>
                        </select>
                    </div>
                </Section>
            </div>
        </PatientDashboardLayout>
    );
}
