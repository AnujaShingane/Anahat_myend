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

export default function CaregiverDashboard() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || 'null');

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
            const data = await response.json();

            if (data.role !== 'caregiver' || data.status !== 'approved') {
                navigate('/caregiver-status', { replace: true });
                return;
            }
            setStatus(data);
        } catch (err) {
            console.error('Error loading caregiver status:', err);
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

    const relationshipLabel = status?.relationship_type === 'other'
        ? status.relationship_other_label
        : RELATIONSHIP_LABELS[status?.relationship_type] || status?.relationship_type;

    return (
        <div className="min-h-screen bg-[#FDF6EE] font-sans text-slate-900 p-4 md:p-8 relative overflow-hidden">
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#0F8594]/45 blur-[120px]"></div>
            </div>

            <div className="relative z-10 max-w-4xl mx-auto">
                <div className="flex justify-between items-center gap-6 bg-white/80 backdrop-blur-2xl border border-black/10 rounded-[2rem] p-6 mb-6">
                    <div className="flex items-center gap-5 min-w-0">
                        {/* Drop an image at public/assets/caregiver-support.jpg to show it here. */}
                        <div className="hidden sm:block w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-lg shrink-0 bg-[#0F8594]/12">
                            <img
                                src="/assets/caregiver-support.jpg"
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                            />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs uppercase tracking-widest text-[#0F8594] font-bold mb-1">Caregiver Access · Approved</p>
                            <h1 className="text-2xl font-serif font-bold text-slate-900 truncate">Welcome, {user?.first_name || user?.name}</h1>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="px-5 py-3 bg-black/[0.03] border border-black/10 text-slate-700 rounded-xl hover:bg-black/[0.06] transition-all text-xs font-bold uppercase tracking-widest shrink-0"
                    >
                        Logout
                    </button>
                </div>

                <div className="bg-white/80 backdrop-blur-2xl border border-black/10 rounded-[2rem] p-10 text-center">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#0F8594]/20 to-[#0F8594]/20 border border-[#0F8594]/30 rounded-full flex items-center justify-center mb-6">
                        <svg className="w-8 h-8 text-[#0F8594]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Caring For</p>
                    <h2 className="text-3xl font-serif font-bold text-slate-900 mb-1">{status?.patient_name}</h2>
                    <p className="text-sm text-slate-600 mb-8">Relationship: {relationshipLabel}</p>

                    <div className="max-w-sm mx-auto bg-black/[0.03] border border-black/10 rounded-2xl p-6">
                        <p className="text-sm text-slate-700 leading-relaxed">
                            Your access has been verified. The full caregiver dashboard — assessment history,
                            reports, and progress for {status?.patient_name} — is coming in the next phase of this build.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}