import { Link, useSearchParams } from 'react-router-dom';
import PublicNav from '../../components/public/PublicNav';
import PublicFooter from '../../components/public/PublicFooter';
import { useRaagPlayer } from '../../hooks/useRaagPlayer';
import { useAuth } from '../../context/AuthContext';

const PRACTICE_PREVIEWS = {
  frustration: { title: 'Release Frustration', focus: 'Emotional reset', description: 'Let a slow, steady listening practice soften tension and make room for a calmer response.', hue: 25 },
  emotions: { title: 'Balance Your Emotions', focus: 'Emotional balance', description: 'A gentle listening practice to settle emotional intensity and return to a steadier rhythm.', hue: 195 },
  mood: { title: 'Lift Your Mood', focus: 'Mood support', description: 'Take a mindful pause with warm, measured tones designed to make space for a lighter moment.', hue: 150 },
  anxiety: { title: 'Ease Anxiety', focus: 'Calm and grounding', description: 'Follow an unhurried listening practice and bring attention back to the present moment.', hue: 190 },
  sleep: { title: 'Invite Sleep', focus: 'Rest and relaxation', description: 'A quiet evening practice to help the body settle and prepare for rest.', hue: 240 },
  focus: { title: 'Return to Focus', focus: 'Mindful attention', description: 'Use a steady tonal bed to pause distractions and bring your attention gently back.', hue: 210 },
};

const DEFAULT_PREVIEW = {
  title: 'Begin Your Free Trial',
  focus: 'A first, unhurried listening session',
  description: 'Experience one complete Anahat session — personalized music guidance built around present-moment awareness — before you commit to anything.',
  hue: 195,
};

export default function DemoPage() {
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedPractice = searchParams.get('practice');
  const preview = PRACTICE_PREVIEWS[requestedPractice?.toLowerCase()] || DEFAULT_PREVIEW;
  const player = useRaagPlayer([{ name: preview.title, length: '20:00', hue: preview.hue }]);

  const highlights = [
    { title: 'No commitment', body: 'A full, complimentary session — no card, no obligation.' },
    { title: 'Guided by you', body: 'Choose the focus that matches how you feel right now.' },
    { title: 'Continue anytime', body: 'Like it? Carry the same account straight into a full plan.' },
  ];

  return (
    <div className="min-h-screen bg-[#FDF6EE] text-[#292D32]">
      <PublicNav />
      <main className="pt-28 pb-24">
        <section className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0A6976]">Start a Free Trial</p>
            <h1 className="mt-4 font-display text-4xl sm:text-5xl font-semibold text-[#292D32] leading-[1.15]">
              A calmer moment,<br className="hidden sm:block" /> made for you.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-[#5b666c]">
              Try a music-led {preview.focus.toLowerCase()} practice with Anahat. Sign in to begin, and your
              session stays connected to your account from the very first note.
            </p>
            {requestedPractice && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/70 border border-black/[0.06] px-4 py-1.5 text-xs font-semibold text-[#0A6976]">
                Practice selected: {preview.title}
              </p>
            )}
          </div>

          <div className="mt-14 grid overflow-hidden rounded-[28px] border border-black/[0.06] bg-white shadow-[0_30px_70px_-40px_rgba(15,23,42,0.35)] lg:grid-cols-[1.05fr_1fr]">
            <div className="relative flex min-h-72 items-center justify-center overflow-hidden bg-gradient-to-br from-[#eef6f6] via-[#f4f0e8] to-[#f9e9de] p-10 lg:min-h-full">
              <div className="absolute -top-16 -left-10 h-56 w-56 rounded-full bg-[#0F8594]/10 blur-3xl" aria-hidden="true" />
              <div className="absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-[#E85D35]/10 blur-3xl" aria-hidden="true" />
              <img
                src="/assets/FREE-Trial.png"
                alt={`${preview.title} artwork`}
                className="relative max-h-80 w-full max-w-sm object-contain drop-shadow-xl"
              />
            </div>
            <div className="flex flex-col justify-center px-8 py-10 sm:px-12 sm:py-12">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0A6976]">{preview.focus}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-[#292D32]">{preview.title}</h2>
              <p className="mt-4 text-sm leading-relaxed text-[#5b666c]">{preview.description}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#9aa3a8]">20 minutes · Complimentary trial session</p>

              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => (player.playing ? player.toggle() : player.select(0))}
                  className="mt-8 inline-flex w-fit items-center gap-2.5 rounded-full bg-[#0F8594] px-7 py-3.5 text-sm font-bold text-white shadow-[0_14px_30px_-12px_rgba(15,133,148,0.5)] transition hover:bg-[#0A6976] hover:-translate-y-0.5"
                >
                  <span aria-hidden="true">{player.playing ? 'Ⅱ' : '▶'}</span>{player.playing ? 'Pause session' : 'Play free trial'}
                </button>
              ) : (
                <div className="mt-8 flex flex-wrap items-center gap-5">
                  <Link to="/login" state={{ from: '/demo' }} className="inline-flex items-center rounded-full bg-[#0F8594] px-7 py-3.5 text-sm font-bold text-white shadow-[0_14px_30px_-12px_rgba(15,133,148,0.5)] transition hover:bg-[#0A6976] hover:-translate-y-0.5">
                    Log in to begin
                  </Link>
                  <Link to="/register" className="text-sm font-bold text-[#0A6976] underline underline-offset-4">Create a free account</Link>
                </div>
              )}
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {highlights.map((h) => (
              <div key={h.title} className="rounded-2xl border border-black/[0.06] bg-white/70 px-6 py-6">
                <p className="font-display text-base font-semibold text-[#292D32]">{h.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#5b666c]">{h.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
