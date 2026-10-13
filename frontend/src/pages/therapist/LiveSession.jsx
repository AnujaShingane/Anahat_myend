import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import NadikaOfflineSession from './NadikaOfflineSession';
import { getProfile, getMyTherapistPatients } from '../../services/api';

/* =========================================================
   LIVE SESSION (therapist side)

   There is only ONE interface here, for both online and offline
   appointments: the therapist <-> Nadika.ai assessment chat
   (NadikaOfflineSession). For an online appointment the patient is on the
   external meeting link (Google Meet/Zoom) they/the therapist set at
   booking — this app has no internal patient<->therapist chat window at
   all anymore. The therapist talks to the patient over that external call
   and enters the patient's responses into Nadika here, exactly as they
   would in person.
========================================================= */

export default function LiveSession() {
  const [searchParams] = useSearchParams();
  const appointmentIdParam = searchParams.get('appointment');
  const { patientId } = useParams();

  const [patientName, setPatientName] = useState('Patient');

  useEffect(() => {
    getMyTherapistPatients()
      .then((appts) => {
        const u = appts.find((a) => a.patient?.id === patientId)?.patient;
        if (u) setPatientName([u.firstName, u.lastName].filter(Boolean).join(' ') || 'Patient');
      })
      .catch((err) => console.error('Failed to load patient from appointments:', err));
    getProfile(patientId)
      .then((profile) => { if (profile?.fullName) setPatientName(profile.fullName); })
      .catch((err) => console.error('Failed to load patient profile:', err));
  }, [patientId]);

  return <NadikaOfflineSession patientId={patientId} patientName={patientName} appointmentId={appointmentIdParam} />;
}
