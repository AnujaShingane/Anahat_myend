import { useState } from 'react';
import { SAGE_DARK } from '../../../components/layout/TherapistDashboardLayout';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Weekly availability + blocked dates, shown on the therapist dashboard.
// This is the only place slots are managed — it directly controls what
// patients can book.
export default function AvailabilityCard({ availability = [], blockedDates = [], onAddSlot, onRemoveSlot, onAddBlockedDate, onRemoveBlockedDate, locked }) {
  const [day, setDay] = useState(1);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('13:00');
  const [blockDate, setBlockDate] = useState('');

  const byDay = WEEKDAYS.map((label, i) => ({ label, i, slots: availability.filter((s) => s.dayOfWeek === i) }));

  return (
    <div className="td-surface td-animate-in bg-white rounded-3xl border border-black/5 p-6 md:p-7">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="font-serif font-bold text-xl text-slate-900">Your availability</h2>
          <p className="text-xs text-slate-500 mt-1">Patients can only book inside these windows. Block a date to take it off entirely.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Weekly grid */}
        <div>
          <div className="grid grid-cols-7 gap-2 mb-4">
            {byDay.map((d) => (
              <div key={d.label} className="rounded-2xl border border-black/5 p-2 min-h-[92px]" style={{ background: d.slots.length ? '#F1F7F3' : '#FBFAF6' }}>
                <p className="text-[11px] font-bold text-slate-600 text-center mb-1.5">{d.label}</p>
                <div className="space-y-1">
                  {d.slots.map((s) => (
                    <div key={s.id} className="group text-[10px] font-bold text-slate-700 bg-white rounded-lg px-1.5 py-1 flex items-center justify-between gap-1">
                      <span>{s.startTime}–{s.endTime}</span>
                      {!locked && <button onClick={() => onRemoveSlot(s.id)} className="text-red-400 hover:text-red-600" aria-label="Remove slot">✕</button>}
                    </div>
                  ))}
                  {d.slots.length === 0 && <p className="text-[10px] text-slate-300 text-center">—</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 block mb-1">Day</label>
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm">
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 block mb-1">From</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 block mb-1">To</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
            </div>
            <button disabled={locked} onClick={() => onAddSlot(day, start, end)} className="px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest text-white disabled:opacity-40" style={{ background: SAGE_DARK }}>
              Add slot
            </button>
          </div>
        </div>

        {/* Blocked dates */}
        <div className="rounded-2xl border border-black/5 p-4" style={{ background: '#FBFAF6' }}>
          <p className="text-sm font-bold text-slate-800 mb-1">Blocked dates</p>
          <p className="text-[11px] text-slate-500 mb-3">Leave, holidays, or a day you just need off.</p>
          <div className="flex gap-2 mb-3">
            <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="flex-1 min-w-0 px-3 py-2 bg-white border border-black/10 rounded-xl text-sm" />
            <button disabled={locked || !blockDate} onClick={() => { onAddBlockedDate(blockDate); setBlockDate(''); }} className="px-3 py-2 rounded-xl font-bold text-xs uppercase tracking-widest border disabled:opacity-40" style={{ borderColor: SAGE_DARK, color: SAGE_DARK }}>
              Block
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {blockedDates.length === 0 ? <p className="text-xs text-slate-400">None blocked.</p> : blockedDates.map((d) => (
              <span key={d.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-[11px] font-bold text-red-600">
                {d.date}
                {!locked && <button onClick={() => onRemoveBlockedDate(d.id)} className="hover:text-red-800">✕</button>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
