import { Badge, EmptyState } from '../../../../components/ui/Kit';

const ROLE_LABEL = { patient: 'Patient', therapist: 'Therapist', admin: 'Admin' };

// Real account directory (GET /api/admin/users — every role, straight from
// Postgres) with real suspend/reactivate (PATCH .../suspend, enforced at
// login and on every request) and delete. Accounts are only ever created
// through the real sign-up flow — there's no "create user" here, since a
// fabricated account with no password would be unusable and misleading.
export default function UsersTab({ users, onToggleSuspend, onRemove, currentUserId }) {
  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Patients</h1>
        <p className="text-slate-500 text-sm mt-1">Every patient account — {users.length} total. Suspending blocks login immediately. Therapist accounts are managed separately under Therapists.</p>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        {users.length === 0 ? (
          <EmptyState title="No users yet" subtitle="Accounts created through sign-up will appear here." />
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3 gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-800 truncate">{u.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {ROLE_LABEL[u.role] || u.role}{u.accountType === 'caregiver' ? ' \u00b7 Caregiver' : ''} \u00b7 {u.email}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {u.role === 'therapist' && (
                    <Badge tone={u.isApproved ? 'emerald' : 'amber'}>{u.isApproved ? 'Approved' : 'Pending'}</Badge>
                  )}
                  <Badge tone={u.isSuspended ? 'red' : 'emerald'}>{u.isSuspended ? 'Suspended' : 'Active'}</Badge>
                  {u.id !== currentUserId && (
                    <>
                      <button onClick={() => onToggleSuspend(u)} className="text-xs font-bold text-sunset">
                        {u.isSuspended ? 'Reactivate' : 'Suspend'}
                      </button>
                      <button onClick={() => onRemove(u.id)} className="text-xs font-bold text-red-500">Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
