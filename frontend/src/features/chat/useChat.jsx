import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

const ChatContext = createContext();

const BACKEND_URL = "http://localhost:3000";
const RESUME_TIMEOUT = 10000;

export const ChatProvider = ({ children }) => {
    // BUGFIX (infinite reload loop): ChatProvider mounts above <Routes> in
    // main.jsx, so it has no built-in idea which page is actually showing.
    // useLocation still works here because ChatProvider is a descendant of
    // <BrowserRouter> - just not of <Routes>. Used below to stop the
    // auto-init effect from ever firing on routes that aren't /chat.
    const location = useLocation();

    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [cameraZoomed, setCameraZoomed] = useState(true);
    const [sessionId, setSessionId] = useState(null);
    const [sessionInitialized, setSessionInitialized] = useState(false);
    const [currentQuadrant, setCurrentQuadrant] = useState(null);
    const [sessionComplete, setSessionComplete] = useState(false);
    const [navigationState, setNavigationState] = useState({
        canGoBack: false,
        canSkip: false,
        canRepeat: true
    });
    const [conversationHistory, setConversationHistory] = useState([]);
    const [isResuming, setIsResuming] = useState(false);
    const [resumeError, setResumeError] = useState(null);
    
    const isSpeaking = useRef(false);
    const audioRef = useRef(null);
    const resumeTimeoutRef = useRef(null);
    const lastMessageRef = useRef(null); // Store last message for repeat

    // =====================================================
    // ACCOUNT IDENTITY FEATURE START
    // Tracks which sessionId we've already attempted to auto-init,
    // so a fresh (non-resume) session starts itself automatically -
    // no name modal, no explicit user action needed beyond navigating
    // here. Guarding with a ref (not just state) means a failed
    // attempt won't retry in a loop: it only fires once per distinct
    // sessionId, no matter how many times this effect re-runs.
    // =====================================================
    const autoInitSessionIdRef = useRef(null);
    // =====================================================
    // ACCOUNT IDENTITY FEATURE END
    // =====================================================

    useEffect(() => {
        const resumeSessionId = localStorage.getItem('resumeSessionId');
        const resumeAction = localStorage.getItem('resumeAction');
        
        console.log('🔍 Checking resume on mount:', { resumeSessionId, resumeAction });
        
        if (resumeSessionId && resumeAction === 'resume') {
            console.log('✅ Resume detected, verifying session...');
            verifyAndResumeSession(resumeSessionId);
        } else {
            const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('🆕 Creating new session:', id);
            setSessionId(id);
        }

        return () => {
            if (resumeTimeoutRef.current) {
                clearTimeout(resumeTimeoutRef.current);
            }
        };
    }, []);

    // =====================================================
    // ACCOUNT IDENTITY FEATURE START (fixed - see bugfix note below)
    // Auto-starts a fresh (non-resume) session as soon as a sessionId
    // exists and nothing is already initialized/resuming - this is
    // what replaces the old "Enter your name" modal's submit button.
    // Since the backend derives the therapy bot's name from the
    // logged-in account itself (see server.js /chat CASE 1), nothing
    // needs to be collected from the user here at all.
    //
    // BUGFIX (infinite reload loop): this effect used to fire on
    // ANY mount, on ANY route, with no auth check at all - because
    // ChatProvider lives above <Routes> in main.jsx, that included
    // /login, /register, and the landing page. With no/a stale token
    // in localStorage, initializeSession() hits its
    // window.location.href='/login' path (see line ~310/~358 below),
    // which is a REAL full-page reload, not a state update. That
    // reload remounts ChatProvider from scratch, generating a brand
    // new sessionId, which re-triggers this same effect, which
    // reloads again - forever. Two independent guards now prevent
    // that: this effect must see BOTH a real auth token AND that the
    // active route is actually /chat before it's allowed to call
    // initializeSession() at all.
    // =====================================================
    useEffect(() => {
        const hasToken = !!localStorage.getItem('token');
        const onChatRoute = location.pathname === '/chat';

        if (
            sessionId &&
            !sessionInitialized &&
            !isResuming &&
            autoInitSessionIdRef.current !== sessionId &&
            hasToken &&
            onChatRoute
        ) {
            autoInitSessionIdRef.current = sessionId;
            initializeSession();
        }
    }, [sessionId, sessionInitialized, isResuming, location.pathname]);
    // =====================================================
    // ACCOUNT IDENTITY FEATURE END
    // =====================================================

    const verifyAndResumeSession = async (sessionId) => {
        const token = getAuthToken();
        if (!token) {
            console.error('❌ No auth token');
            handleResumeError('No authentication token found');
            return;
        }

        resumeTimeoutRef.current = setTimeout(() => {
            console.error('⏱️ Resume timeout - taking too long');
            handleResumeError('Resume operation timed out. Starting new session.');
        }, RESUME_TIMEOUT);

        try {
            console.log('🔍 Verifying session exists:', sessionId);
            
            const response = await fetch(`${BACKEND_URL}/sessions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch sessions');
            }

            const data = await response.json();
            console.log('📊 All sessions:', data.sessions);
            
            const sessionExists = data.sessions.find(s => s.session_id === sessionId);
            
            if (sessionExists && !sessionExists.session_complete) {
                console.log('✅ Session verified:', sessionExists);
                setSessionId(sessionId);
                setIsResuming(true);
                setCurrentQuadrant(sessionExists.phase_info || sessionExists.current_phase);
                
                // Initialize with resume - IMPORTANT: Pass resume flag
                setTimeout(() => {
                    initializeSession({ resume: true, sessionId: sessionId });
                }, 500);
            } else {
                console.warn('⚠️ Session not found or completed');
                handleResumeError('Session not found or already completed. Starting new session.');
            }
        } catch (error) {
            console.error('❌ Error verifying session:', error);
            handleResumeError(`Failed to verify session: ${error.message}`);
        }
    };

    const handleResumeError = (errorMessage) => {
        console.error('❌ Resume error:', errorMessage);
        
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }
        
        localStorage.removeItem('resumeSessionId');
        localStorage.removeItem('resumeAction');
        
        setResumeError(errorMessage);
        setIsResuming(false);
        
        const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(id);
        
        setTimeout(() => {
            setResumeError(null);
        }, 5000);
    };

    // ---------------------------------------------------------------
    // Explicit, callable-from-anywhere versions of "start new" and
    // "resume". ChatProvider lives above <Routes> (see main.jsx), so it
    // is NOT remounted when the user navigates from /dashboard to /chat -
    // it's the same instance for the whole app lifetime. That means the
    // localStorage-driven useEffect above only ever runs once, on the
    // very first app load, never again on a client-side route change.
    // These two functions let the Dashboard reset/resume this same
    // long-lived instance directly, synchronously, at the moment the
    // user clicks - no reliance on a remount or a page refresh.
    // ---------------------------------------------------------------

    const stopSpeaking = useCallback(() => {
        console.log('🛑 Stopping speech');
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }
        isSpeaking.current = false;
    }, []);

    const startNewSession = useCallback(() => {
        stopSpeaking();
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }

        localStorage.removeItem('resumeSessionId');
        localStorage.removeItem('resumeAction');

        // Wipe every piece of state a previous session could have left
        // behind, so this behaves exactly like a first-time visit.
        setMessages([]);
        setMessage(null);
        setConversationHistory([]);
        setCurrentQuadrant(null);
        setSessionComplete(false);
        setSessionInitialized(false);
        setIsResuming(false);
        setResumeError(null);
        lastMessageRef.current = null;

        const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('🆕 Starting brand new session:', id);
        setSessionId(id);
        // ACCOUNT IDENTITY FEATURE: does NOT call initializeSession()
        // directly here - setting a new sessionId with
        // sessionInitialized already false is exactly what the
        // auto-init effect above watches for, so it fires on its own
        // right after this state update commits. No name modal, no
        // explicit trigger needed.
    }, [stopSpeaking]);

    const resumeSession = useCallback((sessionIdToResume) => {
        if (!sessionIdToResume) return;

        stopSpeaking();
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }

        // Clear whatever's currently on screen first, so if the user was
        // just in a different session, none of its messages/history
        // bleed into the resumed one while the network call is in flight.
        setMessages([]);
        setMessage(null);
        setConversationHistory([]);
        setSessionComplete(false);
        setSessionInitialized(false);
        setResumeError(null);
        lastMessageRef.current = null;

        // isResuming=true immediately (not just after the fetch resolves)
        // so the Welcome Modal never has a chance to flash before the
        // resumed session's data arrives.
        setIsResuming(true);

        // Keep localStorage in sync too - this preserves resume-on-hard-
        // refresh (F5 on /chat) as a fallback, it's just no longer the
        // only way resume gets triggered.
        localStorage.setItem('resumeSessionId', sessionIdToResume);
        localStorage.setItem('resumeAction', 'resume');

        verifyAndResumeSession(sessionIdToResume);
    }, [stopSpeaking]);

    const playAudio = useCallback((audioBase64) => {
        return new Promise((resolve) => {
            if (!audioBase64) {
                resolve();
                return;
            }

            try {
                stopSpeaking();

                const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
                audioRef.current = audio;
                isSpeaking.current = true;

                audio.onended = () => {
                    console.log('🎵 Audio ended');
                    isSpeaking.current = false;
                    audioRef.current = null;
                    resolve();
                };

                audio.onerror = (error) => {
                    console.error('Audio playback error:', error);
                    isSpeaking.current = false;
                    audioRef.current = null;
                    resolve();
                };

                audio.play().catch(error => {
                    console.error('Failed to play audio:', error);
                    isSpeaking.current = false;
                    audioRef.current = null;
                    resolve();
                });
            } catch (error) {
                console.error('Audio setup error:', error);
                resolve();
            }
        });
    }, [stopSpeaking]);

    const getAuthToken = () => {
        return localStorage.getItem('token');
    };

    const initializeSession = async (userData = {}) => {
        const currentSessionId = userData.sessionId || sessionId;
        
        if (!currentSessionId) {
            console.error('❌ No session ID available');
            return;
        }

        if (sessionInitialized && !userData.resume) {
            console.log('✅ Session already initialized');
            return;
        }
        
        const token = getAuthToken();
        if (!token) {
            console.error('❌ No auth token found');
            window.location.href = '/login';
            return;
        }
        
        try {
            setLoading(true);
            
            const action = userData.resume ? 'resume' : 'init';
            console.log(`🚀 Initializing session: ${currentSessionId} with action: ${action}`);
            
            const requestBody = {
                session_id: currentSessionId,
                action: action
            };

            // =====================================================
            // ACCOUNT IDENTITY FEATURE START
            // No name is sent for init anymore. The backend looks up
            // the authenticated account's own first_name via the JWT
            // (req.userId) and uses that unconditionally - sending a
            // name here would do nothing but was also a loophole that
            // let one account impersonate multiple different people
            // across sessions. See server.js's /chat CASE 1.
            // =====================================================
            
            console.log('📤 Request body:', requestBody);
            
            const response = await fetch(`${BACKEND_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(requestBody),
            });

            console.log('📡 Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Response error:', errorText);
                
                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('resumeSessionId');
                    localStorage.removeItem('resumeAction');
                    window.location.href = '/login';
                    return;
                }
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('✅ Session initialized successfully:', data);
            
            if (resumeTimeoutRef.current) {
                clearTimeout(resumeTimeoutRef.current);
                resumeTimeoutRef.current = null;
            }
            
            if (data.messages) {
  setSessionInitialized(true);
  
  if (userData.resume) {
    localStorage.removeItem('resumeAction');
    localStorage.removeItem('resumeSessionId');
    console.log('✅ Resume complete, flags cleared');
  }
  
  const messagesWithAudio = data.messages
    .filter(msg => msg.type === 'therapeutic' || !msg.type)
    .map(msg => ({
      ...msg,
      facialExpression: msg.facialExpression || msg.facial_expression || 'default',
      animation: msg.animation || 'Talking_2',
      type: 'therapeutic'
    }));
  
  setMessages(messagesWithAudio);
  
  // Store last message for repeat functionality
  if (messagesWithAudio.length > 0) {
    lastMessageRef.current = messagesWithAudio[messagesWithAudio.length - 1];
  }
  
  // ON RESUME: restore everything the user already answered before the
  // "welcome back" messages, using the conversation_log the backend
  // builds specifically for this (see _build_conversation_log). This was
  // previously fetched but never read, so resuming a session silently
  // dropped all prior Q&A from the visible history.
  if (userData.resume && Array.isArray(data.conversation_log) && data.conversation_log.length > 0) {
    const restoredHistory = data.conversation_log.flatMap(turn => {
      const entries = [];
      if (turn.bot) {
        entries.push({ type: 'assistant', message: turn.bot, timestamp: turn.timestamp || new Date().toISOString() });
      }
      if (turn.user) {
        entries.push({ type: 'user', message: turn.user, timestamp: turn.timestamp || new Date().toISOString() });
      }
      return entries;
    });
    setConversationHistory(prev => [...prev, ...restoredHistory]);
  }
  
  // ADD INITIAL MESSAGES TO HISTORY
  if (messagesWithAudio.length > 0) {
    setConversationHistory(prev => [
      ...prev,
      ...messagesWithAudio.map(msg => ({
        type: 'assistant',
        message: msg.text,
        timestamp: new Date().toISOString()
      }))
    ]);
  }
  
  setCurrentQuadrant(data.phase_info || data.current_phase);
  setSessionComplete(data.session_complete || false);
  
  if (userData.resume) {
    setIsResuming(false);
    console.log('🎉 Resume successful!');
  }
} else {
                throw new Error('No messages in response');
            }
        } catch (error) {
            console.error("❌ Error initializing session:", error);
            
            if (userData.resume) {
                handleResumeError(`Failed to resume: ${error.message}`);
            } else {
                alert(`Failed to initialize session: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const chat = async (userMessage) => {
        if (!sessionId || !sessionInitialized) {
            console.error('❌ Session not initialized');
            return;
        }

        const token = getAuthToken();
        if (!token) {
            console.error('❌ No auth token found');
            window.location.href = '/login';
            return;
        }

        try {
            setLoading(true);
            stopSpeaking();

            console.log('💬 Sending message:', userMessage);

            const response = await fetch(`${BACKEND_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    message: userMessage
                }),
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('token');
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to send message');
            }

            const data = await response.json();
            console.log('✅ Received response:', data);

            if (data.messages) {
  const messagesWithAudio = data.messages
    .filter(msg => msg.type === 'therapeutic' || !msg.type)
    .map(msg => ({
      ...msg,
      facialExpression: msg.facialExpression || msg.facial_expression || 'default',
      animation: msg.animation || 'Talking_2',
      type: 'therapeutic'
    }));

  setMessages(messagesWithAudio);
  
  // Store last message for repeat functionality
  if (messagesWithAudio.length > 0) {
    lastMessageRef.current = messagesWithAudio[messagesWithAudio.length - 1];
  }
  
  // ADD USER MESSAGE TO HISTORY
  setConversationHistory(prev => [
    ...prev,
    {
      type: 'user',
      message: userMessage,
      timestamp: new Date().toISOString()
    }
  ]);
  
  
  // ADD ALL ASSISTANT MESSAGES TO HISTORY
if (messagesWithAudio.length > 0) {
  setConversationHistory(prev => [
    ...prev,
    ...messagesWithAudio.map(msg => ({
      type: 'assistant',
      message: msg.text,
      timestamp: new Date().toISOString()
    }))
  ]);
}
  
  setCurrentQuadrant(data.phase_info || data.current_phase);
  setSessionComplete(data.session_complete || false);
}
        } catch (error) {
            console.error("❌ Error sending message:", error);
            alert('Error processing your message. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleNavigation = async (action) => {
        console.log('🧭 Navigation action:', action);
        stopSpeaking();

        if (action === 'repeat') {
            // Replay the last message
            if (lastMessageRef.current) {
                console.log('🔄 Repeating last message:', lastMessageRef.current);
                setMessages([lastMessageRef.current]);
            } else {
                console.warn('⚠️ No message to repeat');
            }
        } else if (action === 'back' || action === 'skip') {
            // Handle back/skip - would need backend support
            console.log(`Action ${action} needs backend implementation`);
        }
    };

    const onMessagePlayed = () => {
        isSpeaking.current = false;
        setMessages((messages) => messages.slice(1));
    };

    useEffect(() => {
        if (messages.length > 0 && !isSpeaking.current) {
            const currentMessage = messages[0];
            
            setMessage(currentMessage);
            
            // Update last message reference
            lastMessageRef.current = currentMessage;
            
            if (currentMessage.audio) {
                playAudio(currentMessage.audio).then(() => {
                    setTimeout(() => {
                        if (!isSpeaking.current) {
                            onMessagePlayed();
                        }
                    }, 500);
                });
            } else {
                setTimeout(onMessagePlayed, 3000);
            }
        } else if (messages.length === 0) {
            setMessage(null);
        }
    }, [messages, playAudio]);

    return (
        <ChatContext.Provider
            value={{
                chat,
                message,
                onMessagePlayed,
                loading,
                cameraZoomed,
                setCameraZoomed,
                sessionId,
                sessionInitialized,
                initializeSession,
                currentQuadrant,
                sessionComplete,
                navigationState,
                handleNavigation,
                conversationHistory,
                isResuming,
                resumeError,
                isSpeaking: isSpeaking.current,
                stopSpeaking,
                startNewSession,
                resumeSession
            }}
        >
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error("useChat must be used within a ChatProvider");
    }
    return context;
};