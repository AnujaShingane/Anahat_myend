import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = "http://localhost:3000";

const RELATIONSHIP_LABELS = {
    parent: 'Parent',
    spouse: 'Spouse',
    child: 'Child',
    sibling: 'Sibling',
    guardian: 'Legal Guardian',
    caregiver: 'Professional Caregiver',
    other: 'Other',
};

export default function CaregiverStatus() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/auth/access-status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load access status.');
            const data = await response.json();

            if (data.role !== 'caregiver') {
                navigate('/dashboard', { replace: true });
                return;
            }

            if (data.status === 'approved') {
                navigate('/caregiver', { replace: true });
                return;
            }

            setStatus(data);
        } catch (err) {
            setError(err.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FDF6EE] text-slate-900">
                <div className="w-10 h-10 border-2 border-[#0F8594]/40 border-t-teal-400 rounded-full animate-spin"></div>
            </div>
        );
    }

    const isRejected = status?.status === 'rejected';
    const relationshipLabel = status?.relationship_type === 'other'
        ? status.relationship_other_label
        : RELATIONSHIP_LABELS[status?.relationship_type] || status?.relationship_type;

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FDF6EE] font-sans text-slate-900 p-4 relative overflow-hidden">
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#0F8594]/45 blur-[120px] animate-pulse"></div>
            </div>

            <div className="relative z-10 max-w-md w-full text-center space-y-6 bg-white/80 backdrop-blur-2xl border border-black/10 rounded-[2.5rem] p-12">
                {error ? (
                    <>
                        <p className="text-red-400 text-sm">{error}</p>
                    </>
                ) : isRejected ? (
                    <>
                        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500/30 to-rose-600/30 border border-red-500/30 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-serif font-bold text-slate-900">Request Not Approved</h2>
                        <p className="text-slate-600 text-sm leading-relaxed">
                            Your caregiver access request for <strong className="text-slate-800">{status.patient_name}</strong> was not approved.
                        </p>
                        {status.rejection_reason && (
                            <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                {status.rejection_reason}
                            </p>
                        )}
                    </>
                ) : (
                    <>
                        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#0F8594]/20 to-[#0F8594]/20 border border-[#0F8594]/30 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-[#0F8594] animate-pulse-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-serif font-bold text-slate-900">Under Review</h2>
                        <p className="text-slate-600 text-sm leading-relaxed">
                            Thank you for verifying your identity. Our clinical team is reviewing your request to care for
                            {' '}<strong className="text-slate-800">{status?.patient_name}</strong> as their {relationshipLabel?.toLowerCase()}.
                        </p>
                        <p className="text-xs text-slate-500">
                            You'll be able to sign in and access their wellness journey as soon as this is approved.
                        </p>
                    </>
                )}

                <div className="flex flex-col gap-3 pt-2">
                    <button
                        onClick={loadStatus}
                        className="w-full py-3.5 bg-black/[0.03] border border-black/10 text-slate-700 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-black/[0.06] transition-all"
                    >
                        Refresh Status
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full py-3.5 text-slate-500 hover:text-slate-700 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all"
                    >
                        Logout
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes pulse-slow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
                .animate-pulse-slow { animation: pulse-slow 3s ease-in-out infinite; }
            `}</style>
        </div>
    );
}