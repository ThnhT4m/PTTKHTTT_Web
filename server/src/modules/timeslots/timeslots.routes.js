import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { asyncHandler, ok } from '../../lib/http.js';
import { schedule, generateSlots, updatePrice } from './timeslots.service.js';
import { setSlotStatus } from '../admin/admin.service.js';
import { statusBody, uuid } from '../../lib/validation.js';

const router = Router();
router.get(
  '/courts/:id/slots',
  (req, res, next) => (req.headers.authorization ? requireAuth(req, res, next) : next()),
  asyncHandler(async (req, res) => {
    const courtId = z.string().uuid().parse(req.params.id);
    const date = z.string().date().parse(req.query.date);
    ok(res, await schedule(courtId, date, req.user));
  }),
);
const manager = [requireAuth, requireRole(['VENUE_MANAGER', 'ADMIN'])];
router.post('/venues/:id/generate-slots', ...manager, asyncHandler(async (req, res) => {
  const input = z.object({
    start_date: z.string().date().optional(),
    days: z.number().int().min(1).max(30).default(30),
    court_ids: z.array(uuid).min(1).max(100).refine((ids) => new Set(ids).size === ids.length,
      'Danh sách sân không được trùng.').optional(),
  }).strict().parse(req.body ?? {});
  ok(res, await generateSlots(uuid.parse(req.params.id), input, req.user), 201);
}));
router.patch('/slots/:id', ...manager, asyncHandler(async (req, res) => {
  const input = z.object({ expected_version: z.number().int().positive(),
    price: z.number().int().min(0).max(100000000) }).strict().parse(req.body);
  ok(res, await updatePrice(uuid.parse(req.params.id), input, req.user));
}));
router.patch('/slots/:id/status', ...manager, asyncHandler(async (req, res) => {
  ok(res, await setSlotStatus(uuid.parse(req.params.id),
    statusBody(['AVAILABLE', 'UNAVAILABLE']).parse(req.body), req.user));
}));
export default router;
