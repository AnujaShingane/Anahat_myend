import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../features/chat/useChat';
import ChakraTrendChart, { severityBadgeClass } from '../../components/ChakraTrendChart';

const BACKEND_URL = "http://localhost:3000";

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'history', label: 'History & Reports' },
    { key: 'progress', label: 'Progress' },
    { key: 'recommendations', label: 'Recommendations' },
    { key: 'profile', label: 'Profile' },
];

export default function Dashboard() {
    const [user, setUser] = useState(null);
    const [incompleteSessions, setIncompleteSessions] = useState([]);
    const [completedSessions, setCompletedSessions] = useState([]);
    const [trends, setTrends] = useState([]);
    const [latestReport, setLatestReport] = useState(null);
    const [latestReportLoading, setLatestReportLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [activeTab, setActiveTab] = useState('overview');

    const navigate = useNavigate();
    const { startNewSession, resumeSession } = useChat();

    useEffect(() => {
        loadUserData();

        const handleMouseMove = (e) => {
            requestAnimationFrame(() => {
                setMousePos({ x: e.clientX, y: e.clientY });
            });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useEffect(() => {
        if (activeTab === 'recommendations' && !latestReport && completedSessions.length > 0) {
            loadLatestReport();
        }
    }, [activeTab, completedSessions]);

    const loadUserData = async () => {
        const token = localStorage.getItem('token');
        
        if (!token) {
            navigate('/login');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const userResponse = await fetch(`${BACKEND_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!userResponse.ok) {
                throw new Error('Authentication failed');
            }

            const userData = await userResponse.json();
            setUser(userData.user);

            const incompleteResponse = await fetch(`${BACKEND_URL}/conversations/incomplete`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (incompleteResponse.ok) {
                const incompleteData = await incompleteResponse.json();
                setIncompleteSessions(incompleteData.sessions || []);
            }

            const sessionsResponse = await fetch(`${BACKEND_URL}/sessions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (sessionsResponse.ok) {
                const sessionsData = await sessionsResponse.json();
                const completed = (sessionsData.sessions || []).filter(s => s.session_complete);
                setCompletedSessions(completed);
            }

            const trendsResponse = await fetch(`${BACKEND_URL}/reports/trends`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (trendsResponse.ok) {
                const trendsData = await trendsResponse.json();
                setTrends(trendsData.trends || []);
            }

        } catch (error) {
            console.error('Error loading dashboard data:', error);
            setError(error.message);
            
            if (error.message === 'Authentication failed') {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                navigate('/login');
            }
        } finally {
            setLoading(false);
        }
    };

    const loadLatestReport = async () => {
        if (completedSessions.length === 0) return;
        const token = localStorage.getItem('token');
        const newest = [...completedSessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

        try {
            setLatestReportLoading(true);
            const response = await fetch(`${BACKEND_URL}/report/${newest.session_id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setLatestReport(data);
            }
        } catch (err) {
            console.error('Error loading latest report:', err);
        } finally {
            setLatestReportLoading(false);
        }
    };

    const handleStartNewSession = () => {
        startNewSession();
        navigate('/chat');
    };

    const handleResumeClick = (sessionId) => {
        resumeSession(sessionId);
        navigate('/chat');
    };

    const handleLogout = async () => {
        const token = localStorage.getItem('token');
        
        try {
            await fetch(`${BACKEND_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('resumeSessionId');
        navigate('/login');
    };

    const handleExportData = async () => {
        const token = localStorage.getItem('token');
        try {
            setExporting(true);
            const response = await fetch(`${BACKEND_URL}/account/export`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Export failed');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `anahat-account-data.json`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error exporting data:', err);
            alert('Failed to export your data. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FDF6EE] overflow-y-auto relative">
                <div className="fixed inset-0 opacity-[0.05] pointer-events-none z-0 mix-blend-overlay"
                     style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}>
                </div>
                
                <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] p-8 shadow-2xl shadow-[#0F8594]/20 relative z-10">
                    <div className="flex items-center gap-4">
                        <svg className="animate-spin h-8 w-8 text-[#0F8594]" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-xl font-semibold text-slate-900">Loading your wellness portal...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FDF6EE] p-4 overflow-y-auto relative">
                <div className="fixed inset-0 opacity-[0.05] pointer-events-none z-0 mix-blend-overlay"
                     style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}>
                </div>
                
                <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] p-8 shadow-2xl shadow-red-500/20 max-w-md relative z-10">
                    <div className="text-center mb-6">
                        <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <h2 className="text-2xl font-serif font-bold text-slate-900 mb-2">Error Loading Dashboard</h2>
                        <p className="text-slate-600">{error}</p>
                    </div>
                    
                    <div className="flex gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-1 py-3 bg-[#0F8594] hover:bg-[#0a4530] text-white rounded-xl hover:shadow-lg hover:shadow-black/20 font-semibold transition-all"
                        >
                            Retry
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex-1 py-3 bg-white/50 border border-black/10 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold transition-all"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const latestChakraFocus = trends.length > 0
        ? [...trends[trends.length - 1].chakras].sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))[0]
        : null;

    const recentReports = [...completedSessions]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 3);

    return (
        <>
            <style>{`
                @keyframes pulse-slow {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 1; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 3s ease-in-out infinite;
                }
                
                ::-webkit-scrollbar {
                    width: 10px;
                }
                ::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.06);
                    border-radius: 10px;
                }
                ::-webkit-scrollbar-thumb {
                    background: rgba(245, 158, 11, 0.6);
                    border-radius: 10px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: rgba(245, 158, 11, 0.8);
                }
                * {
                    scrollbar-width: thin;
                    scrollbar-color: #f59e0b rgba(0, 0, 0, 0.06);
                }
.sessions-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(245, 158, 11, 0.6) rgba(0, 0, 0, 0.06);
}

.sessions-scroll::-webkit-scrollbar {
    width: 8px;
}

.sessions-scroll::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.06);
    border-radius: 10px;
}

.sessions-scroll::-webkit-scrollbar-thumb {
    background: rgba(245, 158, 11, 0.6);
    border-radius: 10px;
}

.sessions-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(245, 158, 11, 0.8);
}
            `}</style>

            {/* Background Effects */}
            <div className="fixed inset-0 opacity-[0.05] pointer-events-none z-0 mix-blend-overlay"
                 style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}>
            </div>

            <div
                className="fixed w-[600px] h-[600px] rounded-full bg-gradient-radial from-[#0F8594]/45 via-[#0F8594]/5 to-transparent blur-[80px] pointer-events-none transition-transform duration-[400ms] ease-out z-0"
                style={{ transform: `translate(${mousePos.x - 300}px, ${mousePos.y - 300}px)`, background: 'radial-gradient(circle at center, rgba(251, 191, 36, 0.1), rgba(168, 85, 247, 0.05), transparent)' }}
            />

            {/* Dashboard - Main Container */}
            <div className="h-screen bg-[#FDF6EE] overflow-y-auto relative selection:bg-[#0F8594]/30 sessions-scroll">
                <div className="max-w-7xl mx-auto p-6 pb-20 relative z-10">
                    {/* Header Card */}
                    <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] shadow-2xl shadow-[#0F8594]/10 p-6 mb-6">
                        <div className="flex justify-between items-center flex-wrap gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-[#0F8594] rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                                    {(user?.first_name || user?.name)?.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h1 className="text-3xl font-serif font-bold text-slate-900">
                                        Welcome back, {user?.first_name || user?.name}!
                                    </h1>
                                    <p className="text-slate-600 mt-1">{user?.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="px-6 py-3 bg-gradient-to-r from-red-500/20 to-rose-500/20 border border-red-500/30 text-red-600 rounded-xl hover:bg-red-500/30 hover:border-red-500/50 transition-all backdrop-blur-sm font-semibold"
                            >
                                <svg className="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                Logout
                            </button>
                        </div>

                        {/* Tab Nav */}
                        <div className="flex gap-1 mt-6 -mb-6 overflow-x-auto">
                            {TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`px-5 py-3 text-xs font-bold uppercase tracking-widest whitespace-nowrap border-b-2 transition-all ${
                                        activeTab === tab.key
                                            ? 'border-[#0F8594]/75 text-[#0F8594]'
                                            : 'border-transparent text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ============ OVERVIEW TAB ============ */}
                    {activeTab === 'overview' && (
                        <>
                            {/* Main Action Card */}
                            <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] shadow-2xl shadow-[#0F8594]/10 p-8 mb-6">
                                <div className="text-center">
                                    <div className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                                        <div className="absolute inset-0 bg-[#0F8594] blur-xl opacity-60 rounded-full animate-pulse-slow"></div>
                                        <svg className="w-16 h-16 text-[#0E5860] relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                                        </svg>
                                    </div>
                                    <h2 className="text-3xl font-serif font-bold text-slate-900 mb-3">
                                        Ready for Your Wellness Journey?
                                    </h2>
                                    <p className="text-slate-600 mb-6 max-w-2xl mx-auto">
                                        {incompleteSessions.length > 0
                                            ? 'Pick up right where you left off, or begin a brand new assessment.'
                                            : 'Start a new therapy session whenever you\'re ready.'}
                                    </p>
                                    <button
                                        onClick={handleStartNewSession}
                                        className="btn-sunset px-8 py-4 rounded-2xl font-bold text-lg"
                                    >
                                        Start New Therapy Session
                                    </button>
                                </div>
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-2xl p-5 text-center">
                                    <p className="text-3xl font-serif font-bold text-slate-900">{incompleteSessions.length + completedSessions.length}</p>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Total Sessions</p>
                                </div>
                                <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-2xl p-5 text-center">
                                    <p className="text-3xl font-serif font-bold text-emerald-600">{completedSessions.length}</p>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Completed</p>
                                </div>
                                <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-2xl p-5 text-center">
                                    <p className="text-3xl font-serif font-bold text-[#0F8594]">{incompleteSessions.length}</p>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">In Progress</p>
                                </div>
                                <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-2xl p-5 text-center">
                                    <p className="text-lg font-serif font-bold text-[#0F8594] truncate">{latestChakraFocus ? latestChakraFocus.name : '—'}</p>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Latest Focus</p>
                                </div>
                            </div>

                            {/* Continue Your Journey */}
                            <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] shadow-2xl shadow-[#0F8594]/10 p-6 mb-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-xl font-serif font-bold text-slate-900">
                                        Continue Your Journey
                                    </h2>
                                    <span className="bg-[#0F8594]/20 text-[#0F8594] border border-[#0F8594]/30 px-3 py-1 rounded-full text-sm font-semibold">
                                        {incompleteSessions.length} Active
                                    </span>
                                </div>

                                {incompleteSessions.length === 0 ? (
                                    <div className="text-center py-12">
                                        <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <p className="text-slate-500">No sessions in progress</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-h-96 overflow-y-auto pr-2 sessions-scroll">
                                        {incompleteSessions.map((session) => (
                                            <div
                                                key={session.sessionId}
                                                className="bg-white/70 border border-black/10 hover:border-[#0F8594]/30 rounded-xl p-4 transition-all cursor-pointer"
                                                onClick={() => handleResumeClick(session.sessionId)}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className="text-lg font-semibold text-slate-900">
                                                        {session.name}
                                                    </h3>
                                                    <button
                                                        className="px-3 py-1 bg-[#0F8594] hover:bg-[#0a4530] text-white rounded-lg text-sm hover:shadow-lg hover:shadow-black/20 font-semibold transition-all"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleResumeClick(session.sessionId);
                                                        }}
                                                    >
                                                        Resume
                                                    </button>
                                                </div>
                                                <p className="text-sm text-slate-600 mb-3">{session.phaseInfo}</p>
                                                <div className="flex gap-4 text-xs text-slate-500">
                                                    <span className="flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        {session.questionsAsked} questions answered
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                        {new Date(session.lastUpdated).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Recent Reports preview */}
                            {recentReports.length > 0 && (
                                <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] shadow-2xl shadow-emerald-500/10 p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xl font-serif font-bold text-slate-900">Recent Reports</h2>
                                        <button onClick={() => setActiveTab('history')} className="text-xs font-bold uppercase tracking-widest text-[#0F8594]/75 hover:text-[#0F8594] transition-colors">
                                            View All →
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {recentReports.map(session => (
                                            <div key={session.session_id} className="bg-white/70 border border-emerald-500/20 rounded-xl p-4">
                                                <p className="text-sm font-semibold text-slate-900 mb-1">{session.name}</p>
                                                <p className="text-xs text-slate-500 mb-3">{new Date(session.created_at).toLocaleDateString()}</p>
                                                <button
                                                    onClick={() => navigate(`/report/${session.session_id}`)}
                                                    className="text-xs font-bold uppercase tracking-widest text-[#0F8594] hover:text-[#0A6976] transition-colors"
                                                >
                                                    View Report →
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ============ HISTORY & REPORTS TAB ============ */}
                    {activeTab === 'history' && (
                        <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] shadow-2xl shadow-emerald-500/10 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-serif font-bold text-slate-900">
                                    Completed Sessions
                                </h2>
                                <span className="bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 px-3 py-1 rounded-full text-sm font-semibold">
                                    {completedSessions.length} Complete
                                </span>
                            </div>

                            {completedSessions.length === 0 ? (
                                <div className="text-center py-12">
                                    <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                                    </svg>
                                    <p className="text-slate-500">Complete your first session to see it here.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {[...completedSessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((session) => (
                                        <div
                                            key={session.session_id}
                                            className="bg-white/70 border border-emerald-500/20 rounded-xl p-4"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h3 className="text-lg font-semibold text-slate-900 mb-1">
                                                        {session.name}
                                                    </h3>
                                                    <p className="text-xs text-slate-500 flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                        {new Date(session.created_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <span className="bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 px-2 py-1 rounded text-xs font-semibold">
                                                    Complete
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => navigate(`/report/${session.session_id}`)}
                                                className="w-full mt-3 px-4 py-2 bg-[#0F8594] hover:bg-[#0a4530] text-white rounded-lg hover:shadow-lg hover:shadow-black/20 transition-all font-semibold text-sm"
                                            >
                                                View Report
                                            </button>
                                            <button
                                                onClick={() => navigate(`/feedback/${session.session_id}`)}
                                                className="w-full mt-2 px-4 py-2 bg-[#0F8594]/20 border border-[#0F8594]/30 text-[#0F8594] rounded-lg hover:bg-[#0F8594]/30 transition-all font-semibold text-sm"
                                            >
                                                Give Feedback
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============ PROGRESS TAB ============ */}
                    {activeTab === 'progress' && (
                        <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] shadow-2xl shadow-[#0F8594]/10 p-6">
                            <h2 className="text-xl font-serif font-bold text-slate-900 mb-1">Chakra Progress Across Assessments</h2>
                            <p className="text-sm text-slate-600 mb-6">Tracked from every completed assessment, oldest to most recent.</p>

                            {trends.length === 0 ? (
                                <div className="text-center py-16">
                                    <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    <p className="text-slate-500">
                                        {completedSessions.length === 0
                                            ? 'Complete an assessment to start tracking progress trends.'
                                            : 'Complete another assessment to see a trend line - one data point isn\'t a trend yet.'}
                                    </p>
                                </div>
                            ) : trends.length === 1 ? (
                                <>
                                    <div className="bg-[#0F8594]/10 border border-[#0F8594]/20 text-[#0A6976] text-sm rounded-xl p-4 mb-6">
                                        This is your first tracked assessment. Complete another to see how things shift over time.
                                    </div>
                                    <ChakraTrendChart trends={trends} />
                                </>
                            ) : (
                                <ChakraTrendChart trends={trends} />
                            )}

                            {latestChakraFocus && (
                                <div className="mt-8 flex items-center gap-4 bg-white/70 border border-black/10 rounded-xl p-5">
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold border ${severityBadgeClass(latestChakraFocus.severity)}`}>
                                        {latestChakraFocus.severity || 'Balanced'}
                                    </div>
                                    <p className="text-sm text-slate-700">
                                        Your most recent assessment flagged <strong className="text-slate-900">{latestChakraFocus.name}</strong> as your primary area of focus.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============ RECOMMENDATIONS TAB ============ */}
                    {activeTab === 'recommendations' && (
                        <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] shadow-2xl shadow-[#0F8594]/10 p-6">
                            <h2 className="text-xl font-serif font-bold text-slate-900 mb-1">Your Latest Recommendations</h2>
                            <p className="text-sm text-slate-600 mb-6">From your most recently completed assessment.</p>

                            {completedSessions.length === 0 ? (
                                <div className="text-center py-16">
                                    <p className="text-slate-500">Complete an assessment to receive personalized recommendations.</p>
                                </div>
                            ) : latestReportLoading ? (
                                <div className="flex items-center gap-3 text-slate-600 py-16 justify-center">
                                    <svg className="animate-spin h-5 w-5 text-[#0F8594]/75" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Loading your recommendations...
                                </div>
                            ) : latestReport?.report ? (
                                <div className="space-y-6">
                                    {latestReport.report.userPrescription && (
                                        <div className="bg-[#0F8594]/10 border border-[#0F8594]/20 rounded-xl p-5">
                                            <h3 className="text-sm font-bold uppercase tracking-widest text-[#0F8594] mb-3">Personalized Prescription</h3>
                                            <pre className="text-slate-700 whitespace-pre-wrap font-sans text-sm max-h-72 overflow-y-auto sessions-scroll pr-2">
                                                {latestReport.report.userPrescription}
                                            </pre>
                                        </div>
                                    )}

                                    {latestReport.report.raga_recommendations?.success && latestReport.report.raga_recommendations.recommendations && (
                                        <div className="bg-[#0F8594]/10 border border-[#0F8594]/20 rounded-xl p-5">
                                            <h3 className="text-sm font-bold uppercase tracking-widest text-[#0F8594] mb-4">Music Therapy & Listening Schedule</h3>
                                            <div className="space-y-4">
                                                {latestReport.report.raga_recommendations.recommendations.map((rec, i) => (
                                                    <div key={i}>
                                                        <p className="text-slate-900 font-semibold mb-2">{rec.chakra} {rec.swar ? `· Swar: ${rec.swar}` : ''}</p>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {(rec.ragas || []).map((raga, j) => (
                                                                <div key={j} className="bg-white/70 border border-black/10 rounded-lg p-3">
                                                                    <p className="text-sm font-semibold text-slate-900">{raga.name}</p>
                                                                    <p className="text-xs text-slate-500 mt-1">Best time: {raga.time || 'Any time'}</p>
                                                                    {raga.music_links && Object.keys(raga.music_links).length > 0 && (
                                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                                            {Object.entries(raga.music_links).map(([type, link]) => (
                                                                                <a key={type} href={link} target="_blank" rel="noopener noreferrer"
                                                                                   className="text-xs px-2 py-1 bg-[#0F8594]/20 text-[#0F8594] rounded hover:bg-[#0F8594]/30 transition-all">
                                                                                    {type}
                                                                                </a>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => navigate(`/report/${latestReport.session.sessionId}`)}
                                        className="text-xs font-bold uppercase tracking-widest text-[#0F8594]/75 hover:text-[#0F8594] transition-colors"
                                    >
                                        View Full Report →
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-16">
                                    <p className="text-slate-500">Recommendations aren't available for your latest session yet.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============ PROFILE TAB ============ */}
                    {activeTab === 'profile' && (
                        <div className="bg-white/80 backdrop-blur-xl border border-black/10 rounded-[2rem] shadow-2xl shadow-[#0F8594]/10 p-6">
                            <h2 className="text-xl font-serif font-bold text-slate-900 mb-6">Account</h2>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                                <div className="bg-white/70 border border-black/10 rounded-xl p-5">
                                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Full Name</p>
                                    <p className="text-slate-900 font-semibold">{user?.name}</p>
                                </div>
                                <div className="bg-white/70 border border-black/10 rounded-xl p-5">
                                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Email</p>
                                    <p className="text-slate-900 font-semibold">{user?.email}</p>
                                </div>
                                <div className="bg-white/70 border border-black/10 rounded-xl p-5">
                                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Account Type</p>
                                    <p className="text-slate-900 font-semibold capitalize">{user?.role || 'patient'}</p>
                                </div>
                                <div className="bg-white/70 border border-black/10 rounded-xl p-5">
                                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Total Assessments</p>
                                    <p className="text-slate-900 font-semibold">{incompleteSessions.length + completedSessions.length}</p>
                                </div>
                            </div>

                            <div className="bg-white/70 border border-black/10 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 mb-1">Download Your Data</p>
                                    <p className="text-xs text-slate-500">Export your account details and every assessment on file as a single file.</p>
                                </div>
                                <button
                                    onClick={handleExportData}
                                    disabled={exporting}
                                    className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                                        exporting
                                            ? 'bg-slate-200 text-slate-500 cursor-wait'
                                            : 'bg-[#0F8594] hover:bg-[#0a4530] text-white hover:shadow-lg hover:shadow-black/20'
                                    }`}
                                >
                                    {exporting ? 'Preparing...' : 'Download'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}