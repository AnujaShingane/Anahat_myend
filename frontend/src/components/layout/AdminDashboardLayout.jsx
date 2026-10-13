import { initialsOf } from '../../utils/initials';
import { Link, useNavigate } from 'react-router-dom';
import DashboardFooter from './DashboardFooter';
import { useEffect, useRef, useState } from 'react';
import { SAGE_DARK, SAGE, SAGE_SOFT, CREAM } from './TherapistDashboardLayout';

// ---------------------------------------------------------------------------
// Shared shell for the two admin consoles (Technical Admin / Anahat Admin).
// This is a deliberate structural copy of TherapistDashboardLayout — same
// sidebar, header, search bar, notification panel, profile menu, and logout
// confirmation — so both admin dashboards look like they were built
// alongside the Therapist Dashboard. Only the nav items, brand subtitle,
// role label, and storage key are parameterized per role.
// ---------------------------------------------------------------------------

export default function AdminDashboardLayout({
  navItems,
  storageKey,
  roleLabel,
  active,
  onNavigate,
  user,
  onLogout,
  children,
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  notifications = [],
  onOpenNotification,
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(storageKey) === '1');
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(storageKey, collapsed ? '1' : '0');
  }, [collapsed, storageKey]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const displayName = user?.name || 'Admin';
  const initial = initialsOf(displayName);
  const avatarSrc = user?.avatarUrl || null;
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="h-screen w-full flex overflow-hidden text-slate-900 font-sans" style={{ background: CREAM }}>
      {/* ---------------- SIDEBAR ---------------- */}
      <aside
        className={`shrink-0 h-full flex flex-col bg-white border-r border-black/[0.06] transition-all duration-300 ease-in-out ${collapsed ? 'w-[80px]' : 'w-[260px]'}`}
      >
        <Link to="/" aria-label="Anahat Transformations home" className={`flex items-center gap-2.5 px-6 h-20 shrink-0 ${collapsed ? 'justify-center px-0' : ''}`}>
          <img src="/assets/anahat-logo.png" alt="Anahat" className="w-9 h-9 object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-bold text-[15px] tracking-wide truncate" style={{ color: SAGE_DARK }}>ANAHAT TRANSFORMATIONS</p>
              <p className="text-[10px] text-slate-400 truncate -mt-0.5">{roleLabel}</p>
            </div>
          )}
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate?.(item.key)}
                className={`w-full group relative flex items-center gap-3 rounded-xl px-3.5 py-3 transition-all ${collapsed ? 'justify-center' : ''} ${
                  isActive ? '' : 'text-slate-500 hover:bg-black/[0.03] hover:text-slate-800'
                }`}
                style={isActive ? { background: SAGE_SOFT, color: SAGE_DARK } : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="text-sm font-semibold truncate">{item.label}</span>}
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
          <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Go back" title="Go back" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 hover:text-slate-900">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M15 19l-7-7 7-7" /></svg>
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
                onClick={() => setNotifOpen((v) => !v)}
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
                        <p className="text-xs text-slate-400 mt-1">System and workflow notifications will show up here.</p>
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
                  {avatarSrc ? <img src={avatarSrc} alt={displayName} className="w-full h-full rounded-full object-cover" /> : initial}
                </div>
                <span className="hidden sm:block text-left">
                  <span className="block text-sm font-bold text-slate-800 max-w-[130px] truncate">{displayName}</span>
                  <span className="block text-[11px] text-slate-400">{roleLabel}</span>
                </span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-black/5 overflow-hidden z-50">
                  <div className="p-5 flex items-center gap-3" style={{ background: SAGE_SOFT }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold shrink-0" style={{ background: SAGE_DARK }}>
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{displayName}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: SAGE_DARK }}>{roleLabel}</p>
                    </div>
                  </div>
                  <div className="p-2">
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

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 min-h-full flex flex-col"><div className="flex-1 portal-page-content">{children}</div></div>
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
    </div>
  );
}

function LeafMark(props) {
  return (
    <svg {...props} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="9" fill={SAGE_SOFT} />
      <path d="M10 22c0-7 4-11 11-12-1 7-5 11-11 12z" fill={SAGE_DARK} />
      <path d="M10 22c0-4 1.5-7 4-9" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function SettingsIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>); }
function LogoutIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>); }
function SearchIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-4.35-4.35M18 11a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>); }
function BellIcon(props) { return (<svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>); }
