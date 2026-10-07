import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadAudio } from '../middleware/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as tr from '../controllers/trackController.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(tr.listTracks));              // ?category=therapy|relaxation
router.get('/admin/all', requireRole('admin'), asyncHandler(tr.listAllTracksForAdmin));
router.get('/:id/audio', asyncHandler(tr.streamTrackAudio));
router.post('/:id/play', requireRole('patient'), asyncHandler(tr.playTrack));
router.post('/', requireRole('admin', 'therapist'), uploadAudio.single('audio'),
  body('title').notEmpty(), validate, asyncHandler(tr.createTrack));
router.delete('/:id', requireRole('admin'), asyncHandler(tr.deleteTrack));

export default router;
