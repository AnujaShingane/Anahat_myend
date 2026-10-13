import { useEffect, useMemo, useState } from 'react';
import { initialsOf } from '../../utils/initials';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getMyTherapistPatients, getMyAppointments, getMyTherapistPayments,
  getPatientOnboarding, getReportHistory, getSessionHistory, getWeeklyFeedback,
  getMoodEntries, getTherapyRecord, saveTherapyRecord, approveReport,
  getActivityPlan, setActivityPlan, getActivityLog, getDocuments, getListeningLog, getTrackHistory,
} from '../../services/api';
import { getProgressSummary, getActivityProgressSummary, isAppointmentPast, parseAppointmentDateTime } from '../../utils/derived';
import { PageShell, Card, Tabs, Badge, StatusBadge, PrimaryButton, TextAreaField, TextField, EmptyState } from '../../components/ui/Kit';
import BackButton from '../../components/layout/BackButton';

const TEAL = '#0F8594';
const money = (n) => `\u20b9${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014');

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sessions', label: 'Sessions & Reports' },
  { key: 'payments', label: 'Payments' },
  { key: 'progress', label: 'Progress' },
  { key: 'clinical', label: 'Clinical Notes' },
  { key: 'activities', label: 'Daily Activities' },
];

const BLANK_RECORD = {
  sessionNotes: '', aiReport: '', recommendations: '', clinicalNotes: '',
  music: '', meditation: '', lifestyle: '', schedule: '', frequency: '', duration: '', therapyNotes: '', status: 'draft',
};

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5 break-words">{value || '\u2014'}</p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1">{label}</p>
    </div>
  );
}

// Full record for one of this therapist's patients — the same view Anahat
// Admin gets, scoped to the sessions and payments made with this therapist.
export default function PatientProfile() {
  const { patientId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');

  const [patient, setPatient] = useState(null);
  const [seq, setSeq] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [reports, setReports] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [moods, setMoods] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [record, setRecord] = useState(BLANK_RECORD);
  const [activities, setActivities] = useState([]);
  const [newActivity, setNewActivity] = useState('');
  const [activityLog, setActivityLog] = useState([]);
  const [listeningLog, setListeningLog] = useState([]);
  const [trackHistory, setTrackHistory] = useState([]);

  useEffect(() => {
    getMyTherapistPatients().then((appts) => {
      // Sequence number = order of first booking with this therapist.
      const first = {};
      const users = {};
      appts.forEach((a) => {
        if (!a.patient) return;
        users[a.patient.id] = a.patient;
        const at = new Date(a.createdAt || `${a.date}T00:00:00`).getTime();
        if (!first[a.patient.id] || at < first[a.patient.id]) first[a.patient.id] = at;
      });
      const order = Object.keys(first).sort((a, b) => first[a] - first[b]);
      const idx = order.indexOf(patientId);
      setSeq(idx >= 0 ? idx + 1 : null);
      const u = users[patientId];
      if (u) setPatient({ ...u, name: [u.firstName, u.lastName].filter(Boolean).join(' '), firstBookedAt: first[patientId] });
    }).catch((err) => console.error('Failed to load patient:', err));
    getMyAppointments().then((all) => setAppointments(all.filter((a) => (a.patient?.id || a.patientId) === patientId))).catch(() => {});
    getMyTherapistPayments().then((all) => setPayments(all.filter((p) => (p.patient?.id || p.patientId) === patientId))).catch(() => {});
    getPatientOnboarding(patientId).then(setOnboarding).catch(() => {});
    getReportHistory(patientId).then(setReports).catch(() => {});
    getSessionHistory(patientId).then((list) => setSessions(list.filter((s) => !s.therapistId || s.therapistId === user.id))).catch(() => {});
    getWeeklyFeedback(patientId).then((list) => setFeedback(list.slice().reverse())).catch(() => {});
    getMoodEntries(patientId).then(setMoods).catch(() => {});
    getDocuments(patientId).then(setDocuments).catch(() => {});
    getTherapyRecord(patientId).then((r) => setRecord(r || BLANK_RECORD)).catch(() => {});
    getActivityPlan(patientId).then(setActivities).catch(() => {});
    getActivityLog(patientId).then((log) => setActivityLog(log.slice().reverse())).catch(() => {});
    getListeningLog(patientId).then(setListeningLog).catch(() => {});
    getTrackHistory(patientId).then(setTrackHistory).catch(() => {});
  }, [patientId, user.id]);

  const pp = patient?.patientProfile || {};
  const ob = onboarding?.fields || {};
  const completed = appointments.filter((a) => a.status === 'completed').length;
  const paid = payments.filter((p) => p.status === 'paid');
  const totalPaid = paid.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const sortedAppointments = useMemo(() => [...appointments].sort((a, b) => new Date(`${b.date}T${b.startTime || '00:00'}`) - new Date(`${a.date}T${a.startTime || '00:00'}`)), [appointments]);
  const reportsFor = (apptId) => reports.filter((r) => r.report?.appointmentId === apptId || r.appointmentId === apptId);
  const summaryFor = (appt) => {
    const s = sessions.find((x) => x.appointmentId === appt.id || (x.endedAt && x.endedAt.slice(0, 10) === appt.date));
    return s?.summary || s?.notes || (s?.messages?.length ? `${s.messages.length} messages exchanged` : null);
  };

  const update = (key) => (e) => setRecord((r) => ({ ...r, [key]: e.target.value }));
  const saveDraft = () => saveTherapyRecord(patientId, record).then(setRecord).catch((err) => console.error(err));
  const approve = () => saveTherapyRecord(patientId, record).then(() => approveReport(patientId, user.name || 'therapist')).then(setRecord).then(() => getReportHistory(patientId).then(setReports)).catch((err) => console.error(err));
  const addActivity = () => {
    if (!newActivity.trim()) return;
    setActivityPlan(patientId, [...activities, { id: `act_${Date.now()}`, text: newActivity.trim() }]).then(setActivities).catch(() => {});
    setNewActivity('');
  };
  const removeActivity = (id) => setActivityPlan(patientId, activities.filter((a) => a.id !== id)).then(setActivities).catch(() => {});

  const name = patient?.name || 'Patient';
  const music = getProgressSummary(listeningLog);
  const acts = getActivityProgressSummary(activityLog);
  const ragas = new Set([...(listeningLog || []).map((l) => l.trackId || l.trackName || l.date), ...(trackHistory || []).flatMap((h) => h.trackIds || [])]).size;

  return (
    <PageShell showBack={false}>
      <div className="w-full space-y-4 px-4 py-4 pb-10 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-3">
          <BackButton to="/therapist" label="Back to patients" />
          <div className="flex gap-2">
            <button onClick={() => navigate(`/therapist?tab=messages&patient=${encodeURIComponent(patientId)}`)} className="px-4 py-2 rounded-lg text-xs font-bold border border-black/10 text-slate-700 hover:bg-black/[0.02]">Message</button>
            <button
              onClick={() => {
                // One entry point: the offline Nadika.ai session (created or resumed).
                const appt = [...appointments].filter((a) => a.status === 'confirmed' && !isAppointmentPast(a)).sort((a, b) => parseAppointmentDateTime(a) - parseAppointmentDateTime(b))[0];
                navigate(`/therapist/session/${patientId}?mode=offline${appt ? `&appointment=${appt.id}` : ''}`);
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white"
              style={{ background: TEAL }}
            >
              Start ANAHAT Session
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="flex min-h-[112px] w-full flex-col items-start justify-between gap-4 border-b border-black/10 bg-white px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-black/[0.04] flex items-center justify-center text-xl font-bold text-white shrink-0" style={{ background: TEAL }}>
              {patient?.avatarFileId ? <img src={`/api/profile/files/${patient.avatarFileId}`} alt={name} className="w-full h-full object-cover" /> : initialsOf(name)}
            </div>
            <div>
              <h1 className="font-serif font-bold text-xl text-slate-900">{name}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{patient?.email}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Patient {seq ? `#${seq}` : ''} · First booked {fmtDate(patient?.firstBookedAt)}</p>
            </div>
          </div>
          <Badge tone={record.status === 'approved' ? 'emerald' : 'sunset'}>{record.status === 'approved' ? 'Report approved' : 'Report in draft'}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-black/10 pb-4 md:grid-cols-4">
          <Stat label="Total sessions" value={appointments.length} />
          <Stat label="Sessions attended" value={completed} />
          <Stat label="Reports filed" value={reports.length} />
          <Stat label="Total payments" value={money(totalPaid)} />
        </div>

        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        <div className="mt-4 space-y-4">
          {tab === 'overview' && (
            <>
              <Card>
                <h3 className="font-serif font-bold text-lg mb-4">Demographic information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  <Field label="Form filled for" value={ob.formFor === 'care' ? 'Someone in their care' : ob.formFor === 'self' ? 'Self' : ''} />
                  {ob.formFor === 'care' && <Field label="Caregiver" value={`${ob.caregiverName || ''} (${ob.relationship || ''})`} />}
                  <Field label="Age" value={pp.age} />
                  <Field label="Gender" value={pp.gender || ob.gender} />
                  <Field label="Date of birth" value={ob.dob} />
                  <Field label="Blood group" value={ob.bloodGroup} />
                  <Field label="Phone" value={ob.phone} />
                  <Field label="Marital status" value={pp.maritalStatus} />
                  <Field label="Occupation" value={pp.occupation === 'Other' ? ob.otherOccupation : pp.occupation} />
                  <Field label="Education" value={ob.educationLevel === 'Other' ? ob.otherEducationLevel : ob.educationLevel} />
                  <Field label="City" value={ob.city} />
                  <Field label="Country" value={ob.country === 'Other' ? ob.otherCountry : ob.country} />
                  <Field label="Sleep pattern" value={ob.sleepPattern} />
                  <Field label="Referral" value={ob.referralSource === 'Doctor Referral' ? `Doctor: ${ob.referredDoctor}` : ob.referralSource === 'Other' ? ob.otherReferralSource : ob.referralSource} />
                  <div className="col-span-2 md:col-span-4"><Field label="Main concerns" value={pp.disease || (ob.concerns || []).join(', ')} /></div>
                  <div className="col-span-2 md:col-span-4"><Field label="Additional information" value={pp.problemDescription || ob.additionalInfo} /></div>
                </div>
              </Card>
              <Card>
                <h3 className="font-serif font-bold text-lg mb-4">Uploaded documents</h3>
                {documents.length === 0 && !pp.healthReportFileId ? <EmptyState title="No documents uploaded" /> : (
                  <div className="space-y-2">
                    {pp.healthReportFileId && (
                      <a href={`/api/profile/files/${pp.healthReportFileId}`} target="_blank" rel="noreferrer" className="flex justify-between bg-black/[0.03] rounded-xl px-4 py-3 text-sm hover:bg-black/[0.05]">
                        <span className="font-bold">Medical report (from registration)</span><Badge tone="slate">Open</Badge>
                      </a>
                    )}
                    {documents.map((d) => (
                      <div key={d.id} className="flex justify-between bg-black/[0.03] rounded-xl px-4 py-3 text-sm"><span className="font-bold">{d.name}</span><Badge tone="slate">{d.category}</Badge></div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}

          {tab === 'sessions' && (
            <Card>
              <h3 className="font-serif font-bold text-lg mb-1">Session history</h3>
              <p className="text-xs text-slate-500 mb-4">Every appointment with you, with its summary and the reports filed for it.</p>
              {sortedAppointments.length === 0 ? <EmptyState title="No sessions yet" /> : (
                <div className="space-y-3">
                  {sortedAppointments.map((a) => {
                    const rs = reportsFor(a.id);
                    const summary = summaryFor(a);
                    return (
                      <div key={a.id} className="h-[190px] overflow-hidden border-b border-black/10 px-3 py-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{a.date} at {a.startTime}</p>
                            <p className="text-xs text-slate-500">Booked {fmtDateTime(a.createdAt)}</p>
                          </div>
                          <StatusBadge status={a.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Session summary</p>
                            <p className="text-sm text-slate-700" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{summary || (a.status === 'completed' ? 'No summary recorded.' : 'Session not held yet.')}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Reports for this session</p>
                            {rs.length === 0 ? <p className="text-sm text-slate-400">None filed.</p> : rs.map((r) => (
                              <p key={r.id} className="truncate text-sm text-slate-700">• {r.report?.title || r.title || 'Report'} — {fmtDate(r.createdAt)}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {reports.length > 0 && (
                <div className="mt-6 pt-5 border-t border-black/5">
                  <h4 className="font-bold text-sm text-slate-700 mb-3">All reports ({reports.length})</h4>
                  <div className="space-y-2">
                    {reports.map((r) => (
                      <div key={r.id} className="flex h-12 items-center justify-between gap-3 border-b border-black/10 px-3 text-sm">
                        <span className="truncate font-bold">{r.report?.title || r.title || 'Therapy report'}</span>
                        <span className="text-slate-500">{fmtDate(r.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {tab === 'payments' && (
            <Card>
              <h3 className="font-serif font-bold text-lg mb-4">Payment history</h3>
              {payments.length === 0 ? <EmptyState title="No payments yet" /> : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3 text-sm">
                      <div>
                        <p className="font-bold text-slate-800">{money(p.amount)}</p>
                        <p className="text-xs text-slate-500">{fmtDateTime(p.createdAt)}{p.appointmentId ? ` · appointment ${String(p.appointmentId).slice(0, 8)}` : ''}</p>
                      </div>
                      <Badge tone={p.status === 'paid' ? 'emerald' : 'amber'}>{p.status}</Badge>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 text-sm font-bold text-slate-800"><span>Total paid</span><span>{money(totalPaid)}</span></div>
                </div>
              )}
            </Card>
          )}

          {tab === 'progress' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Raags listened" value={ragas} />
                <Stat label="Listening streak" value={`${music.streak}d`} />
                <Stat label="Listening days (7d)" value={`${music.weeklyCompleted}/7`} />
                <Stat label="Activity days (7d)" value={`${acts.weeklyCompleted}/7`} />
              </div>
              <Card>
                <h3 className="font-serif font-bold text-lg mb-1">Daily activities</h3>
                <p className="text-xs text-slate-500 mb-4">What the patient ticked off each day.</p>
                {activityLog.length === 0 ? <EmptyState title="No check-ins yet" /> : (
                  <div className="space-y-2">
                    {activityLog.slice(0, 14).map((entry) => {
                      const vals = Object.values(entry.responses || {});
                      const n = vals.filter(Boolean).length;
                      return (
                        <div key={entry.id} className="flex items-center gap-3 text-xs">
                          <span className="w-20 font-semibold text-slate-600 shrink-0">{entry.date}</span>
                          <div className="flex-1 h-2 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${vals.length ? (n / vals.length) * 100 : 0}%`, background: TEAL }} /></div>
                          <span className="w-10 text-right font-bold text-slate-700">{n}/{vals.length}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              <Card>
                <h3 className="font-serif font-bold text-lg mb-4">Weekly feedback</h3>
                {feedback.length === 0 ? <EmptyState title="No weekly check-ins yet" /> : (
                  <div className="space-y-3">
                    {feedback.map((f) => (
                      <div key={f.id} className="bg-black/[0.03] rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-500">{fmtDate(f.submittedAt)}</span>
                          <Badge tone="slate">{f.mood}</Badge>
                        </div>
                        <div className="text-xs text-slate-500 grid grid-cols-3 gap-2">
                          <span>Stress <b className="text-slate-700">{f.stressLevel}</b></span>
                          <span>Sleep <b className="text-slate-700">{f.sleepQuality}</b></span>
                          <span>Therapy <b className="text-slate-700">{f.effectiveness}</b></span>
                        </div>
                        {f.comments && <p className="text-sm text-slate-700 mt-2">{f.comments}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <h3 className="font-serif font-bold text-lg mb-4">Mood log</h3>
                {moods.length === 0 ? <EmptyState title="No mood entries yet" /> : (
                  <div className="space-y-2">
                    {moods.slice(0, 20).map((m) => (
                      <div key={m.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-2.5 text-sm">
                        <span className="font-bold text-slate-700">{m.mood}</span>
                        <span className="text-xs text-slate-500">{fmtDate(m.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}

          {tab === 'clinical' && (
            <Card className="space-y-5">
              <TextAreaField label="Session notes" rows={5} value={record.sessionNotes} onChange={update('sessionNotes')} placeholder="What did the patient share during the session?" />
              <TextAreaField label="Report (visible to patient once approved)" rows={5} value={record.aiReport} onChange={update('aiReport')} />
              <TextAreaField label="Recommendations" rows={3} value={record.recommendations} onChange={update('recommendations')} />
              <TextAreaField label="Private clinical notes" rows={3} value={record.clinicalNotes} onChange={update('clinicalNotes')} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextField label="Music recommendations" value={record.music} onChange={update('music')} placeholder="e.g. Raag Yaman, evenings" />
                <TextField label="Meditation" value={record.meditation} onChange={update('meditation')} />
                <TextField label="Lifestyle advice" value={record.lifestyle} onChange={update('lifestyle')} />
                <TextField label="Listening schedule" value={record.schedule} onChange={update('schedule')} />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={saveDraft} className="btn-sunset-outline px-6 py-3 rounded-2xl font-bold text-sm">Save draft</button>
                <PrimaryButton onClick={approve}>Approve &amp; send report</PrimaryButton>
              </div>
            </Card>
          )}

          {tab === 'activities' && (
            <>
              <Card>
                <h3 className="font-serif font-bold text-lg mb-4">Assigned activities</h3>
                <div className="flex gap-2 mb-5">
                  <TextField placeholder="e.g. Did you journal today?" value={newActivity} onChange={(e) => setNewActivity(e.target.value)} className="flex-1" />
                  <button onClick={addActivity} className="btn-sunset-outline px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest">Add</button>
                </div>
                {activities.length === 0 ? <EmptyState title="No activities assigned yet" /> : (
                  <div className="space-y-2">
                    {activities.map((a) => (
                      <div key={a.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3">
                        <p className="text-sm font-bold text-slate-800">{a.text}</p>
                        <button onClick={() => removeActivity(a.id)} className="text-xs font-bold text-red-500">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <h3 className="font-serif font-bold text-lg mb-4">Check-in history</h3>
                {activityLog.length === 0 ? <EmptyState title="No check-ins yet" /> : (
                  <div className="space-y-2">
                    {activityLog.slice(0, 14).map((entry) => {
                      const vals = Object.values(entry.responses || {});
                      return (
                        <div key={entry.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3 text-sm">
                          <span className="font-bold text-slate-700">{entry.date}</span>
                          <Badge tone={vals.length && vals.every(Boolean) ? 'emerald' : 'amber'}>{vals.filter(Boolean).length}/{vals.length} completed</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
