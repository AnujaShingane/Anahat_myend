import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { submitWeeklyFeedback } from '../services/api';

const staticQuestions = [
  {
    section: "Overall Experience",
    items: [
      { id: "overall_satisfaction", question: "How satisfied are you with your experience during the session?" },
      { id: "recommend", question: "How likely are you to recommend this session to others?" }
    ]
  },
  {
    section: "Physical Impact",
    items: [
      { id: "physical_relaxation", question: "How relaxed or comfortable did your body feel after the session?" },
      { id: "energy_change", question: "Did you notice any changes in your energy or bodily awareness?" },
      { id: "tension_release", question: "How well did the session help release physical tension or stiffness?" }
    ]
  },
  {
    section: "Mental / Cognitive Effect",
    items: [
      { id: "mental_clarity", question: "How clear or focused did your mind feel after the session?" },
      { id: "mental_refresh", question: "How well did the session help you feel mentally refreshed or alert?" }
    ]
  },
  {
    section: "Emotional Effect",
    items: [
      { id: "emotional_calm", question: "How calm or balanced did you feel emotionally?" },
      { id: "emotional_connection", question: "How connected or in tune with your emotions did you feel during the session?" }
    ]
  },
  {
    section: "Music / Session Effectiveness",
    items: [
      { id: "music_appropriateness", question: "Did the recommended raga/music feel appropriate for your session?" },
      { id: "music_enjoyment", question: "How enjoyable or pleasant did you find the music/raga used in the session?" }
    ]
  },
  {
    section: "Overall Use",
    items: [
      { id: "future_use", question: "How likely are you to integrate this session into your regular wellness routine?" }
    ]
  }
];

export default function Feedback() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [responses, setResponses] = useState({
    improvements: "",
    suggestions: ""
  });
  const [dynamicQuestions, setDynamicQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadDynamicQuestions();

    const handleMouseMove = (e) => {
      requestAnimationFrame(() => {
        setMousePos({ x: e.clientX, y: e.clientY });
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [sessionId]);

  // Per-session "dynamic" health-monitoring questions (numeric before/after
  // measurements tailored to a session type) aren't backed by anything on
  // the server yet — no endpoint for this exists — so this always starts
  // empty rather than hitting a URL that was never real to begin with.
  const loadDynamicQuestions = async () => {
    setDynamicQuestions([]);
    setLoading(false);
  };

  const handleChange = (id, value) => {
    setResponses({ ...responses, [id]: value });
  };

  const handleTextChange = (e) => {
    setResponses({
      ...responses,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Backed by /api/patients/:patientId/weekly-feedback — a running log
      // of feedback entries (see controllers/patientDataController.js).
      await submitWeeklyFeedback(user.id, { sessionId, responses });

      setSubmitted(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDF6EF] flex items-center justify-center p-4 relative">
        <div className="fixed inset-0 opacity-[0.05] pointer-events-none z-0 mix-blend-overlay"
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}>
        </div>
        
        <div className="bg-white/80 backdrop-blur-xl border border-black/5 rounded-[2rem] p-8 shadow-2xl shadow-[#0F8594]/20 relative z-10">
          <div className="text-center">
            <svg className="animate-spin h-12 w-12 mx-auto text-[#0F8594] mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-slate-700">Loading feedback form...</p>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-[#FDF6EF] flex items-center justify-center p-4 relative">
        <div className="fixed inset-0 opacity-[0.05] pointer-events-none z-0 mix-blend-overlay"
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}>
        </div>
        
        <div className="bg-white/90 backdrop-blur-xl border border-black/5 rounded-[2rem] p-12 shadow-2xl shadow-emerald-500/20 max-w-md text-center relative z-10 animate-scale-in">
          <div className="mb-6">
            <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
              <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="text-3xl font-serif font-bold text-slate-900 mb-3">Successfully Submitted!</h2>
          <p className="text-slate-700 mb-2">
            Your feedback has been recorded.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Thank you for helping us improve your healing journey.
          </p>
          <div className="text-[#0F8594]/75 font-semibold mb-4">
            Redirecting to dashboard...
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full px-6 py-3 bg-[#0F8594] hover:bg-[#0a4530] text-white rounded-xl hover:shadow-lg hover:shadow-black/20 transition-all font-bold"
          >
            Go to Dashboard Now
          </button>
        </div>
      </div>
    );
  }

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
          background: rgba(0, 0, 0, 0.05);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(245, 158, 11, 0.6);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
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

      <div className="fixed inset-0 bg-[#FDF6EF] overflow-y-auto selection:bg-[#0F8594]/30">
        <div className="min-h-full p-4 sm:p-6 py-8 relative z-10">
          <div className="max-w-4xl mx-auto pb-8">
            {/* Back Button */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 sm:px-6 py-3 bg-black/5 border border-black/5 text-slate-700 rounded-xl hover:bg-black/10 hover:border-black/10 transition-all backdrop-blur-sm font-semibold flex items-center gap-2 text-sm sm:text-base"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Dashboard
              </button>
            </div>

            <div className="bg-white/80 backdrop-blur-xl border border-black/5 rounded-[2rem] p-4 sm:p-8 shadow-2xl shadow-[#0F8594]/10 mb-6">
              <div className="text-center mb-6">
                <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <div className="absolute inset-0 bg-[#0F8594] blur-xl opacity-60 rounded-full animate-pulse-slow"></div>
                  <svg className="w-12 h-12 text-[#0F8594]/12 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 mb-2">Session Feedback</h2>
                <p className="text-slate-600 text-sm sm:text-base">Help us understand your experience</p>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm backdrop-blur-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Dynamic Health Questions */}
                {dynamicQuestions.length > 0 && (
                  <div className="bg-[#0F8594]/10 border border-[#0F8594]/30 rounded-2xl p-4 sm:p-6">
                    <h3 className="text-lg sm:text-xl font-serif font-bold text-[#0F8594]/75 mb-4 flex items-center gap-2 uppercase tracking-wider">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                      Health Monitoring
                    </h3>
                    <p className="text-xs sm:text-sm text-[#0F8594]/45 mb-4">
                      Based on your session, please provide the following measurements:
                    </p>

                    {dynamicQuestions.map((q) => (
                      <div key={q.id} className="mb-6 bg-black/[0.03] border border-black/5 rounded-xl p-3 sm:p-4">
                        <p className="font-semibold text-slate-800 mb-3 text-sm sm:text-base">{q.question}</p>
                        
                        {q.type === 'numeric' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs sm:text-sm text-slate-600 mb-2">Before Session</label>
                              <input
                                type="number"
                                step="0.1"
                                placeholder={q.placeholder || "Enter value"}
                                className="w-full px-3 sm:px-4 py-2 bg-black/5 border border-black/5 text-slate-900 placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F8594]/50 focus:border-[#0F8594]/50 text-sm sm:text-base transition-all"
                                onChange={(e) => handleChange(`${q.id}_before`, e.target.value)}
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs sm:text-sm text-slate-600 mb-2">After Session</label>
                              <input
                                type="number"
                                step="0.1"
                                placeholder={q.placeholder || "Enter value"}
                                className="w-full px-3 sm:px-4 py-2 bg-black/5 border border-black/5 text-slate-900 placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F8594]/50 focus:border-[#0F8594]/50 text-sm sm:text-base transition-all"
                                onChange={(e) => handleChange(`${q.id}_after`, e.target.value)}
                                required
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="rating-scale flex gap-2 justify-center flex-wrap">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                              <label key={num} className="cursor-pointer">
                                <input
                                  type="radio"
                                  name={q.id}
                                  value={num}
                                  className="sr-only"
                                  onChange={() => handleChange(q.id, num)}
                                  required
                                />
                                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center font-bold transition-all text-xs sm:text-sm ${
                                  responses[q.id] === num 
                                    ? 'bg-[#0F8594] text-white border-[#0F8594] scale-110 shadow-lg' 
                                    : 'bg-black/5 text-slate-600 border-black/5 hover:border-[#0F8594]/50'
                                }`}>
                                  {num}
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                        {q.unit && (
                          <p className="text-xs text-slate-500 mt-2">Unit: {q.unit}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Static Questions */}
                {staticQuestions.map((section) => (
                  <div key={section.section} className="border-b border-black/5 pb-6">
                    <h3 className="text-lg sm:text-xl font-serif font-bold text-[#0F8594]/75 mb-4 uppercase tracking-wider">{section.section}</h3>

                    {section.items.map((q) => (
                      <div key={q.id} className="mb-6 bg-black/[0.02] border border-black/[0.04] rounded-xl p-4">
                        <p className="text-slate-800 mb-4 text-sm sm:text-base">{q.question}</p>
                        <div className="rating-scale flex gap-1 sm:gap-2 justify-center flex-wrap">
                          {[1, 2, 3, 4, 5].map((num) => (
                            <label key={num} className="cursor-pointer">
                              <input
                                type="radio"
                                name={q.id}
                                value={num}
                                className="sr-only"
                                onChange={() => handleChange(q.id, num)}
                                required
                              />
                              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center font-bold transition-all text-sm ${
                                responses[q.id] === num 
                                  ? 'bg-[#0F8594] text-white border-[#0F8594] scale-110 shadow-lg' 
                                  : 'bg-black/5 text-slate-600 border-black/5 hover:border-[#0F8594]/50'
                              }`}>
                                {num}
                              </div>
                            </label>
                          ))}
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 mt-3 px-2">
                          <span>Poor</span>
                          <span>Excellent</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Additional Feedback */}
                <div className="space-y-6">
                  <h3 className="text-lg sm:text-xl font-serif font-bold text-[#0F8594]/75 uppercase tracking-wider">Additional Feedback</h3>

                  <div>
                    <p className="text-slate-800 mb-3 text-sm sm:text-base">
                      What specific changes or improvements have you noticed after the session?
                    </p>
                    <textarea
                      name="improvements"
                      placeholder="Describe physical, mental, or emotional changes..."
                      value={responses.improvements}
                      onChange={handleTextChange}
                      required
                      rows={4}
                      className="w-full px-3 sm:px-4 py-3 bg-black/[0.03] border border-black/5 text-slate-900 placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F8594]/50 focus:border-[#0F8594]/50 text-sm sm:text-base transition-all"
                    />
                  </div>

                  <div>
                    <p className="text-slate-800 mb-3 text-sm sm:text-base">
                      Do you have any suggestions for improvement or additional comments?
                    </p>
                    <textarea
                      name="suggestions"
                      placeholder="Share your suggestions or comments..."
                      value={responses.suggestions}
                      onChange={handleTextChange}
                      rows={4}
                      className="w-full px-3 sm:px-4 py-3 bg-black/[0.03] border border-black/5 text-slate-900 placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F8594]/50 focus:border-[#0F8594]/50 text-sm sm:text-base transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all ${
                    submitting
                      ? 'bg-black/10 text-slate-500 cursor-not-allowed'
                      : 'bg-[#0F8594] hover:bg-[#0a4530] text-white hover:shadow-lg hover:shadow-black/20 transform hover:scale-105'
                  }`}
                >
                  {submitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Submitting...
                    </div>
                  ) : (
                    'Submit Feedback'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}