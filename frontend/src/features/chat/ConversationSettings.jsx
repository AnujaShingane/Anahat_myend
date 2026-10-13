import { useState, useEffect } from 'react';

const BACKEND_URL = "http://localhost:3000";

export default function ConversationSettings({ isOpen, onClose }) {
  const [preferences, setPreferences] = useState({
    autoSave: true,
    retentionDays: 90,
    showHistory: true,
    enableSummary: true,
    promptToResume: true
  });
  
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Load preferences
      const prefsResponse = await fetch(`${BACKEND_URL}/conversation/preferences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (prefsResponse.ok) {
        const prefsData = await prefsResponse.json();
        setPreferences({
          autoSave: prefsData.preferences.auto_save_conversations,
          retentionDays: prefsData.preferences.conversation_retention_days,
          showHistory: prefsData.preferences.show_conversation_history,
          enableSummary: prefsData.preferences.enable_conversation_summary,
          promptToResume: prefsData.preferences.prompt_to_resume
        });
      }

      // Load sessions
      const sessionsResponse = await fetch(`${BACKEND_URL}/conversation/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (sessionsResponse.ok) {
        const sessionsData = await sessionsResponse.json();
        setSessions(sessionsData.sessions);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${BACKEND_URL}/conversation/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(preferences)
      });

      if (response.ok) {
        alert('✅ Preferences saved successfully!');
      } else {
        alert('❌ Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      alert('❌ Error saving preferences');
    } finally {
      setSaving(false);
    }
  };

  const deleteSession = async (sessionId) => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${BACKEND_URL}/conversation/session/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setSessions(sessions.filter(s => s.sessionId !== sessionId));
        alert('✅ Conversation deleted successfully!');
      } else {
        alert('❌ Failed to delete conversation');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('❌ Error deleting conversation');
    } finally {
      setShowDeleteConfirm(false);
      setSessionToDelete(null);
    }
  };

  const clearAllHistory = async () => {
    const userId = JSON.parse(localStorage.getItem('user')).id;
    
    if (confirmText !== userId) {
      alert('❌ Incorrect confirmation. Please enter your user ID correctly.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${BACKEND_URL}/conversation/clear-all`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ confirmation: userId })
      });

      if (response.ok) {
        setSessions([]);
        setShowClearAllConfirm(false);
        setConfirmText('');
        alert('✅ All conversation history cleared!');
      } else {
        alert('❌ Failed to clear history');
      }
    } catch (error) {
      console.error('Error clearing history:', error);
      alert('❌ Error clearing history');
    }
  };

  const exportSession = async (sessionId, format = 'json') => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(
        `${BACKEND_URL}/conversation/export/${sessionId}?format=${format}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversation_${sessionId}.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert('❌ Failed to export conversation');
      }
    } catch (error) {
      console.error('Error exporting session:', error);
      alert('❌ Error exporting conversation');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#0F8594] p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-4xl">⚙️</div>
              <div>
                <h2 className="text-2xl font-bold">Conversation Settings</h2>
                <p className="text-[#0F8594]/12 text-sm mt-1">
                  Manage your conversation history and preferences
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
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <svg className="animate-spin h-12 w-12 mx-auto text-[#0F8594] mb-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-600">Loading settings...</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Preferences Section */}
              <section>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span>🎛️</span>
                  Preferences
                </h3>
                
                <div className="space-y-4 bg-gray-50 rounded-lg p-4">
                  {/* Auto Save */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">Auto-save conversations</p>
                      <p className="text-sm text-gray-600">Automatically save all conversation turns</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.autoSave}
                        onChange={(e) => setPreferences({...preferences, autoSave: e.target.checked})}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0F8594]/45 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0F8594]"></div>
                    </label>
                  </div>

                  {/* Show History */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">Show conversation history</p>
                      <p className="text-sm text-gray-600">Display conversation history in interface</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.showHistory}
                        onChange={(e) => setPreferences({...preferences, showHistory: e.target.checked})}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0F8594]/45 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0F8594]"></div>
                    </label>
                  </div>

                  {/* Enable Summary */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">Enable conversation summaries</p>
                      <p className="text-sm text-gray-600">Generate summaries when resuming sessions</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.enableSummary}
                        onChange={(e) => setPreferences({...preferences, enableSummary: e.target.checked})}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0F8594]/45 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0F8594]"></div>
                    </label>
                  </div>

                  {/* Prompt to Resume */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">Prompt to resume</p>
                      <p className="text-sm text-gray-600">Ask to resume incomplete sessions on login</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.promptToResume}
                        onChange={(e) => setPreferences({...preferences, promptToResume: e.target.checked})}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0F8594]/45 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0F8594]"></div>
                    </label>
                  </div>

                  {/* Retention Days */}
                  <div>
                    <p className="font-semibold text-gray-800 mb-2">Conversation retention</p>
                    <select
                      value={preferences.retentionDays}
                      onChange={(e) => setPreferences({...preferences, retentionDays: parseInt(e.target.value)})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F8594]/75"
                    >
                      <option value={30}>30 days</option>
                      <option value={60}>60 days</option>
                      <option value={90}>90 days</option>
                      <option value={180}>180 days</option>
                      <option value={365}>1 year</option>
                      <option value={-1}>Forever</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={savePreferences}
                  disabled={saving}
                  className={`mt-4 w-full py-3 rounded-lg font-semibold text-white transition-all ${
                    saving 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-[#0F8594] hover:bg-[#0a4530] shadow-lg'
                  }`}
                >
                  {saving ? 'Saving...' : '💾 Save Preferences'}
                </button>
              </section>

              {/* Conversation History Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span>📚</span>
                    Conversation History ({sessions.length})
                  </h3>
                  {sessions.length > 0 && (
                    <button
                      onClick={() => setShowClearAllConfirm(true)}
                      className="text-red-600 hover:text-red-700 text-sm font-semibold"
                    >
                      🗑️ Clear All
                    </button>
                  )}
                </div>

                {sessions.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg p-8 text-center">
                    <div className="text-6xl mb-4">📭</div>
                    <p className="text-gray-600">No conversation history</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {sessions.map((session) => (
                      <div key={session.sessionId} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-800">{session.name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{session.currentPhase}</p>
                            <div className="flex gap-4 mt-2 text-xs text-gray-500">
                              <span>💬 {session.conversationTurns} turns</span>
                              <span>📅 {new Date(session.lastUpdated).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => exportSession(session.sessionId, 'json')}
                              className="p-2 text-[#0F8594] hover:bg-[#0F8594]/8 rounded-lg transition-all"
                              title="Export as JSON"
                            >
                              📥
                            </button>
                            <button
                              onClick={() => {
                                setSessionToDelete(session.sessionId);
                                setShowDeleteConfirm(true);
                              }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Confirm Deletion</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setSessionToDelete(null);
                  }}
                  className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteSession(sessionToDelete)}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear All Confirmation Modal */}
        {showClearAllConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-red-600 mb-4">⚠️ Clear All History</h3>
              <p className="text-gray-600 mb-4">
                This will permanently delete ALL your conversation history. This action cannot be undone.
              </p>
              <p className="text-sm text-gray-700 mb-2 font-semibold">
                Enter your User ID to confirm:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="User ID"
                className="w-full p-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowClearAllConfirm(false);
                    setConfirmText('');
                  }}
                  className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={clearAllHistory}
                  disabled={!confirmText}
                  className={`flex-1 py-2 rounded-lg font-semibold text-white ${
                    confirmText 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}