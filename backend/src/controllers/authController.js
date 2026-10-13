import { User } from '../models/postgres/index.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import { env } from '../config/env.js';
import { bindSession } from '../middleware/auth.js';
import { assertDeliverableEmail } from '../utils/emailCheck.js';

export async function signup(req, res) {
  const { firstName, lastName, email, password, role, accountType } = req.body;
  if (role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot be created here.' });

  const exists = await User.findOne({ where: { email: email.toLowerCase() } });
  if (exists) return res.status(409).json({ message: 'An account with this email already exists.' });

  const problem = await assertDeliverableEmail(email);
  if (problem) return res.status(400).json({ message: problem });

  const user = await User.create({
    firstName, lastName: lastName || '',
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    role,
    accountType: role === 'patient' ? accountType || 'self' : null,
    isApproved: true, // admin approval gate removed — all roles active immediately
  });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ message: 'Could not start session' });
    bindSession(req, user);
    res.status(201).json({ user: sanitizeUser(user) });
  });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email: email.toLowerCase() } });
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  if (user.isSuspended) {
    return res.status(403).json({ message: 'This account has been suspended. Contact support for help.' });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ message: 'Could not start session' });
    bindSession(req, user);
    res.json({ user: sanitizeUser(user) });
  });
}

export function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('harmony.sid');
    res.json({ message: 'Logged out' });
  });
}

export async function me(req, res) {
  res.json({ user: sanitizeUser(req.user) });
}

// Called by passport after Google verifies the account.
export function googleCallback(req, res) {
  req.session.regenerate((err) => {
    if (err) return res.redirect(`${env.clientUrl}/login?error=google_session`);
    bindSession(req, req.user);
    res.redirect(`${env.clientUrl}/auth/callback`);
  });
}

export function googleFailure(_req, res) {
  res.redirect(`${env.clientUrl}/login?error=google_not_registered`);
}
