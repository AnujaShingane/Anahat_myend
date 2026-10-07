import { useNavigate } from 'react-router-dom';

// One consistent "go back" control used across dashboards and inner pages.
// Falls back to `to` when there's no history to go back to (e.g. a page
// opened directly from a bookmark).
export default function BackButton({ to, label = 'Back', onClick, className = '' }) {
  const navigate = useNavigate();
  const handle = () => {
    if (onClick) return onClick();
    if (to) return navigate(to);
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };
  return (
    <button
      type="button"
      onClick={handle}
      className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors ${className}`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
      {label}
    </button>
  );
}
