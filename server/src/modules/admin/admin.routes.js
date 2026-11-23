import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as service from './admin.service.js';
import { pagination, operationalStatuses, statusBody } from '../../lib/validation.js';

const router = Router();
router.use('/admin', requireAuth, requireRole(['ADMIN']));
router.get(
  '/admin/overview',
  asyncHandler(async (req, res) => ok(res, await service.overview())),
);
router.get(
  '/admin/users',
  asyncHandler(async (req, res) => ok(res, await service.listUsers(z.object({
    ...pagination, q: z.string().trim().max(100).optional(),
    role: z.enum(['CUSTOMER', 'VENUE_MANAGER', 'ADMIN']).optional(),
    is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  }).strict().parse(req.query)))),
);
router.get(
  '/admin/audit-logs',
  asyncHandler(async (req, res) => ok(res, await service.listAudit(z.object({
    ...pagination, actor_id: z.string().uuid().optional(),
    entity_id: z.string().uuid().optional(), action: z.string().max(100).optional(),
  }).strict().parse(req.query)))),
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
for (const [entity, statuses, handler] of [
  ['venues', operationalStatuses, service.setVenueStatus],
  ['courts', operationalStatuses, service.setCourtStatus],
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
