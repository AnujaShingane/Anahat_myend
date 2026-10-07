import { EmptyState } from '../../../../components/ui/Kit';

export default function AuditLogsTab({ audit }) {
  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Audit & Security Log</h1>
        <p className="text-slate-500 text-sm mt-1">Every recorded system and account action, most recent first.</p>
      </div>
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        {audit.length === 0 ? (
          <EmptyState title="No activity logged yet" />
        ) : (
          <div className="space-y-2">
            {audit.map((a) => (
              <div key={a.id} className="flex justify-between text-xs bg-black/[0.03] rounded-lg px-4 py-2.5">
                <span><strong>{a.action}</strong> — {a.actor} {a.detail && Object.keys(a.detail).length > 0 && `(${JSON.stringify(a.detail)})`}</span>
                <span className="text-slate-400 shrink-0 ml-3">{new Date(a.createdAt || a.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
