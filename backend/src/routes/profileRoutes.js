import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as profile from '../controllers/profileController.js';

const router = Router();
router.use(requireAuth);

router.get('/me', asyncHandler(profile.getMyProfile));
router.put('/me/avatar', upload.single('avatar'), asyncHandler(profile.updateAvatar));
router.get('/files/:id', asyncHandler(profile.serveFile));
router.patch('/contact', asyncHandler(profile.updateContact));

router.post('/patient', requireRole('patient'),
  upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'healthReport', maxCount: 1 }]),
  body('age').isInt({ min: 1, max: 120 }), body('gender').notEmpty(), body('occupation').notEmpty(),
  body('maritalStatus').notEmpty(), body('disease').notEmpty(), body('problemDescription').trim().notEmpty(),
  validate, asyncHandler(profile.completePatientProfile));

router.post('/therapist', requireRole('therapist'), upload.single('avatar'),
  body('age').isInt({ min: 18, max: 100 }), body('gender').notEmpty(), body('experienceYears').isInt({ min: 0 }),
  body('experienceDetails').trim().notEmpty(), body('profession').notEmpty(), body('fee').isFloat({ min: 0 }),
  body('address').trim().notEmpty(), body('avatar').custom((_value, { req }) => Boolean(req.file) && ['image/jpeg', 'image/png'].includes(req.file.mimetype) && req.file.size <= 5 * 1024 * 1024).withMessage('Upload a JPG or PNG profile photo smaller than 5 MB.'),
  validate, asyncHandler(profile.completeTherapistProfile));

export default router;
