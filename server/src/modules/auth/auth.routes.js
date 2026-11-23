import { Router } from 'express';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as service from './auth.service.js';
import { registerBody, loginBody } from './auth.validation.js';

const router = Router();
router.post(
  '/auth/register',
  asyncHandler(async (req, res) =>
    ok(
      res,
      await service.register(registerBody.parse(req.body)),
      201,
    ),
  ),
);
router.post(
  '/auth/login',
  asyncHandler(async (req, res) =>
    ok(res, await service.login(loginBody.parse(req.body))),
  ),
);
router.post(
  '/auth/logout',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, await service.logout(req.user))),
);
router.get('/auth/me', requireAuth, (req, res) => ok(res, service.publicUser(req.user)));
export default router;
