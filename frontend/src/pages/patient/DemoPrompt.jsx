import { useNavigate } from 'react-router-dom';
import { PageShell, Card, PrimaryButton, OutlineButton } from '../../components/ui/Kit';

// Shown once, right after patient registration (never during login). "Yes"
// leads into the existing self-guided AI demo (the same experience as the
// "Self Therapy" journey option) so nothing new/duplicate had to be built;
// "No" goes straight to the demographic form.
export default function DemoPrompt() {
  const navigate = useNavigate();

  return (
    <PageShell>
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-lg w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-sunset-soft border border-sunset flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-sunset" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 mb-2">Welcome to Anahat</h1>
          <p className="text-sm text-slate-600 leading-relaxed mb-8">
            Before we get your profile set up, would you like a quick guided demo of how Anahat works?
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <OutlineButton onClick={() => navigate('/onboarding', { replace: true })}>
              No, take me to my profile
            </OutlineButton>
            <PrimaryButton onClick={() => navigate('/chat', { replace: true })}>
              Yes, show me a demo
            </PrimaryButton>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
