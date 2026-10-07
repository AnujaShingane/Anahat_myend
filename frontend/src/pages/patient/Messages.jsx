import { useEffect, useState } from 'react';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import WhatsAppChat from '../../components/chat/WhatsAppChat';
import { getCurrentTherapistId, getOrCreateConversation, getTherapistDetail } from '../../services/api';

export default function Messages() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const [conversation, setConversation] = useState(null);
  const [therapist, setTherapist] = useState(null);
  const [hasTherapist, setHasTherapist] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    getCurrentTherapistId(user.id)
      .then(async (therapistId) => {
        if (!therapistId) { setHasTherapist(false); return; }
        setHasTherapist(true);
        const t = await getTherapistDetail(therapistId).catch(() => null);
        setTherapist(t);
        const convo = await getOrCreateConversation(user.id, user.full_name || user.name, therapistId, t?.name || 'Your Therapist');
        setConversation({ ...convo, id: convo.id || convo._id });
      })
      .catch((err) => console.error('Failed to load conversation:', err));
  }, [user?.id]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  return (
    <PatientDashboardLayout active="messages" user={user} onLogout={logout} search={{ placeholder: 'Search your therapist or a message', value: query, onChange: setQuery }}>
      {hasTherapist === false ? (
        <div className="portal-full-chat flex min-h-0 flex-1 items-center justify-center border-y border-black/[0.08] text-center">
          <div><h2 className="text-lg font-semibold text-slate-800">No conversation yet</h2><p className="mt-2 text-sm text-slate-500">Once you've booked a session, you'll be able to message your therapist here.</p></div>
        </div>
      ) : !conversation ? null : (
        <div className="portal-full-chat min-h-0 flex-1 overflow-hidden">
          <WhatsAppChat
            highlight={query}
            conversation={conversation}
            me="patient"
            title={therapist?.name || 'Your Therapist'}
            subtitle={therapist?.profile?.profession || 'Care team'}
            avatarUrl={therapist?.avatarUrl}
            patientId={user.id}
            height="100%"
          />
        </div>
      )}
    </PatientDashboardLayout>
  );
}
