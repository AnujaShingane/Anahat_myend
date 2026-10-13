// Decorative, therapeutic motifs layered onto each music-track card.
// Deliberately built as inline SVG (no external photos) so the tracks page
// stays fast, offline-safe, and free of any image licensing concerns while
// still feeling premium and calming rather than "plain".

const VARIANTS = ['mandala', 'waveform', 'leaf', 'moon', 'bowl'];

export function getTrackVariant(index) {
  return VARIANTS[(index - 1) % VARIANTS.length];
}

export default function TrackVisual({ variant, className = '' }) {
  const common = { className: `absolute ${className}`, fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };

  switch (variant) {
    case 'mandala':
      return (
        <svg {...common} viewBox="0 0 200 200">
          <g stroke="white" strokeOpacity="0.35" strokeWidth="1">
            <circle cx="100" cy="100" r="70" />
            <circle cx="100" cy="100" r="48" />
            <circle cx="100" cy="100" r="26" />
            {[...Array(12)].map((_, i) => (
              <line
                key={i}
                x1="100" y1="100"
                x2={100 + 70 * Math.cos((i * Math.PI) / 6)}
                y2={100 + 70 * Math.sin((i * Math.PI) / 6)}
              />
            ))}
          </g>
        </svg>
      );
    case 'waveform':
      return (
        <svg {...common} viewBox="0 0 200 200" strokeLinecap="round">
          <g stroke="white" strokeOpacity="0.4" strokeWidth="4">
            <line x1="30" y1="110" x2="30" y2="130" />
            <line x1="55" y1="85" x2="55" y2="155" />
            <line x1="80" y1="60" x2="80" y2="180" />
            <line x1="105" y1="40" x2="105" y2="200" />
            <line x1="130" y1="70" x2="130" y2="170" />
            <line x1="155" y1="95" x2="155" y2="145" />
            <line x1="180" y1="110" x2="180" y2="130" />
          </g>
        </svg>
      );
    case 'leaf':
      return (
        <svg {...common} viewBox="0 0 200 200">
          <g stroke="white" strokeOpacity="0.4" strokeWidth="1.5">
            <path d="M100 170C60 150 40 110 55 65c45 5 80 35 85 80 3 15 0 25 -40 25Z" />
            <path d="M100 170C90 130 90 95 100 65" />
          </g>
        </svg>
      );
    case 'moon':
      return (
        <svg {...common} viewBox="0 0 200 200">
          <g stroke="white" strokeOpacity="0.4" strokeWidth="1.5">
            <path d="M120 40a65 65 0 100 120 52 52 0 010-120Z" />
            <circle cx="150" cy="60" r="3" fill="white" fillOpacity="0.5" stroke="none" />
            <circle cx="165" cy="90" r="2" fill="white" fillOpacity="0.4" stroke="none" />
          </g>
        </svg>
      );
    case 'bowl':
    default:
      return (
        <svg {...common} viewBox="0 0 200 200">
          <g stroke="white" strokeOpacity="0.4" strokeWidth="1.5">
            <ellipse cx="100" cy="130" rx="55" ry="16" />
            <path d="M45 130c0 25 25 40 55 40s55-15 55-40" />
            <path d="M70 95c8-15 52-15 60 0" strokeDasharray="4 5" />
          </g>
        </svg>
      );
  }
}
