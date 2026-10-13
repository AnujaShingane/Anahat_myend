import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import { getReportHistory } from '../../services/api';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';

// Informational cards below the report list — copy only, no fabricated
// numbers or sample data.
const INFO_CARDS = [
    {
        title: 'Therapist-Reviewed',
        desc: 'Every report is checked and approved by your assigned therapist before it reaches you.',
        icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />),
    },
    {
        title: 'Securely Stored',
        desc: 'Reports are kept encrypted and only accessible to you and your care team.',
        icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />),
    },
    {
        title: 'Always Accessible',
        desc: 'View or download any past report from this page whenever you need it.',
        icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />),
    },
    {
        title: 'Track Your Progress',
        desc: 'Compare reports over time to see how your wellness journey is developing.',
        icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm6 0V9a2 2 0 00-2-2h-2a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2zm6 0V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14a2 2 0 002 2h2a2 2 0 002-2z" />),
    },
];

export default function Reports() {
    const { user, loading, error, reload, logout } = usePatientSession();
    const [reports, setReports] = useState([]);
    const [reportsLoading, setReportsLoading] = useState(true);
    const [downloadingId, setDownloadingId] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) return;
        loadReports();
    }, [user]);

    const loadReports = async () => {
        try {
            setReportsLoading(true);
            // Backed by /api/patients/:patientId/report-history — populated
            // whenever a therapist approves a therapy record (see
            // controllers/patientDataController.js#approveTherapyRecord).
            const data = await getReportHistory(user.id);
            const normalized = (data || []).map((r) => ({
                session_id: r.id,
                name: r.title || 'Session Report',
                status: r.status || 'Complete',
                created_at: r.createdAt,
                therapist_name: r.approvedBy || r.therapistName,
                consultation_mode: r.consultationMode,
            }));
            setReports(normalized.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        } catch (err) {
            console.error('Error loading reports:', err);
        } finally {
            setReportsLoading(false);
        }
    };

    // Report PDFs aren't generated server-side yet (see README's "still
    // missing" list) — "View" opens the in-app report detail page instead.
    const handleDownload = async (session) => {
        navigate(`/report/${session.session_id}`);
    };

    if (loading) return <PortalLoading />;
    if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

    return (
        <PatientDashboardLayout active="reports" user={user} onLogout={logout}>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
                <p className="text-slate-500 text-sm mt-1">
                    Every therapist-approved report from your sessions, in one place.
                </p>
            </div>

            {reportsLoading ? (
                <div className="bg-white border border-black/5 rounded-3xl shadow-sm p-16 flex items-center justify-center">
                    <svg className="animate-spin h-6 w-6" style={{ color: '#0F8594' }} viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                </div>
            ) : reports.length === 0 ? (
                <div className="bg-white border border-black/5 rounded-3xl shadow-sm p-16 text-center">
                    <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: '#F6F4EC' }}>
                        <svg className="w-10 h-10" style={{ color: '#0F8594' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mb-1">No reports yet</h2>
                    <p className="text-slate-500 text-sm max-w-sm mx-auto">
                        Once your therapist reviews and approves a session, the report will appear here — ready to view or download.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {reports.map((session) => (
                        <div key={session.session_id} className="flex h-[264px] flex-col overflow-hidden border-b border-black/10 bg-white p-5">
                            <div className="flex items-start justify-between mb-3">
                                <h3 className="font-semibold text-slate-900 leading-snug pr-2">{session.name || 'Session Report'}</h3>
                                <span className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ background: '#DCFCE7', color: '#166534' }}>
                                    {session.status || 'Complete'}
                                </span>
                            </div>
                            <dl className="space-y-1.5 text-xs text-slate-500 mb-5">
                                <div className="flex justify-between">
                                    <dt>Session Date</dt>
                                    <dd className="font-semibold text-slate-700">{session.created_at ? new Date(session.created_at).toLocaleDateString() : '—'}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt>Therapist</dt>
                                    <dd className="font-semibold text-slate-700">{session.therapist_name || 'Not yet assigned'}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt>Consultation Mode</dt>
                                    <dd className="font-semibold text-slate-700">{session.consultation_mode || '—'}</dd>
                                </div>
                            </dl>
                            <div className="mt-auto flex gap-2">
                                <button
                                    onClick={() => navigate(`/report/${session.session_id}`)}
                                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-all"
                                    style={{ background: '#0F8594' }}
                                >
                                    View
                                </button>
                                <button
                                    onClick={() => handleDownload(session)}
                                    disabled={downloadingId === session.session_id}
                                    className="flex-1 py-2 rounded-xl text-xs font-bold border border-black/10 text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
                                >
                                    {downloadingId === session.session_id ? 'Preparing…' : 'Download'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
                {INFO_CARDS.map((c) => (
                    <div key={c.title} className="bg-white border border-black/5 rounded-2xl p-5">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: '#E3F0A0' }}>
                            <svg className="w-5 h-5" style={{ color: '#0F8594' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">{c.icon}</svg>
                        </div>
                        <p className="text-sm font-bold text-slate-900 mb-1">{c.title}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{c.desc}</p>
                    </div>
                ))}
            </div>
        </PatientDashboardLayout>
    );
}
