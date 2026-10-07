import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  adminListUsers, adminApproveTherapist, listTherapistSurveys,
  adminListAppointments, updateAppointmentStatus, getAdminNotifications, markNotificationRead,
  getAllSessions, getProfile, getAuditLog, getReportHistory,
} from '../../../services/api';
import AdminDashboardLayout from '../../../components/layout/AdminDashboardLayout';
import { HomeIcon, UsersIcon, CalendarIcon, SessionIcon, ReportIcon, SettingsIcon } from '../../../components/admin/icons';
import PatientDetailView from '../../../components/admin/PatientDetailView';
import { adaptTherapist, adaptPatient } from '../../../components/admin/adapters';
import { isAppointmentPast, parseAppointmentDateTime } from '../../../utils/derived';

import DashboardHome from './tabs/DashboardHome';
import PatientsTab from './tabs/PatientsTab';
import AppointmentsTab from './tabs/AppointmentsTab';
import SessionsTab from './tabs/SessionsTab';
import ReportsTab from './tabs/ReportsTab';
import SettingsTab from './tabs/SettingsTab';

// "Messages" was removed — clinical patient<->therapist communication
// belongs to the therapist console. "Patient Assignments" was removed too
// — there is no patient-therapist assignment anywhere in this app; a
// patient books a therapist directly (see patient/BookSession.jsx).
export const ANAHAT_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: HomeIcon },
  { key: 'patients', label: 'Patients', icon: UsersIcon },
  { key: 'appointments', label: 'Bookings', icon: CalendarIcon },
  { key: 'sessions', label: 'Sessions', icon: SessionIcon },
  { key: 'reports', label: 'Reports', icon: ReportIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function AnahatAdminPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [therapists, setTherapistsState] = useState([]);
  const [rawPatients, setRawPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [now, setNow] = useState(new Date());
  const [notifications, setNotifications] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [audit, setAudit] = useState([]);
  const [patientConcerns, setPatientConcerns] = useState({});
  const [selectedPatient, setSelectedPatient] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(interval);
  }, []);

  // Real Postgres admin listing (ALL therapists regardless of approval
  // status) merged with the sign-up survey — this is the fix for therapists
  // not appearing for approval: the old code read the public /api/therapists
  // directory, which only ever returns *already-approved* therapists.
  const refreshTherapists = () =>
    Promise.all([adminListUsers('therapist'), listTherapistSurveys()])
      .then(([users, surveys]) => {
        const surveyByUserId = Object.fromEntries(surveys.map((s) => [s.userId, s]));
        setTherapistsState(users.map((u) => adaptTherapist(u, surveyByUserId)));
      })
      .catch((err) => console.error('Failed to load therapists:', err));

  const refreshPatients = () =>
    adminListUsers('patient').then((users) => setRawPatients(users.map(adaptPatient)))
      .catch((err) => console.error('Failed to load patients:', err));

  // Real Postgres bookings (patients book therapists directly — this is the
  // same table BookSession.jsx writes to and TherapistPortal.jsx reads).
  const refreshAppointments = () =>
    adminListAppointments()
      .then((list) => setAppointments(list.map((a) => ({
        id: a.id,
        patientId: a.patient?.id,
        therapistId: a.therapist?.id,
        patientName: a.patient ? [a.patient.firstName, a.patient.lastName].filter(Boolean).join(' ') : undefined,
        therapistName: a.therapist ? [a.therapist.firstName, a.therapist.lastName].filter(Boolean).join(' ') : undefined,
        date: a.date, startTime: a.startTime, status: a.status, createdAt: a.createdAt,
      }))))
      .catch((err) => console.error('Failed to load appointments:', err));

  useEffect(() => {
    refreshTherapists();
    refreshPatients();
    refreshAppointments();
    getAdminNotifications().then(setNotifications).catch((err) => console.error('Failed to load notifications:', err));
    getAllSessions().then(setSessions).catch((err) => console.error('Failed to load sessions:', err));
    getAuditLog().then(setAudit).catch((err) => console.error('Failed to load audit log:', err));
  }, []);

  const patients = rawPatients;

  // Per-patient stated concern (from onboarding) — informational only, not
  // used for any assignment.
  useEffect(() => {
    if (patients.length === 0) return;
    Promise.all(patients.map((p) => getProfile(p.id)))
      .then((results) => {
        const concerns = {};
        patients.forEach((p, i) => { concerns[p.id] = results[i]?.concern || null; });
        setPatientConcerns(concerns);
      })
      .catch((err) => console.error('Failed to load patient profiles:', err));
  }, [patients]);

  const patientsWithConcern = useMemo(() => patients.map((p) => ({
    ...p,
    concern: patientConcerns[p.id] || null,
  })), [patients, patientConcerns]);

  const pendingTherapists = therapists.filter((t) => t.approvalStatus === 'pending');
  const approvedTherapists = therapists.filter((t) => t.approvalStatus === 'approved');

  const upcomingAppointments = appointments
    .filter((a) => a.status === 'confirmed' && !isAppointmentPast(a, now))
    .sort((a, b) => parseAppointmentDateTime(a) - parseAppointmentDateTime(b));

  // Flips the real isApproved flag (PATCH /api/admin/therapists/:id/approve)
  // — the single source of truth checked everywhere else in the app.
  const toggleTherapistVerified = (id, status) => {
    adminApproveTherapist(id, status === 'approved')
      .then(refreshTherapists)
      .catch((err) => console.error('Failed to update therapist approval:', err));
  };

  // Admin can step in and cancel a stuck real booking.
  const updateAppt = (id, patch) => {
    updateAppointmentStatus(id, patch).then(refreshAppointments).catch((err) => console.error('Failed to update appointment:', err));
  };

  const readNotification = (id) => {
    markNotificationRead(id).then(setNotifications).catch((err) => console.error('Failed to mark notification read:', err));
  };

  const notifItems = useMemo(() => notifications.map((n) => ({
    id: n.id, title: n.message, time: new Date(n.timestamp || n.createdAt).toLocaleString(), read: n.read,
  })), [notifications]);

  const recentAppointmentActivity = useMemo(() => [...appointments]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8)
    .map((a) => ({ id: a.id, type: 'appointment', text: `${a.patientName || a.patientId} — booking ${a.status}`, at: a.createdAt })), [appointments]);

  const goTab = (key) => { setTab(key); setSearch(''); setSelectedPatient(null); };

  return (
    <AdminDashboardLayout
      navItems={ANAHAT_NAV_ITEMS}
      storageKey="anahatAdminSidebarCollapsed"
      roleLabel="Anahat Admin"
      active={tab}
      onNavigate={goTab}
      user={{ ...user, name: user?.name || 'Anahat Admin' }}
      onLogout={logout}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search patients, therapists, bookings..."
      notifications={notifItems}
      onOpenNotification={() => goTab('dashboard')}
    >
      {tab === 'dashboard' && (
        <DashboardHome
          stats={{
            pendingApprovals: pendingTherapists.length,
            upcomingAppointments: upcomingAppointments.length,
            activeTherapists: approvedTherapists.length,
            activePatients: patients.length,
          }}
          pendingTherapists={pendingTherapists}
          approvedTherapists={approvedTherapists}
          upcomingAppointments={upcomingAppointments.slice(0, 5)}
          recentAppointmentActivity={recentAppointmentActivity}
          onApprove={(id) => toggleTherapistVerified(id, 'approved')}
          onReject={(id) => toggleTherapistVerified(id, 'rejected')}
          onNavigate={goTab}
        />
      )}

      {tab === 'patients' && (
        selectedPatient ? (
          <PatientDetailView
            patient={selectedPatient}
            appointments={appointments.filter((a) => a.patientId === selectedPatient.id)}
            therapists={approvedTherapists}
            onBack={() => setSelectedPatient(null)}
            onSessionLogged={refreshAppointments}
          />
        ) : (
          <PatientsTab
            patients={search ? patientsWithConcern.filter((p) => (p.name || '').toLowerCase().includes(search.toLowerCase())) : patientsWithConcern}
            onSelect={setSelectedPatient}
          />
        )
      )}

      {tab === 'appointments' && (
        <AppointmentsTab
          appointments={search ? appointments.filter((a) => (a.patientName || '').toLowerCase().includes(search.toLowerCase())) : appointments}
          onUpdate={updateAppt}
        />
      )}

      {tab === 'sessions' && <SessionsTab sessions={sessions} />}

      {tab === 'reports' && <ReportsTab patients={patients} getReportHistory={getReportHistory} />}

      {tab === 'settings' && <SettingsTab onLogout={logout} />}
    </AdminDashboardLayout>
  );
}
