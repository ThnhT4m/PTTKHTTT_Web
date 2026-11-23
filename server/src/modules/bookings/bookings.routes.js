import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { asyncHandler } from '../../lib/http.js';
import * as controller from './bookings.controller.js';

const router = Router();
router.use('/bookings', requireAuth);
router.get('/bookings', asyncHandler(controller.list));
router.get('/bookings/:id', asyncHandler(controller.detail));
router.get('/bookings/:id/history', asyncHandler(controller.history));
router.post('/bookings/online', requireRole(['CUSTOMER']), asyncHandler(controller.online));
router.post(
  '/bookings/walk-in',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  asyncHandler(controller.walkIn),
);
router.post(
  '/bookings/:id/complete',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  asyncHandler(controller.complete),
);
router.post(
  '/bookings/:id/extend',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  asyncHandler(controller.extend),
);

export default router;
