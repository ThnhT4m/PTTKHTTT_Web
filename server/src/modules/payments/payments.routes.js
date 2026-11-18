import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { asyncHandler } from '../../lib/http.js';
import * as controller from './payments.controller.js';

const router = Router();
router.use('/payments', requireAuth, requireRole(['CUSTOMER']));
router.post('/payments/create', asyncHandler(controller.create));
router.post('/payments/confirm', asyncHandler(controller.confirm));
export default router;
