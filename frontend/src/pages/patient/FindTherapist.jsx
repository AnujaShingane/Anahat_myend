import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalError, PortalLoading } from '../../components/layout/PortalStatus';
import TherapistCard from '../../components/patient/TherapistCard';
import { getFreeSlots, getTherapists } from '../../services/api';

const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

export default function FindTherapist() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const navigate = useNavigate();
  const [therapists, setTherapists] = useState(null);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(today);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [availability, setAvailability] = useState({});
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  useEffect(() => {
    getTherapists().then(setTherapists).catch(() => setTherapists([]));
  }, []);

  useEffect(() => {
    if (!availableOnly || !therapists?.length) return undefined;
    let active = true;
    setCheckingAvailability(true);
    Promise.all(therapists.map((therapist) => getFreeSlots(therapist.id, date)
      .then((slots) => [therapist.id, (slots || []).length > 0])
      .catch(() => [therapist.id, false])))
      .then((entries) => { if (active) setAvailability(Object.fromEntries(entries)); })
      .finally(() => { if (active) setCheckingAvailability(false); });
    return () => { active = false; };
  }, [availableOnly, date, therapists]);

  const locations = useMemo(() => [...new Set((therapists || []).map((t) => t.location?.split(',').slice(-2).join(',').trim()).filter(Boolean))].sort(), [therapists]);
  const visible = useMemo(() => (therapists || []).filter((therapist) => {
    const normalizedQuery = query.trim().toLowerCase();
    const textMatches = !normalizedQuery || [therapist.name, therapist.profile?.profession, therapist.bio, ...(therapist.expertise || [])]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery));
    const locationMatches = !location || (therapist.location || '').toLowerCase().includes(location.toLowerCase());
    const availabilityMatches = !availableOnly || availability[therapist.id];
    return textMatches && locationMatches && availabilityMatches;
  }), [availability, availableOnly, location, query, therapists]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  return (
    <PatientDashboardLayout active="find-therapist" user={user} onLogout={logout}>
      {/* Static header + filter bar — pinned to the top of the scroll area.
          Only the results grid beneath it scrolls. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 bg-[#F6F4EC]/95 px-4 pb-3 pt-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0A6976]">Consultation</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Find your therapist</h1>

        <div className="mt-3 flex flex-col gap-3 border-b border-black/[0.06] pb-3 md:flex-row md:items-end md:gap-4">
          <label className="block flex-[2] text-xs font-semibold text-slate-500">
            Concern or therapist
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sleep, anxiety, music therapy..."
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#0F8594] focus:ring-2 focus:ring-[#0F8594]/20"
            />
          </label>
          <label className="block flex-1 text-xs font-semibold text-slate-500">
            Location
            <select
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#0F8594] focus:ring-2 focus:ring-[#0F8594]/20"
            >
              <option value="">All locations</option>
              {locations.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="block flex-1 text-xs font-semibold text-slate-500">
            Available on
            <input
              type="date"
              value={date}
              min={today()}
              onChange={(event) => setDate(event.target.value)}
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#0F8594] focus:ring-2 focus:ring-[#0F8594]/20"
            />
          </label>
          <label className="flex shrink-0 items-center gap-2.5 pb-2.5 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} className="h-4 w-4 accent-[#0F8594]" />
            Has open slots
          </label>
        </div>
        {checkingAvailability && <p className="pt-3 text-xs text-slate-400">Checking live appointment availability…</p>}
      </div>

      {/* Scrolling results */}
      <div className="pt-4">
        {therapists === null ? (
          <p className="py-16 text-center text-sm text-slate-500">Loading therapists…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e7d6cb] bg-white/60 px-6 py-16 text-center">
            <h2 className="font-semibold text-slate-800">No matching therapists</h2>
            <p className="mt-2 text-sm text-slate-500">Try a broader concern, another location, or a different date.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((therapist) => (
              <TherapistCard
                key={therapist.id}
                therapist={therapist}
                onViewProfile={() => navigate(`/dashboard/therapists/${therapist.id}`)}
                onBook={() => navigate(`/dashboard/book-session?therapistId=${encodeURIComponent(therapist.id)}`)}
              />
            ))}
          </div>
        )}
      </div>
    </PatientDashboardLayout>
  );
}
