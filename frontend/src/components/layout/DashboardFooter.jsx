import { Link } from 'react-router-dom';
import { CONTACT } from '../../constants/services';

// Thin, single-row footer at the bottom of every dashboard.
export default function DashboardFooter() {
  return (
    <footer className="w-full shrink-0 border-t border-black/10 bg-white px-5 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-slate-500">
      <Link to="/" aria-label="Anahat Transformations home" className="flex items-center gap-2">
        <img src="/assets/anahat-logo.png" alt="" className="w-6 h-6 object-contain" />
        <span className="font-semibold text-slate-700">Anahat Transformations</span>
        <span className="hidden sm:inline text-slate-300">·</span>
        <span className="hidden sm:inline">Tune. Heal. Transform.</span>
      </Link>
      <div className="flex items-center gap-4">
        <a href={`mailto:${CONTACT.email}`} className="hover:text-slate-800">{CONTACT.email}</a>
        <SocialLink href={CONTACT.instagram} label="Instagram"><InstagramIcon /></SocialLink>
        <SocialLink href={CONTACT.linkedin} label="LinkedIn"><LinkedInIcon /></SocialLink>
        <SocialLink href={CONTACT.facebook} label="Facebook"><FacebookIcon /></SocialLink>
        <Link to="/about" className="hover:text-slate-800">About</Link>
      </div>
    </footer>
  );
}

function SocialLink({ href, label, children }) {
  return <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#F6F4EC] hover:text-[#0F8594]">{children}</a>;
}

function InstagramIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" /></svg>;
}

function LinkedInIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.2 8.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3.5 10h3.4v10H3.5V10Zm5.4 0h3.3v1.4h.1a3.6 3.6 0 0 1 3.2-1.7c3.4 0 4 2.2 4 5.1V20h-3.4v-4.6c0-1.1 0-2.6-1.6-2.6s-1.9 1.2-1.9 2.5V20H8.9V10Z" /></svg>;
}

function FacebookIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.4 21v-8.2h2.8l.4-3.2h-3.2v-2c0-.9.3-1.5 1.6-1.5h1.7V3.2c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.3H7.2v3.2H10V21h3.4Z" /></svg>;
}
