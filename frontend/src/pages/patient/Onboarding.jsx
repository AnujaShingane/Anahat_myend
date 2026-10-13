import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import { useAuth } from '../../context/AuthContext';
import {
  getPatientOnboarding, submitPatientOnboarding, completePatientProfile,
} from '../../services/api';
import { getOnboardingConfig } from '../../constants/options';
import { validatePhone } from '../../utils/phone';
import PublicNav from '../../components/public/PublicNav';

const TEAL = '#0F8594';
const CREAM = '#F6F4EC';

const MAX_FILE_MB = 5;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// ---------------------------------------------------------------------------
// Small presentational helpers, matching the reference spec exactly:
// numbered section badges, labeled inputs/selects with a left icon slot,
// and the free-form "chip" style used for selected concerns.
// ---------------------------------------------------------------------------
function SectionHeading({ number, title }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: TEAL }}>
        {number}
      </div>
      <h2 className="text-base font-bold" style={{ color: TEAL }}>{title}</h2>
    </div>
  );
}

function FieldLabel({ children, optional }) {
  return (
    <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">
      {children} {optional && <span className="font-normal text-slate-400">(Optional)</span>}
    </label>
  );
}

function IconInput({ icon, className = '', ...props }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
      <input
        className="w-full pl-10 pr-4 py-3 bg-white border border-black/10 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#0F8594]/40 transition-all"
        {...props}
      />
    </div>
  );
}

function IconSelect({ icon, options, placeholder, className = '', ...props }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10">{icon}</span>
      <select
        className="w-full pl-10 pr-9 py-3 bg-white border border-black/10 rounded-xl text-sm outline-none focus:border-[#0F8594]/40 transition-all appearance-none text-slate-800"
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

function ChevronDown(props) {
  return (<svg {...props} className={`w-4 h-4 ${props.className || ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>);
}
function IconPerson(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>); }
function IconCalendar(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>); }
function IconMail(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>); }
function IconPhone(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.05 11.05 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>); }
function IconPin(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>); }
function IconGlobe(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z" /><circle cx="12" cy="12" r="9" strokeWidth={1.75} /></svg>); }
function IconBriefcase(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>); }
function IconGraduation(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 14l9-5-9-5-9 5 9 5zm0 0v7m-9-9.5V16m18-6.5V16" /></svg>); }
function IconUsers(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-1a4 4 0 00-4-4h-1m-6 5H1v-1a4 4 0 014-4h4a4 4 0 014 4v1zM9 12a4 4 0 100-8 4 4 0 000 8zm7-3a3 3 0 10-2-5.24" /></svg>); }
function IconMoon(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" /></svg>); }
function IconMegaphone(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>); }
function IconTag(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 7h.01M7 3h5.586a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-6.586 6.586a2 2 0 01-2.828 0l-7-7A2 2 0 013 10.414V7a4 4 0 014-4z" /></svg>); }
function IconPencil(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>); }
function IconShield(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>); }
function IconUpload(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 12v9m0-9l-3 3m3-3l3 3" /></svg>); }
function IconLock(props) { return (<svg {...props} className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>); }
function IconHelp(props) { return (<svg {...props} className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.08 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>); }
function IconLeaf(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M12 21c-4.5-2.5-8-6-8-10.5A5.5 5.5 0 0112 6a5.5 5.5 0 018 4.5C20 15 16.5 18.5 12 21z" /></svg>); }
function IconArrowRight(props) { return (<svg {...props} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>); }

const FORM_FOR_OPTIONS = [
  { value: 'self', label: 'Myself — I am the person receiving therapy' },
  { value: 'care', label: 'Someone in my care — I am filling this on their behalf' },
];
const RELATIONSHIP_OPTIONS = ['Parent', 'Child', 'Spouse / Partner', 'Sibling', 'Grandparent', 'Relative', 'Friend', 'Guardian', 'Caretaker', 'Other'];

const draftKey = (userId) => `anahat_onboarding_draft_${userId}`;

const EMPTY_FORM = {
  formFor: '', caregiverName: '', relationship: '',
  fullName: '', dob: '', gender: '', bloodGroup: '', email: '', phone: '',
  city: '', country: '', otherCountry: '',
  occupation: '', otherOccupation: '',
  educationLevel: '', otherEducationLevel: '',
  maritalStatus: '', sleepPattern: '',
  referralSource: '', otherReferralSource: '', referredDoctor: '',
  concerns: [], otherConcern: '', additionalInfo: '',
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = usePatientSession();
  const { login } = useAuth();
  const [configState, setConfigState] = useState({ loading: true, error: null, data: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [identityFile, setIdentityFile] = useState(null);
  const [existingIdentityFileName, setExistingIdentityFileName] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [healthReportFile, setHealthReportFile] = useState(null);
  const [concernDropdownOpen, setConcernDropdownOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const healthReportInputRef = useRef(null);
  const concernBoxRef = useRef(null);

  // Load dropdown option sets (static) + any existing (draft/rejected)
  // submission from the real backend.
  const loadConfig = () => {
    setConfigState({ loading: true, error: null, data: null });
    try {
      const config = getOnboardingConfig();
      setConfigState({ loading: false, error: null, data: config });

      if (user?.id) {
        // Anything typed so far is kept locally, so going back to this page
        // (e.g. from the consent form) shows exactly what was filled in.
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey(user.id)) || 'null');
          if (draft && typeof draft === 'object') setForm((f) => ({ ...f, ...draft, concerns: draft.concerns || [] }));
        } catch { /* ignore corrupt draft */ }
        getPatientOnboarding(user.id).then((existing) => {
          if (existing?.status && existing.status !== 'not_submitted') {
            setForm((f) => ({
              ...f,
              ...existing.fields,
              concerns: existing.fields?.concerns || [],
            }));
            if (existing.identityProofFileName) setExistingIdentityFileName(existing.identityProofFileName);
            if (existing.status === 'rejected') setRejectionReason(existing.rejectionReason || 'Your submission was rejected. Please review and resubmit.');
          }
        }).catch((err) => console.error('Failed to load existing onboarding submission:', err));
      }
    } catch (err) {
      setConfigState({ loading: false, error: err.message || 'Something went wrong loading this form.', data: null });
    }
  };

  useEffect(() => { loadConfig(); }, [user?.id]);

  // Persist the draft on every change (cheap, and it's what keeps the form
  // filled when the patient navigates back).
  useEffect(() => {
    if (!user?.id) return;
    if (form === EMPTY_FORM) return;
    try { localStorage.setItem(draftKey(user.id), JSON.stringify(form)); } catch { /* storage full/blocked */ }
  }, [form, user?.id]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (concernBoxRef.current && !concernBoxRef.current.contains(e.target)) setConcernDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleConcern = (concern) => {
    setForm((f) => {
      const has = f.concerns.includes(concern);
      return { ...f, concerns: has ? f.concerns.filter((c) => c !== concern) : [...f.concerns, concern] };
    });
  };

  const removeConcern = (concern) => setForm((f) => ({ ...f, concerns: f.concerns.filter((c) => c !== concern) }));

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrors((er) => ({ ...er, identityProof: 'Please upload a JPG, PNG, or PDF file.' }));
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setErrors((er) => ({ ...er, identityProof: `File must be under ${MAX_FILE_MB}MB.` }));
      return;
    }
    setErrors((er) => ({ ...er, identityProof: undefined }));
    setIdentityFile(file);
  };

  // Profile photo — mirrors frontend-1's avatar upload on the patient
  // demographic form (frontend-2 didn't have this at all).
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setErrors((er) => ({ ...er, avatar: 'Please upload a JPG or PNG image.' }));
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setErrors((er) => ({ ...er, avatar: `File must be under ${MAX_FILE_MB}MB.` }));
      return;
    }
    setErrors((er) => ({ ...er, avatar: undefined }));
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  // Optional health report / medical records upload — also carried over
  // from frontend-1's demographic form.
  const handleHealthReportChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrors((er) => ({ ...er, healthReport: 'Please upload a JPG, PNG, or PDF file.' }));
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setErrors((er) => ({ ...er, healthReport: `File must be under ${MAX_FILE_MB}MB.` }));
      return;
    }
    setErrors((er) => ({ ...er, healthReport: undefined }));
    setHealthReportFile(file);
  };

  const validate = () => {
  const next = {};

  // 0. Who is this for?
  if (!form.formFor) {
    next.formFor = 'Please tell us who this form is for.';
  }
  if (form.formFor === 'care') {
    if (!form.caregiverName.trim()) next.caregiverName = 'Please enter your name.';
    if (!form.relationship) next.relationship = 'Please select your relationship with the patient.';
  }

  // 1. Basic Information
  if (!form.fullName.trim()) {
    next.fullName = 'Full name is required.';
  }

  if (!form.dob) {
    next.dob = 'Date of birth is required.';
  }

  if (!form.gender) {
    next.gender = 'Please select your gender.';
  }

  if (!form.email.trim()) {
    next.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    next.email = 'Enter a valid email address.';
  }

  {
    const phoneError = validatePhone(form.phone);
    if (phoneError) next.phone = phoneError;
  }

  // 2. Location
  if (!form.city.trim()) {
    next.city = 'City is required.';
  }

  if (!form.country) {
    next.country = 'Please select your country.';
  }
  if (form.country === 'Other' && !form.otherCountry.trim()) {
    next.otherCountry = 'Please specify your country.';
  }

  // 3. Lifestyle & Background
  if (!form.occupation) {
    next.occupation = 'Please select your occupation.';
  }
  if (form.occupation === 'Other' && !form.otherOccupation.trim()) {
    next.otherOccupation = 'Please specify your occupation.';
  }

  if (!form.educationLevel) {
    next.educationLevel = 'Please select your education level.';
  }
  if (form.educationLevel === 'Other' && !form.otherEducationLevel.trim()) {
    next.otherEducationLevel = 'Please specify your education level.';
  }

  if (!form.maritalStatus) {
    next.maritalStatus = 'Please select your marital status.';
  }

  if (!form.sleepPattern) {
    next.sleepPattern = 'Please select your sleep pattern.';
  }

  if (!form.referralSource) {
    next.referralSource = 'Please select how you heard about us.';
  }
  if (form.referralSource === 'Other' && !form.otherReferralSource.trim()) {
    next.otherReferralSource = 'Please specify how you heard about us.';
  }
  if (form.referralSource === 'Doctor Referral' && !form.referredDoctor.trim()) {
    next.referredDoctor = "Please enter the doctor's name.";
  }

  // 4. Main Concerns
  if (form.concerns.length === 0) {
    next.concerns = 'Please select at least one main concern.';
  }

  // If "Other" is selected, require the user to explain it
  if (
    form.concerns.includes('Other') &&
    !form.otherConcern.trim()
  ) {
    next.otherConcern = 'Please specify your other concern.';
  }

  // 5. Additional Information
  if (!form.additionalInfo.trim()) {
    next.additionalInfo = 'Additional information is required.';
  }

  setErrors(next);

  if (Object.keys(next).length > 0) {
    setSubmitError(
      'All fields are mandatory. Please complete all required fields before submitting.'
    );
    return false;
  }

  setSubmitError(null);
  return true;
};

  const calcAge = (dob) => {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.max(1, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const patientName = user.full_name || user.name;
      const [firstName, ...rest] = (patientName || '').trim().split(/\s+/);
      const disease = [...form.concerns.filter((c) => c !== 'Other'), form.concerns.includes('Other') ? form.otherConcern : null]
        .filter(Boolean).join(', ') || 'Not specified';

      // Two writes, both against the real backend:
      // 1) the rich frontend-2 onboarding record (auto-approved, no admin
      //    gate — see backend controllers/patientDataController.js)
      // 2) the existing Postgres demographic-profile endpoint, which is what
      //    flips `isProfileComplete` and is what frontend-1 already uses —
      //    this also carries the profile photo + health report uploads.
      const [, updatedUser] = await Promise.all([
        submitPatientOnboarding(user.id, patientName, form, identityFile),
        completePatientProfile({
          firstName, lastName: rest.join(' ') || firstName,
          age: calcAge(form.dob) || 18,
          gender: form.gender,
          occupation: form.occupation,
          maritalStatus: form.maritalStatus,
          disease,
          problemDescription: form.additionalInfo,
          phone: form.phone,
          ...(form.formFor === 'care' ? { caregiverName: form.caregiverName, caregiverRelation: form.relationship } : {}),
        }, avatarFile, healthReportFile),
      ]);

      // Refresh the app-wide user so route guards immediately see
      // isProfileComplete: true instead of bouncing back to this form.
      login(updatedUser);
      navigate('/consent');
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong submitting your form.');
    } finally {
      setSubmitting(false);
    }
  };

  const cfg = configState.data || {};
  const concernOptions = cfg.concerns || [];
  const showOtherField = form.concerns.includes('Other');

  return (
    <div className="min-h-screen flex flex-col bg-[#FDF6EE] font-sans text-slate-900 relative overflow-x-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#0F8594]/45 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#0F8594]/45 blur-[120px]"></div>
      </div>
      <PublicNav tone="light" />
      <div className="relative z-10 flex-1 pt-28 pb-16">
      <div className="max-w-4xl mx-auto px-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-[#0F8594] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
          Back to home
        </button>
      </div>

      {/* Hero heading */}
      <div className="relative text-center px-6 pt-8 pb-10 max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-[2.25rem] font-bold tracking-tight text-slate-900">Tell us about yourself</h1>
        <p className="text-slate-500 text-sm md:text-[15px] mt-3 leading-relaxed">
          Thank you for joining us. To provide you with the best possible support, please take a few minutes to tell us about yourself.
        </p>
      </div>

      {/* Review notice */}
      <div className="relative max-w-4xl mx-auto px-6 mb-8">
        <div className="bg-white/85 backdrop-blur-2xl rounded-2xl shadow-lg border border-black/10 px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: CREAM, color: TEAL }}>
              <IconPerson className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">All fields are required unless marked optional</p>
              <p className="text-xs text-slate-500 mt-0.5">After this form you'll review a short consent form, and then your dashboard opens.</p>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full border border-black/5 flex items-center justify-center shrink-0" style={{ color: TEAL }}>
            <IconShield className="w-5 h-5" />
          </div>
        </div>
      </div>

      {rejectionReason && (
        <div className="relative max-w-4xl mx-auto px-6 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-4">
            <p className="text-sm font-bold text-red-700">Your previous submission was rejected</p>
            <p className="text-xs text-red-600 mt-1">{rejectionReason}</p>
            <p className="text-xs text-red-500 mt-1">Please review your information below and resubmit.</p>
          </div>
        </div>
      )}

      {/* Main form card */}
      <div className="relative max-w-4xl mx-auto px-6 pb-16">
        <div className="bg-white/85 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-black/10 p-6 md:p-10">
          {configState.loading ? (
            <div className="py-24 text-center text-sm text-slate-400">Loading form…</div>
          ) : configState.error ? (
            <div className="py-16 text-center">
              <p className="text-sm text-red-600 font-semibold mb-4">{configState.error}</p>
              <button onClick={() => loadConfig()} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: TEAL }}>
                Try Again
              </button>
            </div>
          ) : (
            <>
              {/* Profile Photo — top of the form, circular avatar (not a
                  generic file-upload field), matches the wellness theme. */}
              <div className="flex flex-col items-center mb-10">
                <div className="relative">
                  <div
                    className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden flex items-center justify-center border-4 border-white shadow-lg"
                    style={{ background: CREAM, color: TEAL }}
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <IconPerson className="w-12 h-12 opacity-50" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white transition-transform hover:scale-105"
                    style={{ background: TEAL }}
                    aria-label={avatarFile ? 'Change profile photo' : 'Upload profile photo'}
                  >
                    <IconPencil className="w-4 h-4" />
                  </button>
                  <input ref={avatarInputRef} type="file" accept=".jpg,.jpeg,.png" onChange={handleAvatarChange} className="hidden" />
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="text-xs font-bold mt-3 hover:underline"
                  style={{ color: TEAL }}
                >
                  {avatarFile || avatarPreview ? 'Change Photo' : 'Upload Profile Photo'}
                </button>
                <p className="text-[11px] text-slate-400 mt-0.5">JPG or PNG, max 5MB</p>
                {errors.avatar && <p className="text-[11px] text-red-600 mt-1">{errors.avatar}</p>}
              </div>

              {/* 0. Who is this form for? */}
              <div className="rounded-2xl p-5 md:p-6 mb-9 border border-black/5" style={{ background: CREAM }}>
                <FieldLabel>Who are you filling this form for?</FieldLabel>
                <p className="text-xs text-slate-500 mb-3 -mt-1">Choose "Someone in my care" if you are a parent, guardian or caretaker filling this in on the patient's behalf. The details below should then describe the patient.</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10"><IconUsers /></span>
                  <select
                    className="w-full pl-10 pr-9 py-3 bg-white border border-black/10 rounded-xl text-sm outline-none focus:border-[#0F8594]/40 transition-all appearance-none text-slate-800"
                    value={form.formFor}
                    onChange={update('formFor')}
                  >
                    <option value="">Select an option</option>
                    {FORM_FOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                {errors.formFor && <p className="text-[11px] text-red-600 mt-1">{errors.formFor}</p>}

                {form.formFor === 'care' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                    <div>
                      <FieldLabel>Your name (caregiver)</FieldLabel>
                      <IconInput icon={<IconPerson />} placeholder="Enter your full name" value={form.caregiverName} onChange={update('caregiverName')} />
                      {errors.caregiverName && <p className="text-[11px] text-red-600 mt-1">{errors.caregiverName}</p>}
                    </div>
                    <div>
                      <FieldLabel>Your relationship with the patient</FieldLabel>
                      <IconSelect icon={<IconUsers />} placeholder="Select relationship" options={RELATIONSHIP_OPTIONS} value={form.relationship} onChange={update('relationship')} />
                      {errors.relationship && <p className="text-[11px] text-red-600 mt-1">{errors.relationship}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* 1. Basic Information */}
              <SectionHeading number="1" title={form.formFor === 'care' ? "Patient's Basic Information" : 'Basic Information'} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-9">
                <div>
                  <FieldLabel>Full Name</FieldLabel>
                  <IconInput icon={<IconPerson />} placeholder="Enter your full name" value={form.fullName} onChange={update('fullName')} />
                  {errors.fullName && <p className="text-[11px] text-red-600 mt-1">{errors.fullName}</p>}
                </div>
                <div>
                  <FieldLabel>Date of Birth</FieldLabel>
                  <IconInput icon={<IconCalendar />} type="date" value={form.dob} onChange={update('dob')} />
                  {errors.dob && <p className="text-[11px] text-red-600 mt-1">{errors.dob}</p>}
                </div>
                <div>
                  <FieldLabel>Gender</FieldLabel>
                  <IconSelect icon={<IconPerson />} placeholder="Select your gender" options={cfg.genders || []} value={form.gender} onChange={update('gender')} />
                  {errors.gender && <p className="text-[11px] text-red-600 mt-1">{errors.gender}</p>}
                </div>
                <div>
                  <FieldLabel optional>Blood Group</FieldLabel>
                  <IconSelect icon={<IconTag />} placeholder="Select your blood group" options={cfg.bloodGroups || []} value={form.bloodGroup} onChange={update('bloodGroup')} />
                </div>
                <div>
                  <FieldLabel>Email Address</FieldLabel>
                  <IconInput icon={<IconMail />} type="email" placeholder="Enter your email" value={form.email} onChange={update('email')} />
                  {errors.email && <p className="text-[11px] text-red-600 mt-1">{errors.email}</p>}
                </div>
                <div>
                  <FieldLabel>Phone Number</FieldLabel>
                  <IconInput
                    icon={<IconPhone />}
                    type="tel"
                    placeholder="Enter your phone number"
                    value={form.phone}
                    onChange={update('phone')}
                  />
                  {errors.phone && (
                    <p className="text-[11px] text-red-600 mt-1">
                      {errors.phone}
                    </p>
                  )}
                </div>
              </div>

              {/* 2. Location */}
              <SectionHeading number="2" title="Location" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-9">
                <div>
                  <FieldLabel>City</FieldLabel>
                  <IconInput icon={<IconPin />} placeholder="Enter your city" value={form.city} onChange={update('city')} />
                  {errors.city && <p className="text-[11px] text-red-600 mt-1">{errors.city}</p>}
                </div>
                <div>
                  <FieldLabel>Country</FieldLabel>
                  <IconSelect icon={<IconGlobe />} placeholder="Select your country" options={cfg.countries || []} value={form.country} onChange={update('country')} />
                  {errors.country && <p className="text-[11px] text-red-600 mt-1">{errors.country}</p>}
                </div>
                {form.country === 'Other' && (
                  <div>
                    <FieldLabel>Please specify your country</FieldLabel>
                    <IconInput icon={<IconPencil />} placeholder="Enter your country" value={form.otherCountry} onChange={update('otherCountry')} />
                    {errors.otherCountry && <p className="text-[11px] text-red-600 mt-1">{errors.otherCountry}</p>}
                  </div>
                )}
              </div>

              {/* 3. Lifestyle & Background */}
              <SectionHeading number="3" title="Lifestyle & Background" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-9">
                <div>
                  <FieldLabel>Occupation</FieldLabel>
                  <IconSelect icon={<IconBriefcase />} placeholder="Select your occupation" options={cfg.occupations || []} value={form.occupation} onChange={update('occupation')} />
                  {errors.occupation && (
  <p className="text-[11px] text-red-600 mt-1">
    {errors.occupation}
  </p>
)}
                </div>
                {form.occupation === 'Other' && (
                  <div>
                    <FieldLabel>Please specify your occupation</FieldLabel>
                    <IconInput icon={<IconPencil />} placeholder="Enter your occupation" value={form.otherOccupation} onChange={update('otherOccupation')} />
                    {errors.otherOccupation && <p className="text-[11px] text-red-600 mt-1">{errors.otherOccupation}</p>}
                  </div>
                )}
                <div>
                  <FieldLabel>Education Level</FieldLabel>
                  <IconSelect icon={<IconGraduation />} placeholder="Select your education level" options={cfg.educationLevels || []} value={form.educationLevel} onChange={update('educationLevel')} />
                </div>
                {form.educationLevel === 'Other' && (
                  <div>
                    <FieldLabel>Please specify your education level</FieldLabel>
                    <IconInput icon={<IconPencil />} placeholder="Enter your education level" value={form.otherEducationLevel} onChange={update('otherEducationLevel')} />
                    {errors.otherEducationLevel && <p className="text-[11px] text-red-600 mt-1">{errors.otherEducationLevel}</p>}
                  </div>
                )}
                <div>
                  <FieldLabel>Marital Status</FieldLabel>
                  <IconSelect icon={<IconUsers />} placeholder="Select your marital status" options={cfg.maritalStatuses || []} value={form.maritalStatus} onChange={update('maritalStatus')} />
                </div>
                <div>
                  <FieldLabel>Sleep Pattern</FieldLabel>
                  <IconSelect icon={<IconMoon />} placeholder="Select your sleep pattern" options={cfg.sleepPatterns || []} value={form.sleepPattern} onChange={update('sleepPattern')} />
                </div>
                <div>
                  <FieldLabel>How did you hear about us?</FieldLabel>
                  <IconSelect icon={<IconMegaphone />} placeholder="Select an option" options={cfg.referralSources || []} value={form.referralSource} onChange={update('referralSource')} />
                </div>
                {form.referralSource === 'Other' && (
                  <div>
                    <FieldLabel>Please specify</FieldLabel>
                    <IconInput icon={<IconPencil />} placeholder="How did you hear about us?" value={form.otherReferralSource} onChange={update('otherReferralSource')} />
                    {errors.otherReferralSource && <p className="text-[11px] text-red-600 mt-1">{errors.otherReferralSource}</p>}
                  </div>
                )}
                {form.referralSource === 'Doctor Referral' && (
                  <div>
                    <FieldLabel>Which doctor referred you?</FieldLabel>
                    <IconInput icon={<IconPencil />} placeholder="Doctor's name" value={form.referredDoctor} onChange={update('referredDoctor')} />
                    {errors.referredDoctor && <p className="text-[11px] text-red-600 mt-1">{errors.referredDoctor}</p>}
                  </div>
                )}
              </div>

              {/* 4. Main Concerns */}
              <SectionHeading number="4" title="Main Concerns" />
              <div className="mb-9">
                <p className="text-[13px] font-semibold text-slate-700 mb-2">
                  What are your main concerns right now? <span className="font-normal text-slate-400">(Select all that apply)</span>
                </p>
                <div className="relative" ref={concernBoxRef}>
                  <button
                    type="button"
                    onClick={() => setConcernDropdownOpen((o) => !o)}
                    className="w-full flex items-center pl-10 pr-9 py-3 bg-white border border-black/10 rounded-xl text-sm text-left text-slate-400 relative"
                  >
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconTag /></span>
                    Select your concerns
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </button>
                  {concernDropdownOpen && (
                    <div className="absolute z-20 mt-1.5 w-full max-h-56 overflow-y-auto bg-white border border-black/10 rounded-xl shadow-lg py-1.5">
                      {concernOptions.length === 0 ? (
                        <p className="px-4 py-2 text-xs text-slate-400">No options available.</p>
                      ) : (
                        concernOptions.map((c) => (
                          <label key={c} className="flex items-center gap-2.5 px-4 py-2 hover:bg-[#F6F4EC] cursor-pointer text-sm text-slate-700">
                            <input type="checkbox" checked={form.concerns.includes(c)} onChange={() => toggleConcern(c)} />
                            {c}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {errors.concerns && <p className="text-[11px] text-red-600 mt-1">{errors.concerns}</p>}

                {form.concerns.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {form.concerns.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-semibold text-slate-700" style={{ background: CREAM }}>
                        {c}
                        <button type="button" onClick={() => removeConcern(c)} className="text-slate-400 hover:text-slate-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {showOtherField && (
                <div className="mt-4">
                  <FieldLabel>Other (Please specify) *</FieldLabel>

                  <IconInput
                    icon={<IconPencil />}
                    placeholder="Please specify your concern"
                    value={form.otherConcern}
                    onChange={update('otherConcern')}
                  />

                  {errors.otherConcern && (
                    <p className="text-[11px] text-red-600 mt-1">
                      {errors.otherConcern}
                    </p>
                  )}
                </div>
              )}
              </div>

              {/* 5. Additional Information */}
              {/* 5. Additional Information */}
<SectionHeading number="5" title="Additional Information" />

<div className="mb-9">
  <FieldLabel>
    Is there anything else you would like us to know? *
  </FieldLabel>

  <div className="relative">
    <span className="absolute left-3.5 top-3.5 text-slate-400">
      <IconPencil />
    </span>

    <textarea
      rows={3}
      maxLength={500}
      placeholder="Please provide any additional information that may help us support you better..."
      value={form.additionalInfo}
      onChange={(e) =>
        setForm((f) => ({
          ...f,
          additionalInfo: e.target.value
        }))
      }
      className="w-full pl-10 pr-4 py-3 bg-white border border-black/10 rounded-xl text-sm outline-none focus:border-[#0F8594]/40 transition-all resize-none"
    />

    <span className="absolute bottom-2.5 right-4 text-[11px] text-slate-400">
      {form.additionalInfo.length}/500
    </span>
  </div>

  {errors.additionalInfo && (
    <p className="text-[11px] text-red-600 mt-1">
      {errors.additionalInfo}
    </p>
  )}
</div>

              {/* Health report — carried over from frontend-1's demographic
                  form, which frontend-2 didn't have. */}
              <SectionHeading number="6" title="Medical Report (Optional)" />
              <div className="grid grid-cols-1 gap-4 mb-2">
                <div
                  className="border-2 border-dashed border-black/10 rounded-2xl p-5 flex items-center gap-4"
                  style={{ background: CREAM }}
                >
                  <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shrink-0" style={{ color: TEAL }}>
                    <IconUpload className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: TEAL }}>Medical Report</p>
                    <p className="text-xs text-slate-400 mb-2">Any past medical records (Max. 5MB)</p>
                    <button
                      type="button"
                      onClick={() => healthReportInputRef.current?.click()}
                      className="px-4 py-2 bg-white border border-black/10 rounded-xl text-xs font-bold text-slate-700 hover:bg-black/[0.02] transition-all"
                    >
                      {healthReportFile ? 'Change File' : 'Upload File'}
                    </button>
                    <input ref={healthReportInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleHealthReportChange} className="hidden" />
                    {healthReportFile && <p className="text-[11px] text-slate-500 mt-1 truncate">{healthReportFile.name}</p>}
                  </div>
                </div>
              </div>
              {errors.healthReport && (
                <p className="text-[11px] text-red-600 mb-4">{errors.healthReport}</p>
              )}

              {/* Secure/confidential notice */}
              <div className="flex items-start gap-3 mt-8 rounded-2xl px-5 py-4" style={{ background: CREAM }}>
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0" style={{ color: TEAL }}>
                  <IconShield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Your information is secure and confidential.</p>
                  <p className="text-xs text-slate-500">It will only be used to provide you with the best therapy experience.</p>
                </div>
              </div>

              {submitError && <p className="text-sm text-red-600 mt-6 text-center">{submitError}</p>}

              {/* Footer actions */}
              <div className="flex items-center justify-end mt-8 flex-wrap gap-4">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60 transition-all"
                style={{ background: TEAL }}
              >
                {submitting ? 'Submitting…' : 'Submit'}
                {!submitting && <IconArrowRight />}
              </button>
            </div>
            </>
          )}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mt-6">
          <IconLock />
          By submitting, you agree to our <a href="#" className="font-semibold text-slate-600 hover:underline">Privacy Policy</a> and <a href="#" className="font-semibold text-slate-600 hover:underline">Terms of Service</a>.
        </p>
      </div>
      </div>
    </div>
  );
}