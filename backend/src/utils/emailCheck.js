import dns from 'dns';

// We cannot ask Google whether a particular Gmail address exists (Google
// does not expose that), but we can reject everything that provably cannot
// receive mail: malformed addresses, Gmail addresses that break Gmail's own
// username rules, and domains with no mail server (no MX / A record).
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export async function assertDeliverableEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const m = value.match(/^([^@]+)@([^@]+)$/);
  if (!m) return 'Enter a valid email address.';
  const [, local, domain] = m;

  if (GMAIL_DOMAINS.has(domain)) {
    // Gmail: 6–30 chars, letters/digits/dots only, no leading/trailing dot,
    // no consecutive dots.
    const bare = local.split('+')[0];
    if (!/^[a-z0-9](?:[a-z0-9]|\.(?!\.)){4,28}[a-z0-9]$/.test(bare)) {
      return 'That does not look like a real Gmail address.';
    }
    return null;
  }

  try {
    const mx = await dns.promises.resolveMx(domain);
    if (mx && mx.length) return null;
  } catch { /* fall through to A-record check */ }
  try {
    const a = await dns.promises.resolve4(domain);
    if (a && a.length) return null;
  } catch { /* no records */ }
  return 'That email domain cannot receive mail. Please use a real email address.';
}
