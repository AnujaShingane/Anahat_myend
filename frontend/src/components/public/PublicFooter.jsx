import { Link } from 'react-router-dom';
import { CONTACT } from '../../constants/services';

// Shared warm public-site footer with contact, navigation, and social links.
export default function PublicFooter({ tone = 'light' }) {
  const dark = tone === 'dark';
  const text = 'text-[#5f6a70]';
  const muted = 'text-[#879096]';
  const ring = 'border-[#d8d4d0] hover:bg-[#f7e8df] text-[#677178]';

  return (
    <footer className="relative z-10 text-[#303b42]" style={{ background: dark ? '#fff5ef' : '#fff5ef' }}>
      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 items-start">
        {/* Brand */}
        <Link to="/" aria-label="Anahat Transformations home" className="flex items-start gap-3">
          <img src="/assets/anahat-logo.png" alt="" className="w-12 h-12 object-contain" />
          <div>
            <p className="font-display text-lg font-semibold text-[#303b42]">Anahat</p>
            <p className={`text-sm mt-1 max-w-xs ${muted}`}>Music therapy rooted in Indian classical raags — for stress, focus, sleep and everything in between.</p>
          </div>
        </Link>

        {/* Contact — centred column */}
        <div className="text-center">
          <p className="font-display text-sm font-semibold mb-4 text-[#303b42]">Support</p>
          <a href={`mailto:${CONTACT.email}`} className={`block text-sm ${text} hover:underline`}>{CONTACT.email}</a>
          <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`} className={`block text-sm mt-1 ${text} hover:underline`}>{CONTACT.phone}</a>
          <p className={`text-sm mt-1 ${muted}`}>{CONTACT.address}</p>

        </div>

        {/* Links */}
        <div>
          <p className="font-display text-sm font-semibold mb-4 text-[#303b42]">Quick links</p>
          <ul className={`space-y-2 text-sm ${text}`}>
            <li><Link to="/demo" className="hover:underline">Start a Free Trial</Link></li>
            <li><Link to="/#relaxation" className="hover:underline">Relaxation</Link></li>
            <li><Link to="/register?journey=consultation" className="hover:underline">Consultation</Link></li>
            <li><Link to="/login" className="hover:underline">Login</Link></li>
            <li><Link to="/register" className="hover:underline">Sign up</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-display text-sm font-semibold mb-4 text-[#303b42]">Follow us</p>
          <div className="flex items-center gap-3">
            <a href={CONTACT.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${ring}`}>
              <InstagramIcon className="w-4 h-4" />
            </a>
            <a href={CONTACT.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn" className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${ring}`}>
              <LinkedInIcon className="w-4 h-4" />
            </a>
            <a href={CONTACT.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${ring}`}>
              <FacebookIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-[#e8ddd6]">
        <div className={`max-w-7xl mx-auto px-6 py-4 flex flex-wrap gap-4 justify-center text-xs ${muted}`}>
          <span>© {new Date().getFullYear()} Anahat. All rights reserved.</span>
          <a href="#" className="hover:underline">Privacy policy</a>
          <a href="#" className="hover:underline">Terms of service</a>
        </div>
      </div>
    </footer>
  );
}

function InstagramIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" /></svg>;
}

function LinkedInIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.2 8.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3.5 10h3.4v10H3.5V10Zm5.4 0h3.3v1.4h.1a3.6 3.6 0 0 1 3.2-1.7c3.4 0 4 2.2 4 5.1V20h-3.4v-4.6c0-1.1 0-2.6-1.6-2.6s-1.9 1.2-1.9 2.5V20H8.9V10Z" /></svg>;
}

function FacebookIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.4 21v-8.2h2.8l.4-3.2h-3.2v-2c0-.9.3-1.5 1.6-1.5h1.7V3.2c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.3H7.2v3.2H10V21h3.4Z" /></svg>;
}
