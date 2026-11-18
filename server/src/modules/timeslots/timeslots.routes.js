import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { asyncHandler, ok } from '../../lib/http.js';
import { schedule } from './timeslots.service.js';

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
// Timetable cố định: không cung cấp generate-slots hay API sửa ngày/giờ/giá slot.
export default router;
