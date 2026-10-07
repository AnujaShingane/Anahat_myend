import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  adminListUsers, adminSuspendUser, adminDeleteUser,
  listTherapistSurveys,
  getAppointments, getAuditLog, getAdminNotifications, markNotificationRead,
  getFeedbackList, respondToFeedback, getAllSessions,
} from '../../../services/api';
import AdminDashboardLayout from '../../../components/layout/AdminDashboardLayout';
import { HomeIcon, UsersIcon, TherapistIcon, SystemIcon, AnalyticsIcon, AuditIcon, BellIcon, ReportIcon, SettingsIcon, MusicIcon } from '../../../components/admin/icons';
import { adaptTherapist, adaptAccount } from '../../../components/admin/adapters';

import DashboardHome from './tabs/DashboardHome';
import UsersTab from './tabs/UsersTab';
import TherapistsTab from './tabs/TherapistsTab';
import SystemTab from './tabs/SystemTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import AuditLogsTab from './tabs/AuditLogsTab';
import NotificationsTab from './tabs/NotificationsTab';
import ReportsTab from './tabs/ReportsTab';
import SettingsTab from './tabs/SettingsTab';
import AudioTracksTab from './tabs/AudioTracksTab';

// Technical Admin is system/account administration across every role —
// Anahat Admins, therapists, patients, and caretakers — not clinical
// workflows (those live in Anahat Admin). Sidebar and tabs are organized
// accordingly: accounts, system health, analytics, audit, notifications.
export const TECHNICAL_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: HomeIcon },
  { key: 'users', label: 'Patients', icon: UsersIcon },
  { key: 'therapists', label: 'Therapists', icon: TherapistIcon },
  { key: 'tracks', label: 'Audio Tracks', icon: MusicIcon },
  { key: 'system', label: 'System', icon: SystemIcon },
  { key: 'analytics', label: 'Analytics', icon: AnalyticsIcon },
  { key: 'audit', label: 'Audit Logs', icon: AuditIcon },
  { key: 'notifications', label: 'Notifications', icon: BellIcon },
  { key: 'reports', label: 'Reports', icon: ReportIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function TechnicalAdminPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [therapists, setTherapistsState] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [sessions, setSessions] = useState([]);

  // Real Postgres account directory (every role: admin, therapist, patient
  // — caretakers are patients with accountType: 'caregiver') merged with the
  // therapist sign-up survey for the Therapists tab. Same real source of
  // truth Anahat Admin uses, so approval status can never drift between the
  // two consoles.
  const refreshUsers = () =>
    adminListUsers().then((all) => setUsers(all.map(adaptAccount)))
      .catch((err) => console.error('Failed to load users:', err));

  const refreshTherapists = () =>
    Promise.all([adminListUsers('therapist'), listTherapistSurveys()])
      .then(([therapistUsers, surveys]) => {
        const surveyByUserId = Object.fromEntries(surveys.map((s) => [s.userId, s]));
        setTherapistsState(therapistUsers.map((u) => adaptTherapist(u, surveyByUserId)));
      })
      .catch((err) => console.error('Failed to load therapists:', err));

  useEffect(() => {
    refreshUsers();
    refreshTherapists();
    getFeedbackList().then(setFeedback).catch((err) => console.error('Failed to load feedback:', err));
    getAdminNotifications().then(setNotifications).catch((err) => console.error('Failed to load notifications:', err));
    getAppointments().then(setAppointments).catch((err) => console.error('Failed to load appointments:', err));
    getAuditLog().then(setAudit).catch((err) => console.error('Failed to load audit log:', err));
    getAllSessions().then(setSessions).catch((err) => console.error('Failed to load sessions:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patients = users.filter((u) => u.role === 'patient');

  const toggleSuspend = (u) => adminSuspendUser(u.id, !u.isSuspended).then(() => { refreshUsers(); refreshTherapists(); }).catch((err) => console.error('Failed to update account status:', err));
  const removeUser = (id) => adminDeleteUser(id).then(() => { refreshUsers(); refreshTherapists(); }).catch((err) => console.error('Failed to remove user:', err));
  const answerFeedback = (id, response) => respondToFeedback(id, response).then(setFeedback).catch((err) => console.error('Failed to respond to feedback:', err));
  const readNotification = (id) => markNotificationRead(id).then(setNotifications).catch((err) => console.error('Failed to mark notification read:', err));

  const notifItems = useMemo(() => notifications.map((n) => ({
    id: n.id, title: n.message, time: new Date(n.timestamp || n.createdAt).toLocaleString(), read: n.read,
  })), [notifications]);

  const recentActivity = useMemo(() => audit.slice(0, 8).map((a) => ({
    id: a.id, type: 'audit', text: `${a.action} — ${a.actor}${a.detail ? ` (${JSON.stringify(a.detail)})` : ''}`, at: a.createdAt || a.timestamp,
  })), [audit]);

  const goTab = (key) => { setTab(key); setSearch(''); };

  return (
    <AdminDashboardLayout
      navItems={TECHNICAL_NAV_ITEMS}
      storageKey="technicalAdminSidebarCollapsed"
      roleLabel="Technical Admin"
      active={tab}
      onNavigate={goTab}
      user={{ ...user, name: user?.name || 'Technical Admin' }}
      onLogout={logout}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search users, therapists, logs..."
      notifications={notifItems}
      onOpenNotification={() => goTab('notifications')}
    >
      {tab === 'dashboard' && (
        <DashboardHome
          stats={{
            totalUsers: users.length,
            totalTherapists: therapists.length,
            totalSessions: sessions.length,
            unreadNotifications: notifications.filter((n) => !n.read).length,
          }}
          recentUsers={users.slice(-5).reverse()}
          recentTherapists={[...therapists].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)).slice(0, 5)}
          recentActivity={recentActivity}
          onNavigate={goTab}
        />
      )}

      {tab === 'users' && (
        <UsersTab
          users={(search ? users.filter((u) => (u.name || '').toLowerCase().includes(search.toLowerCase())) : users).filter((u) => u.role === 'patient')}
          onToggleSuspend={toggleSuspend}
          onRemove={removeUser}
          currentUserId={user?.id}
        />
      )}

      {tab === 'therapists' && (
        <TherapistsTab
          therapists={search ? therapists.filter((t) => (t.name || '').toLowerCase().includes(search.toLowerCase())) : therapists}
        />
      )}

      {tab === 'tracks' && <AudioTracksTab />}

      {tab === 'system' && <SystemTab />}

      {tab === 'analytics' && (
        <AnalyticsTab
          users={users}
          patients={patients}
          therapists={therapists}
          appointments={appointments}
          sessions={sessions}
        />
      )}

      {tab === 'audit' && <AuditLogsTab audit={audit} />}

      {tab === 'notifications' && (
        <NotificationsTab notifications={notifications} onMarkRead={readNotification} />
      )}

      {tab === 'reports' && (
        <ReportsTab feedback={feedback} onRespond={answerFeedback} />
      )}

      {tab === 'settings' && <SettingsTab onLogout={logout} />}
    </AdminDashboardLayout>
  );
}
