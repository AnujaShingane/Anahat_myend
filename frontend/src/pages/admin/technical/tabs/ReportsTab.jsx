import { Badge, EmptyState } from '../../../../components/ui/Kit';

// The legacy AdminConsole "Feedback" tab (patient/therapist feedback, bug
// reports, feature requests) lives here now — it's a technical/product
// concern, distinct from the clinical session reports that Anahat Admin >
// Reports shows. Same data (getFeedbackList/respondToFeedback), same logic.
export default function ReportsTab({ feedback, onRespond }) {
  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Reports</h1>
        <p className="text-slate-500 text-sm mt-1">Feedback, bug reports, and feature requests submitted across the app.</p>
      </div>
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        {feedback.length === 0 ? (
          <EmptyState title="No feedback yet" subtitle="Patient feedback, therapist feedback, bug reports, and feature requests will appear here." />
        ) : (
          <div className="space-y-3">
            {feedback.map((f) => (
              <div key={f.id} className="bg-black/[0.03] rounded-xl px-4 py-3">
                <div className="flex justify-between mb-1">
                  <Badge tone="slate">{f.type || 'Feedback'}</Badge>
                  <Badge tone={f.status === 'resolved' ? 'emerald' : 'sunset'}>{f.status}</Badge>
                </div>
                <p className="text-sm text-slate-700 mb-2">{f.message}</p>
                {f.status !== 'resolved' && (
                  <button onClick={() => onRespond(f.id, 'Thank you — noted by the team.')} className="text-xs font-bold text-sunset">Mark Resolved</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
