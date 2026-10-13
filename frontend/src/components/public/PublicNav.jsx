import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Shared navigation for public pages and authenticated entry points.
export default function PublicNav({ tone = 'light', scrolled = false }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const dark = tone === 'dark';

  const { user, logout } = useAuth();
  const dashboardPath = user?.role === 'therapist' ? '/therapist' : user?.role === 'admin' ? '/admin' : '/dashboard';
  const doLogout = () => { setOpen(false); logout(); navigate('/login'); };

  const linkCls = dark
    ? 'text-white/85 hover:text-white transition-colors'
    : 'text-[#525d63] hover:text-[#0F8594] transition-colors';

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
        dark
          ? scrolled ? 'bg-[#0B1310]/70 backdrop-blur-xl border-b border-white/10 py-3' : 'bg-black/25 backdrop-blur-md py-4'
          : scrolled ? 'bg-[#FDF6EE]/95 backdrop-blur-md border-b border-black/[0.06] py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.02)]' : 'bg-[#FDF6EE]/70 backdrop-blur-sm border-b border-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-10 flex items-center justify-between">
        <Link to="/" aria-label="Anahat Transformations — home" className="flex items-center gap-3 shrink-0">
          <img src="/assets/anahat-logo.png" alt="" className="w-11 h-11 sm:w-12 sm:h-12 object-contain" />
          <span className={`font-display leading-tight ${dark ? 'text-white photo-text-shadow' : 'text-[#303b42]'}`}>
            <span className="block text-lg sm:text-xl font-semibold tracking-tight">Anahat</span>
            <span className={`block text-[11px] tracking-[0.14em] uppercase ${dark ? 'text-white/70' : 'text-slate-400'}`}>Transformations</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[13.5px] font-semibold tracking-wide">
          <Link to="/#relaxation" className={linkCls}>Relaxation</Link>
          <Link to="/register?journey=consultation" className={linkCls}>Consultation</Link>
          {user ? (
            <>
              <button type="button" onClick={doLogout} className={linkCls}>Logout</button>
            </>
          ) : (
            <Link to="/login" className={linkCls}>Login</Link>
          )}
          <span className={`h-5 w-px ${dark ? 'bg-white/20' : 'bg-black/10'}`} aria-hidden="true" />
          {user ? (
            <Link to={dashboardPath} className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all ${dark ? 'bg-white text-[#d65b38] hover:bg-[#fff5ef]' : 'bg-[#e85d35] text-white hover:bg-[#d84d2c]'}`}>
              My dashboard
            </Link>
          ) : (
            <Link to="/register" className="px-5 py-2.5 rounded-full text-sm font-bold text-white transition-colors bg-[#e85d35] hover:bg-[#d84d2c]">Sign Up</Link>
          )}
          <Link to="/demo" className="inline-flex items-center gap-2 rounded-full border-2 border-[#0F8594] px-5 py-[9px] text-sm font-bold text-[#0A6976] transition-colors hover:bg-[#0F8594] hover:text-white">
            Start a Free Trial
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
          </Link>
        </div>

        <button type="button" aria-label="Menu" onClick={() => setOpen((o) => !o)} className={`md:hidden ${dark ? 'text-white' : 'text-slate-800'}`}>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className={`md:hidden mt-2 mx-4 rounded-2xl overflow-hidden shadow-2xl border ${dark ? 'bg-[#10201c]/95 border-white/10 text-white' : 'bg-white border-black/5 text-slate-800'}`}>
          <Link to="/#relaxation" onClick={() => setOpen(false)} className="block px-5 py-3.5 text-sm font-semibold">Relaxation</Link>
          <Link to="/register?journey=consultation" onClick={() => setOpen(false)} className="block px-5 py-3.5 text-sm font-semibold">Consultation</Link>
          {user ? (
            <>
              <Link to={dashboardPath} onClick={() => setOpen(false)} className="block px-5 py-3.5 text-sm font-bold text-[#0F8594]/75">My dashboard</Link>
              <button type="button" onClick={doLogout} className="w-full text-left px-5 py-3.5 text-sm font-semibold">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setOpen(false)} className="block px-5 py-3.5 text-sm font-semibold">Login</Link>
              <Link to="/register" onClick={() => setOpen(false)} className="block px-5 py-3.5 text-sm font-bold text-[#e85d35]">Sign Up</Link>
            </>
          )}
          <Link to="/demo" onClick={() => setOpen(false)} className="flex items-center justify-between px-5 py-3.5 text-sm font-bold text-[#e85d35]">Start a Free Trial <span aria-hidden="true">→</span></Link>
        </div>
      )}
    </nav>
  );
}
