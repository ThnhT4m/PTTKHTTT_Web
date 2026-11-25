import { ApiError } from '../api/errors.js';
import { onlineSlotReason } from '../utils/customer.js';
import { reasonError } from '../utils/managerValidation.js';

const fail = (status, code, message) => { throw new ApiError({ code, message }, status); };
function whitelist(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) fail(400, 'VALIDATION_ERROR', 'Body chứa trường không hợp lệ.');
}
export function customerAudit(db, user, action, type, item, before, now, reason = null) {
  db.audits.push({ id: crypto.randomUUID(), actor_id: user?.id || null, actor_name: user?.full_name || 'Hệ thống', action, entity_type: type, entity_id: item.id, before_data: before, after_data: structuredClone(item), reason, created_at: new Date(now).toISOString() });
}
export function expireHolds(db, now) {
  for (const b of db.bookings) if (b.status === 'PENDING' && Date.parse(b.held_until) <= now) {
    const before = structuredClone(b), slot = db.slots.find((s) => s.id === b.time_slot_id);
    if (slot?.status === 'HELD' && slot.held_until === b.held_until && !db.bookings.some((other) => other.id !== b.id && other.time_slot_id === slot.id && other.status === 'PENDING' && Date.parse(other.held_until) > now)) {
      slot.status = 'AVAILABLE'; slot.held_until = null; slot.version++; slot.updated_at = new Date(now).toISOString();
    }
    b.status = 'EXPIRED'; b.held_until = null; b.updated_at = new Date(now).toISOString();
    db.payments.filter((p) => p.booking_id === b.id && p.status === 'PENDING').forEach((p) => { p.status = 'FAILED'; });
    customerAudit(db, null, 'BOOKING_EXPIRED', 'bookings', b, before, now);
  }
}
export function writeCustomer(db, { path, method, body, user, now }) {
  if (method !== 'POST' || !(/^\/bookings\/online$/.test(path) || /^\/bookings\/[^/]+\/(reschedule|refund-request|reviews)$/.test(path))) return null;
  if (user.role !== 'CUSTOMER') {
    if (path !== '/bookings/online' && ['VENUE_MANAGER', 'ADMIN'].includes(user.role)) fail(501, 'MOCK_NOT_IMPLEMENTED', 'Nghiệp vụ hậu mãi phía quản lý thuộc TASK 4, chưa được hỗ trợ.');
    fail(403, 'FORBIDDEN', 'Chỉ CUSTOMER được thực hiện thao tác khách hàng.');
  }
  const stamp = new Date(now).toISOString();
  const find = (rows, id) => rows.find((r) => r.id === id) || fail(404, 'NOT_FOUND', 'Không tìm thấy dữ liệu.');
  const courtFor = (slot) => find(db.courts, slot.court_id);
  const venueFor = (court) => find(db.venues, court.venue_id);
  if (path === '/bookings/online') {
    whitelist(body, ['time_slot_id']);
    if (!/^[0-9a-f-]{36}$/i.test(body.time_slot_id || '')) fail(400, 'VALIDATION_ERROR', 'time_slot_id phải là UUID hợp lệ.');
    const slot = find(db.slots, body.time_slot_id), court = courtFor(slot), venue = venueFor(court);
    const reason = onlineSlotReason(slot, court, venue, now);
    if (reason) fail(409, slot.status !== 'AVAILABLE' ? 'SLOT_NOT_AVAILABLE' : court.status !== 'ACTIVE' || venue.status !== 'ACTIVE' ? 'NOT_OPERATIONAL' : 'LEAD_TIME', reason);
    if (db.bookings.some((b) => b.time_slot_id === slot.id && ['PENDING', 'CONFIRMED', 'COMPLETED'].includes(b.status))) fail(409, 'SLOT_NOT_AVAILABLE', 'Ca đang có booking hiệu lực.');
    const held_until = new Date(now + venue.payment_hold_minutes * 60000).toISOString();
    slot.status = 'HELD'; slot.held_until = held_until; slot.version++; slot.updated_at = stamp;
    const booking = { id: crypto.randomUUID(), time_slot_id: slot.id, customer_id: user.id, customer_name: user.full_name, customer_phone: user.phone || null,
      status: 'PENDING', source: 'ONLINE', parent_booking_id: null, total_amount: slot.price, held_until,
      issue_reported_at: null, issue_reason: null, created_at: stamp, updated_at: stamp,
      court_id: court.id, venue_id: venue.id, court_name: court.name, venue_name: venue.name, sport_type: court.sport_type,
      start_at: slot.start_at, end_at: slot.end_at, refund_id: null, refund_status: null, review_id: null };
    db.bookings.push(booking); customerAudit(db, user, 'BOOKING_HELD', 'bookings', booking, null, now);
    return { data: booking, status: 201 };
  }
  const [, , id, action] = path.split('/'), booking = find(db.bookings, id);
  if (booking.customer_id !== user.id) fail(403, 'FORBIDDEN', 'Booking không thuộc tài khoản của bạn.');
  const before = structuredClone(booking);
  if (action === 'reviews') {
    whitelist(body, ['rating', 'comment']);
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.length > 2000))) fail(400, 'VALIDATION_ERROR', 'Đánh giá cần 1–5 sao, bình luận tối đa 2000 ký tự.');
    if (booking.status !== 'COMPLETED' || booking.review_id || db.reviews.some((r) => r.booking_id === id)) fail(409, 'REVIEW_NOT_ALLOWED', 'Chỉ đánh giá một lần cho booking đã hoàn thành.');
    const review = { id: crypto.randomUUID(), booking_id: id, rating: body.rating, comment: body.comment || '', created_at: stamp };
    db.reviews.push(review); booking.review_id = review.id;
    customerAudit(db, user, 'REVIEW_CREATED', 'reviews', review, null, now);
    return { data: review, status: 201 };
  }
  if (action === 'refund-request') {
    whitelist(body, []);
    const existing = db.refunds.find((r) => r.booking_id === id);
    if (existing) return { data: existing, status: 200 };
    if (booking.status !== 'CONFIRMED' || !booking.issue_reported_at) fail(409, 'REFUND_NOT_ALLOWED', 'Chỉ yêu cầu hoàn tiền khi cơ sở đã báo sự cố trên booking được xác nhận.');
    const refund = { id: crypto.randomUUID(), booking_id: id, amount: booking.total_amount, status: 'REQUESTED', reason: booking.issue_reason,
      requested_by: user.id, processed_by: null, created_at: stamp, updated_at: stamp };
    db.refunds.push(refund); booking.refund_id = refund.id; booking.refund_status = 'REQUESTED'; booking.updated_at = stamp;
    customerAudit(db, user, 'REFUND_REQUESTED', 'refunds', refund, null, now, refund.reason);
    return { data: refund, status: 201 };
  }
  whitelist(body, ['new_time_slot_id', 'reason', 'is_venue_issue']);
  if (reasonError(body.reason) || (body.is_venue_issue !== undefined && typeof body.is_venue_issue !== 'boolean')) fail(400, 'VALIDATION_ERROR', reasonError(body.reason) || 'is_venue_issue phải là boolean.');
  if (booking.status !== 'CONFIRMED' || booking.refund_status || db.refunds.some((r) => r.booking_id === id)) fail(409, 'RESCHEDULE_NOT_ALLOWED', 'Chỉ dời booking CONFIRMED chưa có yêu cầu hoàn tiền.');
  const issue = body.is_venue_issue === true;
  if (issue && !booking.issue_reported_at) fail(403, 'ISSUE_NOT_REPORTED', 'Cơ sở chưa ghi nhận sự cố trên booking.');
  if (!issue && Date.parse(booking.start_at) <= now) fail(409, 'RESCHEDULE_TOO_LATE', 'Chỉ dời tự nguyện trước giờ bắt đầu ca cũ.');
  const target = find(db.slots, body.new_time_slot_id), old = find(db.slots, booking.time_slot_id), court = courtFor(target), venue = venueFor(court), oldCourt = courtFor(old);
  if (target.id === old.id || target.status !== 'AVAILABLE' || Date.parse(target.start_at) <= now || court.venue_id !== booking.venue_id || court.sport_type !== oldCourt.sport_type || target.price !== booking.total_amount || court.status !== 'ACTIVE' || venue.status !== 'ACTIVE' || db.bookings.some((b) => b.time_slot_id === target.id && ['PENDING', 'CONFIRMED', 'COMPLETED'].includes(b.status))) fail(409, 'INVALID_RESCHEDULE_TARGET', 'Chọn ca trống trong tương lai, cùng cơ sở, bộ môn và giá; sân phải hoạt động.');
  old.status = issue ? 'UNAVAILABLE' : 'AVAILABLE'; old.held_until = null; old.version++; old.updated_at = stamp;
  target.status = 'BOOKED'; target.held_until = null; target.version++; target.updated_at = stamp;
  Object.assign(booking, { time_slot_id: target.id, court_id: court.id, court_name: court.name, start_at: target.start_at, end_at: target.end_at, held_until: null, updated_at: stamp });
  const history = { id: crypto.randomUUID(), booking_id: id, old_time_slot_id: old.id, new_time_slot_id: target.id, reason: body.reason.trim(), is_venue_issue: issue, requested_by: user.id, processed_by: null, created_at: stamp };
  db.reschedules.push(history); customerAudit(db, user, 'BOOKING_RESCHEDULED', 'bookings', booking, before, now, history.reason);
  return { data: booking, status: 200 };
}
