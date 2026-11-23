import { z } from 'zod';
import { ok } from '../../lib/http.js';
import * as service from './bookings.service.js';
import { pagination } from '../../lib/validation.js';

const uuid = z.string().uuid();
const empty = z.object({}).strict();
const counterMethod = z.enum(['CASH', 'BANK_TRANSFER']);
const onlineSchema = z.object({ time_slot_id: uuid }).strict();
const walkInSchema = z
  .object({
    time_slot_id: uuid,
    customer_name: z.string().trim().min(2).max(120),
    customer_phone: z.string().trim().max(30).optional(),
    method: counterMethod,
  })
  .strict();
const extendSchema = z.object({ method: counterMethod }).strict();

export const list = async (req, res) => {
  const filters = z.object({
    ...pagination,
    status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED_BY_VENUE']).optional(),
    source: z.enum(['ONLINE', 'WALK_IN', 'EXTENSION']).optional(),
    venue_id: uuid.optional(), court_id: uuid.optional(),
    date: z.string().date().optional(),
    has_issue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    refund_status: z.enum(['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED']).optional(),
  }).strict().parse(req.query);
  ok(res, await service.listBookings(req.user, filters));
};
export const detail = async (req, res) =>
  ok(res, await service.getBooking(req.user, uuid.parse(req.params.id)));
export const history = async (req, res) =>
  ok(res, await service.getBookingHistory(req.user, uuid.parse(req.params.id)));
export const online = async (req, res) =>
  ok(res, await service.bookOnline(req.user, onlineSchema.parse(req.body)), 201);
export const walkIn = async (req, res) =>
  ok(res, await service.bookWalkIn(req.user, walkInSchema.parse(req.body)), 201);
export const complete = async (req, res) => {
  empty.parse(req.body ?? {});
  return ok(res, await service.completeBooking(req.user, uuid.parse(req.params.id)));
};
export const extend = async (req, res) =>
  ok(
    res,
    await service.extendBooking(req.user, uuid.parse(req.params.id), extendSchema.parse(req.body)),
    201,
  );
