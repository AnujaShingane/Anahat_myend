import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = "http://localhost:3000";

const RELATIONSHIPS = [
    { value: 'parent', label: 'Parent' },
    { value: 'spouse', label: 'Spouse' },
    { value: 'child', label: 'Child' },
    { value: 'sibling', label: 'Sibling' },
    { value: 'guardian', label: 'Legal Guardian' },
    { value: 'caregiver', label: 'Professional Caregiver' },
    { value: 'other', label: 'Other' },
];

const STEPS = ['Relationship', 'Patient', 'Verification', 'Your Account'];

export default function CaregiverAccessRequest() {
    const [step, setStep] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const navigate = useNavigate();

    const [form, setForm] = useState({
        relationship_type: '',
        relationship_other_label: '',
        patient_name: '',
        patient_email: '',
        consent: false,
        document: null,
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
    });

    useEffect(() => {
        setMounted(true);
    }, []);

    const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const goBack = () => {
        if (step === 0) {
            navigate('/register');
        } else {
            setError('');
            setStep(s => s - 1);
        }
    };

    const validateStep = () => {
        if (step === 0) {
            if (!form.relationship_type) return 'Please select your relationship to the patient.';
            if (form.relationship_type === 'other' && !form.relationship_other_label.trim()) {
                return 'Please describe your relationship.';
            }
        }
        if (step === 1) {
            if (!form.patient_name.trim() || !form.patient_email.trim()) {
                return "Please enter the patient's full name and registered email.";
            }
        }
        if (step === 2) {
            if (!form.document) return 'Please upload a verification document (ID or signed consent form).';
            if (!form.consent) return 'Please confirm you have the authority and consent to act on behalf of this person.';
        }
        return '';
    };

    const goNext = () => {
        const validationError = validateStep();
        if (validationError) {
            setError(validationError);
            return;
        }
        setError('');
        setStep(s => s + 1);
    };

    const handleSubmit = async () => {
        if (!form.name || !form.email || !form.password || !form.confirmPassword) {
            setError('All fields are required.');
            return;
        }
        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (form.password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const body = new FormData();
            body.append('email', form.email);
            body.append('password', form.password);
            body.append('name', form.name);
            body.append('relationship_type', form.relationship_type);
            body.append('relationship_other_label', form.relationship_other_label);
            body.append('patient_name', form.patient_name);
            body.append('patient_email', form.patient_email);
            body.append('document', form.document);

            const response = await fetch(`${BACKEND_URL}/auth/register-caregiver`, {
                method: 'POST',
                body,
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Request failed.');

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            setSubmitted(true);
            setTimeout(() => navigate('/caregiver-status', { replace: true }), 1200);
        } catch (err) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full px-5 py-3.5 bg-black/[0.03] border border-black/10 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-[#0F8594]/50 focus:bg-white outline-none transition-all";
    const labelClass = "text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1";

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FDF6EE] font-sans text-slate-900 p-4">
                <div className="max-w-md w-full text-center space-y-6 bg-white/80 backdrop-blur-2xl border border-black/10 rounded-3xl p-12">
                    <div className="w-20 h-20 mx-auto bg-[#0F8594] rounded-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-serif font-bold">Request Submitted</h2>
                    <p className="text-slate-600 text-sm">Taking you to your status page...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center overflow-hidden bg-[#FDF6EE] font-sans text-slate-900 selection:bg-[#0F8594]/30 p-4 relative">

            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#0F8594]/45 blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#0F8594]/45 blur-[120px] animate-pulse" style={{ animationDelay: '1.5s' }}></div>
            </div>

            <div className={`relative z-10 w-full max-w-2xl bg-white/80 backdrop-blur-2xl border border-black/10 rounded-[2.5rem] shadow-2xl p-8 md:p-12 transition-all duration-1000 transform ${mounted ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-95'}`}>

                <button
                    onClick={goBack}
                    className="flex items-center gap-2 text-slate-500 hover:text-[#0F8594]/75 transition-colors mb-8 text-xs font-bold uppercase tracking-[0.2em]"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-10">
                    {STEPS.map((label, i) => (
                        <div key={label} className="flex-1">
                            <div className={`h-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-[#0F8594]' : 'bg-black/[0.06]'}`}></div>
                            <p className={`mt-2 text-[10px] uppercase tracking-widest font-bold ${i === step ? 'text-[#0F8594]' : 'text-slate-600'}`}>{label}</p>
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="mb-6 py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center animate-shake">
                        {error}
                    </div>
                )}

                {/* STEP 0: Relationship */}
                {step === 0 && (
                    <div className="space-y-6">
                        <h2 className="text-3xl font-serif font-bold text-slate-900">What's your relationship <br />to the patient?</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {RELATIONSHIPS.map(r => (
                                <button
                                    key={r.value}
                                    onClick={() => update('relationship_type', r.value)}
                                    className={`px-5 py-4 rounded-2xl border text-sm font-semibold text-left transition-all ${
                                        form.relationship_type === r.value
                                            ? 'border-[#0F8594]/60 bg-[#0F8594]/10 text-[#0A6976]'
                                            : 'border-black/10 bg-black/[0.03] text-slate-700 hover:border-black/10'
                                    }`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        {form.relationship_type === 'other' && (
                            <div className="space-y-1.5">
                                <label className={labelClass}>Please Describe</label>
                                <input
                                    type="text"
                                    value={form.relationship_other_label}
                                    onChange={(e) => update('relationship_other_label', e.target.value)}
                                    className={inputClass}
                                    placeholder="e.g. Close family friend"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 1: Patient identification */}
                {step === 1 && (
                    <div className="space-y-5">
                        <h2 className="text-3xl font-serif font-bold text-slate-900 mb-2">Who are you <br />caring for?</h2>
                        <p className="text-sm text-slate-600 mb-4">
                            Enter the patient's details exactly as registered on Anahat Transformations, if they already have an account here.
                        </p>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Patient's Full Name</label>
                            <input
                                type="text"
                                value={form.patient_name}
                                onChange={(e) => update('patient_name', e.target.value)}
                                className={inputClass}
                                placeholder="Full Name"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Patient's Email</label>
                            <input
                                type="email"
                                value={form.patient_email}
                                onChange={(e) => update('patient_email', e.target.value)}
                                className={inputClass}
                                placeholder="patient@example.com"
                            />
                        </div>
                    </div>
                )}

                {/* STEP 2: Verification */}
                {step === 2 && (
                    <div className="space-y-6">
                        <h2 className="text-3xl font-serif font-bold text-slate-900">Verify your <br />authority to act</h2>
                        <p className="text-sm text-slate-600">
                            Upload a government ID or a signed consent form. A member of our clinical team will review this before caregiver access is granted.
                        </p>

                        <div className="space-y-1.5">
                            <label className={labelClass}>Verification Document</label>
                            <label className="flex flex-col items-center justify-center gap-2 w-full py-10 bg-black/[0.03] border border-dashed border-black/10 rounded-2xl text-slate-600 cursor-pointer hover:border-[#0F8594]/50 hover:bg-black/[0.06] transition-all">
                                <svg className="w-8 h-8 text-[#0F8594]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span className="text-xs font-semibold">
                                    {form.document ? form.document.name : 'Click to upload ID or consent form'}
                                </span>
                                <span className="text-[10px] text-slate-600">JPG, PNG, or PDF · up to 10MB</span>
                                <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                                    className="hidden"
                                    onChange={(e) => update('document', e.target.files?.[0] || null)}
                                />
                            </label>
                        </div>

                        <label className="flex items-start gap-3 text-xs text-slate-600 leading-relaxed cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.consent}
                                onChange={(e) => update('consent', e.target.checked)}
                                className="mt-0.5 w-4 h-4 rounded border-black/10 bg-black/[0.03] accent-[#0F8594]"
                            />
                            I confirm that I have the authority and consent to complete this wellness assessment on behalf of the person named above, and that the information I've provided is accurate.
                        </label>
                    </div>
                )}

                {/* STEP 3: Caregiver's own account */}
                {step === 3 && (
                    <div className="space-y-5">
                        <h2 className="text-3xl font-serif font-bold text-slate-900 mb-2">Create your <br />caregiver account</h2>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Your Full Name</label>
                            <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} className={inputClass} placeholder="Full Name" disabled={loading} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Your Email</label>
                            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className={inputClass} placeholder="you@example.com" disabled={loading} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className={labelClass}>Password</label>
                                <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} className={inputClass} placeholder="••••••••" disabled={loading} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelClass}>Confirm</label>
                                <input type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} className={inputClass} placeholder="••••••••" disabled={loading} />
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-10 flex gap-3">
                    {step < STEPS.length - 1 ? (
                        <button
                            onClick={goNext}
                            className="w-full py-4 bg-[#0F8594] hover:bg-[#0a4530] text-white rounded-2xl font-bold uppercase tracking-widest text-xs hover:shadow-lg hover:shadow-black/20 transition-all"
                        >
                            Continue
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all ${
                                loading ? 'bg-slate-200 text-slate-500 cursor-wait' : 'bg-[#0F8594] hover:bg-[#0a4530] text-white hover:shadow-lg hover:shadow-black/20'
                            }`}
                        >
                            {loading ? 'Submitting...' : 'Submit for Review'}
                        </button>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-4px); }
                    75% { transform: translateX(4px); }
                }
                .animate-shake { animation: shake 0.4s ease-in-out; }
            `}</style>
        </div>
    );
}