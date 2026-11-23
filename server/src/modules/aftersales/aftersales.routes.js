import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import {
  rescheduleBooking,
  reportVenueIssue,
  requestRefund,
  changeRefundStatus,
  listRefunds, getRefund,
} from './aftersales.service.js';
import { pagination } from '../../lib/validation.js';

const router = Router();
const idSchema = z.string().uuid();
const reason = z.string().trim().min(5).max(1000);
const rescheduleSchema = z
  .object({ new_time_slot_id: idSchema, reason, is_venue_issue: z.boolean().optional() })
  .strict();
const issueSchema = z
  .object({ reason, action: z.enum(['REPORT', 'REFUND']).default('REPORT') })
  .strict();
const refundStatusSchema = z.object({ status: z.enum(['APPROVED', 'COMPLETED']) }).strict();

router.use(['/bookings', '/refunds'], requireAuth);
router.get('/refunds', asyncHandler(async (req, res) => {
  const filters = z.object({ ...pagination,
    status: z.enum(['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED']).optional(),
    venue_id: idSchema.optional(), booking_id: idSchema.optional(),
  }).strict().parse(req.query);
  ok(res, await listRefunds(req.user, filters));
}));
router.get('/refunds/:id', asyncHandler(async (req, res) =>
  ok(res, await getRefund(req.user, idSchema.parse(req.params.id)))));
router.post(
  '/bookings/:id/reschedule',
  asyncHandler(async (req, res) => {
    ok(
      res,
      await rescheduleBooking(
        req.user,
        idSchema.parse(req.params.id),
        rescheduleSchema.parse(req.body),
      ),
    );
  }),
);
router.post(
  '/bookings/:id/venue-issue',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await reportVenueIssue(req.user, idSchema.parse(req.params.id), issueSchema.parse(req.body)),
    );
  }),
);
router.post(
  '/bookings/:id/refund-request',
  requireRole(['CUSTOMER']),
  asyncHandler(async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    ok(res, await requestRefund(req.user, idSchema.parse(req.params.id)), 201);
  }),
);
router.patch(
  '/refunds/:id/status',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  asyncHandler(async (req, res) => {
    const input = refundStatusSchema.parse(req.body);
    ok(res, await changeRefundStatus(req.user, idSchema.parse(req.params.id), input.status));
  }),
);

export default router;
