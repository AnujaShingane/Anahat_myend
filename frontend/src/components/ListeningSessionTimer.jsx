import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logListeningSession, getListeningLog } from '../services/api';
import { getProgressSummary } from '../utils/derived';
import { PrimaryButton, Badge } from './ui/Kit';

const QUALIFY_SECONDS = 15 * 60;

function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

// A day only counts toward the progress tracker if the patient listens
// continuously for 15+ minutes — switching tabs, minimizing, or pausing
// resets the count so skipping/fast-forwarding can't fake a session.
export default function ListeningSessionTimer({ trackName }) {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [completedToday, setCompletedToday] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getListeningLog(user.id)
      .then((log) => { if (!cancelled) setCompletedToday(getProgressSummary(log).todayQualified); })
      .catch((err) => console.error('Failed to load listening log:', err));
    return () => { cancelled = true; };
  }, [user.id]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= QUALIFY_SECONDS) {
            clearInterval(intervalRef.current);
            logListeningSession(user.id, { trackName, durationSeconds: QUALIFY_SECONDS, qualified: true })
              .catch((err) => console.error('Failed to log listening session:', err));
            setCompletedToday(true);
            setRunning(false);
            return QUALIFY_SECONDS;
          }
          return e + 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    const resetOnSkip = () => {
      if (document.hidden && running && elapsed < QUALIFY_SECONDS) {
        setRunning(false);
        setElapsed(0);
      }
    };
    document.addEventListener('visibilitychange', resetOnSkip);
    return () => document.removeEventListener('visibilitychange', resetOnSkip);
  }, [running, elapsed]);

  const pause = () => {
    setRunning(false);
    setElapsed(0);
  };

  if (completedToday) {
    return (
      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-4">
        <span className="text-sm font-bold text-emerald-700">Today's listening session is complete</span>
        <Badge tone="emerald">✓ Logged</Badge>
      </div>
    );
  }

  return (
    <div className="bg-black/[0.03] rounded-2xl px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Continuous listening session</span>
        <span className="font-mono text-lg font-bold text-sunset">{formatTime(elapsed)} / 15:00</span>
      </div>
      <div className="h-2 rounded-full bg-black/10 overflow-hidden mb-4">
        <div className="h-full bg-gradient-to-r from-lime-300 to-sunset transition-all" style={{ width: `${(elapsed / QUALIFY_SECONDS) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500 max-w-[70%]">
          Stay on this tab for 15 uninterrupted minutes to count today toward your progress. Leaving or pausing resets it.
        </p>
        {running ? (
          <button onClick={pause} className="btn-sunset-outline px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest whitespace-nowrap">Pause</button>
        ) : (
          <PrimaryButton className="whitespace-nowrap" onClick={() => setRunning(true)}>{elapsed > 0 ? 'Resume' : 'Start Listening'}</PrimaryButton>
        )}
      </div>
    </div>
  );
}
