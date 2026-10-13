import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { submitTherapistSurvey, completeTherapistProfile } from '../../services/api';
import { GENDER_OPTIONS, QUALIFICATION_OPTIONS } from '../../constants/options';
import { isValidPhone } from '../../utils/phone';
import { PageShell, Card, SectionHeading, PrimaryButton, TextField, SelectField, TextAreaField } from '../../components/ui/Kit';
import BackButton from '../../components/layout/BackButton';

const TEAL = '#0F8594';
const CREAM = '#F6F4EC';

// Therapist demographic form, shown once after sign-up. Submitting takes the
// therapist straight to their console — the console stays locked with a
// "not approved yet" banner until Anahat Admin approves the account.
export default function TherapistOnboardingSurvey() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef(null);

  const [form, setForm] = useState({
    name: user?.name || '',
    age: '',
    address: '',
    phone: '',
    gender: '',
    yearsExperience: '',
    practiceLevel: '',
    qualification: '',
    specialization: '',
    fee: '',
    bio: '',
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError('Profile photo must be a JPG or PNG.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Profile photo must be under 5MB.'); return; }
    setError('');
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const missing = [];
  if (!form.name.trim()) missing.push('name');
  if (!form.age) missing.push('age');
  if (!form.address.trim()) missing.push('address');
  if (!isValidPhone(form.phone)) missing.push('a valid mobile number (10-digit Indian, or international with country code)');
  if (!form.gender) missing.push('gender');
  if (form.yearsExperience === '') missing.push('years of experience');
  if (!form.practiceLevel) missing.push('your practice level');
  if (!form.qualification) missing.push('qualification');
  if (!form.specialization.trim()) missing.push('specialization');
  if (!form.fee) missing.push('session fee');

  const submit = async () => {
    if (!avatarFile) {
      setError('Upload a profile photo before submitting your profile.');
      return;
    }
    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}.`);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const [firstName, ...rest] = form.name.trim().split(/\s+/);
      const experienceYears = parseInt(form.yearsExperience, 10) || 0;
      const specializations = form.specialization.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

      const [, updatedUser] = await Promise.all([
        submitTherapistSurvey(user.id, { ...form, specializations }),
        completeTherapistProfile({
          firstName, lastName: rest.join(' '), phone: form.phone,
          age: form.age, gender: form.gender, experienceYears,
          experienceDetails: form.qualification, profession: form.qualification,
          fee: form.fee, address: form.address, bio: form.bio,
        }, avatarFile),
      ]);
      login(updatedUser);
      navigate('/therapist', { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to submit your details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell showBack={false}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <BackButton to="/" label="Back to home" className="mb-6" />
        <SectionHeading
          eyebrow="One-time setup"
          title="Tell us about your practice"
          subtitle="These details appear on your profile card when patients book a session."
        />

        <Card className="space-y-6">
          {/* Profile photo — required */}
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className={`group relative w-24 h-24 rounded-full overflow-hidden flex items-center justify-center border-4 shrink-0 transition ${
                avatarPreview ? 'border-white shadow-lg' : 'border-dashed border-[#0F8594]/50 shadow-sm'
              }`}
              style={{ background: avatarPreview ? undefined : CREAM, color: TEAL }}
              aria-label={avatarPreview ? 'Change profile photo' : 'Upload profile photo (required)'}
            >
              {avatarPreview ? (
                <>
                  <img src={avatarPreview} alt="Profile preview" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[10px] font-bold uppercase tracking-wide opacity-0 transition group-hover:opacity-100">
                    Change
                  </span>
                </>
              ) : (
                <svg className="w-9 h-9 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h1.2a2 2 0 001.6-.8l.8-1.2A2 2 0 0110.2 4h3.6a2 2 0 011.6.8l.8 1.2a2 2 0 001.6.8H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3.5" /></svg>
              )}
            </button>
            <div>
              <p className="text-sm font-bold text-slate-800">Profile photo <span className="font-bold text-[#e85d35]">* required</span></p>
              <p className="text-xs text-slate-500 mb-2">Patients see this on your booking card — profiles can't be submitted without one. JPG or PNG, max 5MB.</p>
              <button type="button" onClick={() => avatarInputRef.current?.click()} className="px-4 py-2 rounded-xl border border-[#0F8594]/50 text-xs font-bold text-[#0A6976] hover:bg-[#E5F7F8] transition">
                {avatarFile ? 'Change photo' : 'Upload photo'}
              </button>
              <input ref={avatarInputRef} type="file" accept=".jpg,.jpeg,.png" onChange={onAvatar} className="hidden" aria-required="true" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="Full Name" value={form.name} onChange={update('name')} placeholder="Dr. Jane Doe" />
            <TextField label="Age" type="number" min={18} value={form.age} onChange={update('age')} placeholder="Age" />
            <TextField label="Address" value={form.address} onChange={update('address')} placeholder="Clinic / practice address" className="md:col-span-2" />
            <TextField label="Contact Number" value={form.phone} onChange={update('phone')} placeholder="Mobile number (add country code if outside India)" />
            <SelectField label="Gender" value={form.gender} onChange={update('gender')} options={['', ...GENDER_OPTIONS]} />
            <TextField label="Years of Experience" type="number" min={0} value={form.yearsExperience} onChange={update('yearsExperience')} placeholder="e.g. 4" />
            <SelectField label="Practice Level" value={form.practiceLevel} onChange={update('practiceLevel')} options={['', 'Beginner', 'Moderate', 'Professional']} />
            <SelectField label="Qualification" value={form.qualification} onChange={update('qualification')} options={['', ...QUALIFICATION_OPTIONS]} />
            <TextField label="Session Fee (₹)" type="number" min={0} value={form.fee} onChange={update('fee')} placeholder="e.g. 1500" />
          </div>

          <TextAreaField
            label="Specialization"
            rows={2}
            value={form.specialization}
            onChange={update('specialization')}
            placeholder="Describe your specialization in your own words — e.g. anxiety and sleep disorders in adults, music therapy for children with special needs"
          />

          <TextAreaField
            label="Short Bio (optional)"
            rows={3}
            value={form.bio}
            onChange={update('bio')}
            placeholder="A brief professional summary patients will read on your profile."
          />

          {error && (
            <div className="py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center">{error}</div>
          )}

          <div className="flex justify-end pt-2">
            <PrimaryButton onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</PrimaryButton>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
