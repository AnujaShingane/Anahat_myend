import { useEffect, useMemo, useRef, useState } from 'react';
import { initialsOf } from '../../utils/initials';
import { addDocument, getConversation, sendConversationMessage, markConversationRead } from '../../services/api';
import SessionChatComposer from './SessionChatComposer';

// Anahat-styled chat window shared by the patient Messages page and the
// therapist Messages tab. `me` is 'patient' or 'therapist'; the window polls
// the conversation every 1.5s so both sides see new messages as they arrive.
const HEADER_BG = '#0F2A2E';
const BUBBLE_OUT = '#0F8594';
const BG = '#FAF7F1';

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function WhatsAppChat({ conversation: initial, me, title, subtitle, avatarUrl, height = '100%', className = '', highlight = '', onBack, patientId }) {
  const [conversation, setConversation] = useState(initial);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);
  const convoId = initial?.id || initial?._id;

  useEffect(() => { setConversation(initial); }, [initial?.id, initial?._id]);

  useEffect(() => {
    if (!convoId) return undefined;
    let cancelled = false;
    const tick = () => {
      getConversation(convoId)
        .then((fresh) => { if (!cancelled && fresh) setConversation(fresh); })
        .catch(() => {});
    };
    tick();
    markConversationRead(convoId, me).catch(() => {});
    const interval = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [convoId, me]);

  const count = conversation?.messages?.length || 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (convoId && count) markConversationRead(convoId, me).catch(() => {});
  }, [count, convoId, me]);

  const groups = useMemo(() => {
    const out = [];
    const hq = highlight.trim().toLowerCase();
    const list = (conversation?.messages || []).filter((m) => !hq || m.text.toLowerCase().includes(hq) || (title || '').toLowerCase().includes(hq));
    list.forEach((m) => {
      const label = dayLabel(m.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    });
    return out;
  }, [conversation, highlight, title]);

  const send = () => {
    const text = draft.trim();
    if (!text || !convoId) return;
    setDraft('');
    // Optimistic bubble so the sender sees it instantly.
    setConversation((c) => ({ ...c, messages: [...(c?.messages || []), { id: `tmp-${Date.now()}`, from: me, text, at: new Date().toISOString(), read: false }] }));
    sendConversationMessage(convoId, me, text).then(setConversation).catch((err) => console.error('Failed to send message:', err));
  };

  const uploadAttachment = (file) => {
    if (!patientId) throw new Error('Patient documents are unavailable for this conversation.');
    return addDocument(patientId, { file, name: file.name, size: file.size, category: 'Previous Report' });
  };

  const initial1 = initialsOf(title);

  return (
    <div className={`h-full min-h-0 w-full overflow-hidden bg-white ${className}`} style={{ height }}>
      <div className="h-full flex flex-col min-h-0">
        <div className="px-6 py-4 flex items-center gap-3.5 shrink-0" style={{ background: HEADER_BG }}>
          {onBack && <button type="button" onClick={onBack} aria-label="Back to patients" className="flex h-9 w-9 shrink-0 items-center justify-center text-white/80 hover:text-white md:hidden"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>}
          <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-white/10 text-white font-bold shrink-0 ring-1 ring-white/15">
            {avatarUrl ? <img src={avatarUrl} alt={title} className="w-full h-full object-cover" /> : initial1}
          </div>
          <div className="min-w-0">
            <p className="text-white font-display font-semibold text-[15px] truncate">{title}</p>
            {subtitle && <p className="text-white/55 text-xs truncate mt-0.5">{subtitle}</p>}
          </div>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto thin-scroll px-5 md:px-10 py-6"
          style={{ background: BG }}
        >
          {count === 0 ? (
            <div className="flex justify-center mt-10">
              <span className="text-sm text-slate-500 bg-white px-4 py-2 rounded-full border border-black/5">Say hello to start the conversation</span>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="flex justify-center my-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 bg-white px-3 py-1 rounded-full border border-black/5">{group.label}</span>
                </div>
                {group.items.map((m, i) => {
                  const mine = m.from === me;
                  return (
                    <div key={m.id || m._id || i} className={`flex mb-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`relative min-w-[88px] max-w-[78%] pb-5 pl-4 pr-4 pt-2.5 text-sm ${mine ? 'text-white' : 'text-slate-800 border border-black/[0.05]'} md:max-w-[58%]`}
                        style={{
                          background: mine ? BUBBLE_OUT : '#FFFFFF',
                          borderRadius: mine ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                        }}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                        <span className="absolute bottom-1.5 right-3 flex items-center gap-1">
                          <span className={`text-[10px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>{new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                          {mine && (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 16 15" fill="none">
                              <path d="M15.01 3.316l-.478-.372a.365.365 0 00-.51.063L8.666 9.879a.32.32 0 01-.484.033l-.358-.325a.319.319 0 00-.484.032l-.378.483a.418.418 0 00.036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 00-.064-.512zM11.01 3.316l-.478-.372a.365.365 0 00-.51.063L4.666 9.879a.32.32 0 01-.484.033L1.891 7.769a.366.366 0 00-.515.006l-.423.433a.364.364 0 00.006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 00-.064-.512z" fill={m.read ? '#FFFFFF' : 'rgba(255,255,255,0.55)'} />
                            </svg>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t border-black/[0.05] bg-white px-4 py-3 sm:px-5">
          <SessionChatComposer value={draft} onChange={setDraft} onSend={send} onUpload={uploadAttachment} placeholder="Type a message" />
        </div>
      </div>
    </div>
  );
}
