export function PortalLoading({ label = 'Loading your wellness portal…' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F4EC]">
      <div className="bg-white rounded-2xl p-8 shadow-xl border border-black/5">
        <div className="flex items-center gap-4">
          <svg className="animate-spin h-7 w-7 text-[#0F8594]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-lg font-semibold text-slate-900">{label}</span>
        </div>
      </div>
    </div>
  );
}

export function PortalError({ message, onRetry, onLogout }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F4EC] p-4">
      <div className="bg-white rounded-2xl p-8 shadow-xl border border-black/5 max-w-md w-full">
        <div className="text-center mb-6">
          <svg className="w-14 h-14 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-slate-600 text-sm">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onRetry} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm" style={{ background: '#0F8594' }}>Retry</button>
          <button onClick={onLogout} className="flex-1 py-2.5 rounded-xl border border-black/10 text-slate-700 font-semibold text-sm hover:bg-slate-50">Logout</button>
        </div>
      </div>
    </div>
  );
}
