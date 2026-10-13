import { useState } from 'react';

export default function ResumeConversationDialog({ 
  isOpen, 
  onResume, 
  onStartNew, 
  onClose,
  resumeData 
}) {
  const [loading, setLoading] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  if (!isOpen || !resumeData) return null;

  const { session, summary, daysSinceActivity } = resumeData;

  const handleResume = async () => {
    setLoading(true);
    try {
      await onResume(session.sessionId);
    } finally {
      setLoading(false);
    }
  };

  const handleStartNew = async () => {
    setLoading(true);
    try {
      await onStartNew();
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#0F8594] p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-4xl"></div>
              <div>
                <h2 className="text-2xl font-bold">Welcome Back!</h2>
                <p className="text-[#0F8594]/12 text-sm mt-1">
              You have an incomplete session
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-all"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Session Info */}
          <div className="bg-[#0F8594]/8 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">Session Name</p>
                <p className="font-semibold text-gray-800">{session.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Current Phase</p>
                <p className="font-semibold text-[#0A6976]">{session.currentPhase}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Questions Answered</p>
                <p className="font-semibold text-gray-800">{session.questionsAsked}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Last Activity</p>
                <p className="font-semibold text-gray-800">
                  {daysSinceActivity === 0 ? 'Today' : 
                   daysSinceActivity === 1 ? 'Yesterday' : 
                   `${daysSinceActivity} days ago`}
                </p>
              </div>
            </div>
          </div>

          {/* Summary */}
          {summary && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span>‹</span>
              Session Summary
              </h3>
              
              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-[#0F8594]">
                      {summary.totalTurns}
                    </p>
                    <p className="text-xs text-gray-600">Exchanges</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-[#0A6976]">
                      {session.conversationTurns}
                    </p>
                    <p className="text-xs text-gray-600">Messages</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-[#0F8594]">
                      {summary.phases?.length || 0}
                    </p>
                    <p className="text-xs text-gray-600">Phases</p>
                  </div>
                </div>

                {/* Last Message Preview */}
                {summary.lastUserMessage && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-600 mb-2">Your Last Message:</p>
                    <p className="text-sm text-gray-800 italic">
                      "{summary.lastUserMessage.text}"
                    </p>
                  </div>
                )}

                {/* Recent Conversation Preview */}
                {summary.conversationPreview && summary.conversationPreview.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowFullHistory(!showFullHistory)}
                      className="text-sm text-[#0F8594] hover:text-[#0A6976] font-semibold mb-2 flex items-center gap-1"
                    >
                      {showFullHistory ? 'â–¼' : 'â–¶'}Recent Conversation
                    </button>
                    
                    {showFullHistory && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {summary.conversationPreview.map((turn, idx) => (
                          <div key={idx} className="border-l-2 border-gray-300 pl-3 py-2">
                            <p className="text-xs text-gray-500 mb-1">
                              {formatTimestamp(turn.timestamp)}
                            </p>
                            {turn.userText && (
                              <div className="mb-1">
                                <span className="text-xs font-semibold text-[#0A6976]">You: </span>
                                <span className="text-sm text-gray-700">{turn.userText}</span>
                              </div>
                            )}
                            {turn.assistantText && (
                              <div>
                                <span className="text-xs font-semibold text-[#0E5860]">Therapist: </span>
                                <span className="text-sm text-gray-700">{turn.assistantText}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Information Box */}
          <div className="bg-[#0F8594]/8 border border-[#0F8594]/25 rounded-lg p-4 mb-4">
            <div className="flex gap-3">
              <div className="text-2xl"></div>
              <div className="flex-1">
                <p className="text-sm text-[#0A4247]">
                  <strong>Resume your session</strong> to continue from where you left off, 
                  or <strong>start a new session</strong>to begin fresh with a new assessment.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-50 p-6 flex gap-3">
          <button
            onClick={handleStartNew}
            disabled={loading}
            className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
              loading 
                ? 'bg-gray-300 cursor-not-allowed' 
                : 'bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {loading ? 'Please wait...' : 'ðŸ†• Start New Session'}
          </button>
          
          <button
            onClick={handleResume}
            disabled={loading}
            className={`flex-1 py-3 rounded-lg font-semibold text-white transition-all ${
              loading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-[#0F8594] hover:bg-[#0a4530] shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </div>
            ) : (
              'Resume Session'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}