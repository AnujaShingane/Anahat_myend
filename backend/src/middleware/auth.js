import crypto from 'crypto';
import { User } from '../models/postgres/index.js';

// ---------------------------------------------------------------------------
// Session hardening
//
// Every login binds the server-side session to a fingerprint of the client
// (user-agent + accept-language). A session cookie copied into a different
// browser / Postman / Hoppscotch no longer matches, so the request is rejected
// and the session destroyed. Each browser must log in on its own.
// ---------------------------------------------------------------------------
export function clientFingerprint(req) {
  const raw = `${req.get('user-agent') || ''}|${req.get('accept-language') || ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Call right after a successful login / signup / OAuth callback.
export function bindSession(req, user) {
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.fp = clientFingerprint(req);
  req.session.issuedAt = Date.now();
}

// Every protected route goes through here.
export async function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: 'Please log in.' });

  if (req.session.fp && req.session.fp !== clientFingerprint(req)) {
    req.session.destroy(() => {});
    res.clearCookie('harmony.sid');
    return res.status(401).json({ message: 'Session is not valid for this device. Please log in again.' });
  }

  const user = await User.findByPk(userId, { attributes: { exclude: ['passwordHash'] } });
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
  if (user.isSuspended) {
    req.session.destroy(() => {});
    return res.status(403).json({ message: 'This account has been suspended.' });
  }
  // Role changes (e.g. admin demotes an account) invalidate old sessions.
  if (req.session.role && req.session.role !== user.role) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: 'Please log in again.' });
  }
  req.user = user;
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Please log in.' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have access to this.' });
  next();
};

// Admin approval gating has been removed: therapists are active as soon as
// they register (see authController — isApproved now defaults to true for
// everyone). This middleware is kept as a no-op passthrough, and the
// isApproved flag is left on the User model/admin UI so it can be reused
// later (e.g. for a "verified" badge) without a schema change.
export function requireApproved(req, res, next) {
  next();
}

// A patient may only touch records keyed by their own id; therapists and
// admins may read patients (they need it for care), but only admins may act
// on another therapist's records.
export const requireSelfOrStaff = (param) => (req, res, next) => {
  const target = req.params[param];
  if (!req.user) return res.status(401).json({ message: 'Please log in.' });
  if (req.user.id === target || req.user.role === 'admin') return next();
  if (req.user.role === 'therapist') return next();
  return res.status(403).json({ message: 'You do not have access to this record.' });
};

export const requireSelfOrAdmin = (param) => (req, res, next) => {
  const target = req.params[param];
  if (!req.user) return res.status(401).json({ message: 'Please log in.' });
  if (req.user.id === target || req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'You do not have access to this record.' });
};

// ---------------------------------------------------------------------------
// App-origin gate — applied to EVERY /api request (GET included).
//
// Requests must (a) carry the X-Requested-With header the frontend sets on
// every fetch and (b) originate from the configured client URL (Origin or
// Referer). Plain browser navigations, Postman, Hoppscotch, curl, etc. fail
// this check before any controller runs. Exceptions: the Google OAuth
// redirect hops, and inline file fetches (<img src="/api/profile/files/…">)
// which browsers issue without custom headers.
// ---------------------------------------------------------------------------
export function requireAppOrigin(clientUrl) {
  const allowed = (Array.isArray(clientUrl) ? clientUrl : [clientUrl]).map((u) => u.replace(/\/$/, ''));
  return (req, res, next) => {
    if (req.path.startsWith('/auth/google')) return next();
    if (req.method === 'GET' && req.path.startsWith('/profile/files/')) {
      // Images: still require the referer to be our app.
      const ref = req.get('referer') || '';
      return allowed.some((a) => ref.startsWith(a)) ? next() : res.status(403).json({ message: 'Forbidden' });
    }
    const origin = req.get('origin') || req.get('referer') || '';
    const custom = req.get('x-requested-with');
    const originOk = allowed.some((a) => origin.startsWith(a));
    if (originOk && custom === 'XMLHttpRequest') return next();
    return res.status(403).json({ message: 'Requests must come from the Anahat app.' });
  };
}
