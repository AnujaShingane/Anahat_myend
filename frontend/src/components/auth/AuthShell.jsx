import { useNavigate } from 'react-router-dom';
import PublicNav from '../public/PublicNav';

// Centred auth card (no decorative side panel), with the public nav on top
// and the shared footer below. Colours match the original login/register
// pages: cream page, white card, teal accents.
export default function AuthShell({ children, backTo = '/', backLabel = 'Back' }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col bg-[#FDF6EE] font-sans text-slate-900 selection:bg-[#0F8594]/30 relative overflow-x-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#0F8594]/45 blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#0F8594]/45 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <PublicNav tone="light" />

      <main className="relative z-10 flex-1 flex items-start justify-center px-4 pt-32 pb-16">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="flex items-center gap-2 text-slate-500 hover:text-[#0F8594] transition-colors mb-5 text-xs font-bold uppercase tracking-[0.2em]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
            {backLabel}
          </button>
          <div className="bg-white/85 backdrop-blur-2xl border border-black/10 rounded-[2rem] shadow-2xl p-8 sm:p-10">
            {children}
          </div>
        </div>
      </main>


      <style>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}

// Patient / Therapist switch shown at the top of both auth forms.
export function RoleTabs({ role, onChange }) {
  return (
    <div className="relative flex bg-black/[0.04] rounded-2xl p-1 mb-7" role="tablist" aria-label="Account type">
      <div
        className="absolute top-1 bottom-1 w-1/2 rounded-xl bg-white shadow-md transition-transform duration-300 ease-out"
        style={{ transform: role === 'therapist' ? 'translateX(100%)' : 'translateX(0%)' }}
      />
      {[['patient', 'Patient'], ['therapist', 'Therapist']].map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={role === key}
          onClick={() => onChange(key)}
          className={`relative z-10 flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${role === key ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Password field with a show/hide eye toggle.
export function PasswordInput({ value, onChange, placeholder = '••••••••', disabled, name, autoComplete }) {
  return (
    <PasswordInputInner value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} name={name} autoComplete={autoComplete} />
  );
}

import { useState } from 'react';
function PasswordInputInner({ value, onChange, placeholder, disabled, name, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        className="w-full pl-5 pr-12 py-3.5 bg-black/[0.03] border border-black/10 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-[#0F8594]/50 focus:bg-white outline-none transition-all"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
      >
        {show ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.7 9.7 0 0112 5c5 0 9 4 10 7-.4 1.1-1.2 2.4-2.3 3.5M6.6 6.6C4.6 8 3.3 10 2 12c1 3 5 7 10 7 1.5 0 2.9-.3 4.1-.9" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function GoogleButton({ onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-2xl font-bold text-sm bg-white border border-black/10 hover:border-[#0F8594]/40 text-slate-800 flex items-center justify-center gap-3 transition-all disabled:opacity-70"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      {label}
    </button>
  );
}
