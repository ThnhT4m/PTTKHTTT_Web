import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as service from './admin.service.js';

const router = Router();
router.use('/admin', requireAuth, requireRole(['ADMIN']));
router.get(
  '/admin/overview',
  asyncHandler(async (req, res) => ok(res, await service.overview())),
);
router.get(
  '/admin/users',
  asyncHandler(async (req, res) => ok(res, await service.listUsers())),
);
router.get(
  '/admin/audit-logs',
  asyncHandler(async (req, res) => ok(res, await service.listAudit())),
);
router.patch(
  '/admin/users/:id/status',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        is_active: z.boolean().optional(),
        role: z.enum(['CUSTOMER', 'VENUE_MANAGER']).optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, 'Cần trường thay đổi.')
      .parse(req.body);
    ok(res, await service.updateUser(z.string().uuid().parse(req.params.id), input, req.user));
  }),
);
const statusBody = (statuses) =>
  z
    .object({
      status: z.enum(statuses),
      expected_version: z.number().int().positive(),
      reason: z.string().trim().min(5).max(1000),
    })
    .strict();
for (const [entity, statuses, handler] of [
  ['venues', ['ACTIVE', 'INACTIVE', 'MAINTENANCE'], service.setVenueStatus],
  ['courts', ['ACTIVE', 'INACTIVE', 'MAINTENANCE'], service.setCourtStatus],
  ['slots', ['AVAILABLE', 'UNAVAILABLE'], service.setSlotStatus],
])
  router.patch(
    `/admin/${entity}/:id/status`,
    asyncHandler(async (req, res) =>
      ok(
        res,
        await handler(
          z.string().uuid().parse(req.params.id),
          statusBody(statuses).parse(req.body),
          req.user,
        ),
      ),
    ),
  );
export default router;
