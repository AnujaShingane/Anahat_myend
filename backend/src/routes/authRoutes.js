import { Router } from 'express';
import { body } from 'express-validator';
import passport from '../config/passport.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as auth from '../controllers/authController.js';
import { env } from '../config/env.js';

const googleEnabled = Boolean(env.google.clientId && env.google.clientSecret);

const router = Router();

router.post('/signup', authLimiter,
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').optional({ values: 'falsy' }).trim(),
  body('email').isEmail().withMessage('Enter a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((v, { req }) => v === req.body.password).withMessage('Passwords do not match'),
  body('role').isIn(['patient', 'therapist']).withMessage('Choose patient or therapist'),
  body('accountType').optional().isIn(['self', 'caregiver']),
  validate, asyncHandler(auth.signup));

router.post('/login', authLimiter,
  body('email').isEmail(), body('password').notEmpty(), validate, asyncHandler(auth.login));

router.post('/logout', requireAuth, auth.logout);
router.get('/me', requireAuth, asyncHandler(auth.me));

// Tells the frontend which login options to show
router.get('/providers', (_req, res) => res.json({ google: googleEnabled }));

// Google OAuth (only mounted when keys are present in .env)
if (googleEnabled) {
router.get('/google', (req, res, next) => {
  const { role } = req.query;
  if (role) {
    if (!['patient', 'therapist'].includes(role)) {
      return res.redirect(`${env.clientUrl}/register?error=invalid_role`);
    }
    req.session.oauthRole = role;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/api/auth/google/failure', session: false }),
  auth.googleCallback);
router.get('/google/failure', auth.googleFailure);
} else {
router.get('/google', (_req, res) => res.redirect(`${env.clientUrl}/login?error=google_disabled`));
}

export default router;
