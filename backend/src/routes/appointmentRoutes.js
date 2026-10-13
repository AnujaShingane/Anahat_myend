import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as a from '../controllers/appointmentController.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(a.myAppointments));
router.post('/', requireRole('patient'),
  body('therapistId').isUUID(), body('date').isISO8601(), body('startTime').notEmpty(),
  validate, asyncHandler(a.book));
router.post('/payments/:paymentId/pay', requireRole('patient'), asyncHandler(a.pay));
router.get('/payments', requireRole('patient'), asyncHandler(a.myPayments));
router.patch('/:id', asyncHandler(a.updateStatus));

export default router;
