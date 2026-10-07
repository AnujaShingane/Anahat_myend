import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env.js';
import { User } from '../models/postgres/index.js';

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try { done(null, (await User.findByPk(id)) || false); } catch (e) { done(e); }
});

if (env.google.clientId && env.google.clientSecret) {
  passport.use(new GoogleStrategy(
    { clientID: env.google.clientId, clientSecret: env.google.clientSecret, callbackURL: env.google.callbackUrl, passReqToCallback: true },
    async (req, _at, _rt, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) return done(null, false, { message: 'No email from Google' });
        let user = await User.findOne({ where: { email } });
        if (!user) {
          const role = req.session?.oauthRole;
          if (!['patient', 'therapist'].includes(role)) {
            return done(null, false, { message: 'Choose Patient or Therapist before signing up with Google.' });
          }
          const [firstName = 'Google', ...lastParts] = (profile.displayName || email.split('@')[0]).trim().split(/\s+/);
          user = await User.create({
            firstName,
            lastName: lastParts.join(' '),
            email,
            googleId: profile.id,
            role,
            accountType: role === 'patient' ? 'self' : null,
            isApproved: true,
          });
        }
        if (!user.googleId) await user.update({ googleId: profile.id });
        return done(null, user);
      } catch (e) { return done(e); }
    },
  ));
}

export default passport;
