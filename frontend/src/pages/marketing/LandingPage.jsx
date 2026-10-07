import { useState, useEffect, useRef } from 'react';  
import { Link, useLocation } from 'react-router-dom';  
import PublicNav from '../../components/public/PublicNav';  
import PublicFooter from '../../components/public/PublicFooter';  
import { ANAHAT_SERVICES } from '../../constants/services';  
import { RELAXATION_CONCERNS } from '../../constants/relaxationArtwork';  
import { useAuth } from '../../context/AuthContext';  
  
export default function LandingPage() {  
  const [scrollY, setScrollY] = useState(0);  
  const location = useLocation();  
  const { isAuthenticated } = useAuth();  
  
  // Nav turns solid once the visitor scrolls the window.  
  useEffect(() => {  
    const onScroll = () => setScrollY(window.scrollY);  
    window.addEventListener('scroll', onScroll, { passive: true });  
    return () => window.removeEventListener('scroll', onScroll);  
  }, []);  
  
  // Support /#services links coming from other pages.  
  useEffect(() => {  
    if (location.hash) {  
      const el = document.getElementById(location.hash.slice(1));  
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 80);  
    }  
  }, [location.hash]);  
  
  return (  
    <div className="home-page min-h-screen bg-[#fffdfa] text-[#303b42] font-sans selection:bg-[#f6c9b5]">  
      <PublicNav tone="light" scrolled={scrollY > 40} />  
  
      <main>  
        <section className="min-h-screen bg-[#fff8f3] pt-20">  
          <div className="max-w-7xl mx-auto min-h-[calc(100vh-5rem)] grid grid-cols-1 md:grid-cols-2 items-center gap-8 px-6 py-10 md:py-12">  
            <div className="py-4 md:py-8">  
              <div className="home-title-wrap relative w-fit">  
                <h1 className="home-title text-6xl sm:text-7xl lg:text-8xl xl:text-9xl font-bold leading-[0.95] tracking-tight text-[#303b42]">  
                  TUNE<br />  
                  <span className="tune-gradient">YOURSELF</span>  
                </h1>  
                <div className="music-notes" aria-hidden="true">  
                  <span className="music-note" style={{ '--note-x': '7%', '--note-y': '24%', '--note-size': '26px', '--note-color': '#d98f79', '--note-duration': '13s', '--note-delay': '-4s', '--note-rotate': '-12deg' }}>♪</span>  
                  <span className="music-note" style={{ '--note-x': '23%', '--note-y': '8%', '--note-size': '30px', '--note-color': '#aa829f', '--note-duration': '15s', '--note-delay': '-11s', '--note-rotate': '9deg' }}>♫</span>  
                  <span className="music-note" style={{ '--note-x': '48%', '--note-y': '25%', '--note-size': '23px', '--note-color': '#829db8', '--note-duration': '12s', '--note-delay': '-7s', '--note-rotate': '-7deg' }}>♬</span>  
                  <span className="music-note" style={{ '--note-x': '74%', '--note-y': '5%', '--note-size': '34px', '--note-color': '#cf8f89', '--note-duration': '16s', '--note-delay': '-13s', '--note-rotate': '14deg' }}>♪</span>  
                  <span className="music-note" style={{ '--note-x': '88%', '--note-y': '38%', '--note-size': '25px', '--note-color': '#d98f79', '--note-duration': '14s', '--note-delay': '-2s', '--note-rotate': '-9deg' }}>♪</span>  
                  <span className="music-note" style={{ '--note-x': '31%', '--note-y': '68%', '--note-size': '27px', '--note-color': '#9586b1', '--note-duration': '15s', '--note-delay': '-9s', '--note-rotate': '11deg' }}>♫</span>  
                  <span className="music-note" style={{ '--note-x': '66%', '--note-y': '76%', '--note-size': '23px', '--note-color': '#829db8', '--note-duration': '13s', '--note-delay': '-6s', '--note-rotate': '-14deg' }}>♪</span>  
                </div>  
              </div>  
              <p className="mt-6 max-w-lg text-sm sm:text-base leading-relaxed text-[#778087]">  
                Personalized music and AI-powered guidance for your mental, emotional and spiritual well-being.  
              </p>  
              <div className="mt-8 flex flex-wrap gap-3">  
                <button onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-3 rounded-full bg-[#e85d35] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#d84d2c]">  
                  Explore Our Services <ArrowRightIcon className="w-4 h-4" />  
                </button>  
                <Link to={isAuthenticated ? '/dashboard/find-therapist' : '/login'} className="inline-flex items-center gap-3 rounded-full border-2 border-[#e85d35] bg-transparent px-5 py-[10px] text-sm font-semibold text-[#d84d2c] transition hover:bg-[#e85d35] hover:text-white">  
                  Book a Consultation <ArrowRightIcon className="w-4 h-4" />  
                </Link>  
              </div>  
            </div>  
            <div className="relative h-64 sm:h-80 md:h-[min(70vh,620px)] overflow-hidden">  
              <img src="/assets/meditation-glow.jpg" alt="A quiet mountain landscape at dusk" className="hero-landscape h-full w-full object-cover object-center" />
            </div>  
          </div>  
        </section>  
  
        <section id="relaxation" className="scroll-mt-24 max-w-7xl mx-auto px-6 py-16 md:py-20">  
          <div className="services-heading mb-8 text-center">  
            <h2 className="section-title services-heading-title text-[46px] font-semibold leading-tight sm:text-[50px]">  
              <span className="services-heading-services">Relaxation</span>  
            </h2>  
            <div className="services-heading-ornament" aria-hidden="true">  
              <svg className="services-heading-wave" viewBox="0 0 320 30" fill="none" role="presentation">  
                <defs>  
                  <linearGradient id="relaxation-heading-gradient" x1="0" y1="0" x2="320" y2="0" gradientUnits="userSpaceOnUse">  
                    <stop stopColor="#E8A17F" />  
                    <stop offset="0.36" stopColor="#D99AB0" />  
                    <stop offset="0.68" stopColor="#A998BD" />  
                    <stop offset="1" stopColor="#96AD89" />  
                  </linearGradient>  
                </defs>  
                <path className="services-heading-wave-base" d="M3 15C28 15 35 9 57 11C81 13 85 19 109 17C128 15 136 11 147 14M173 14C186 11 194 15 211 17C234 20 246 12 267 11C291 9 298 15 317 15" stroke="url(#relaxation-heading-gradient)" strokeWidth="1.6" strokeLinecap="round" />  
                <path className="services-heading-wave-shimmer" d="M3 15C28 15 35 9 57 11C81 13 85 19 109 17C128 15 136 11 147 14M173 14C186 11 194 15 211 17C234 20 246 12 267 11C291 9 298 15 317 15" stroke="url(#relaxation-heading-gradient)" strokeWidth="2.2" strokeLinecap="round" />  
              </svg>  
              <LotusIcon className="services-heading-lotus" />  
            </div>  
            <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-[#778087] sm:text-lg">Choose what you’re feeling and let the music guide you toward a calmer state.</p>  
          </div>  
          <ArrowCardCarousel items={RELAXATION_CONCERNS.map((concern) => ({  
            ...concern,  
            to: `/dashboard/relaxation?concern=${concern.key}`,  
          }))} section="relaxation" />  
        </section>  
  
        <section id="services" className="scroll-mt-24 max-w-7xl mx-auto px-6 py-16 md:py-20">  
          <div className="services-heading mb-6 text-center">
            <h2 className="section-title services-heading-title text-[46px] sm:text-[50px] font-semibold leading-tight">
              <span className="services-heading-our">Our</span>{' '}
              <span className="services-heading-services">Services</span>
            </h2>
            <div className="services-heading-ornament" aria-hidden="true">
              <svg className="services-heading-wave" viewBox="0 0 320 30" fill="none" role="presentation">
                <defs>
                  <linearGradient id="services-heading-gradient" x1="0" y1="0" x2="320" y2="0" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#E8A17F" />
                    <stop offset="0.36" stopColor="#D99AB0" />
                    <stop offset="0.68" stopColor="#A998BD" />
                    <stop offset="1" stopColor="#96AD89" />
                  </linearGradient>
                </defs>
                <path className="services-heading-wave-base" d="M3 15C28 15 35 9 57 11C81 13 85 19 109 17C128 15 136 11 147 14M173 14C186 11 194 15 211 17C234 20 246 12 267 11C291 9 298 15 317 15" stroke="url(#services-heading-gradient)" strokeWidth="1.6" strokeLinecap="round" />
                <path className="services-heading-wave-shimmer" d="M3 15C28 15 35 9 57 11C81 13 85 19 109 17C128 15 136 11 147 14M173 14C186 11 194 15 211 17C234 20 246 12 267 11C291 9 298 15 317 15" stroke="url(#services-heading-gradient)" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <LotusIcon className="services-heading-lotus" />
            </div>
          </div>  
          <ArrowCardCarousel items={ANAHAT_SERVICES.map((service) => ({  
            key: service.key,  
            label: service.name,  
            image: service.image,  
            description: service.focus,  
            glow: service.glow,
            to: '/register?journey=consultation',  
          }))} section="services" />  
        </section>  
      </main>  
  
      <PublicFooter />  
      <style>{`  
        .home-title, .section-title { font-family: 'Playfair Display', Georgia, serif; }  
        .home-page { font-family: 'DM Sans', sans-serif; }  
        html { scroll-behavior: smooth; }  
        .music-notes { position: absolute; top: -22%; left: -8%; z-index: 2; width: 145%; height: 140%; overflow: visible; pointer-events: none; }  
        .home-title-wrap .home-title { position: relative; z-index: 1; }  
        .music-note {  
          position: absolute;  
          top: var(--note-y);  
          left: var(--note-x);  
          color: var(--note-color);  
          font-size: var(--note-size);  
          line-height: 1;  
          opacity: 0;  
          transform-origin: center;  
          animation: music-note-drift var(--note-duration) ease-in-out var(--note-delay) infinite;  
          will-change: transform, opacity;  
        }  
        @keyframes music-note-drift {  
          0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(0) scale(0.8); }  
          14% { opacity: 0.42; }  
          56% { opacity: 0.3; transform: translate3d(13px, -42px, 0) rotate(var(--note-rotate)) scale(1); }  
          100% { opacity: 0; transform: translate3d(29px, -84px, 0) rotate(calc(var(--note-rotate) * 1.5)) scale(0.88); }  
        }  
        .hero-landscape {
          -webkit-mask-image: radial-gradient(ellipse 72% 78% at 56% 50%, #000 48%, transparent 100%);
          mask-image: radial-gradient(ellipse 72% 78% at 56% 50%, #000 48%, transparent 100%);
        }
  
        .tune-gradient {  
          background-image: linear-gradient(100deg, #7d5a6b 0%, #b98a95 20%, #d9b8ab 38%, #e8d7c3 55%, #c69aa0 72%, #8c6478 88%, #b98a95 100%);  
          background-size: 300% 100%;  
          -webkit-background-clip: text;  
          background-clip: text;  
          color: transparent;  
          -webkit-text-fill-color: transparent;  
        }  
        .services-heading { text-align: center; }
        .services-heading-title { margin: 0; }
        .services-heading-our { color: #263746; }
        .services-heading-services {
          background: linear-gradient(105deg, #d98965 0%, #cc849e 38%, #9a83ae 68%, #78956c 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
        }
        .services-heading-ornament {
          position: relative;
          width: min(320px, 72vw);
          height: 30px;
          margin: 8px auto 0;
        }
        .services-heading-wave { display: block; width: 100%; height: 100%; overflow: visible; }
        .services-heading-wave-base { opacity: 0.9; }
        .services-heading-wave-shimmer {
          stroke-dasharray: 30 390;
          stroke-dashoffset: 0;
          opacity: 0.42;
          animation: services-heading-shimmer 16s linear infinite;
        }
        .services-heading-lotus {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 16px;
          height: 16px;
          color: #b68776;
          transform: translate(-50%, -50%);
        }
        @keyframes services-heading-shimmer {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -420; }
        }
        .services-carousel { position: relative; height: 360px; touch-action: pan-y; }
        .services-heading-glow {
          display: block;
          width: min(260px, 65vw);
          height: 3px;
          margin: 16px auto 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #f3ae22, #9e247d, #bd3b45, #6729c9, #b45322, #df4da6, #2768b4, #0795a5, #689b52);
          box-shadow: 0 0 7px rgba(158, 36, 125, 0.45), 0 0 16px rgba(103, 41, 201, 0.24);
        }
        .services-track { position: relative; width: 100%; height: 100%; }
        .service-tile--services {
          position: absolute;
          top: 50%;
          left: 50%;
          display: flex;
          width: clamp(172px, 24vw, 270px);
          height: min(310px, calc(100% - 32px));
          flex-direction: column;
          transform: translate(-50%, -50%) translateX(var(--card-x)) perspective(1100px) rotateY(var(--card-angle)) scale(var(--card-scale));
          transform-origin: center center;
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--service-glow) 78%, transparent), 0 0 18px color-mix(in srgb, var(--service-glow) 44%, transparent), 0 0 38px color-mix(in srgb, var(--service-glow) 22%, transparent), 0 12px 35px rgba(15, 23, 42, 0.2);
          opacity: var(--card-opacity);
          transition: transform 500ms ease, opacity 400ms ease, box-shadow 300ms ease;
          z-index: var(--card-z);
        }
        .service-tile--services::after {
          position: absolute;
          inset: 0;
          border: 1px solid color-mix(in srgb, var(--service-glow) 65%, transparent);
          border-radius: inherit;
          box-shadow: inset 0 0 18px color-mix(in srgb, var(--service-glow) 16%, transparent);
          content: '';
          pointer-events: none;
        }
        .service-tile--services:hover {
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--service-glow) 90%, transparent), 0 0 24px color-mix(in srgb, var(--service-glow) 58%, transparent), 0 0 44px color-mix(in srgb, var(--service-glow) 28%, transparent), 0 12px 35px rgba(15, 23, 42, 0.2);
        }
        .service-artwork { min-height: 0; height: auto; flex: 1; }
        .service-caption { flex: none; padding: 10px 12px 14px; text-align: center; }
        .service-tile--services[style*="visibility: hidden"] { pointer-events: none; }
        @keyframes tune-gradient-shift {  
          0% { background-position: 0% 50%; }  
          50% { background-position: 100% 50%; }  
          100% { background-position: 0% 50%; }  
        }  
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .service-tile, .relaxation-track { transition: none; } .tune-gradient { animation: none; } .services-heading-wave-shimmer { animation: none; } .music-note { display: none; } }  
      `}</style>  
    </div>  
  );  
}  
  
function ArrowCardCarousel({ items, section }) {  
  const firstCardRef = useRef(null);  
  const touchStartRef = useRef(null);
  const touchMovedRef = useRef(false);
  const autoDirectionRef = useRef(1);
  const [index, setIndex] = useState(0);  
  const [visibleCount, setVisibleCount] = useState(1);  
  const [step, setStep] = useState(0);  
  const lastIndex = section === 'services' ? items.length - 1 : Math.max(0, items.length - visibleCount);
  
  useEffect(() => {  
    const measure = () => {  
      const width = window.innerWidth;  
      const count = width >= 1024 ? 3 : width >= 640 ? 2 : 1;  
      setVisibleCount(count);  
      const cardWidth = firstCardRef.current?.getBoundingClientRect().width || 0;  
      const gap = width >= 640 ? 20 : 12;  
      setStep(cardWidth + gap);  
      if (section !== 'services') setIndex((current) => Math.min(current, Math.max(0, items.length - count)));
    };  
    measure();  
    window.addEventListener('resize', measure);  
    return () => window.removeEventListener('resize', measure);  
  }, [items.length, visibleCount]);  
  
  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((current) => {
        if (section === 'services') return (current + 1) % items.length;
        if (current >= lastIndex) autoDirectionRef.current = -1;
        if (current <= 0) autoDirectionRef.current = 1;
        return Math.max(0, Math.min(lastIndex, current + autoDirectionRef.current));
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [items.length, lastIndex, section]);

  const move = (direction) => {
    autoDirectionRef.current = direction;
    setIndex((current) => section === 'services' ? (current + direction + items.length) % items.length : Math.max(0, Math.min(lastIndex, current + direction)));
  };
  const handleTouchStart = (event) => {
    if (section !== 'services') return;
    touchStartRef.current = event.touches[0].clientX;
    touchMovedRef.current = false;
  };
  const handleTouchEnd = (event) => {
    if (section !== 'services' || touchStartRef.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartRef.current;
    touchStartRef.current = null;
    if (Math.abs(distance) < 45) return;
    touchMovedRef.current = true;
    move(distance < 0 ? 1 : -1);
  };
  return (  
    <div className="w-full">  
      <div className="relative">
        <button type="button" onClick={() => move(-1)} disabled={section !== 'services' && index === 0} aria-label={`Previous ${section}`} className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#d8e2e3] bg-white text-[#292d32] transition hover:border-[#0F8594] hover:bg-[#0F8594] hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
          <ArrowLeftIcon className="h-5 w-5" />  
        </button>  
        <button type="button" onClick={() => move(1)} disabled={section !== 'services' && index >= lastIndex} aria-label={`Next ${section}`} className="absolute right-0 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#d8e2e3] bg-white text-[#292d32] transition hover:border-[#0F8594] hover:bg-[#0F8594] hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
          <ArrowRightIcon className="h-5 w-5" />  
        </button>
        <div className={section === 'services' ? 'services-carousel overflow-hidden' : 'mx-12 overflow-hidden sm:mx-14'} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClickCapture={(event) => {
          if (touchMovedRef.current) {
            event.preventDefault();
            touchMovedRef.current = false;
          }
        }}>
        <div className={`relaxation-track flex gap-5 transition-transform duration-500 ease-out sm:gap-7 ${section === 'services' ? 'services-track' : ''}`} style={section === 'services' ? undefined : { transform: `translateX(-${index * step}px)` }}>
          {items.map((item, cardIndex) => {
            const rawOffset = cardIndex - index;
            const relativeOffset = section === 'services'
              ? ((rawOffset + items.length + Math.floor(items.length / 2)) % items.length) - Math.floor(items.length / 2)
              : rawOffset;
            const distance = Math.abs(relativeOffset);
            const spread = window.innerWidth < 640 ? 78 : window.innerWidth < 1024 ? 148 : 180;
            const cardStyle = section === 'services' ? {
              '--service-glow': item.glow,
              '--card-x': `${relativeOffset * spread}px`,
              '--card-scale': [1, 0.74, 0.52][Math.min(distance, 2)],
              '--card-angle': `${relativeOffset * -8}deg`,
              '--card-opacity': [1, 0.74, 0.44][Math.min(distance, 2)],
              '--card-z': 5 - distance,
              visibility: distance > 2 ? 'hidden' : 'visible',
            } : undefined;
            return (
            <Link  
              key={item.key}  
              ref={cardIndex === 0 ? firstCardRef : undefined}  
              to={item.to}  
              className={`service-tile group overflow-hidden rounded-[20px] bg-white transition ${section === 'services' ? 'service-tile--services' : 'min-w-0 basis-full shrink-0 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(15,23,42,0.16)] hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-24px_rgba(15,23,42,0.22)] sm:basis-[calc((100%-1.75rem)/2)] lg:basis-[calc((100%-3.5rem)/3)]'}`}
              style={cardStyle}
            >  
              <div className={section === 'services' ? 'service-artwork h-64 overflow-hidden bg-[#f4f8f8] sm:h-72 lg:h-80' : 'h-64 overflow-hidden bg-[#e7f1f2] sm:h-72 lg:h-80'}>
                <img  
                  src={item.image.startsWith('/assets/') ? item.image : `/assets/relaxation/${encodeURIComponent(item.image)}`}  
                  alt={`${item.label} ${section === 'relaxation' ? 'relaxation scenery' : 'service'}`}  
                  className={`h-full w-full transition duration-500 group-hover:scale-[1.04] ${section === 'services' ? 'object-contain' : 'object-cover'}`}  
                  loading="lazy"  
                />  
              </div>  
              <div className={section === 'services' ? 'service-caption px-6 py-5' : 'px-6 py-5'}>
                <h3 className="font-display text-base font-semibold text-[#303b42]">{item.label}</h3>  
                <p className="mt-1.5 text-xs leading-relaxed text-[#68777b]">{item.description}</p>  
              </div>  
            </Link>  
            );
          })}
        </div>  
        </div>
      </div>  
    </div>  
  );  
}  
  
function LotusIcon({ className }) {  
  return (  
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">  
      <path d="M12 2c1.2 2.4 1.8 4.6 1.8 6.6 0 1.9-.8 3.4-1.8 4.4-1-1-1.8-2.5-1.8-4.4C10.2 6.6 10.8 4.4 12 2z" />  
      <path d="M4.5 8c2.4.5 4.3 1.6 5.6 3.1 1.2 1.5 1.6 3.1 1.4 4.5-1.4.3-3-.2-4.3-1.6C5.9 12.4 5 10.4 4.5 8z" />  
      <path d="M19.5 8c-.5 2.4-1.4 4.4-2.7 5.9-1.3 1.5-2.9 2-4.3 1.7-.2-1.4.2-3 1.4-4.5C15.2 9.6 17.1 8.5 19.5 8z" />  
      <path d="M2 15.5c2.2-.6 4.3-.5 6 .3 1.7.8 2.8 2.1 3.2 3.5-1.2.9-2.9 1-4.6.2C4.9 18.6 3.2 17.2 2 15.5z" />  
      <path d="M22 15.5c-1.2 1.7-2.9 3.1-4.6 4-1.7.8-3.4.7-4.6-.2.4-1.4 1.5-2.7 3.2-3.5 1.7-.8 3.8-.9 6-.3z" />  
      <path d="M12 22c-2.8 0-5.2-.8-6.9-2.1 1.5-1.3 3.9-2.1 6.9-2.1s5.4.8 6.9 2.1C17.2 21.2 14.8 22 12 22z" />  
    </svg>  
  );  
}  
  
function ArrowRightIcon({ className }) {  
  return (  
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">  
      <path d="M5 12h14M13 6l6 6-6 6" />  
    </svg>  
  );  
}  
  
function ArrowLeftIcon({ className }) {  
  return (  
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">  
      <path d="M19 12H5m7 7-7-7 7-7" />  
    </svg>  
  );  
}