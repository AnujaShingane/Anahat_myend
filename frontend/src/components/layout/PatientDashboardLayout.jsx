import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getPatientNotifications, markPatientNotificationRead, getPatientOnboarding, getProfile, getTrackCatalog } from '../../services/api';
import anahatLogo from '../../assets/anahat-logo.png';
import { initialsOf } from '../../utils/initials';
import DashboardFooter from './DashboardFooter';
import { useResizableSidebar, ResizeHandle } from './useResizableSidebar';
import { consentKey } from '../../pages/patient/Consent';

// ---------------------------------------------------------------------------
// Reusable patient dashboard shell: collapsible sidebar (persisted, animated),
// fixed top bar (search / notifications / profile dropdown), and a scrollable
// content area. Every patient-facing page (Dashboard, Reports, Profile,
// Settings, and future pages) composes this same layout so navigation,
// spacing, and the profile menu stay identical everywhere.
//
// Light cream sidebar with a solid teal active pill, matching the reference
// layout — deep teal is reserved for accents/active states, not the whole rail.
// ---------------------------------------------------------------------------

// Single, consistent cyan accent used app-wide for active states, links,
// icons and highlights (see src/index.css --accent-cyan-*).
const TEAL = '#0F8594';
const TEAL_DARK = '#0A6976';
const TEAL_LIGHT = '#0F8594';
const LIME = '#E3F0A0';
const SIDEBAR_BG = '#FFFFFF';

export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: HomeIcon, keywords: 'home overview' },
  { key: 'book-session', label: 'Book Session', to: '/dashboard/book-session', icon: CalendarPlusIcon, keywords: 'appointment therapist booking' },
  { key: 'appointments', label: 'Appointments', to: '/dashboard/appointments', icon: CalendarIcon, keywords: 'sessions upcoming schedule' },
  { key: 'tracking', label: 'Tracking', to: '/dashboard/tracking', icon: ProgressIcon, keywords: 'mood progress' },
  { key: 'messages', label: 'Messages', to: '/dashboard/messages', icon: MessageIcon, keywords: 'chat therapist' },
  { key: 'notifications', label: 'Notifications', to: '/dashboard/notifications', icon: BellIcon, keywords: 'alerts' },
  { key: 'reports', label: 'Reports', to: '/dashboard/reports', icon: ReportIcon, keywords: 'report summary' },
  { key: 'music', label: 'Music Library', to: '/consultation/music', icon: MusicIcon, keywords: 'tracks music therapy listen' },
  { key: 'feedback', label: 'Weekly Feedback', to: '/consultation/feedback', icon: FeedbackIcon, keywords: 'check-in' },
  { key: 'daily', label: 'Daily Activities', to: '/consultation/activities', icon: ActivityIcon, keywords: 'habits' },
  { key: 'documents', label: 'Documents', to: '/consultation/documents', icon: DocumentIcon, keywords: 'files upload' },
  { key: 'profile', label: 'My Profile', to: '/dashboard/profile', icon: UserIcon, keywords: 'account' },
  { key: 'settings', label: 'Settings', to: '/dashboard/settings', icon: SettingsIcon, keywords: 'password preferences demographic' },
];
const SIDEBAR_ITEMS = NAV_ITEMS.filter((i) => !['profile', 'settings', 'notifications', 'book-session', 'appointments'].includes(i.key));

// `search` lets a page take over the header search bar:
//   search={{ placeholder: 'Search tracks', value, onChange }}
// Without it the bar searches the dashboard's pages.
export default function PatientDashboardLayout({ active, user, onLogout, children, headerRight = null, backTo, search: pageSearch = null }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1');
  const { width: sidebarWidth, onMouseDown: onResizeStart } = useResizableSidebar('patientSidebarWidth');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [guideStep, setGuideStep] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [search, setSearch] = useState('');
  const menuRef = useRef(null);
  const notificationRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [toasts, setToasts] = useState([]);
  // Generic "there's something new here" badge system — a nav item's key
  // shows a small dot when the feature has unseen new content. Currently
  // drives Music Library (new tracks added since the patient last opened
  // it); other features can push into this same set the same way.
  const [newFeatureKeys, setNewFeatureKeys] = useState(new Set());
  const seenKey = user?.id ? `anahat_notif_seen_${user.id}` : null;
  const guideKey = user?.id ? `anahat_patient_guide_${user.id}` : null;

  useEffect(() => {
    if (active === 'dashboard' && guideKey && !localStorage.getItem(guideKey)) setGuideOpen(true);
  }, [active, guideKey]);

  const closeGuide = () => {
    if (guideKey) localStorage.setItem(guideKey, 'done');
    setGuideOpen(false);
  };

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // Poll the notification store so the badge stays current across pages
  // without requiring every page to know about notifications.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const refresh = () => {
      getPatientNotifications(user.id)
        .then((list) => {
          if (cancelled) return;
          setNotificationItems(list);
          // Pop a toast for anything new since this browser last saw the list.
          const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'));
          const fresh = list.filter((n) => !n.read && !seen.has(n.id));
          if (seen.size === 0 && list.length) {
            // First load in this browser: don't replay history as toasts.
            localStorage.setItem(seenKey, JSON.stringify(list.map((n) => n.id)));
            return;
          }
          if (fresh.length) {
            setToasts((t) => [...t, ...fresh.slice(0, 3).map((n) => ({ id: n.id, message: n.message }))]);
            localStorage.setItem(seenKey, JSON.stringify([...seen, ...fresh.map((n) => n.id)].slice(-200)));
            fresh.forEach((n) => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 7000));
          }
        })
        .catch((err) => console.error('Failed to load notifications:', err));
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.id]);

  // Music Library "new" badge: compare the newest track's createdAt against
  // the last time this browser opened the Music Library page.
  useEffect(() => {
    if (!user?.id) return;
    const lastViewedKey = `anahat_music_last_viewed_${user.id}`;
    if (location.pathname === '/consultation/music') {
      localStorage.setItem(lastViewedKey, new Date().toISOString());
      setNewFeatureKeys((s) => { const n = new Set(s); n.delete('music'); return n; });
      return;
    }
    getTrackCatalog()
      .then((tracks) => {
        const lastViewed = localStorage.getItem(lastViewedKey);
        const newest = tracks.reduce((max, t) => (t.createdAt && (!max || t.createdAt > max) ? t.createdAt : max), null);
        if (newest && (!lastViewed || newest > lastViewed)) {
          setNewFeatureKeys((s) => new Set(s).add('music'));
        }
      })
      .catch((err) => console.error('Failed to check for new tracks:', err));
  }, [user?.id, location.pathname]);

  // Access gate: a patient's account isn't usable until the mandatory
  // demographic/verification form is submitted. This is enforced here
  // (rather than per-page) because every patient page renders through this
  // layout — with one deliberate exception: Relaxation. Per the Relaxation
  // flow (basic-info form -> payment -> Do's & Don'ts -> tracks), it does
  // NOT require the full demographic Onboarding form, so pages under
  // /dashboard/relaxation are exempt from this redirect.
  useEffect(() => {
    if (!user?.id) return;
    if (location.pathname.startsWith('/dashboard/relaxation')) return;
    let cancelled = false;
    getPatientOnboarding(user.id)
      .then((result) => {
        if (!result) return;
        const { status } = result;
        if (cancelled) return;
        if (status === 'not_submitted' || status === 'rejected') {
          navigate('/onboarding', { replace: true });
        } else if (status === 'pending') {
          navigate('/onboarding/pending', { replace: true });
        } else if (!localStorage.getItem(consentKey(user.id))) {
          // Demographic form done — make sure the consent form was accepted too.
          getProfile(user.id).then((p) => {
            if (cancelled) return;
            if (p?.consentAcceptedAt) localStorage.setItem(consentKey(user.id), p.consentAcceptedAt);
            else navigate('/consent', { replace: true });
          }).catch(() => {});
        }
      })
      .catch((err) => console.error('Failed to load onboarding status:', err));
    return () => { cancelled = true; };
  }, [user?.id, navigate, location.pathname]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (notificationRef.current && !notificationRef.current.contains(e.target)) setNotificationOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const q = search.trim().toLowerCase();
  const searchResults = q
    ? NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(q) || (i.keywords || '').includes(q))
    : [];
  const goToResult = (item) => {
    setSearch('');
    setSearchOpen(false);
    navigate(item.to);
  };
  const unreadCount = notificationItems.filter((notification) => !notification.read).length;

  const displayName = user?.name || user?.full_name || 'Patient';
  const avatarSrc = user?.avatarUrl || user?.avatar_url || (user?.avatarFileId ? `/api/profile/files/${user.avatarFileId}` : null);
  const email = user?.email || '';
  const initial = initialsOf(user?.name || user?.full_name || displayName);
  const isVerified = Boolean(user?.verified || user?.is_verified);

  return (
    <div className="h-screen w-full flex bg-[#F6F4EC] text-slate-900 font-sans overflow-hidden">
      {/* ---------------- SIDEBAR ---------------- */}
      <aside
        className="relative shrink-0 h-full flex flex-col transition-[width] duration-200 ease-in-out border-r border-black/5"
        style={{ background: SIDEBAR_BG, width: collapsed ? 76 : sidebarWidth }}
      >
        {!collapsed && <ResizeHandle onMouseDown={onResizeStart} />}
        <Link to="/" aria-label="Anahat home" className={`flex items-center gap-2.5 px-5 h-20 shrink-0 ${collapsed ? 'justify-center px-0' : ''}`}>
          <img src={anahatLogo} alt="Anahat" className="w-9 h-9 object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <span className="block text-slate-900 font-bold text-base tracking-tight truncate">Anahat</span>
              <span className="block text-[10px] text-slate-400 font-semibold tracking-wide truncate">Transformations</span>
            </div>
          )}
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = item.key === active;
            const disabled = !item.to;
            const Icon = item.icon;
            const content = (
              <div
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all cursor-pointer ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'text-white'
                    : disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-[#F6F4EC]'
                }`}
                style={isActive ? { background: TEAL } : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="text-sm font-semibold truncate">{item.label}</span>}
                {!collapsed && item.key === 'notifications' && unreadCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: '#DC2626' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                {!collapsed && item.key !== 'notifications' && newFeatureKeys.has(item.key) && (
                  <span className="ml-auto w-2 h-2 rounded-full shrink-0" style={{ background: '#DC2626' }} title="New" />
                )}
                {collapsed && newFeatureKeys.has(item.key) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#DC2626' }} />
                )}
                {!collapsed && disabled && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-slate-300">Soon</span>
                )}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                    {item.label}{disabled ? ' — coming soon' : ''}
                  </span>
                )}
              </div>
            );
            return disabled ? (
              <div key={item.key}>{content}</div>
            ) : (
              <Link key={item.key} to={item.to}>{content}</Link>
            );
          })}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`m-3 flex items-center gap-2 rounded-xl px-3 py-3 text-slate-400 hover:text-slate-800 hover:bg-[#F6F4EC] transition-all ${collapsed ? 'justify-center' : ''}`}
        >
          <svg className={`w-5 h-5 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-xs font-bold uppercase tracking-widest">Collapse</span>}
        </button>
      </aside>

      {/* ---------------- MAIN COLUMN ---------------- */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        {/* Top bar */}
        <header className="h-20 shrink-0 flex items-center gap-4 px-6 md:px-8 bg-white border-b border-black/5">
          <button
            type="button"
            onClick={() => (backTo ? navigate(backTo) : window.history.length > 1 ? navigate(-1) : navigate('/'))}
            aria-label="Go back"
            title="Go back"
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-[#F6F4EC] hover:text-slate-900 transition-all shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 max-w-md relative" ref={searchRef}>
            <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            {pageSearch ? (
              <input
                value={pageSearch.value}
                onChange={(e) => pageSearch.onChange(e.target.value)}
                placeholder={pageSearch.placeholder}
                className="w-full bg-[#F6F4EC] border border-transparent focus:border-black/10 rounded-full pl-11 pr-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all"
              />
            ) : (
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults[0]) goToResult(searchResults[0]);
                if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); }
              }}
              placeholder="Search pages — e.g. appointments, music, settings"
              className="w-full bg-[#F6F4EC] border border-transparent focus:border-black/10 rounded-full pl-11 pr-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all"
            />
            )}
            {!pageSearch && searchOpen && q && (
              <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-black/5 overflow-hidden z-50">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-400">No pages match “{search}”.</p>
                ) : (
                  searchResults.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.key} type="button" onClick={() => goToResult(item)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-[#F6F4EC]">
                        <Icon className="w-4 h-4 text-slate-400" /> {item.label}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 ml-auto">
            {headerRight}
            <button type="button" onClick={() => navigate('/dashboard/find-therapist')} aria-label="Find your therapist" className="inline-flex items-center gap-2 rounded-full bg-[#e85d35] px-3 sm:px-4 py-2.5 text-[11px] sm:text-xs font-bold text-white hover:bg-[#d84d2c]">
              <span className="sm:hidden">Find</span><span className="hidden sm:inline">Find your therapist</span>
            </button>
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => setNotificationOpen((open) => !open)}
                className="relative w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-[#F6F4EC] transition-all"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={notificationOpen}
              >
                <BellIcon className="w-5 h-5" />
                {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 h-4 rounded-full border-2 border-white px-1 text-[9px] font-bold leading-3 text-white" style={{ background: '#DC2626' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {notificationOpen && (
                <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                    <p className="text-sm font-bold text-slate-800">Notifications</p>
                    {unreadCount > 0 && <span className="text-[11px] font-semibold text-[#d65b38]">{unreadCount} unread</span>}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notificationItems.length ? notificationItems.map((notification) => (
                      <button key={notification.id} type="button" onClick={() => {
                        if (notification.read) return;
                        markPatientNotificationRead(user.id, notification.id)
                          .then(() => setNotificationItems((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item)))
                          .catch((err) => console.error('Failed to mark notification read:', err));
                      }} className="w-full border-b border-black/5 px-4 py-3 text-left last:border-b-0 hover:bg-[#fff8f3]">
                        <span className="flex items-start gap-2">
                          {!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#e85d35]" />}
                          <span className="min-w-0 flex-1">
                            <span className={`block text-xs ${notification.read ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}>{notification.title || notification.message}</span>
                            {(notification.body || notification.detail?.text) && <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{notification.body || notification.detail.text}</span>}
                            <span className="mt-1 block text-[10px] text-slate-400">{notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ''}</span>
                          </span>
                        </span>
                      </button>
                    )) : <p className="px-4 py-6 text-center text-xs text-slate-500">No notifications yet.</p>}
                  </div>
                  <button type="button" onClick={() => { setNotificationOpen(false); navigate('/dashboard/notifications'); }} className="w-full border-t border-black/5 px-4 py-3 text-xs font-bold text-[#d65b38] hover:bg-[#fff8f3]">View notification history</button>
                </div>
              )}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-[#F6F4EC] transition-all"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: TEAL }}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={displayName} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <span className="text-sm font-semibold text-slate-800 hidden sm:block max-w-[160px] truncate">{displayName}</span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-black/5 overflow-hidden z-50">
                  <div className="p-5 flex items-center gap-3" style={{ background: '#F6F4EC' }}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ background: TEAL }}>
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={displayName} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        initial
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-900 truncate">{displayName}</p>
                        {isVerified && (
                          <svg className="w-4 h-4 shrink-0" style={{ color: TEAL_LIGHT }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      {isVerified && <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: TEAL_LIGHT }}>Verified Patient</p>}
                      <p className="text-xs text-slate-500 truncate mt-0.5">{email}</p>
                    </div>
                  </div>
                  <div className="p-2">
                    <button onClick={() => { setMenuOpen(false); navigate('/dashboard/profile'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-[#F6F4EC] transition-all text-left">
                      <UserIcon className="w-4 h-4 text-slate-400" /> My Profile
                    </button>
                    <button onClick={() => { setMenuOpen(false); navigate('/dashboard/settings'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-[#F6F4EC] transition-all text-left">
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

        {/* Content */}
        <main className={`flex-1 min-h-0 ${active === 'messages' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={`${active === 'messages' ? 'h-full w-full px-0 py-0' : 'w-full max-w-none px-4 sm:px-6 lg:px-8 py-4 sm:py-6'} min-h-full flex flex-col`}>
            <div className={`flex-1 portal-page-content ${active === 'messages' ? 'h-full min-h-0 flex flex-col' : ''}`}>{children}</div>
          </div>

        {/* Toasts */}
        <div className="fixed bottom-6 right-6 z-[120] space-y-3 w-[340px] max-w-[90vw]">
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setToasts((x) => x.filter((y) => y.id !== t.id)); navigate('/dashboard/notifications'); }}
              className="w-full text-left bg-white rounded-2xl shadow-2xl border border-black/5 px-5 py-4 flex gap-3 items-start"
            >
              <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: TEAL }}>
                <BellIcon className="w-4 h-4" />
              </span>
              <span className="text-sm text-slate-800 leading-snug">{t.message}</span>
            </button>
          ))}
        </div>
        </main>
        <DashboardFooter />
      </div>

      {/* Logout confirmation dialog */}
      {confirmingLogout && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Log out of Anahat?</h3>
            <p className="text-sm text-slate-600 mb-6">You'll need to sign in again to access your dashboard.</p>
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
      {guideOpen && active === 'dashboard' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/35 px-4" role="dialog" aria-modal="true" aria-labelledby="patient-guide-title">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#d65b38]">Getting started · {guideStep + 1} of 3</p>
            <h2 id="patient-guide-title" className="mt-2 text-xl font-bold text-slate-900">{['Find a therapist', 'Review and book', 'Stay up to date'][guideStep]}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{[
              'Use Find your therapist to browse registered therapists by concern, location, and date availability.',
              'Open View profile for a therapist’s details, then choose Book appointment to select an available session.',
              'Use the bell for new and previous notifications. Your profile menu contains your profile, settings, and logout.',
            ][guideStep]}</p>
            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={closeGuide} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Skip guide</button>
              <div className="flex gap-2">
                {guideStep > 0 && <button type="button" onClick={() => setGuideStep((step) => step - 1)} className="rounded-md border border-black/10 px-4 py-2 text-xs font-semibold text-slate-700">Back</button>}
                <button type="button" onClick={() => guideStep === 2 ? closeGuide() : setGuideStep((step) => step + 1)} className="rounded-md bg-[#e85d35] px-4 py-2 text-xs font-semibold text-white">{guideStep === 2 ? 'Done' : 'Next'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, no external icon package dependency)
// ---------------------------------------------------------------------------
function HomeIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h0a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1V10" /></svg>); }
function ReportIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>); }
function CalendarIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>); }
function CalendarPlusIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zM12 13v4m-2-2h4" /></svg>); }
function MusicIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19V6l12-2v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-2c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>); }
function FeedbackIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>); }
function ProgressIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm6 0V9a2 2 0 00-2-2h-2a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2zm6 0V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>); }
function ActivityIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>); }
function MessageIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z" /></svg>); }
function BellIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>); }
function LeafIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 21c-4.5-2.5-8-6-8-10.5A5.5 5.5 0 0112 6a5.5 5.5 0 018 4.5C20 15 16.5 18.5 12 21z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v9" /></svg>); }
function DocumentIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>); }
function UserIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>); }
function SettingsIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>); }
function LogoutIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>); }