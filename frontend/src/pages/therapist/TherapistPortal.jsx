import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getTherapistDetail,
  getMyAppointments, updateAppointmentStatus,
  getMySlots, setMySlots, getMyBlockedDates, blockMyDate, unblockMyDate,
  getMyTherapistPatients, addAudit,
  getActiveSessionForTherapist,
  getProfile, saveProfile, getSessionHistory, getReportHistory,
  addReportToHistory, updateReportInHistory, getTrackCatalog,
  apiMe, changePassword as apiChangePassword, getTherapistSurvey,
  getOrCreatePatientId,
} from '../../services/api';
import TherapistDashboardLayout from '../../components/layout/TherapistDashboardLayout';
import { timeAgo } from './scheduleUtils';
import { isAppointmentPast } from '../../utils/derived';

import DashboardHome from './tabs/DashboardHome';
import AvailabilityCard from './tabs/AvailabilityCard';

// The header search bar is specific to whatever tab is open.
const SEARCH_PLACEHOLDERS = {
  overview: 'Search patients, sessions, reports…',
  patients: 'Search your patients by name',
  appointments: 'Search appointments by patient or date',
  history: 'Search session history',
  messages: 'Search patients to chat with',
  reports: 'Search reports by patient',
  notifications: 'Search notifications',
  profile: 'Search…',
  settings: 'Search…',
};
import PatientsTab from './tabs/PatientsTab';
import AppointmentsTab from './tabs/AppointmentsTab';
import SessionHistoryTab from './tabs/SessionHistoryTab';
import MessagesTab from './tabs/MessagesTab';
import ReportsTab from './tabs/ReportsTab';
import ProfileTab from './tabs/ProfileTab';
import SettingsTab from './tabs/SettingsTab';

const DEFAULT_PREFS = {
  notifyRequests: true,
  notifyReminders: true,
  notifyMessages: true,
  profileVisible: true,
  acceptingNewPatients: true,
};

// Beginner vs Professional is decided ONCE, automatically, from the
// experience the therapist gave at registration — never asked again, and
// never asked at login (see items 12 in the spec).
function deriveLevel(experienceYears) {
  return (Number(experienceYears) || 0) >= 5 ? 'Professional Therapist' : 'Beginner Therapist';
}

function adaptAppointment(a) {
  const patientName = a.patient ? [a.patient.firstName, a.patient.lastName].filter(Boolean).join(' ') : a.patientName;
  const therapistName = a.therapist ? [a.therapist.firstName, a.therapist.lastName].filter(Boolean).join(' ') : a.therapistName;
  return {
    id: a.id,
    patientId: a.patient?.id || a.patientId,
    therapistId: a.therapist?.id || a.therapistId,
    patientName,
    therapistName,
    patientAvatarFileId: a.patient?.avatarFileId,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    mode: a.mode || 'online',
    meetLink: a.meetLink || null,
    slot: `${a.date} ${a.startTime}`, // parseable by scheduleUtils#slotToDate
    status: a.status,
    createdAt: a.createdAt,
  };
}

export default function TherapistPortal() {
  const { user, logout, login } = useAuth();
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'overview');
  const [messagePatientId, setMessagePatientId] = useState(() => searchParams.get('patient'));
  const [search, setSearch] = useState('');
  const [experienceYears, setExperienceYears] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [blockedDates, setBlockedDatesState] = useState([]);
  const [profile, setProfileState] = useState({});
  const [reportsVersion, setReportsVersion] = useState(0);
  const [activeSession, setActiveSession] = useState(null);
  const [rawPatients, setRawPatients] = useState([]);
  const [patientExtras, setPatientExtras] = useState({}); // id -> { profile, sessionHistory, reportHistory }
  const [trackCatalog, setTrackCatalog] = useState([]);
  const [lastSeenMessages, setLastSeenMessages] = useState(() => {
    const raw = localStorage.getItem(`therapistLastSeenMsgs_${user.id}`);
    return raw ? new Date(raw) : new Date(0);
  });
  const [therapistDetail, setTherapistDetail] = useState(null);
  const [survey, setSurvey] = useState(null);
  const [patientFirstSeen, setPatientFirstSeen] = useState({}); // patientId -> earliest booking createdAt
  const [patientAdminNumbers, setPatientAdminNumbers] = useState({}); // patientId -> static ANH-YYYY-NNNNNN id, for Prescriptions

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(interval);
  }, []);

  // Every patient's static "Admin Number" (ANH-YYYY-NNNNNN) — fetched once
  // per patient and cached, since it never changes for the life of the
  // account. Used on the Prescription form.
  useEffect(() => {
    rawPatients.forEach((p) => {
      if (patientAdminNumbers[p.id]) return;
      getOrCreatePatientId(p.id)
        .then((adminNumber) => setPatientAdminNumbers((m) => ({ ...m, [p.id]: adminNumber })))
        .catch((err) => console.error('Failed to load admin number for patient', p.id, err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPatients]);
  const locked = !user.isApproved;

  const refreshAppointments = () => getMyAppointments().then((list) => setAppointments(list.map(adaptAppointment))).catch((err) => console.error('Failed to load appointments:', err));
  const refreshAvailability = () => getMySlots().then(setAvailability).catch((err) => console.error('Failed to load availability:', err));
  const refreshBlockedDates = () => getMyBlockedDates().then(setBlockedDatesState).catch((err) => console.error('Failed to load blocked dates:', err));

  useEffect(() => {
    getProfile(user.id).then((p) => setProfileState(p || {})).catch((err) => console.error('Failed to load profile:', err));
    getTherapistSurvey(user.id).then(setSurvey).catch(() => {});
    if (locked) {
      // Unapproved: nothing that needs approval is loaded. Poll the session
      // so the console unlocks by itself once Anahat Admin approves.
      setExperienceYears(0);
      const t = setInterval(() => {
        apiMe().then((fresh) => { if (fresh?.isApproved !== user.isApproved) login(fresh); }).catch(() => {});
      }, 20000);
      return () => clearInterval(t);
    }
    refreshAppointments();
    refreshAvailability();
    refreshBlockedDates();
    getTherapistDetail(user.id).then((t) => { setExperienceYears(t.experienceYears); setTherapistDetail(t); }).catch((err) => console.error('Failed to load therapist detail:', err));
    getActiveSessionForTherapist(user.id).then(setActiveSession).catch((err) => console.error('Failed to load active session:', err));
    getTrackCatalog().then(setTrackCatalog).catch((err) => console.error('Failed to load track catalog:', err));
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, locked]);

  // Single source of truth: the real isProfileComplete/isApproved flags on
  // the session user (same ones Anahat Admin flips via
  // PATCH /api/admin/therapists/:id/approve) — no separate async status
  // fetch, and no flash-of-portal before a fetch resolves.
  if (!user.isProfileComplete) return <Navigate to="/therapist/onboarding-survey" replace />;

  const level = experienceYears == null ? null : deriveLevel(experienceYears);
  const therapistName = profile?.fullName || user.name || 'Therapist';
  const avatarUrl = profile?.avatarUrl || user.picture || (user.avatarFileId ? `/api/profile/files/${user.avatarFileId}` : null);

  // Patients are whoever has actually booked a session with this therapist —
  // derived straight from real bookings, not an assignment list. There is
  // no admin/therapist/patient "assignment" step anywhere in this flow.
  useEffect(() => {
    if (locked) return;
    getMyTherapistPatients()
      .then((appts) => {
        const seen = new Map();
        const first = {};
        appts.forEach((a) => {
          if (!a.patient) return;
          if (!seen.has(a.patient.id)) seen.set(a.patient.id, a.patient);
          const at = new Date(a.createdAt || `${a.date}T00:00:00`).getTime();
          if (!first[a.patient.id] || at < first[a.patient.id]) first[a.patient.id] = at;
        });
        // First come, first served: the patient who booked this therapist
        // earliest is #1, the next is #2, and so on.
        const ordered = [...seen.values()].sort((a, b) => (first[a.id] || 0) - (first[b.id] || 0));
        setRawPatients(ordered);
        setPatientFirstSeen(first);
      })
      .catch((err) => console.error('Failed to load patients:', err));
  }, [user.id, appointments.length, locked]);

  // Per-patient extended profile + session history + report count.
  useEffect(() => {
    if (rawPatients.length === 0) { setPatientExtras({}); return; }
    Promise.all(rawPatients.map((p) => Promise.all([
      getProfile(p.id),
      getSessionHistory(p.id),
      getReportHistory(p.id),
    ]))).then((results) => {
      const extras = {};
      rawPatients.forEach((p, i) => {
        const [pProfile, sessionHistory, reportHistory] = results[i];
        extras[p.id] = { profile: pProfile, sessionHistory, reportHistory };
      });
      setPatientExtras(extras);
    }).catch((err) => console.error('Failed to load patient details:', err));
  }, [rawPatients, reportsVersion]);

  const patients = useMemo(() => rawPatients.map((p, index) => {
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
    const extra = patientExtras[p.id] || {};
    const pProfile = extra.profile;
    const history = (extra.sessionHistory || []).filter((s) => s.therapistId === user.id);
    const lastEnded = history.length ? history.reduce((a, b) => (new Date(a.endedAt) > new Date(b.endedAt) ? a : b)) : null;
    const nextAppt = appointments
      .filter((a) => a.patientId === p.id && a.status === 'confirmed')
      .map((a) => ({ ...a, dateObj: new Date(`${a.date}T${a.startTime}:00+05:30`) }))
      .filter((a) => a.dateObj.getTime() > Date.now())
      .sort((a, b) => a.dateObj - b.dateObj)[0];
    return {
      id: p.id,
      name,
      seq: index + 1,
      patientId: `#${index + 1}`,
      adminNumber: patientAdminNumbers[p.id] || null,
      email: p.email,
      phone: p.phone || null,
      firstSeenAt: patientFirstSeen[p.id] || null,
      avatarUrl: p.avatarFileId ? `/api/profile/files/${p.avatarFileId}` : null,
      concern: pProfile?.concern || null,
      age: pProfile?.age || null,
      lastSession: lastEnded ? new Date(lastEnded.endedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : null,
      upcomingSlot: nextAppt ? `${nextAppt.date} ${nextAppt.startTime}` : null,
    };
  }), [rawPatients, patientExtras, appointments, user.id, patientFirstSeen, patientAdminNumbers]);

  const q = search.trim().toLowerCase();
  const filteredPatients = q ? patients.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.patientId || '').toLowerCase().includes(q)) : patients;

  const startSessionWith = (patientId, appointmentId) => navigate(`/therapist/session/${patientId}${appointmentId ? `?appointment=${appointmentId}` : ''}`);

  const myAppointments = appointments;
  const pendingReviews = myAppointments.filter((a) => a.status === 'confirmed' && new Date(`${a.date}T${a.startTime}:00+05:30`).getTime() < Date.now());

  const allReports = useMemo(() => patients.flatMap((p) =>
    (patientExtras[p.id]?.reportHistory || []).map((r) => ({ ...r, patientName: p.name, patientId: p.id }))
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [patients, patientExtras]);

  const allSessionHistory = useMemo(() => patients.flatMap((p) =>
    (patientExtras[p.id]?.sessionHistory || []).filter((s) => s.therapistId === user.id).map((s) => ({ ...s, patientName: p.name, patientId: p.id }))
  ), [patients, patientExtras, user.id]);

  const upcomingSessions = myAppointments
    .filter((a) => a.status === 'confirmed' && !isAppointmentPast(a, now))
    .map((a) => ({ id: a.id, patientId: a.patientId, patientName: a.patientName, slot: a.slot, date: new Date(`${a.date}T${a.startTime}:00+05:30`) }))
    .filter((a) => a.date.getTime() > now.getTime())
    .sort((a, b) => a.date - b.date)
    .slice(0, 4);

  const todaySessionsCount = myAppointments.filter((a) => {
    if (a.status === 'cancelled') return false;
    return a.date === new Date().toISOString().slice(0, 10);
  }).length;

  const recentActivity = useMemo(() => {
    const items = [];
    myAppointments.forEach((a) => {
      if (a.createdAt) items.push({ id: `appt-${a.id}`, type: 'appointment', text: `${a.patientName} — appointment ${a.status}`, at: a.createdAt });
    });
    allReports.slice(0, 10).forEach((r) => items.push({ id: `rep-${r.id}`, type: 'report', text: `Report saved for ${r.patientName}`, at: r.createdAt }));
    allSessionHistory.forEach((s) => items.push({ id: `sess-${s.id}`, type: 'session', text: `Session with ${s.patientName} completed`, at: s.endedAt }));
    return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
  }, [myAppointments, allReports, allSessionHistory]);

  // Notifications: reviews pending + recent cancellations — no "requests"
  // concept, since a booking is already confirmed once paid.
  const notifications = useMemo(() => {
    const items = [];
    pendingReviews.forEach((a) => items.push({
      id: `rev-${a.id}`, title: `Session with ${a.patientName} needs a report`, detail: 'Consultation completed — add your notes.',
      time: timeAgo(a.createdAt), read: false, tab: 'reports',
    }));
    myAppointments.filter((a) => a.status === 'cancelled').slice(0, 5).forEach((a) => items.push({
      id: `cancel-${a.id}`, title: `${a.patientName} cancelled their session`, detail: `Slot ${a.slot} is free again.`, time: timeAgo(a.createdAt), read: true, tab: 'appointments',
    }));
    // New bookings and today's sessions — the two things a therapist most
    // needs to see at a glance.
    const today = new Date().toISOString().slice(0, 10);
    myAppointments.filter((a) => a.status === 'confirmed').forEach((a) => {
      const isToday = (a.date || String(a.scheduledAt || '').slice(0, 10)) === today;
      items.push({
        id: `book-${a.id}`,
        title: isToday ? `Session today with ${a.patientName} at ${a.startTime || a.slot}` : `New booking: ${a.patientName}`,
        detail: isToday ? 'Join from the Appointments tab up to 5 minutes before the slot.' : `Confirmed for ${a.slot}.`,
        time: timeAgo(a.createdAt), read: !isToday, tab: 'appointments',
      });
    });
    return items.sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1)).slice(0, 20);
  }, [pendingReviews, myAppointments]);

  const messageThreads = useMemo(() => patients.map((p) => {
    const ended = (patientExtras[p.id]?.sessionHistory || []).filter((s) => s.therapistId === user.id);
    const active = activeSession?.patientId === p.id ? activeSession : null;
    const allMsgs = [...ended.flatMap((s) => s.messages || []), ...(active?.messages || [])]
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    const last = allMsgs[allMsgs.length - 1];
    const unread = allMsgs.filter((m) => m.from === 'patient' && new Date(m.at) > lastSeenMessages).length;
    return {
      patientId: p.id, patientName: p.name, active: !!active,
      messages: allMsgs, lastMessage: last?.text || '', unread,
    };
  }).filter((t) => t.messages.length > 0 || t.active), [patients, patientExtras, activeSession, lastSeenMessages, user.id]);

  const totalUnreadMessages = messageThreads.reduce((sum, t) => sum + t.unread, 0);

  // ---------------- handlers ----------------
  const completeAppointment = (id) => {
    updateAppointmentStatus(id, { status: 'completed' })
      .then(() => { addAudit({ action: 'Appointment completed', actor: user.name || 'therapist' }).catch((err) => console.error('Failed to write audit log:', err)); refreshAppointments(); })
      .catch((err) => console.error('Failed to update appointment:', err));
  };
  const cancelAppointment = (id) => {
    updateAppointmentStatus(id, { status: 'cancelled' })
      .then(() => { addAudit({ action: 'Appointment cancelled', actor: user.name || 'therapist' }).catch((err) => console.error('Failed to write audit log:', err)); refreshAppointments(); })
      .catch((err) => console.error('Failed to update appointment:', err));
  };

  // Recurring weekly availability — full-overwrite PUT under the hood, so
  // add/remove just mutate the local list and re-save the whole thing.
  const addSlot = (dayOfWeek, startTime, endTime) => {
    if (!startTime || !endTime || startTime >= endTime) return;
    const next = [...availability, { dayOfWeek, startTime, endTime }];
    setMySlots(next).then(setAvailability).catch((err) => console.error('Failed to update availability:', err));
  };
  const removeSlot = (slotId) => {
    const next = availability.filter((s) => s.id !== slotId).map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }));
    setMySlots(next).then(setAvailability).catch((err) => console.error('Failed to update availability:', err));
  };

  const addBlockedDate = (date) => {
    if (blockedDates.some((d) => d.date === date)) return;
    blockMyDate(date).then(refreshBlockedDates).catch((err) => console.error('Failed to block date:', err));
  };
  const removeBlockedDate = (id) => {
    unblockMyDate(id).then(refreshBlockedDates).catch((err) => console.error('Failed to unblock date:', err));
  };

  const saveProfileDetails = (fields) => {
    saveProfile(user.id, fields).then(setProfileState).catch((err) => console.error('Failed to save profile:', err));
  };

  const saveAvatar = (dataUrl) => {
    saveProfile(user.id, { avatarUrl: dataUrl }).then(setProfileState).catch((err) => console.error('Failed to save avatar:', err));
  };

  const createReport = (patientId, fields) => {
    addReportToHistory(patientId, { therapistName, patientId, ...fields })
      .then(() => setReportsVersion((v) => v + 1))
      .catch((err) => console.error('Failed to create report:', err));
  };

  const updateReport = (patientId, reportId, fields) => {
    updateReportInHistory(patientId, reportId, fields)
      .then(() => setReportsVersion((v) => v + 1))
      .catch((err) => console.error('Failed to update report:', err));
  };

  const savePrefs = (prefs) => {
    saveProfile(user.id, { notificationPrefs: prefs }).then(setProfileState).catch((err) => console.error('Failed to save preferences:', err));
  };
  const changePassword = (pw) => apiChangePassword(pw.current, pw.next);

  const goTab = (key, extra) => {
    if (locked && key !== 'overview') return;
    if (key === 'patient') { navigate(`/therapist/patient/${extra}`); return; }
    if (key === 'messages') {
      setMessagePatientId(extra || null);
      const now = new Date();
      setLastSeenMessages(now);
      localStorage.setItem(`therapistLastSeenMsgs_${user.id}`, now.toISOString());
      navigate('/therapist?tab=messages', { replace: true });
    } else {
      setMessagePatientId(null);
      if (searchParams.has('tab')) navigate('/therapist', { replace: true });
    }
    setTab(key);
    setSearch('');
  };

  if (level === null) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-[#FAF8F2] text-sm text-slate-500">Loading your dashboard…</div>;
  }

  const demographics = {
    name: therapistName,
    email: user.email,
    phone: user.phone || survey?.phone,
    age: therapistDetail?.profile?.age ?? survey?.age,
    gender: survey?.gender,
    address: therapistDetail?.location || survey?.address,
    experienceYears: experienceYears,
    qualification: therapistDetail?.profile?.profession || survey?.qualification,
    specialization: (survey?.specializations || []).join(', ') || survey?.specialization,
    fee: therapistDetail?.fee ?? survey?.fee,
    bio: therapistDetail?.bio || survey?.bio,
  };

  return (
    <TherapistDashboardLayout
      active={tab}
      onNavigate={goTab}
      user={{ name: therapistName }}
      userId={user.id}
      level={level}
      avatarUrl={avatarUrl}
      onLogout={logout}
      search={search}
      onSearchChange={setSearch}
      notifications={notifications}
      messageBadgeCount={totalUnreadMessages}
      approvalsBadgeCount={0}
      onOpenNotification={(n) => goTab(n.tab || 'overview')}
      onOpenNotifications={() => goTab('notifications')}
      searchPlaceholder={SEARCH_PLACEHOLDERS[tab] || 'Search…'}
      locked={locked}
    >
      {locked && (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <p className="font-bold text-amber-800">Not approved yet</p>
            <p className="text-sm text-amber-700 mt-1">Your details have been submitted. An Anahat administrator will review and approve your account — patients, appointments, messages and reports unlock automatically once that happens.</p>
          </div>
        </div>
      )}

      {activeSession && tab !== 'messages' && (
        <div className="mt-8 mb-0 bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-emerald-700">Live session in progress with {activeSession.patientName}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Started {new Date(activeSession.startedAt).toLocaleTimeString()}</p>
          </div>
          <button onClick={() => startSessionWith(activeSession.patientId)} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-widest transition-all">
            Resume
          </button>
        </div>
      )}

      {tab === 'overview' && (
        <DashboardHome
          therapistName={therapistName}
          avatarUrl={avatarUrl}
          level={level}
          stats={{
            todaySessions: todaySessionsCount,
            totalPatients: patients.length,
            reportsShared: allReports.length,
            pendingReviews: pendingReviews.length,
          }}
          upcomingSessions={upcomingSessions}
          recentPatients={patients.slice(0, 5)}
          recentActivity={recentActivity}
          onNavigate={goTab}
          onJoinSession={startSessionWith}
          availabilityCard={(
            <AvailabilityCard
              availability={availability}
              blockedDates={blockedDates}
              onAddSlot={addSlot}
              onRemoveSlot={removeSlot}
              onAddBlockedDate={addBlockedDate}
              onRemoveBlockedDate={removeBlockedDate}
              locked={locked}
            />
          )}
        />
      )}

      {tab === 'notifications' && (
        <div className="pt-8 space-y-6">
          <div className="td-animate-in">
            <h1 className="font-serif font-bold text-2xl text-slate-900">Notifications</h1>
            <p className="text-slate-500 text-sm mt-1">Bookings, messages, feedback and reminders — newest first.</p>
          </div>
          <div className="td-surface bg-white rounded-3xl border border-black/5 divide-y divide-black/5">
            {notifications.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-400">You're all caught up.</p>
            ) : notifications.map((n) => (
              <button key={n.id} type="button" onClick={() => goTab(n.tab || 'overview')} className="w-full text-left px-6 py-4 flex items-start gap-3 hover:bg-black/[0.02]">
                <span className="mt-2 w-2 h-2 rounded-full shrink-0" style={{ background: n.read ? 'transparent' : '#3F6B4F' }} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{n.title}</span>
                  {n.detail && <span className="block text-xs text-slate-500 mt-0.5">{n.detail}</span>}
                  <span className="block text-[11px] text-slate-400 mt-1">{n.time}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'patients' && (
        <PatientsTab
          patients={filteredPatients}
          onOpenProfile={(id) => navigate(`/therapist/patient/${id}`)}
        />
      )}

      {tab === 'appointments' && (
        <AppointmentsTab
          appointments={q ? myAppointments.filter((a) => (a.patientName || '').toLowerCase().includes(q)) : myAppointments}
          onComplete={completeAppointment}
          onCancel={cancelAppointment}
          onRefresh={refreshAppointments}
        />
      )}

      {tab === 'history' && (
        <SessionHistoryTab
          sessions={allSessionHistory}
          search={search}
          hasReport={(patientId) => (patientExtras[patientId]?.reportHistory || []).length > 0}
          onOpenReport={() => goTab('reports')}
          onOpenPatient={(id) => navigate(`/therapist/patient/${id}`)}
        />
      )}

      {tab === 'messages' && (
        <MessagesTab therapist={{ id: user.id, name: therapistName }} patients={patients} selectedPatientId={messagePatientId} />
      )}

      {tab === 'reports' && (
        <ReportsTab
          patients={patients}
          reports={allReports}
          ragaCatalog={trackCatalog}
          therapistName={therapistName}
          onCreateReport={createReport}
          onUpdateReport={updateReport}
        />
      )}

      {tab === 'profile' && (
        <ProfileTab
          key={`${demographics.specialization}|${demographics.fee}|${demographics.bio}`}
          name={therapistName}
          level={level}
          specialty={profile?.specialty || demographics.specialization || ''}
          experience={profile?.experience || (experienceYears != null ? `${experienceYears} years` : '')}
          contactEmail={profile?.contactEmail || user.email || ''}
          contactPhone={profile?.contactPhone || survey?.phone || ''}
          bio={profile?.bio || demographics.bio || ''}
          qualification={demographics.qualification}
          address={demographics.address}
          avatarUrl={avatarUrl}
          sessionFee={profile?.sessionFee ?? demographics.fee ?? null}
          availability={availability}
          blockedDates={blockedDates}
          onSaveDetails={saveProfileDetails}
          onAvatarChange={saveAvatar}
        />
      )}

      {tab === 'settings' && (
        <SettingsTab
          demographics={demographics}
          prefs={{ ...DEFAULT_PREFS, ...(profile?.notificationPrefs || {}) }}
          onSavePrefs={savePrefs}
          onChangePassword={changePassword}
          onLogout={logout}
        />
      )}
    </TherapistDashboardLayout>
  );
}
