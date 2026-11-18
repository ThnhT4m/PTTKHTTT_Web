import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { createReview } from './reviews.service.js';

const router = Router();
router.post(
  '/bookings/:id/reviews',
  requireAuth,
  requireRole(['CUSTOMER']),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(2000).optional(),
      })
      .strict()
      .parse(req.body);
    ok(res, await createReview(z.string().uuid().parse(req.params.id), input, req.user), 201);
  }),
);
export default router;
