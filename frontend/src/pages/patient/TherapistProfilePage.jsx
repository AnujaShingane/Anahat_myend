import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalError, PortalLoading } from '../../components/layout/PortalStatus';
import { getTherapistDetail, getTherapistSurvey } from '../../services/api';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TherapistProfilePage() {
  const { therapistId } = useParams();
  const navigate = useNavigate();
  const { user, loading, error, reload, logout } = usePatientSession();
  const [therapist, setTherapist] = useState(null);
  const [survey, setSurvey] = useState(null);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      getTherapistDetail(therapistId),
      getTherapistSurvey(therapistId).catch(() => null),
    ]).then(([details, onboarding]) => {
      if (!active) return;
      setTherapist(details);
      setSurvey(onboarding?.survey || onboarding);
    }).catch((err) => { if (active) setProfileError(err.message || 'Could not load therapist profile.'); });
    return () => { active = false; };
  }, [therapistId]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  const schedule = (therapist?.availability || []).reduce((groups, slot) => {
    (groups[slot.dayOfWeek] ||= []).push(slot);
    return groups;
  }, {});
  const specializations = therapist?.expertise?.length ? therapist.expertise : survey?.specializations || [];

  return (
    <PatientDashboardLayout active="find-therapist" user={user} onLogout={logout}>
      <button type="button" onClick={() => navigate('/dashboard/find-therapist')} className="mb-5 text-sm font-semibold text-[#0A6976] hover:underline">← Find your therapist</button>
      {profileError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">{profileError}</div> : !therapist ? <PortalLoading /> : (
        <div className="overflow-hidden rounded-lg border border-[#E85D35] bg-white">
          <section className="grid grid-cols-1 gap-7 bg-[#e8f5fb] p-6 md:grid-cols-[280px_1fr] md:p-8">
            <div className="h-72 overflow-hidden border border-[#E85D35] bg-white">
              {therapist.avatarUrl ? <img src={therapist.avatarUrl} alt={therapist.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl font-bold text-[#d65b38]">{therapist.name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</div>}
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-2xl font-bold text-slate-900">{therapist.name}</h1>
              <p className="mt-2 text-sm font-medium text-slate-700">{therapist.profile?.experience || therapist.profile?.profession || 'Therapist'}</p>
              <div className="mt-6 grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Specialization</p>
                  <p className="mt-1 text-slate-800">{specializations.length ? specializations.join(', ') : therapist.profile?.profession || 'Music therapy'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Experience</p>
                  <p className="mt-1 text-slate-800">{therapist.experienceYears ?? '—'}{therapist.experienceYears != null ? ' years' : ''}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Clinic / location</p>
                  <p className="mt-1 text-slate-800">{therapist.location || 'Location not provided'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Session fee</p>
                  <p className="mt-1 text-slate-800">{therapist.fee != null ? `₹${therapist.fee}` : 'Contact for details'}</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate(`/dashboard/book-session?therapistId=${encodeURIComponent(therapist.id)}`)} className="mt-7 w-fit rounded-md bg-[#0F8594] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0F8594]">Book appointment</button>
            </div>
          </section>

          <section className="px-6 py-7 md:px-8">
            <h2 className="text-lg font-bold text-slate-900">Overview</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{therapist.bio || survey?.bio || `${therapist.name} is a ${therapist.profile?.profession || 'wellbeing'} professional with ${therapist.experienceYears || 'clinical'} experience.`}</p>
            {schedule && Object.keys(schedule).length > 0 && (
              <div className="mt-7 border-t border-black/5 pt-6">
                <h2 className="text-base font-bold text-slate-900">Regular availability</h2>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(schedule).sort(([a], [b]) => Number(a) - Number(b)).map(([day, slots]) => (
                    <div key={day} className="rounded-md bg-[#f8fafb] px-3 py-2.5 text-sm">
                      <p className="font-semibold text-slate-800">{DAYS[Number(day)] || 'Day'}</p>
                      <p className="mt-1 text-xs text-slate-500">{slots.map((slot) => `${slot.startTime}–${slot.endTime}`).join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </PatientDashboardLayout>
  );
}
