import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as admin from '../controllers/adminController.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/overview', asyncHandler(admin.overview));
router.get('/users', asyncHandler(admin.listUsers));            // ?role=patient|therapist
router.patch('/therapists/:id/approve', asyncHandler(admin.approveTherapist));
router.patch('/users/:id/suspend', asyncHandler(admin.suspendUser));
router.delete('/users/:id', asyncHandler(admin.deleteUser));
router.get('/payments', asyncHandler(admin.listPayments));
router.get('/appointments', asyncHandler(admin.listAppointments));
router.get('/system-info', asyncHandler(admin.systemInfo));

export default router;
