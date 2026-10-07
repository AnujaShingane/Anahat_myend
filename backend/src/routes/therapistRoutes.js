import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole, requireApproved } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as t from '../controllers/therapistController.js';

const router = Router();
router.use(requireAuth);

// Therapist's own management routes must come before /:id routes so that
// the literal "me" segment is not treated as a therapist id.
const own = [requireRole('therapist'), requireApproved];
router.get('/me/slots', own, asyncHandler(t.mySlots));
router.put('/me/slots', own, body('slots').isArray(), validate, asyncHandler(t.setSlots));
router.get('/me/blocked-dates', own, asyncHandler(t.myBlockedDates));
router.post('/me/blocked-dates', own, body('date').isISO8601(), validate, asyncHandler(t.blockDate));
router.delete('/me/blocked-dates/:id', own, asyncHandler(t.unblockDate));
router.get('/me/patients', own, asyncHandler(t.myPatients));
router.get('/me/payments', own, asyncHandler(t.myPaymentHistory));

// Public (to logged-in users): browse therapists
router.get('/', asyncHandler(t.listTherapists));
router.get('/:id', asyncHandler(t.getTherapist));
router.get('/:id/free-slots', asyncHandler(t.getFreeSlots));

export default router;
