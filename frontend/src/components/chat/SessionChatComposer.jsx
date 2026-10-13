import { useEffect, useRef, useState } from 'react';

export default function SessionChatComposer({ value, onChange, onSend, onUpload, disabled = false, placeholder = 'Type a message' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const upload = async (file) => {
    if (!file || !onUpload) return;
    setUploading(true);
    setStatus('');
    try {
      await onUpload(file);
      setStatus(`${file.name} uploaded to patient documents.`);
    } catch (error) {
      setStatus(error.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      window.setTimeout(() => setStatus(''), 5000);
    }
  };

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus('Voice input is not supported in this browser.');
      window.setTimeout(() => setStatus(''), 4000);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = true;
    const startingValue = value;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join(' ').trim();
      onChange([startingValue.trim(), transcript].filter(Boolean).join(' '));
    };
    recognition.onerror = () => setStatus('Could not access the microphone. Check browser permissions.');
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="w-full">
      {status && <p role="status" className="mb-2 px-1 text-xs text-slate-500">{status}</p>}
      <div className="flex w-full items-end gap-2 border border-black/[0.12] bg-white p-2 focus-within:border-[#0F8594]/60">
        <button type="button" onClick={onSend} disabled={disabled || !value.trim()} aria-label="Send message" title="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0F8594] text-white transition hover:bg-[#0A6976] disabled:cursor-not-allowed disabled:opacity-40">
          <SendIcon />
        </button>
        <button type="button" onClick={toggleVoice} disabled={disabled} aria-label={listening ? 'Stop voice input' : 'Dictate message'} title={listening ? 'Stop voice input' : 'Dictate message'} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition disabled:opacity-40 ${listening ? 'bg-[#FCE9DF] text-[#D65B38]' : 'text-slate-600 hover:bg-slate-100'}`}>
          <MicrophoneIcon />
        </button>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend(); } }}
          disabled={disabled}
          rows={1}
          placeholder={placeholder}
          className="max-h-32 min-h-10 min-w-0 flex-1 resize-y bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400 disabled:text-slate-400"
        />
        <div className="relative shrink-0">
          {menuOpen && <div className="absolute bottom-12 right-0 z-30 w-44 border border-black/10 bg-white py-1 shadow-lg">
            <button type="button" onClick={() => { setMenuOpen(false); cameraInputRef.current?.click(); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><CameraIcon />Use camera</button>
            <button type="button" onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><PaperclipIcon />Attach files</button>
          </div>}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} />
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt" className="hidden" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} />
          <button type="button" onClick={() => setMenuOpen((open) => !open)} disabled={disabled || uploading} aria-label={uploading ? 'Uploading file' : 'Add attachment'} title={uploading ? 'Uploading file' : 'Add attachment'} className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">
            {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0F8594]" /> : <PlusIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

function SendIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>; }
function MicrophoneIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8" /></svg>; }
function CameraIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="4" /></svg>; }
function PaperclipIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.4 11.1-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9.8 17.1a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>; }
function PlusIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }