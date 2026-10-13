import { useRef, useState, useEffect } from "react";
import { useChat } from "./useChat";
import { Link } from 'react-router-dom';
import { addDocument } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const UI = ({ hidden, ...props }) => {
  const input = useRef();
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const {
    chat,
    loading,
    cameraZoomed,
    setCameraZoomed,
    message,
    sessionInitialized,
    currentQuadrant,
    sessionComplete,
    sessionId,
    navigationState,
    handleNavigation,
    conversationHistory,
    isResuming,
    resumeError,
    isSpeaking,
    stopSpeaking
  } = useChat();

  // =====================================================
  // ACCOUNT IDENTITY FEATURE START
  // No more name entry. The account's own first name (set once at
  // signup, see server.js /auth/register) is read straight from what
  // login already stored - purely for the "Welcome back" display
  // below. The backend never trusts this value for anything; it does
  // its own lookup via the authenticated user id. See useChat.jsx's
  // auto-init effect for what actually starts a fresh session now.
  // =====================================================
  const [accountFirstName] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('user') || 'null');
      return stored?.first_name || stored?.name?.split(/\s+/)[0] || 'Friend';
    } catch {
      return 'Friend';
    }
  });
  // =====================================================
  // ACCOUNT IDENTITY FEATURE END
  // =====================================================
  const [showConversationText, setShowConversationText] = useState(true);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const conversationEndRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      requestAnimationFrame(() => {
        setMousePos({ x: e.clientX, y: e.clientY });
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationHistory, message]);

  // Stop the mic if the assistant starts speaking, and clean up on unmount
  useEffect(() => {
    if (isSpeaking && recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isSpeaking, isListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const sendMessage = () => {
    const text = input.current.value;
    if (!loading && !message && text.trim() && !isSpeaking) {
      chat(text);
      input.current.value = "";
    }
  };

  const uploadDocument = async (file) => {
    if (!file || !user?.id) return;
    setUploading(true);
    setUploadStatus('');
    try {
      await addDocument(user.id, { file, name: file.name, size: file.size, category: 'Previous Report' });
      setUploadStatus(`${file.name} uploaded to your documents.`);
    } catch (error) {
      setUploadStatus(error.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      window.setTimeout(() => setUploadStatus(''), 5000);
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError("Speech recognition isn't supported in this browser. Try Chrome or Edge.");
      return;
    }

    setVoiceError("");
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (input.current) {
        input.current.value = transcript;
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech Recognition Error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setVoiceError("Mic access was denied. Allow microphone permission to use voice input.");
      } else if (event.error === "no-speech") {
        setVoiceError("Didn't catch that — try again.");
      } else {
        setVoiceError("Voice input failed. Please try again.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (
        input.current &&
        input.current.value.trim() &&
        !loading &&
        !message &&
        !isSpeaking
      ) {
        sendMessage();
      }
    };

    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (hidden) {
    return null;
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
        @keyframes mic-pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .mic-listening {
          animation: mic-pulse-ring 1.5s infinite;
        }

        ::-webkit-scrollbar {
          width: 8px;
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
      `}</style>

      {/* Background Glow Effect */}
      <div
        className="fixed w-[600px] h-[600px] rounded-full bg-gradient-radial from-lime-300/10 via-[#0F8594]/5 to-transparent blur-[80px] pointer-events-none transition-transform duration-[400ms] ease-out z-0"
        style={{ transform: `translate(${mousePos.x - 300}px, ${mousePos.y - 300}px)`, background: 'radial-gradient(circle at center, rgba(251, 191, 36, 0.1), rgba(168, 85, 247, 0.05), transparent)' }}
      />

      {/* =====================================================
          ACCOUNT IDENTITY FEATURE START
          Replaces the old "Enter your name" modal. Purely
          informational - there's nothing to type or click here.
          initializeSession() is already firing on its own (see
          useChat.jsx's auto-init effect) using the account's own
          first name from the backend. This just shows briefly while
          that request is in flight, then disappears automatically
          once sessionInitialized becomes true.
          ===================================================== */}
      {!sessionInitialized && !isResuming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="bg-white border border-black/10 rounded-[2rem] p-8 max-w-md w-full mx-4 shadow-2xl shadow-[#0F8594]/20 text-center">
            <div className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#0F8594] blur-xl opacity-60 rounded-full animate-pulse-slow"></div>
              <svg className="w-16 h-16 text-[#0E5860] relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
              </svg>
            </div>
            <h2 className="text-3xl font-serif font-bold text-slate-900 mb-2">
              Welcome, {accountFirstName}!
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              Let's begin your wellness assessment.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Starting your session...
            </div>
          </div>
        </div>
      )}
      {/* =====================================================
          ACCOUNT IDENTITY FEATURE END
          ===================================================== */}


      {/* Resume Error Toast */}
      {resumeError && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-red-500/20 border border-red-500/30 backdrop-blur-xl text-red-600 px-6 py-4 rounded-2xl shadow-2xl shadow-red-500/20 max-w-md">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-bold mb-1">Resume Failed</p>
                <p className="text-sm">{resumeError}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voice Error Toast */}
      {voiceError && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-red-500/20 border border-red-500/30 backdrop-blur-xl text-red-600 px-6 py-3 rounded-2xl shadow-2xl shadow-red-500/20 max-w-md flex items-center gap-3">
            <span className="text-sm">{voiceError}</span>
            <button onClick={() => setVoiceError("")} className="text-red-600 hover:text-red-800 font-bold">
              ×
            </button>
          </div>
        </div>
      )}

      {/* Resuming Session Indicator */}
      {isResuming && !resumeError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-white border border-black/10 rounded-[2rem] p-8 max-w-md w-full mx-4 shadow-2xl shadow-[#0F8594]/20 text-center">
            <div className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#0F8594] blur-xl opacity-60 rounded-full animate-pulse"></div>
              <svg className="w-16 h-16 text-[#0E5860] relative z-10 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h2 className="text-2xl font-serif font-bold text-[#0F8594] mb-2">
              Resuming Your Session
            </h2>
            <p className="text-slate-600 mb-4">
              Loading your previous progress and conversation history...
            </p>
            <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-[#0F8594] animate-pulse"></div>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              This may take a few seconds...
            </p>
          </div>
        </div>
      )}

      {/* Main UI Container */}
      <div className="fixed top-0 left-0 right-0 bottom-0 z-10 flex justify-between p-4 flex-col pointer-events-none overflow-hidden">
        {/* Header with Progress */}
        <div className="flex justify-between items-start">
          <div className="self-start backdrop-blur-xl bg-white/80 border border-black/10 p-4 rounded-2xl shadow-lg shadow-[#0F8594]/10 pointer-events-auto">
            <Link to="/" aria-label="Anahat Transformations home" className="mb-2 flex items-center gap-3">
              <div className="relative flex h-8 w-8 items-center justify-center">
                <img src="/assets/anahat-logo.png" alt="Anahat" className="relative z-10 h-8 w-8 object-contain" />
              </div>
              <div>
                <h1 className="font-serif text-lg font-bold text-slate-900">Anahat Transformations</h1>
                <p className="text-xs text-slate-600">Holistic Wellness Assessment</p>
              </div>
            </Link>

            {sessionInitialized && (
              <div className="mt-3 pt-3 border-t border-black/10">
                <p className="text-xs font-semibold text-[#0F8594] flex items-center">
                  <span className="inline-block w-2 h-2 bg-[#0F8594] rounded-full mr-2 animate-pulse"></span>
                  {currentQuadrant || "In Progress"}
                </p>

                {sessionComplete && (
                  <div className="mt-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-2">
                    <p className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Session Complete
                    </p>
                    <p className="text-xs text-emerald-700 mt-1">
                      Preparing your report...
                    </p>
                  </div>
                )}

                {!sessionComplete && sessionId && (
                  <p className="text-xs text-slate-500 mt-2">
                    Session: {sessionId.substring(0, 20)}...
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Conversation Text Toggle */}
          {sessionInitialized && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowConversationText(!showConversationText)}
                className="pointer-events-auto backdrop-blur-xl bg-white/80 border border-black/10 p-3 rounded-2xl shadow-lg hover:border-[#0F8594]/30 transition-all"
                title={showConversationText ? "Hide Conversation Text" : "Show Conversation Text"}
              >
                <svg className="w-6 h-6 text-[#0A6976]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Live Conversation Display Panel */}
        {showConversationText && sessionInitialized && (
          <div className="absolute top-20 right-4 w-96 max-h-[60vh] bg-white/90 backdrop-blur-xl border border-black/10 rounded-2xl shadow-2xl shadow-[#0F8594]/20 overflow-hidden pointer-events-auto">
            <div className="bg-gradient-to-r from-[#0F8594]/20 to-[#0F8594]/20 border-b border-black/10 p-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Full Conversation
              </h3>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(60vh-60px)] space-y-3">
              {conversationHistory.map((entry, idx) => {
                // The avatar's currently-speaking message is ALSO the most
                // recent assistant entry in conversationHistory (it's pushed
                // there as soon as the backend responds, before playback
                // starts). Decorate that same bubble instead of rendering a
                // second "live" copy of it below — otherwise, when playback
                // ends and `message` clears, it looks like the question
                // vanished even though the permanent entry never moved.
                const isCurrentlySpeaking =
                  !!message &&
                  entry.type === 'assistant' &&
                  idx === conversationHistory.length - 1 &&
                  entry.message === message.text;

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      entry.type === 'user'
                        ? 'bg-[#0F8594]/10 ml-4 border-l-4 border-[#0F8594]'
                        : isCurrentlySpeaking
                        ? 'bg-[#0F8594]/20 mr-4 border-l-4 border-[#0F8594] animate-pulse'
                        : 'bg-[#0F8594]/10 mr-4 border-l-4 border-[#0F8594]'
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-2">
                      <span>{entry.type === 'user' ? '👤 You' : '🧘 Therapist'}</span>
                      {isCurrentlySpeaking && (
                        <span className="text-xs bg-[#0F8594] text-white px-2 py-0.5 rounded-full">
                          Speaking...
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-800">{entry.message}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                );
              })}

              <div ref={conversationEndRef} />
            </div>
          </div>
        )}

        {/* Navigation Controls */}
        <div className="fixed left-4 bottom-32 flex flex-col gap-3 pointer-events-auto z-20">
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-600 px-4 py-2 rounded-xl shadow-lg backdrop-blur-xl transition-all flex items-center gap-2 font-semibold"
              title="Stop Speaking"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
              Stop Speaking
            </button>
          )}

          {sessionInitialized && !sessionComplete && (
            <div className="flex gap-2 pointer-events-auto">
              {navigationState.canGoBack && (
                <button
                  onClick={() => handleNavigation('back')}
                  disabled={loading || isSpeaking}
                  className="bg-white/80 backdrop-blur-xl border border-black/10 hover:border-[#0F8594]/30 text-[#0F8594] px-3 py-2 rounded-xl shadow-lg transition-all flex items-center gap-2 font-semibold disabled:opacity-50"
                  title="Go Back"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              )}

              {navigationState.canRepeat && (
                <button
                  onClick={() => handleNavigation('repeat')}
                  disabled={loading || isSpeaking}
                  className="bg-white/80 backdrop-blur-xl border border-black/10 hover:border-[#0F8594]/30 text-[#0A6976] px-4 py-2 rounded-xl shadow-lg transition-all transform hover:scale-105 flex items-center gap-2 font-semibold disabled:opacity-50"
                  title="Repeat Question"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Repeat
                </button>
              )}

              {navigationState.canSkip && (
                <button
                  onClick={() => handleNavigation('skip')}
                  disabled={loading || isSpeaking}
                  className="bg-white/80 backdrop-blur-xl border border-black/10 hover:border-orange-500/30 text-orange-600 px-4 py-2 rounded-xl shadow-lg transition-all transform hover:scale-105 flex items-center gap-2 font-semibold disabled:opacity-50"
                  title="Skip Question"
                >
                  Skip
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Camera Controls */}
        <div className="w-full flex flex-col items-end justify-center gap-4">
          <button
            onClick={() => setCameraZoomed(!cameraZoomed)}
            className="pointer-events-auto bg-[#0F8594] hover:bg-[#0a4530] hover:shadow-lg hover:shadow-black/20 text-white p-4 rounded-xl shadow-lg transition-all transform hover:scale-105"
            title={cameraZoomed ? "Zoom Out" : "Zoom In"}
          >
            {cameraZoomed ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
              </svg>
            )}
          </button>
        </div>

        {/* Chat Input */}
        <div className="flex items-center gap-2 pointer-events-auto max-w-screen-sm w-full mx-auto">
          <button
            onClick={sendMessage}
            disabled={loading || message || !sessionInitialized || sessionComplete || isSpeaking}
            aria-label="Send message"
            title="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0F8594] text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <SendIcon />
          </button>
          <button
            onClick={isListening ? () => recognitionRef.current?.stop() : startListening}
            disabled={loading || message || !sessionInitialized || sessionComplete || isSpeaking}
            aria-label={isListening ? 'Stop voice input' : 'Dictate message'}
            title={isListening ? 'Stop voice input' : 'Dictate message'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${isListening ? 'bg-red-500 text-white mic-listening' : 'bg-white/85 text-slate-700'} disabled:opacity-30`}
          >
            <MicrophoneIcon />
          </button>
          <input
            className="w-full placeholder:text-slate-600 placeholder:italic p-4 rounded-xl bg-white/80 backdrop-blur-xl border border-black/10 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F8594]/50 focus:border-[#0F8594]/50 shadow-lg disabled:opacity-50 transition-all"
            placeholder={
              sessionComplete
                ? "Session complete. Preparing your report..."
                : sessionInitialized
                ? isSpeaking
                  ? "Please wait while I finish speaking..."
                  : isListening
                  ? "Listening..."
                  : "Type your response here..."
                : "Please start your session first..."
            }
            ref={input}
            disabled={!sessionInitialized || sessionComplete || isSpeaking}
            onKeyDown={handleKeyPress}
          />
          <div className="relative shrink-0">
            {attachmentMenuOpen && <div className="absolute bottom-14 right-0 z-30 w-44 border border-black/10 bg-white py-1 text-slate-800 shadow-xl pointer-events-auto">
              <button type="button" onClick={() => { setAttachmentMenuOpen(false); cameraInputRef.current?.click(); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"><CameraIcon />Use camera</button>
              <button type="button" onClick={() => { setAttachmentMenuOpen(false); fileInputRef.current?.click(); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"><PaperclipIcon />Attach files</button>
            </div>}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { uploadDocument(event.target.files?.[0]); event.target.value = ''; }} />
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt" className="hidden" onChange={(event) => { uploadDocument(event.target.files?.[0]); event.target.value = ''; }} />
            <button type="button" onClick={() => setAttachmentMenuOpen((open) => !open)} disabled={uploading || !user?.id} aria-label="Add attachment" title={uploading ? 'Uploading file' : 'Add attachment'} className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/85 text-slate-700 disabled:opacity-40">
              {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0F8594]" /> : <PlusIcon />}
            </button>
          </div>
        </div>
        {(voiceError || uploadStatus) && <p role="status" className="pointer-events-auto mx-auto mt-2 max-w-screen-sm text-xs text-white">{voiceError || uploadStatus}</p>}

        {/* Status Indicators */}
        {loading && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 pointer-events-none">
            <div className="bg-[#0F8594] text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg flex items-center animate-pulse">
              <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing your response...
            </div>
          </div>
        )}

        {sessionComplete && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 pointer-events-none">
            <div className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg animate-bounce">
              🎉 Generating Your Personalized Report...
            </div>
          </div>
        )}
      </div>
    </>
  );
};

function SendIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>; }
function MicrophoneIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8" /></svg>; }
function CameraIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="4" /></svg>; }
function PaperclipIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.4 11.1-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9.8 17.1a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>; }
function PlusIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }