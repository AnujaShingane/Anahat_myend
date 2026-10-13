export default function SettingsTab({ onLogout }) {
  return (
    <div className="pt-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Account settings for this Technical Admin session.</p>
      </div>
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-3">Account</h3>
        <button onClick={onLogout} className="text-sm font-bold text-red-500 hover:text-red-600">Logout</button>
      </div>
    </div>
  );
}
