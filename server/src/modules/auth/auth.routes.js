import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as service from './auth.service.js';

const router = Router();
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z.string().min(8).max(128);
router.post(
  '/auth/register',
  asyncHandler(async (req, res) =>
    ok(
      res,
      await service.register(
        z
          .object({
            full_name: z.string().trim().min(2).max(120),
            email,
            phone: z.string().trim().max(20).optional(),
            password,
          })
          .strict()
          .parse(req.body),
      ),
      201,
    ),
  ),
);
router.post(
  '/auth/login',
  asyncHandler(async (req, res) =>
    ok(res, await service.login(z.object({ email, password }).strict().parse(req.body))),
  ),
);
router.post(
  '/auth/logout',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, await service.logout(req.user))),
);
router.get('/auth/me', requireAuth, (req, res) => ok(res, service.publicUser(req.user)));
export default router;
