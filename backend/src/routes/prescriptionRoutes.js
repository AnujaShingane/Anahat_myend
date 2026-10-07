import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole, requireApproved } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as p from '../controllers/prescriptionController.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(p.myPrescriptions));
router.post('/', requireRole('therapist'), requireApproved, upload.single('file'),
  body('patientId').isUUID(), body('title').trim().notEmpty(), validate, asyncHandler(p.createPrescription));

export default router;
