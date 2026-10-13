import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { addDocument, getDocuments } from '../../services/api';
import { PageShell, Card, SectionHeading, PrimaryButton, Badge } from '../../components/ui/Kit';

const CATEGORIES = ['Previous Report', 'Blood Report', 'Medical History', 'Doctor Prescription', 'Other Supporting Document'];

export default function DocumentUpload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [category, setCategory] = useState(CATEGORIES[0]);

  useEffect(() => {
    getDocuments(user.id).then(setDocs).catch((err) => console.error('Failed to load documents:', err));
  }, [user.id]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList);
    let updated = docs;
    for (const f of files) {
      try {
        updated = await addDocument(user.id, { file: f, name: f.name, size: f.size, category });
      } catch (err) {
        console.error('Failed to upload document:', err);
      }
    }
    setDocs(updated);
  };

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <SectionHeading
          eyebrow="Professional Consultation · Step 1 of 3"
          title="Upload Supporting Documents"
          subtitle="These become available to the therapist assigned to your consultation."
        />

        <Card className="mb-6">
          <div className="flex flex-wrap gap-2 mb-6">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide border transition-all ${
                  category === c ? 'bg-slate-900 text-white border-slate-900' : 'border-black/10 text-slate-500 hover:border-sunset'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <label className="block border-2 border-dashed border-sunset rounded-2xl p-10 text-center cursor-pointer bg-sunset-soft hover:bg-sunset-soft/80 transition-all">
            <input type="file" multiple className="hidden" onChange={(e) => e.target.files.length && handleFiles(e.target.files)} />
            <svg className="w-10 h-10 mx-auto text-sunset mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="font-bold text-slate-800">Click to upload, or drag files here</p>
            <p className="text-xs text-slate-500 mt-1">Uploading as: {category}</p>
          </label>

          {docs.length > 0 && (
            <div className="mt-6 space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{d.name}</p>
                    <p className="text-[11px] text-slate-500">{(d.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Badge tone="slate">{d.category}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex justify-between">
          <button onClick={() => navigate(-1)} className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-sunset">Back</button>
          <PrimaryButton onClick={() => navigate('/consultation')}>
            {docs.length ? 'Continue' : 'Skip for Now'}
          </PrimaryButton>
        </div>
      </div>
    </PageShell>
  );
}
