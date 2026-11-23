import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as service from './venues.service.js';
import * as statusService from '../admin/admin.service.js';
import {
  pagination, priceFilters, validPriceRange, operationalStatuses, statusBody, sport, reason,
} from '../../lib/validation.js';

const router = Router();
const optionalAuth = (req, res, next) =>
  req.headers.authorization ? requireAuth(req, res, next) : next();
const manager = [requireAuth, requireRole(['VENUE_MANAGER', 'ADMIN'])];
const venueFields = {
  name: z.string().trim().min(2).max(150),
  address: z.string().trim().min(3).max(300),
  district: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  payment_hold_minutes: z.number().int().min(1).max(10).default(10),
  minimum_online_booking_lead_minutes: z.number().int().min(10).max(1440).default(10),
};
const venueCreate = z.object(venueFields).strict();
const venuePatch = venueCreate
  .partial()
  .extend({ expected_version: z.number().int().positive() })
  .strict()
  .refine((data) => Object.keys(data).length > 1, 'Cần ít nhất một trường thay đổi.');
const courtCreate = z
  .object({
    name: z.string().trim().min(2).max(120),
    sport_type: sport,
    hourly_price: z.number().int().min(0).max(100000000),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();
const courtPatch = courtCreate
  .partial()
  .extend({ expected_version: z.number().int().positive() })
  .strict()
  .refine((data) => Object.keys(data).length > 1, 'Cần ít nhất một trường thay đổi.');

router.get(
  '/venues',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const filters = z
      .object({
        ...pagination,
        q: z.string().max(100).optional(),
        district: z.string().max(100).optional(),
        sport_type: sport.optional(),
        ...priceFilters,
        mine: z
          .enum(['true', 'false'])
          .transform((value) => value === 'true')
          .optional(),
      })
      .strict().refine(validPriceRange, 'min_price phải nhỏ hơn hoặc bằng max_price.').parse(req.query);
    ok(res, await service.list(filters, req.user));
  }),
);
router.get(
  '/venues/:id/courts',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const filters = z.object({ ...pagination, ...priceFilters, sport_type: sport.optional() })
      .strict().refine(validPriceRange, 'min_price phải nhỏ hơn hoặc bằng max_price.').parse(req.query);
    ok(res, await service.listCourts(z.string().uuid().parse(req.params.id), filters, req.user));
  }),
);
router.get(
  '/venues/:id',
  optionalAuth,
  asyncHandler(async (req, res) =>
    ok(res, await service.detail(z.string().uuid().parse(req.params.id), req.user)),
  ),
);
router.get(
  '/courts/:id',
  optionalAuth,
  asyncHandler(async (req, res) =>
    ok(res, await service.courtDetail(z.string().uuid().parse(req.params.id), req.user)),
  ),
);
router.post(
  '/venues',
  ...manager,
  asyncHandler(async (req, res) =>
    ok(res, await service.createVenue(venueCreate.parse(req.body), req.user), 201),
  ),
);
router.patch(
  '/venues/:id',
  ...manager,
  asyncHandler(async (req, res) =>
    ok(
      res,
      await service.updateVenue(
        z.string().uuid().parse(req.params.id),
        venuePatch.parse(req.body),
        req.user,
      ),
    ),
  ),
);
router.post(
  '/venues/:id/courts',
  ...manager,
  asyncHandler(async (req, res) =>
    ok(
      res,
      await service.createCourt(
        z.string().uuid().parse(req.params.id),
        courtCreate.parse(req.body),
        req.user,
      ),
      201,
    ),
  ),
);
router.patch(
  '/courts/:id',
  ...manager,
  asyncHandler(async (req, res) =>
    ok(
      res,
      await service.updateCourt(
        z.string().uuid().parse(req.params.id),
        courtPatch.parse(req.body),
        req.user,
      ),
    ),
  ),
);
// Keep privileged state edits separate from metadata PATCH, with the same
// version, booking guards and audit transaction for managers and admins.
for (const [entity, handler] of [
  ['venues', statusService.setVenueStatus], ['courts', statusService.setCourtStatus],
]) {
  router.patch(`/${entity}/:id/status`, ...manager, asyncHandler(async (req, res) =>
    ok(res, await handler(z.string().uuid().parse(req.params.id),
      statusBody(operationalStatuses).parse(req.body), req.user))));
  // Soft deletion preserves foreign keys and booking/payment history.
  router.delete(`/${entity}/:id`, ...manager, asyncHandler(async (req, res) => {
    const input = z.object({ expected_version: z.number().int().positive(),
      reason }).strict().parse(req.body);
    ok(res, await handler(z.string().uuid().parse(req.params.id),
      { ...input, status: 'INACTIVE' }, req.user));
  }));
}
export default router;
