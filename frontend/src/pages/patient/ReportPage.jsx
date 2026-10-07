import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { severityBadgeClass } from '../../components/ChakraTrendChart';
import { usePatientSession } from '../../hooks/usePatientSession';
import { getReportHistory } from '../../services/api';

export default function ReportPage() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { user } = usePatientSession();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (user?.id) loadReport();
    }, [sessionId, user?.id]);

    const loadReport = async () => {
        try {
            const reports = await getReportHistory(user.id);
            const match = reports.find((item) => String(item.id) === String(sessionId));
            if (!match) throw new Error('Report not found or not available to this patient.');
            setReport({ report: match });
        } catch (error) {
            console.error('Error loading report:', error);
            setError('Error loading report: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadPDF = async () => {
        window.print();
    };

    const downloadTextReport = (type) => {
        if (!report || !report.report) return;
        
        const content = type === 'doctor' 
            ? report.report.doctorReport 
            : report.report.userPrescription;
        
        if (!content) {
            alert('Report not available');
            return;
        }
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}_report_${sessionId}.txt`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const musicRecommendations = Array.isArray(report?.report?.raga)
        ? report.report.raga
        : String(report?.report?.raga || '').split(/\n|,/).map((item) => item.trim()).filter(Boolean);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FDF6EF]">
                <div className="bg-white/80 backdrop-blur-xl border border-black/5 rounded-[2rem] p-8 shadow-2xl shadow-[#0F8594]/20">
                    <div className="flex items-center gap-4">
                        <svg className="animate-spin h-8 w-8 text-[#0F8594]" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-xl font-semibold text-slate-900">Loading report...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FDF6EF] p-4">
                <div className="bg-white/80 backdrop-blur-xl border border-black/5 rounded-[2rem] p-8 max-w-md shadow-2xl shadow-red-500/20">
                    <div className="text-center mb-6">
                        <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <h2 className="text-2xl font-serif font-bold text-slate-900 mb-2">Error Loading Report</h2>
                        <p className="text-slate-600">{error}</p>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="w-full px-6 py-3 bg-[#0F8594] hover:bg-[#0a4530] text-white rounded-xl hover:shadow-lg hover:shadow-black/20 font-semibold transition-all"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <style>{`
                .report-container::-webkit-scrollbar { width: 10px; }
                .report-container::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.05); border-radius: 10px; }
                .report-container::-webkit-scrollbar-thumb { background: rgba(245, 158, 11, 0.6); border-radius: 10px; }
                .report-container::-webkit-scrollbar-thumb:hover { background: rgba(245, 158, 11, 0.8); }
                .report-container { scrollbar-width: thin; scrollbar-color: #f59e0b rgba(0, 0, 0, 0.05); }
            `}</style>

            <div className="report-container min-h-screen h-screen overflow-y-auto bg-[#FDF6EF] p-6 relative">
                <div className="fixed inset-0 opacity-[0.05] pointer-events-none z-0 mix-blend-overlay"
                     style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}>
                </div>

                <div className="max-w-6xl mx-auto relative z-10">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="mb-4 px-4 py-2 bg-white/80 border border-black/5 text-slate-700 rounded-lg hover:bg-black/5 transition-all text-sm font-semibold"
                    >
                        ← Back to Dashboard
                    </button>

                    <div className="bg-white/80 backdrop-blur-xl border border-black/5 rounded-[2rem] p-8 shadow-2xl shadow-[#0F8594]/75 mb-6">
                        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                            <div>
                                <h1 className="text-3xl font-serif font-bold text-slate-900">Your Therapy Report</h1>
                                <p className="text-slate-600 mt-1">{report?.session?.name ? `${report.session.name}'s wellness journey` : 'Complete Healing Journey'}</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={downloadPDF}
                                    className="px-6 py-3 bg-[#0F8594] hover:bg-[#0a4530] text-white rounded-xl hover:shadow-lg hover:shadow-black/20 transition-all font-semibold"
                                >
                                    Download PDF
                                </button>
                            </div>
                        </div>

                        {report && report.report && (
                            <div className="space-y-8">
                                {(report.report.summary || report.report.observations || report.report.advice || report.report.nextSteps) && (
                                    <div className="border-l-4 border-emerald-600 bg-emerald-50 rounded-r-xl p-6 space-y-5">
                                        {report.report.summary && <section><h2 className="text-xl font-serif font-bold text-slate-900 mb-2">Summary</h2><p className="text-sm text-slate-700 whitespace-pre-wrap">{report.report.summary}</p></section>}
                                        {report.report.observations && <section><h2 className="font-bold text-slate-900 mb-2">Observations</h2><p className="text-sm text-slate-700 whitespace-pre-wrap">{report.report.observations}</p></section>}
                                        {report.report.advice && <section><h2 className="font-bold text-slate-900 mb-2">Guidance</h2><p className="text-sm text-slate-700 whitespace-pre-wrap">{report.report.advice}</p></section>}
                                        {report.report.nextSteps && <section><h2 className="font-bold text-slate-900 mb-2">Next Steps</h2><p className="text-sm text-slate-700 whitespace-pre-wrap">{report.report.nextSteps}</p></section>}
                                    </div>
                                )}
                                {report.report.activities?.length > 0 && (
                                    <div className="border-l-4 border-amber-500 bg-amber-50 rounded-r-xl p-6">
                                        <h2 className="text-xl font-serif font-bold text-slate-900 mb-3">Recommended Activities</h2>
                                        <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">{report.report.activities.map((activity, i) => <li key={i}>{activity}</li>)}</ul>
                                    </div>
                                )}
                                {musicRecommendations.length > 0 && (
                                    <div className="border-l-4 border-sky-500 bg-sky-50 rounded-r-xl p-6">
                                        <h2 className="text-xl font-serif font-bold text-slate-900 mb-3">Music Recommendations</h2>
                                        <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">{musicRecommendations.map((item, i) => <li key={i}>{typeof item === 'string' ? item : item.name || item.title || JSON.stringify(item)}</li>)}</ul>
                                    </div>
                                )}
                                {report.report.chakraAnalysis?.length > 0 && (
                                    <div className="border-l-4 border-violet-500 bg-violet-50 rounded-r-xl p-6">
                                        <h2 className="text-xl font-serif font-bold text-slate-900 mb-3">Chakra Analysis</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{report.report.chakraAnalysis.map((item, i) => <div key={i} className="bg-white/70 rounded-xl p-3"><p className="font-bold text-slate-900">{item.chakra}</p>{item.engineStatus && <p className="text-sm text-slate-600">Final ANAHAT result: {item.engineStatus}</p>}<p className="text-sm text-slate-600">{item.therapistOverride ? `Therapist override: ${item.therapistOverride}` : item.engineStatus ? 'No therapist override' : item.status}</p>{item.note && <p className="text-xs text-slate-500 mt-1">{item.note}</p>}</div>)}</div>
                                    </div>
                                )}
                                {report.report.userPrescription && (
                                    <div className="border-l-4 border-[#0F8594]/75 bg-[#0F8594]/75 rounded-r-xl p-6">
                                        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                                            <h2 className="text-xl font-serif font-bold text-slate-900">
                                                Your Personalized Prescription
                                            </h2>
                                            <button
                                                onClick={() => downloadTextReport('user')}
                                                className="px-4 py-2 bg-[#0F8594]/75 border border-[#0F8594]/75 text-[#0F8594]/25 rounded-lg hover:bg-[#0F8594]/75 text-sm font-semibold transition-all"
                                            >
                                                Download
                                            </button>
                                        </div>
                                        <pre className="text-slate-700 whitespace-pre-wrap font-sans text-sm bg-black/[0.03] border border-black/[0.04] p-4 rounded-xl max-h-96 overflow-y-auto report-container">
                                            {report.report.userPrescription}
                                        </pre>
                                    </div>
                                )}

                                {report.report.chakras && report.report.chakras.length > 0 && (
                                    <div className="border-l-4 border-[#0F8594] bg-[#0F8594]/10 rounded-r-xl p-6">
                                        <h2 className="text-xl font-serif font-bold text-slate-900 mb-4">
                                            Chakra Analysis Summary
                                        </h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {report.report.chakras.map((chakra, i) => (
                                                <div key={i} className="bg-black/[0.03] border border-black/5 rounded-xl p-4">
                                                    <h3 className="font-bold text-slate-900">{chakra.name}</h3>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${severityBadgeClass(chakra.severity)}`}>
                                                            {chakra.severity || 'Balanced'}
                                                        </span>
                                                        <span className="text-sm text-slate-500">
                                                            {chakra.state}
                                                        </span>
                                                    </div>
                                                    {chakra.ai_explanation && (
                                                        <p className="text-sm text-slate-600 mt-2">
                                                            {chakra.ai_explanation}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {report.report.raga_recommendations && report.report.raga_recommendations.success && (
                                    <div className="border-l-4 border-[#0F8594]/75 bg-[#0F8594]/75 rounded-r-xl p-6">
                                        <h2 className="text-xl font-serif font-bold text-slate-900 mb-4">
                                            Music Therapy Recommendations
                                        </h2>
                                        {report.report.raga_recommendations.recommendations && 
                                         report.report.raga_recommendations.recommendations.map((rec, i) => (
                                            <div key={i} className="mb-4 last:mb-0">
                                                <h3 className="font-bold text-slate-900 mb-2">
                                                    {rec.chakra} {rec.swar ? `(Swar: ${rec.swar})` : ''}
                                                </h3>
                                                <div className="space-y-2">
                                                    {rec.ragas && rec.ragas.map((raga, j) => (
                                                        <div key={j} className="bg-black/[0.03] border border-black/5 rounded-xl p-3">
                                                            <p className="font-semibold text-slate-900">{raga.name}</p>
                                                            <p className="text-sm text-slate-500">
                                                                Thaat: {raga.thaat} | Vadi: {raga.vadi} | Best Time: {raga.time}
                                                            </p>
                                                            {raga.music_links && Object.keys(raga.music_links).length > 0 && (
                                                                <div className="mt-2">
                                                                    <p className="text-xs font-semibold text-slate-600 mb-1">
                                                                        Listen Now:
                                                                    </p>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        {Object.entries(raga.music_links).map(([type, link]) => (
                                                                            <a
                                                                                key={type}
                                                                                href={link}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="text-xs px-2 py-1 bg-[#0F8594]/75 text-[#0F8594]/25 rounded hover:bg-[#0F8594]/75 transition-all"
                                                                            >
                                                                                {type}
                                                                            </a>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
