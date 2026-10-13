import { useEffect, useState } from 'react';
import { Badge, EmptyState } from '../../../../components/ui/Kit';
import { adminListTracks, adminCreateTrack, adminDeleteTrack } from '../../../../services/api';

const CHAKRA_OPTIONS = ['', 'Root', 'Sacral', 'Solar Plexus', 'Heart', 'Throat', 'Third Eye', 'Crown'];
const EMPTY_FORM = { title: '', artist: '', chakra: '', category: 'therapy', mode: 'url', audioUrl: '', file: null };

export default function AudioTracksTab() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    setLoading(true);
    adminListTracks()
      .then(setTracks)
      .catch((err) => console.error('Failed to load tracks:', err))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (form.mode === 'url' && !form.audioUrl.trim()) { setError('Add an audio URL, or switch to file upload.'); return; }
    if (form.mode === 'file' && !form.file) { setError('Choose an audio file, or switch to URL.'); return; }
    setSaving(true);
    setError('');
    try {
      await adminCreateTrack({
        title: form.title.trim(),
        artist: form.artist.trim(),
        chakra: form.chakra || undefined,
        category: form.category,
        audioUrl: form.mode === 'url' ? form.audioUrl.trim() : undefined,
        file: form.mode === 'file' ? form.file : undefined,
      });
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      setError(err.message || 'Could not add track.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (id) => {
    if (!window.confirm('Remove this track? Patients will no longer see it in the Music Library.')) return;
    adminDeleteTrack(id).then(refresh).catch((err) => console.error('Failed to delete track:', err));
  };

  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Audio Tracks</h1>
        <p className="text-slate-500 text-sm mt-1">Add or remove tracks in the Music Library — by external URL or direct upload.</p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-3xl border border-black/5 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Track title"
              className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Artist (optional)</label>
            <input value={form.artist} onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))} placeholder="Artist / performer"
              className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Category</label>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm">
              <option value="therapy">Therapy</option>
              <option value="relaxation">Relaxation</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Chakra (optional)</label>
            <select value={form.chakra} onChange={(e) => setForm((f) => ({ ...f, chakra: e.target.value }))}
              className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm">
              {CHAKRA_OPTIONS.map((c) => <option key={c} value={c}>{c || 'None'}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => setForm((f) => ({ ...f, mode: 'url' }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${form.mode === 'url' ? 'bg-slate-900 text-white' : 'bg-black/[0.04] text-slate-500'}`}>
              Add via URL
            </button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, mode: 'file' }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${form.mode === 'file' ? 'bg-slate-900 text-white' : 'bg-black/[0.04] text-slate-500'}`}>
              Upload file
            </button>
          </div>
          {form.mode === 'url' ? (
            <input value={form.audioUrl} onChange={(e) => setForm((f) => ({ ...f, audioUrl: e.target.value }))} placeholder="https://..."
              className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
          ) : (
            <input type="file" accept="audio/*" onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              className="w-full text-sm" />
          )}
          <p className="text-[11px] text-slate-400 mt-1">Uploads accept MP3, WAV, OGG or M4A, up to 25MB.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50">
          {saving ? 'Adding…' : '+ Add Track'}
        </button>
      </form>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : tracks.length === 0 ? (
          <EmptyState title="No tracks yet" subtitle="Tracks added here appear in the patient Music Library and Relaxation player." />
        ) : (
          <div className="space-y-2">
            {tracks.map((t) => (
              <div key={t._id || t.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3 gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-800 truncate">{t.title}{t.artist ? ` — ${t.artist}` : ''}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {t.category}{t.chakra ? ` · ${t.chakra}` : ''} · {t.fileId ? 'Uploaded file' : t.audioUrl ? 'External URL' : 'No audio source'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge tone={t.category === 'relaxation' ? 'sunset' : 'emerald'}>{t.category}</Badge>
                  <button onClick={() => remove(t._id || t.id)} className="text-xs font-bold text-red-500">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
