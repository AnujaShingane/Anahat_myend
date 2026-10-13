import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { initialsOf } from '../../utils/initials';
import DashboardFooter from './DashboardFooter';
import { useResizableSidebar, ResizeHandle } from './useResizableSidebar';

// ---------------------------------------------------------------------------
// Therapist dashboard shell for the Anahat Transformations look: light cream
// workspace, white sidebar, deep-teal accents, generous whitespace. Sidebar
// contains only the approved feature set (no Earnings/Analytics/Marketing/
// etc). The notification bell lives in the top bar and opens a real,
// backend-driven panel instead of taking up dashboard real estate.
//
// Palette is intentionally the same teal/lime/cream family used by the
// patient dashboard (see PatientDashboardLayout's TEAL/TEAL_LIGHT/LIME) so
// the therapist and admin consoles, which both import these constants,
// read as one consistent product rather than separate skins.
// ---------------------------------------------------------------------------

// Single, consistent cyan accent shared by the therapist and admin consoles
// (and PatientDashboardLayout's TEAL/TEAL_LIGHT) so every dashboard reads as
// one product. Kept under the historical "SAGE" name so every importing tab
// repaints automatically — cyan is used for accents (icons, active states,
// links, small highlights), not as a dominant page color.
export const SAGE_DARK = '#0A6976';
export const SAGE = '#0F8594';
export const SAGE_SOFT = '#DDF2F4';
export const CREAM = '#F6F4EC';
export const MINT = '#8FCBB9';
export const SOFT_YELLOW = '#E3F0A0';
export const SOFT_LAVENDER = '#B8D8CE';
export const SOFT_BLUE = '#AED9D1';

export const THERAPIST_NAV_ITEMS = [
  { key: 'overview', label: 'Dashboard', icon: HomeIcon },
  { key: 'patients', label: 'Patients', icon: UsersIcon },
  { key: 'appointments', label: 'Appointments', icon: CalendarIcon },
  { key: 'history', label: 'Session History', icon: HistoryIcon },
  { key: 'messages', label: 'Messages', icon: MessageIcon },
  { key: 'reports', label: 'Prescriptions', icon: ReportIcon },
  { key: 'profile', label: 'Profile', icon: UserIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function TherapistDashboardLayout({
  active,
  onNavigate,
  user,
  userId,
  level,
  avatarUrl,
  onLogout,
  children,
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search patients, sessions, reports...',
  notifications = [],
  messageBadgeCount = 0,
  approvalsBadgeCount = 0,
  onOpenNotification,
  onOpenNotifications,
  locked = false,
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('therapistSidebarCollapsed') === '1');
  const { width: sidebarWidth, onMouseDown: onResizeStart } = useResizableSidebar('therapistSidebarWidth', { initial: 260 });
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const guideKey = userId ? `anahat_therapist_guide_${userId}` : null;

  useEffect(() => {
    if (active === 'overview' && guideKey && !localStorage.getItem(guideKey)) setGuideOpen(true);
  }, [active, guideKey]);

  const closeGuide = () => {
    if (guideKey) localStorage.setItem(guideKey, 'done');
    setGuideOpen(false);
  };

  useEffect(() => {
    localStorage.setItem('therapistSidebarCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const displayName = user?.name || 'Therapist';
  const avatarSrc = avatarUrl || user?.avatarUrl || null;
  const initial = initialsOf(displayName);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="h-screen w-full flex overflow-hidden text-slate-900 font-sans" style={{ background: CREAM }}>
      {/* ---------------- SIDEBAR ---------------- */}
      <aside
        className="relative shrink-0 h-full flex flex-col bg-white border-r border-black/[0.06] transition-[width] duration-200 ease-in-out"
        style={{ width: collapsed ? 80 : sidebarWidth }}
      >
        {!collapsed && <ResizeHandle onMouseDown={onResizeStart} />}
        <Link to="/" aria-label="Anahat Transformations home" className={`flex items-center gap-2.5 px-6 h-20 shrink-0 ${collapsed ? 'justify-center px-0' : ''}`}>
          <img src="/assets/anahat-logo.png" alt="Anahat" className="w-9 h-9 object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-bold text-[15px] tracking-wide truncate" style={{ color: SAGE_DARK }}>ANAHAT TRANSFORMATIONS</p>
              <p className="text-[10px] text-slate-400 truncate -mt-0.5">Tune. Heal. Transform.</p>
            </div>
          )}
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {THERAPIST_NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;
            const badge = item.key === 'messages' ? messageBadgeCount : item.key === 'approvals' ? approvalsBadgeCount : 0;
            const disabled = locked && item.key !== 'overview';
            return (
              <button
                key={item.key}
                type="button"
                disabled={disabled}
                title={disabled ? 'Available after admin approval' : undefined}
                onClick={() => onNavigate?.(item.key)}
                className={`w-full group relative flex items-center gap-3 rounded-xl px-3.5 py-3 transition-all ${collapsed ? 'justify-center' : ''} ${
                  disabled ? 'text-slate-300 cursor-not-allowed' : isActive ? '' : 'text-slate-500 hover:bg-black/[0.03] hover:text-slate-800'
                }`}
                style={isActive ? { background: SAGE_SOFT, color: SAGE_DARK } : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="text-sm font-semibold truncate">{item.label}</span>}
                {!collapsed && badge > 0 && (
                  <span
                    className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                    style={{ background: SAGE }}
                  >
                    {badge}
                  </span>
                )}
                {collapsed && badge > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: SAGE }} />
                )}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`m-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-slate-400 hover:text-slate-700 hover:bg-black/[0.03] transition-all ${collapsed ? 'justify-center' : ''}`}
        >
          <svg className={`w-4 h-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-xs font-bold uppercase tracking-widest">Collapse</span>}
        </button>

      </aside>

      {/* ---------------- MAIN ---------------- */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <header className="h-20 shrink-0 flex items-center justify-between gap-4 px-8" style={{ background: CREAM }}>
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/therapist'))}
            aria-label="Go back"
            title="Go back"
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-500 bg-white border border-black/[0.06] hover:bg-black/[0.02] shadow-sm shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="relative w-full max-w-md">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-black/[0.06] focus:border-black/10 outline-none text-sm placeholder-slate-400 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => (onOpenNotifications ? onOpenNotifications() : setNotifOpen((v) => !v))}
                className="relative w-11 h-11 rounded-full flex items-center justify-center text-slate-500 bg-white border border-black/[0.06] hover:bg-black/[0.02] transition-all shadow-sm"
              >
                <BellIcon className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                    style={{ background: SAGE_DARK }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-3 w-96 max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-black/5 overflow-hidden z-50">
                  <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                    <p className="font-bold text-slate-900">Notifications</p>
                    {unreadCount > 0 && <span className="text-[11px] font-bold" style={{ color: SAGE_DARK }}>{unreadCount} new</span>}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 px-6 text-center">
                        <p className="text-sm font-semibold text-slate-600">You're all caught up</p>
                        <p className="text-xs text-slate-400 mt-1">New requests, messages, and reminders will show up here.</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => { setNotifOpen(false); onOpenNotification?.(n); }}
                          className={`w-full text-left px-5 py-3.5 flex items-start gap-3 hover:bg-black/[0.02] transition-all border-b border-black/[0.03] ${!n.read ? '' : 'opacity-70'}`}
                        >
                          <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={!n.read ? { background: SAGE } : { background: 'transparent' }} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-800">{n.title}</span>
                            {n.detail && <span className="block text-xs text-slate-500 mt-0.5">{n.detail}</span>}
                            <span className="block text-[11px] text-slate-400 mt-1">{n.time}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full hover:bg-white transition-all"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden" style={{ background: SAGE_DARK }}>
                  {avatarSrc ? <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" /> : initial}
                </div>
                <span className="hidden sm:block text-left">
                  <span className="block text-sm font-bold text-slate-800 max-w-[130px] truncate">{displayName}</span>
                  <span className="block text-[11px] text-slate-400">Therapist</span>
                </span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-black/5 overflow-hidden z-50">
                  <div className="p-5 flex items-center gap-3" style={{ background: SAGE_SOFT }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold shrink-0 overflow-hidden" style={{ background: SAGE_DARK }}>
                      {avatarSrc ? <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" /> : initial}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{displayName}</p>
                      {level && <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: SAGE_DARK }}>{level}</p>}
                    </div>
                  </div>
                  <div className="p-2">
                    <button onClick={() => { setMenuOpen(false); onNavigate?.('profile'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-black/[0.03] transition-all text-left">
                      <UserIcon className="w-4 h-4 text-slate-400" /> My Profile
                    </button>
                    <button onClick={() => { setMenuOpen(false); onNavigate?.('settings'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-black/[0.03] transition-all text-left">
                      <SettingsIcon className="w-4 h-4 text-slate-400" /> Settings
                    </button>
                    <div className="my-2 border-t border-black/5" />
                    <button
                      onClick={() => { setMenuOpen(false); setConfirmingLogout(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-all text-left"
                    >
                      <LogoutIcon className="w-4 h-4" /> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`flex-1 min-h-0 ${active === 'messages' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={`${active === 'messages' ? 'h-full w-full px-0 pb-0' : 'w-full max-w-none px-4 sm:px-6 lg:px-8 pb-4'} min-h-full flex flex-col`}>
            <div className={`flex-1 portal-page-content ${active === 'messages' ? 'h-full min-h-0 flex flex-col' : ''}`}>{children}</div>
          </div>
        </main>
        <DashboardFooter />
      </div>

      {confirmingLogout && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <img src="/assets/anahat-logo.png" alt="Anahat" className="w-5 h-5 object-contain shrink-0" />
              Log out of Anahat Transformations?
            </h3>
            <p className="text-sm text-slate-600 mb-6">You'll need to sign in again to access your console.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingLogout(false)}
                className="flex-1 py-2.5 rounded-xl border border-black/10 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingLogout(false); onLogout?.(); }}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-all"
                style={{ background: '#DC2626' }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
      {guideOpen && active === 'overview' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/35 px-4" role="dialog" aria-modal="true" aria-labelledby="therapist-guide-title">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: SAGE }}>Therapist quick start · {guideStep + 1} of 3</p>
            <h2 id="therapist-guide-title" className="mt-2 text-xl font-bold text-slate-900">{['Review appointments', 'Open a patient session', 'Record one answer at a time'][guideStep]}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{[
              'Use Appointments to review booked sessions and confirm the schedule you have set in your profile.',
              'Open the appointment or patient record to start the session and launch Nadika.ai.',
              'Read the current question aloud, record the patient response, and Nadika advances automatically. The answered count tracks progress; End Session is available whenever you need to stop.',
            ][guideStep]}</p>
            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={closeGuide} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Skip guide</button>
              <div className="flex gap-2">
                {guideStep > 0 && <button type="button" onClick={() => setGuideStep((step) => step - 1)} className="rounded-md border border-black/10 px-4 py-2 text-xs font-semibold text-slate-700">Back</button>}
                <button type="button" onClick={() => guideStep === 2 ? closeGuide() : setGuideStep((step) => step + 1)} className="rounded-md px-4 py-2 text-xs font-semibold text-white" style={{ background: SAGE }}>{guideStep === 2 ? 'Done' : 'Next'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons + logo mark (inline SVG, no external icon package dependency)
// ---------------------------------------------------------------------------
function LeafMark(props) {
  return (
    <svg {...props} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="9" fill={SAGE_SOFT} />
      <path d="M10 22c0-7 4-11 11-12-1 7-5 11-11 12z" fill={SAGE_DARK} />
      <path d="M10 22c0-4 1.5-7 4-9" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function ApprovalIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>); }
function HomeIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h0a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1V10" /></svg>); }
function UsersIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-4.13a4 4 0 100-8 4 4 0 000 8zm6 4a4 4 0 100-8 4 4 0 000 8z" /></svg>); }
function CalendarIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>); }
function HistoryIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>); }
function MessageIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z" /></svg>); }
function ReportIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>); }
function UserIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>); }
function SettingsIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>); }
function LogoutIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>); }
function SearchIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-4.35-4.35M18 11a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>); }
function BellIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>); }
function HeadsetIconUnused(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" /></svg>); }