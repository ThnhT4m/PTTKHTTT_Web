import { reasonError } from '../utils/managerValidation.js';
import { fail, bodyFields, findRow, requireUUID, slotContext, bookingContext, assertStaff, assertBookingAccess, assertOperational, bumpSlot, audit, paidPayment } from './rules.js';

function confirmed(booking) {
  if (booking.status !== 'CONFIRMED') fail(409, 'INVALID_BOOKING_STATE', 'Nghiệp vụ chỉ áp dụng cho booking CONFIRMED.');
}
function createRefund(db, user, booking, now) {
  const existing = db.refunds.find((r) => r.booking_id === booking.id);
  if (existing) return existing;
  paidPayment(db, booking);
  const stamp = new Date(now).toISOString();
  const refund = { id: crypto.randomUUID(), booking_id: booking.id, amount: booking.total_amount, status: 'REQUESTED', reason: booking.issue_reason,
    requested_by: user.id, processed_by: null, created_at: stamp, updated_at: stamp };
  db.refunds.push(refund); Object.assign(booking, { refund_id: refund.id, refund_status: refund.status, updated_at: stamp });
  audit(db, user, 'REFUND_REQUESTED', 'refunds', refund, null, now, refund.reason);
  return refund;
}
export function rescheduleBooking(db, user, id, body, now) {
  bodyFields(body, ['new_time_slot_id', 'reason', 'is_venue_issue']);
  requireUUID(body.new_time_slot_id, 'new_time_slot_id');
  if (reasonError(body.reason) || (body.is_venue_issue !== undefined && typeof body.is_venue_issue !== 'boolean')) fail(400, 'VALIDATION_ERROR', reasonError(body.reason) || 'is_venue_issue phải là boolean.');
  const context = bookingContext(db, id), { booking, slot: old, court: oldCourt } = context;
  assertBookingAccess(user, context); confirmed(booking);
  if (db.refunds.some((r) => r.booking_id === id)) fail(409, 'REFUND_ALREADY_REQUESTED', 'Đã có refund, không thể đồng thời dời sân.');
  if (user.role === 'CUSTOMER' && body.is_venue_issue && !booking.issue_reported_at) fail(403, 'VENUE_ISSUE_NOT_REPORTED', 'Cơ sở chưa ghi nhận sự cố trên booking.');
  const issue = !!booking.issue_reported_at || body.is_venue_issue === true;
  const target = findRow(db.slots, body.new_time_slot_id), targetContext = slotContext(db, target), { court, venue } = targetContext;
  assertOperational(targetContext);
  if (court.venue_id !== oldCourt.venue_id || court.sport_type !== oldCourt.sport_type) fail(400, 'INCOMPATIBLE_SLOT', 'Chỉ dời cùng cơ sở và cùng bộ môn.');
  if (Number(target.price) !== Number(booking.total_amount)) fail(400, 'PRICE_MISMATCH', 'Ca mới phải có cùng giá với booking đã thanh toán.');
  if (Date.parse(target.start_at) <= now) fail(409, 'SLOT_ALREADY_STARTED', 'Ca mới phải chưa bắt đầu.');
  if (!issue && Date.parse(old.start_at) <= now) fail(409, 'BOOKING_ALREADY_STARTED', 'Chỉ dời tự nguyện trước giờ bắt đầu ca cũ.');
  if (target.id === old.id || target.status !== 'AVAILABLE' || db.bookings.some((b) => b.time_slot_id === target.id && ['PENDING', 'CONFIRMED', 'COMPLETED'].includes(b.status))) fail(409, 'SLOT_UNAVAILABLE', 'Ca mới không còn trống.');
  if (!['BOOKED', 'UNAVAILABLE'].includes(old.status)) fail(409, 'INVALID_SLOT_STATE', 'Trạng thái ca cũ không phù hợp để dời.');
  const before = structuredClone(booking), stamp = new Date(now).toISOString();
  bumpSlot(old, { status: issue ? 'UNAVAILABLE' : 'AVAILABLE' }, now); bumpSlot(target, { status: 'BOOKED' }, now);
  Object.assign(booking, { time_slot_id: target.id, court_id: court.id, court_name: court.name, venue_id: venue.id, venue_name: venue.name, sport_type: court.sport_type,
    start_at: target.start_at, end_at: target.end_at, held_until: null, issue_reported_at: null, issue_reason: null, updated_at: stamp });
  db.reschedules.push({ id: crypto.randomUUID(), booking_id: id, old_time_slot_id: old.id, new_time_slot_id: target.id, reason: body.reason.trim(), is_venue_issue: issue,
    requested_by: user.id, processed_by: user.role === 'CUSTOMER' ? null : user.id, created_at: stamp });
  audit(db, user, 'BOOKING_RESCHEDULED', 'bookings', booking, before, now, body.reason.trim());
  return booking;
}
export function writeAftersales(db, { path, method, body, user, now }) {
  const match = path.match(/^\/bookings\/([^/]+)\/(reschedule|refund-request|venue-issue)$/);
  const refundMatch = path.match(/^\/refunds\/([^/]+)\/status$/);
  if (!(method === 'POST' && match) && !(method === 'PATCH' && refundMatch)) return null;
  if (match?.[2] === 'reschedule') return { data: rescheduleBooking(db, user, match[1], body, now), status: 200 };
  const context = bookingContext(db, match ? match[1] : findRow(db.refunds, refundMatch[1]).booking_id), { booking, slot, venue } = context;
  const stamp = new Date(now).toISOString();
  if (match?.[2] === 'refund-request') {
    bodyFields(body, []);
    if (user.role !== 'CUSTOMER' || booking.customer_id !== user.id) fail(403, 'FORBIDDEN', 'Chỉ chủ booking được yêu cầu hoàn tiền.');
    if (!booking.issue_reported_at) fail(409, 'VENUE_ISSUE_REQUIRED', 'Cơ sở phải báo sự cố trước khi yêu cầu hoàn tiền.');
    const existing = db.refunds.find((r) => r.booking_id === booking.id);
    if (existing) return { data: existing, status: 201 };
    confirmed(booking); return { data: createRefund(db, user, booking, now), status: 201 };
  }
  assertStaff(user, venue);
  if (match) {
    bodyFields(body, ['reason', 'action']);
    if (reasonError(body.reason) || !['REPORT', 'REFUND'].includes(body.action ?? 'REPORT')) fail(400, 'VALIDATION_ERROR', reasonError(body.reason) || 'Action phải là REPORT hoặc REFUND.');
    confirmed(booking);
    if (!booking.issue_reported_at) {
      if (slot.status !== 'BOOKED') fail(409, 'INVALID_SLOT_STATE', 'Chỉ báo sự cố cho ca đã BOOKED.');
      const before = structuredClone(booking);
      booking.issue_reported_at = stamp; booking.issue_reason = body.reason.trim(); booking.updated_at = stamp;
      bumpSlot(slot, { status: 'UNAVAILABLE' }, now);
      audit(db, user, 'VENUE_ISSUE_REPORTED', 'bookings', booking, before, now, booking.issue_reason);
    }
    return { data: body.action === 'REFUND' ? createRefund(db, user, booking, now) : booking, status: 200 };
  }
  bodyFields(body, ['status']);
  if (!['APPROVED', 'COMPLETED'].includes(body.status)) fail(400, 'VALIDATION_ERROR', 'Chỉ gửi APPROVED hoặc COMPLETED.');
  const refund = findRow(db.refunds, refundMatch[1]);
  if (body.status === 'COMPLETED' && refund.status === 'COMPLETED') return { data: refund, status: 200 };
  if (!booking.issue_reported_at) fail(409, 'VENUE_ISSUE_REQUIRED', 'Booking không có sự cố để hoàn tiền.');
  confirmed(booking);
  if (body.status === 'APPROVED') {
    if (refund.status !== 'REQUESTED') fail(409, 'INVALID_REFUND_TRANSITION', 'Chỉ duyệt yêu cầu REQUESTED.');
    const before = structuredClone(refund);
    Object.assign(refund, { status: 'APPROVED', processed_by: user.id, updated_at: stamp });
    audit(db, user, 'REFUND_APPROVED', 'refunds', refund, before, now, refund.reason);
    const approved = structuredClone(refund); refund.status = 'PROCESSING';
    audit(db, null, 'REFUND_PROCESSING', 'refunds', refund, approved, now, refund.reason);
  } else {
    if (refund.status !== 'PROCESSING') fail(409, 'INVALID_REFUND_TRANSITION', 'Phải duyệt trước khi xác nhận đã hoàn tiền.');
    const payment = paidPayment(db, booking, refund.amount), before = structuredClone(refund);
    payment.status = 'REFUNDED'; payment.updated_at = stamp;
    booking.status = 'CANCELLED_BY_VENUE'; booking.updated_at = stamp;
    bumpSlot(slot, { status: 'UNAVAILABLE' }, now);
    Object.assign(refund, { status: 'COMPLETED', processed_by: user.id, updated_at: stamp });
    audit(db, user, 'REFUND_COMPLETED', 'refunds', refund, before, now, refund.reason);
  }
  booking.refund_id = refund.id; booking.refund_status = refund.status;
  return { data: refund, status: 200 };
}
