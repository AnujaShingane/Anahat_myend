import { useEffect, useState } from 'react';
import { Badge } from '../../../../components/ui/Kit';
import { adminGetSystemInfo } from '../../../../services/api';

function StatusRow({ label, ok, okText, badText }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-black/5 last:border-0">
      <p className="text-sm text-slate-700">{label}</p>
      <Badge tone={ok ? 'emerald' : 'red'}>{ok ? okText : badText}</Badge>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-black/5 last:border-0">
      <p className="text-sm text-slate-700">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

const formatUptime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};

// Real, live-checked backend/system status (GET /api/admin/system-info) —
// database connectivity, environment, uptime, and account counts by role.
// Replaces a set of unwired placeholder panels that showed no real data.
export default function SystemTab() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminGetSystemInfo()
      .then((data) => { setInfo(data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="pt-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif font-bold text-2xl text-slate-900">System</h1>
          <p className="text-slate-500 text-sm mt-1">Live backend health, environment, and platform-wide account counts.</p>
        </div>
        <button onClick={load} className="text-xs font-bold text-sunset">{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-2xl p-4">
          Couldn't reach the backend to load system status: {error}
        </div>
      )}

      {info && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h3 className="font-serif font-bold text-lg mb-2">Backend Status</h3>
            <StatusRow label="PostgreSQL" ok={info.postgresConnected} okText="Connected" badText="Unreachable" />
            <StatusRow label="MongoDB" ok={info.mongoConnected} okText="Connected" badText="Unreachable" />
            <StatusRow label="Google OAuth" ok={info.googleOAuthConfigured} okText="Configured" badText="Not configured" />
            <InfoRow label="Environment" value={info.nodeEnv} />
            <InfoRow label="Port" value={info.port} />
            <InfoRow label="Uptime" value={formatUptime(info.uptimeSeconds)} />
            <InfoRow label="Server Time" value={new Date(info.serverTime).toLocaleString()} />
          </div>

          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h3 className="font-serif font-bold text-lg mb-2">Platform Accounts</h3>
            <InfoRow label="Patients" value={info.counts.patients} />
            <InfoRow label="of which Caretakers" value={info.counts.caregivers} />
            <InfoRow label="Therapists" value={info.counts.therapists} />
            <InfoRow label="Anahat Admins" value={info.counts.admins} />
            <InfoRow label="Total Appointments" value={info.counts.appointments} />
            <InfoRow label="Total Payments" value={info.counts.payments} />
          </div>
        </div>
      )}
    </div>
  );
}
