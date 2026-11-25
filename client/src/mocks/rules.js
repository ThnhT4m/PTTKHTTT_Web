import { ApiError } from '../api/errors.js';
import { redactSecrets } from '../utils/redact.js';
export const fail = (status, code, message, details) => { throw new ApiError({ code, message, details }, status); };
export function bodyFields(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) fail(400, 'VALIDATION_ERROR', 'Body chứa trường không hợp lệ.');
}
export const findRow = (rows, id) => rows.find((r) => r.id === id) || fail(404, 'NOT_FOUND', 'Không tìm thấy dữ liệu.');
export function requireUUID(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(400, 'VALIDATION_ERROR', `${field} phải là UUID hợp lệ.`);
}
export function slotContext(db, slot) {
  const court = findRow(db.courts, slot.court_id), venue = findRow(db.venues, court.venue_id);
  return { slot, court, venue };
}
export function bookingContext(db, id) {
  const booking = findRow(db.bookings, id);
  return { booking, ...slotContext(db, findRow(db.slots, booking.time_slot_id)) };
}
export function assertStaff(user, venue) {
  if (!['VENUE_MANAGER', 'ADMIN'].includes(user.role) || (user.role !== 'ADMIN' && venue.manager_id !== user.id)) fail(403, 'FORBIDDEN', 'Bạn không có quyền quản lý cơ sở này.');
}
export function assertBookingAccess(user, context) {
  if (user.role === 'CUSTOMER') {
    if (context.booking.customer_id !== user.id) fail(403, 'FORBIDDEN', 'Booking không thuộc tài khoản của bạn.');
  } else assertStaff(user, context.venue);
}
export function assertOperational({ court, venue }) {
  if (court.status !== 'ACTIVE' || venue.status !== 'ACTIVE') fail(409, 'NOT_OPERATIONAL', 'Cơ sở hoặc sân không hoạt động.');
}
export function bumpSlot(slot, changes, now) {
  Object.assign(slot, changes, { held_until: null, version: slot.version + 1, updated_at: new Date(now).toISOString() });
}
export function audit(db, user, action, type, item, before, now, reason = null) {
  db.audits.push({ id: crypto.randomUUID(), actor_id: user?.id || null, actor_name: user?.full_name || 'Hệ thống', action, entity_type: type, entity_id: item.id,
    before_data: redactSecrets(before), after_data: redactSecrets(structuredClone(item)), reason, created_at: new Date(now).toISOString() });
}
export function paidPayment(db, booking, amount = booking.total_amount) {
  const paid = db.payments.filter((p) => p.booking_id === booking.id && p.status === 'PAID');
  if (paid.length !== 1) fail(409, 'PAID_PAYMENT_REQUIRED', 'Cần đúng một thanh toán PAID để hoàn tiền.');
  if (Number(paid[0].amount) !== Number(amount)) fail(409, 'REFUND_AMOUNT_MISMATCH', 'Số tiền hoàn không khớp giao dịch đã thanh toán.');
  return paid[0];
}
export const publicUser = (user) => Object.fromEntries(['id', 'full_name', 'email', 'phone', 'role', 'is_active', 'created_at', 'updated_at'].filter((key) => Object.hasOwn(user, key)).map((key) => [key, user[key]]));
