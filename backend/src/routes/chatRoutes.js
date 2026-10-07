import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as c from '../controllers/chatController.js';

const router = Router();
router.use(requireAuth);
router.get('/contacts', asyncHandler(c.contacts));
router.get('/:userId/messages', asyncHandler(c.history));
export default router;
