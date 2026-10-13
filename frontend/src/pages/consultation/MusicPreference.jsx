import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getTrackCatalog, getTrackSelection, selectTracks, getTrackHistory } from '../../services/api';
import { getTrackSelectionMeta } from '../../utils/derived';
import { Card, SectionHeading, PrimaryButton, Badge } from '../../components/ui/Kit';
import TrackVisual, { getTrackVariant } from '../../components/TrackVisual';
import ListeningSessionTimer from '../../components/ListeningSessionTimer';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import DosAndDonts from '../../components/DosAndDonts';

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Do's & Don'ts gate: shown every time the Music Library is opened. The
// library itself only appears after "I understand"; a "Back to Do's &
// Don'ts" link in the library brings this screen back.
function ListeningGuide({ onContinue }) {
  return (
    <div className="bg-white border border-black/5 rounded-3xl p-6 md:p-8">
      <h3 className="font-bold text-xl text-slate-900">Before you listen</h3>
      <p className="text-sm text-slate-500 mt-1 mb-6">Headphones or a speaker, 60–70% volume, phone away. Read once, then confirm.</p>
      <DosAndDonts compact />
      <div className="flex justify-end mt-6">
        <button type="button" onClick={onContinue} className="px-7 py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background: '#0F8594' }}>
          I understand — open Music Library
        </button>
      </div>
    </div>
  );
}

function BackToGuide({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 mb-5">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
      Back to Do's &amp; Don'ts
    </button>
  );
}

export default function MusicPreference() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const [catalog, setCatalog] = useState([]);
  const [selection, setSelection] = useState(null);
  const [picked, setPicked] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [history, setHistory] = useState([]);
  const [guideOk, setGuideOk] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (t) => !q || [t.name, t.mood, t.tag, t.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  const searchProps = { placeholder: 'Search tracks in your Music Library', value: query, onChange: setQuery };

  useEffect(() => {
    getTrackCatalog().then(setCatalog).catch((err) => console.error('Failed to load track catalog:', err));
    getTrackSelection(user.id).then((sel) => setSelection(getTrackSelectionMeta(sel))).catch((err) => console.error('Failed to load track selection:', err));
    getTrackHistory(user.id).then(setHistory).catch((err) => console.error('Failed to load track history:', err));
  }, [user.id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const togglePick = (id) => {
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.length >= 2) return [p[1], id];
      return [...p, id];
    });
  };

  const confirmSelection = () => {
    if (picked.length !== 2) return;
    selectTracks(user.id, picked)
      .then((sel) => setSelection(getTrackSelectionMeta(sel)))
      .catch((err) => console.error('Failed to save track selection:', err));
  };

  if (selection?.locked) {
    const remaining = selection.unlockAt - now;
    const activeTracks = catalog.filter((t) => selection.trackIds.includes(t.id));
    if (!guideOk) {
      return (
        <PatientDashboardLayout active="music" user={user} onLogout={handleLogout}>
          <SectionHeading eyebrow="Music Library" title="Do's & Don'ts" subtitle="A quick reminder before every listening session." />
          <ListeningGuide onContinue={() => setGuideOk(true)} />
        </PatientDashboardLayout>
      );
    }
    return (
      <PatientDashboardLayout active="music" user={user} onLogout={handleLogout} search={searchProps}>
        <BackToGuide onClick={() => setGuideOk(false)} />
        <SectionHeading
          eyebrow="Music Library"
          title="Your Music Selection"
          subtitle="These two tracks are available for listening for 24 hours. New selections open once the timer ends."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          {activeTracks.map((t) => {
            const variant = getTrackVariant(t.index);
            return (
              <div
                key={t.id}
                className="relative overflow-hidden rounded-[1.75rem] p-7 text-white shadow-xl shadow-[#0F8594]/10"
                style={{ background: `linear-gradient(150deg, ${t.colors[0]}, ${t.colors[1]})` }}
              >
                <TrackVisual variant={variant} className="w-40 h-40 -right-6 -top-6 opacity-80" />
                <TrackVisual variant={variant} className="w-56 h-56 -left-16 -bottom-20 opacity-40" />
                <div className="relative z-10">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[10px] font-bold uppercase tracking-widest">
                    Track {t.index}
                  </span>
                  <p className="text-2xl font-serif font-bold mt-3">{t.name}</p>
                  <p className="text-xs uppercase tracking-widest opacity-80 mt-1">Neuroacoustic Sound Therapy</p>
                </div>
              </div>
            );
          })}
        </div>

        <Card className="mb-6">
          <div className="flex items-center justify-between bg-black/[0.03] rounded-2xl px-5 py-4">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">New selection unlocks in</span>
            <span className="font-mono text-lg font-bold text-sunset">{formatCountdown(remaining)}</span>
          </div>
        </Card>

        <Card className="mb-6">
          <h3 className="font-serif font-bold text-lg mb-4">Today's Listening Session</h3>
          <ListeningSessionTimer trackName={activeTracks.map((t) => t.name).join(' + ')} />
        </Card>

        {history.length > 0 && (
          <Card className="mb-6">
            <h3 className="font-serif font-bold text-lg mb-4">Track History</h3>
            <div className="space-y-2">
              {history.slice().reverse().map((h, i) => (
                <div key={i} className="text-xs text-slate-500 flex justify-between bg-black/[0.02] rounded-xl px-4 py-2">
                  <span>{h.trackIds.map((id) => catalog.find((t) => t.id === id)?.name).join(' + ')}</span>
                  <span>{new Date(h.selectedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex justify-end">
          <PrimaryButton onClick={() => navigate('/consultation/appointment')}>Book an Appointment</PrimaryButton>
        </div>
      </PatientDashboardLayout>
    );
  }

  if (!guideOk) {
    return (
      <PatientDashboardLayout active="music" user={user} onLogout={handleLogout}>
        <SectionHeading eyebrow="Music Library" title="Do's & Don'ts" subtitle="A quick reminder before every listening session." />
        <ListeningGuide onContinue={() => setGuideOk(true)} />
      </PatientDashboardLayout>
    );
  }
  return (
    <PatientDashboardLayout active="music" user={user} onLogout={handleLogout} search={searchProps}>
      <BackToGuide onClick={() => setGuideOk(false)} />
      <SectionHeading
        eyebrow="Music Library"
        title="Music Library"
        subtitle="Fifteen anonymous tracks — pick the two that resonate. Raga names stay hidden until your therapist review."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {catalog.filter(matches).map((t) => {
          const isPicked = picked.includes(t.id);
          const variant = getTrackVariant(t.index);
          return (
            <button
              key={t.id}
              onClick={() => togglePick(t.id)}
              className={`relative overflow-hidden rounded-2xl p-5 h-36 text-left text-white transition-all shadow-lg shadow-black/5 ${isPicked ? 'ring-4 ring-slate-900 scale-[1.03]' : 'hover:scale-[1.02]'}`}
              style={{ background: `linear-gradient(150deg, ${t.colors[0]}, ${t.colors[1]})` }}
            >
              <TrackVisual variant={variant} className="w-28 h-28 -right-4 -top-4 opacity-70" />
              <TrackVisual variant={variant} className="w-36 h-36 -left-10 -bottom-12 opacity-30" />
              <div className="relative z-10">
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">Track {t.index}</p>
                <p className="font-serif font-bold text-lg leading-snug mt-1">Sound Session {t.index}</p>
              </div>
              {isPicked && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center z-20">
                  <svg className="w-4 h-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <Badge tone={picked.length === 2 ? 'emerald' : 'slate'}>{picked.length}/2 selected</Badge>
        <PrimaryButton disabled={picked.length !== 2} onClick={confirmSelection}>
          Confirm Selection
        </PrimaryButton>
      </div>
    </PatientDashboardLayout>
  );
}
