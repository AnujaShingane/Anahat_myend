import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { addDocument, getSession, sendSessionMessage } from '../../services/api';
import { PageShell, Card, Badge } from '../../components/ui/Kit';
import SessionChatComposer from '../../components/chat/SessionChatComposer';

export default function PatientLiveSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getSession(sessionId)
        .then((fresh) => { if (!cancelled) { setSession(fresh); setLoading(false); } })
        .catch((err) => { console.error('Failed to load session:', err); if (!cancelled) setLoading(false); });
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages?.length]);

  const sendChat = () => {
    if (!chatInput.trim() || !session || session.status !== 'active') return;
    sendSessionMessage(session.id, 'patient', chatInput.trim())
      .then(setSession)
      .catch((err) => console.error('Failed to send message:', err));
    setChatInput('');
  };

  const uploadAttachment = async (file) => {
    if (!user?.id || !file) throw new Error('Sign in again before uploading a file.');
    await addDocument(user.id, { file, name: file.name, size: file.size, category: 'Previous Report' });
  };

  if (!session) {
    if (loading) return <PageShell><div className="min-h-screen" /></PageShell>;
    return (
      <PageShell>
        <div className="min-h-screen flex items-center justify-center px-6">
          <Card className="max-w-md w-full text-center">
            <h1 className="text-xl font-serif font-bold mb-2">Session not found</h1>
            <p className="text-slate-600 text-sm mb-6">This session link may have expired.</p>
            <button onClick={() => navigate('/dashboard')} className="btn-sunset px-6 py-3 rounded-2xl font-bold text-sm">Back to Dashboard</button>
          </Card>
        </div>
      </PageShell>
    );
  }

  const ended = session.status !== 'active';

  return (
    <PageShell fullScreen>
      <div className="flex h-full min-h-0 w-full flex-col bg-[#F7F6F2]">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-black/[0.08] bg-white px-5 py-4 sm:px-8">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-sunset">Live Session</span>
            <h1 className="mt-1 text-xl font-serif font-bold text-slate-900">With {session.therapistName}</h1>
          </div>
          <Badge tone={ended ? 'slate' : 'emerald'}>{ended ? 'Ended' : 'Active'}</Badge>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">
            <div className="mx-auto w-full max-w-5xl space-y-3">
            {session.messages.length === 0 ? (
              <p className="text-sm text-slate-400 text-center mt-10">
                {ended ? 'This session has ended. Your therapist will share a report under Reports.' : `You're in. Say hello — ${session.therapistName} can see your messages as you send them.`}
              </p>
            ) : (
              session.messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === 'patient' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.from === 'patient' ? 'bg-slate-900 text-white' : 'bg-black/[0.05] text-slate-800'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
            </div>
          </div>
          <div className="flex shrink-0 border-t border-black/[0.08] bg-white px-4 py-4 sm:px-8">
            <div className="mx-auto w-full max-w-5xl">
              <SessionChatComposer
                value={chatInput}
                onChange={setChatInput}
                onSend={sendChat}
                onUpload={uploadAttachment}
                disabled={ended}
                placeholder={ended ? 'This session has ended' : 'Type a message...'}
              />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
