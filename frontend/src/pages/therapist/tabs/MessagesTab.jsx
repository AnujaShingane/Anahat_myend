import { useEffect, useState } from 'react';
import { initialsOf } from '../../../utils/initials';
import { SAGE } from '../../../components/layout/TherapistDashboardLayout';
import WhatsAppChat from '../../../components/chat/WhatsAppChat';
import { getConversationsForTherapist, getOrCreateConversation } from '../../../services/api';

// Therapist side of the patient <-> therapist chat: a WhatsApp-style
// contact list on the left (one thread per patient), the conversation on
// the right. Polls the thread list every 4s for unread counts.
export default function MessagesTab({ therapist, patients, selectedPatientId = null }) {
  const [threads, setThreads] = useState([]);
  const [openId, setOpenId] = useState(selectedPatientId);
  const [query, setQuery] = useState('');

  const refresh = () => {
    getConversationsForTherapist(therapist.id)
      .then((list) => setThreads(list.map((c) => ({ ...c, id: c.id || c._id }))))
      .catch((err) => console.error('Failed to load conversations:', err));
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [therapist.id]);

  useEffect(() => {
    if (selectedPatientId) setOpenId(selectedPatientId);
  }, [selectedPatientId]);

  // Contacts = every patient of this therapist, merged with existing threads.
  const contacts = patients.map((p) => {
    const thread = threads.find((t) => t.patientId === p.id);
    const msgs = thread?.messages || [];
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter((m) => m.from === 'patient' && !m.read).length;
    return { patient: p, thread, last, unread };
  }).sort((a, b) => new Date(b.last?.at || 0) - new Date(a.last?.at || 0));

  const q = query.trim().toLowerCase();
  const visible = q ? contacts.filter((c) => c.patient.name.toLowerCase().includes(q)) : contacts;
  const active = contacts.find((c) => c.patient.id === openId) || null;

  const open = async (c) => {
    setOpenId(c.patient.id);
    if (!c.thread) {
      const convo = await getOrCreateConversation(c.patient.id, c.patient.name, therapist.id, therapist.name).catch(() => null);
      if (convo) setThreads((ts) => [...ts, { ...convo, id: convo.id || convo._id }]);
    }
  };

  return (
    <div className="portal-full-chat flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white md:grid-cols-[320px_minmax(0,1fr)]">
        <div className={`${openId ? 'hidden' : 'flex'} md:flex border-b md:border-b-0 md:border-r border-black/[0.06] min-h-0 flex-col`}>
          <div className="p-3 border-b border-black/[0.06]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients"
              className="w-full px-4 py-2.5 rounded-full bg-[#F6F4EC] text-sm outline-none border border-transparent focus:border-[#0F8594]/30"
            />
          </div>
          <div className="flex-1 overflow-y-auto thin-scroll">
            {visible.length === 0 ? (
              <p className="text-sm text-slate-400 text-center px-4 py-10">{patients.length === 0 ? 'Patients appear here once they book a session with you.' : 'No patient matches that search.'}</p>
            ) : visible.map((c) => (
              <button
                key={c.patient.id}
                onClick={() => open(c)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-black/[0.03] transition-colors ${openId === c.patient.id ? '' : 'hover:bg-black/[0.02]'}`}
                style={openId === c.patient.id ? { background: '#EAF4F4' } : undefined}
              >
                <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: SAGE }}>
                  {c.patient.avatarUrl ? <img src={c.patient.avatarUrl} alt={c.patient.name} className="w-full h-full object-cover" /> : initialsOf(c.patient.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm text-slate-800 truncate">{c.patient.name}</p>
                    {c.last && <span className="text-[10px] text-slate-400 shrink-0">{new Date(c.last.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 truncate mt-0.5">{c.last ? `${c.last.from === 'therapist' ? 'You: ' : ''}${c.last.text}` : 'Tap to start chatting'}</p>
                    {c.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0" style={{ background: '#0F8594' }}>{c.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`${openId ? 'flex' : 'hidden'} md:flex min-h-0 min-w-0 flex-col`}>
          {!active || !active.thread ? (
            <div className="relative flex h-full flex-col items-center justify-center px-6 text-center" style={{ background: '#FAF7F1' }}>
              {openId && <button type="button" onClick={() => setOpenId(null)} className="absolute left-5 top-5 text-xs font-semibold text-slate-600 md:hidden">← Patients</button>}
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: '#EAF4F4', color: '#0A6976' }}>
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z" /></svg>
              </div>
              <p className="font-bold text-slate-800">{active ? 'No existing conversation' : 'Select a patient to view their conversation'}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">{active ? 'This patient does not have a conversation thread yet.' : 'Messages are delivered instantly and kept for the whole course of therapy.'}</p>
            </div>
          ) : (
            <WhatsAppChat
              conversation={active.thread}
              me="therapist"
              title={active.patient.name}
              subtitle={`Patient ${active.patient.patientId}`}
              avatarUrl={active.patient.avatarUrl}
              patientId={active.patient.id}
              height="100%"
              className="!border-0"
              onBack={() => setOpenId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
