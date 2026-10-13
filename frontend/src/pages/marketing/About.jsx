import PublicNav from '../../components/public/PublicNav';
import { Link } from 'react-router-dom';
import { ANAHAT_SERVICES } from '../../constants/services';

const TEAL = '#0F8594';

export default function About() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FDF6EE] text-slate-900 font-sans">
      <PublicNav tone="light" />

      <main className="flex-1 pt-28 pb-20">
        <section className="max-w-5xl mx-auto px-6">
          <div className="bg-white rounded-[2rem] shadow-sm border border-black/5 p-8 md:p-14 grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-10 items-center">
            <div>
              <Link to="/" aria-label="Anahat Transformations home"><img src="/assets/anahat-logo.png" alt="Anahat Transformations" className="w-28 h-28 object-contain mb-6" /></Link>
              <h1 className="font-serif text-4xl md:text-5xl font-semibold leading-tight" style={{ color: TEAL }}>About us</h1>
              <p className="text-slate-500 mt-3 text-sm">Tune. Heal. Transform.</p>
            </div>
            <div className="space-y-4 text-slate-700 leading-relaxed">
              <p>
                Anahat Transformations is a music-therapy practice built on Indian classical raags. Every raag carries a
                mood and a time of day; we pair that knowledge with modern listening protocols so the music you hear is
                chosen for what you are going through — not what is trending.
              </p>
              <p>
                A qualified therapist listens first, then prescribes a personalised programme: assigned tracks, simple daily
                practices, and regular check-ins. Progress is tracked week by week so both you and your therapist can see
                what is changing.
              </p>
              <p>
                Whether it is stress, anger, sleep, focus, pregnancy or support for a loved one in your care, there is a
                programme for it — and a person on the other side who reads every feedback you send.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 mt-14">
          <h2 className="font-serif text-3xl font-semibold text-slate-900 mb-2">How therapy works</h2>
          <p className="text-slate-500 text-sm mb-8">Three steps, one therapist who stays with you.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              ['Tell us what weighs on you', 'A short intake form in your own words, so your therapist understands what you actually need.'],
              ['Meet your therapist', 'Book a session with a therapist you choose. They listen, then prescribe raags and simple daily practices.'],
              ['Listen, practise, check in', 'Assigned tracks in your Music Library, daily activities, and a weekly check-in your therapist reads.'],
            ].map(([title, body], i) => (
              <div key={title} className="bg-white rounded-3xl border border-black/5 p-6">
                <div className="w-9 h-9 rounded-full text-white flex items-center justify-center font-bold mb-4" style={{ background: TEAL }}>{i + 1}</div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 mt-14">
          <h2 className="font-serif text-3xl font-semibold text-slate-900 mb-2">Our programmes</h2>
          <p className="text-slate-500 text-sm mb-8">Each one is designed around a single need.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {ANAHAT_SERVICES.map((s) => (
              <figure key={s.key} className="rounded-2xl overflow-hidden bg-white border border-black/5 shadow-sm">
                <img src={s.image} alt={`${s.name} — music therapy for ${s.focus.toLowerCase()}`} className="w-full aspect-square object-cover" loading="lazy" />
              </figure>
            ))}
          </div>
        </section>
      </main>

    </div>
  );
}
