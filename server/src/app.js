import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { db } from './db/knex.js';
import { AppError, asyncHandler, errorHandler, ok } from './lib/http.js';
import authRoutes from './modules/auth/auth.routes.js';
import venueRoutes from './modules/venues/venues.routes.js';
import timeslotRoutes from './modules/timeslots/timeslots.routes.js';
import reviewRoutes from './modules/reviews/reviews.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import bookingRoutes from './modules/bookings/bookings.routes.js';
import paymentRoutes from './modules/payments/payments.routes.js';
import aftersalesRoutes from './modules/aftersales/aftersales.routes.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json({ limit: '64kb' }));
app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    await db.raw('SELECT 1');
    ok(res, { service: 'SportBooking API', status: 'ok' });
  }),
);
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.')),
  }),
);
for (const router of [
  authRoutes,
  venueRoutes,
  timeslotRoutes,
  reviewRoutes,
  adminRoutes,
  bookingRoutes,
  paymentRoutes,
  aftersalesRoutes,
]) {
  app.use('/api', router);
}
app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Không tìm thấy API.')));
app.use(errorHandler);
export default app;
