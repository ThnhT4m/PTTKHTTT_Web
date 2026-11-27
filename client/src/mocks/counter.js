import { fail, bodyFields, findRow, requireUUID, slotContext, bookingContext, assertStaff, assertOperational, bumpSlot, audit } from './rules.js';
const counterMethod = (method) => { if (!['CASH', 'BANK_TRANSFER'].includes(method)) fail(400, 'VALIDATION_ERROR', 'Phương thức tại quầy phải là CASH hoặc BANK_TRANSFER.'); };
function reserve(db, user, context, customer, source, method, now, parent = null) {
  const { slot, court, venue } = context, stamp = new Date(now).toISOString();
  if (slot.status !== 'AVAILABLE' || db.bookings.some((b) => b.time_slot_id === slot.id && ['PENDING', 'CONFIRMED', 'COMPLETED'].includes(b.status))) fail(409, parent ? 'NEXT_SLOT_UNAVAILABLE' : 'SLOT_UNAVAILABLE', 'Ca không còn trống, không thể bán hoặc gia hạn.');
  bumpSlot(slot, { status: 'BOOKED' }, now);
  const booking = { id: crypto.randomUUID(), time_slot_id: slot.id, customer_id: customer.customer_id ?? null, customer_name: customer.customer_name, customer_phone: customer.customer_phone || null,
    status: 'CONFIRMED', source, parent_booking_id: parent, total_amount: slot.price, held_until: null, issue_reported_at: null, issue_reason: null,
    created_at: stamp, updated_at: stamp, court_id: court.id, court_name: court.name, venue_id: venue.id, venue_name: venue.name, sport_type: court.sport_type,
    start_at: slot.start_at, end_at: slot.end_at, refund_id: null, refund_status: null, review_id: null };
  db.bookings.push(booking);
  db.payments.push({ id: crypto.randomUUID(), booking_id: booking.id, method, transaction_code: `COUNTER-${crypto.randomUUID()}`, status: 'PAID', amount: booking.total_amount, created_at: stamp, updated_at: stamp });
  audit(db, user, parent ? 'BOOKING_EXTEND' : 'BOOKING_WALK_IN', 'booking', booking, null, now);
  return { data: booking, status: 201 };
}
export function writeCounter(db, { path, method, body, user, now }) {
  const match = path.match(/^\/bookings\/([^/]+)\/(extend|complete)$/);
  if (method !== 'POST' || (path !== '/bookings/walk-in' && !match)) return null;
  if (!['VENUE_MANAGER', 'ADMIN'].includes(user.role)) fail(403, 'FORBIDDEN', 'Chức năng dành cho quản lý hoặc ADMIN.');
  if (path === '/bookings/walk-in') {
    bodyFields(body, ['time_slot_id', 'customer_name', 'customer_phone', 'method']); counterMethod(body.method);
    requireUUID(body.time_slot_id, 'time_slot_id');
    if (typeof body.customer_name !== 'string' || body.customer_name.trim().length < 2 || body.customer_name.trim().length > 120 ||
      (body.customer_phone !== undefined && (typeof body.customer_phone !== 'string' || body.customer_phone.trim().length > 30))) fail(400, 'VALIDATION_ERROR', 'Tên cần 2–120 ký tự; điện thoại tùy chọn tối đa 30 ký tự.');
    const context = slotContext(db, findRow(db.slots, body.time_slot_id)); assertStaff(user, context.venue); assertOperational(context);
    if (Date.parse(context.slot.end_at) <= now) fail(409, 'SLOT_ENDED', 'Ca này đã kết thúc.');
    return reserve(db, user, context, { customer_name: body.customer_name.trim(), customer_phone: body.customer_phone?.trim() }, 'WALK_IN', body.method, now);
  }
  const context = bookingContext(db, match[1]), { booking, slot } = context;
  assertStaff(user, context.venue);
  if (match[2] === 'complete') {
    bodyFields(body, []);
    if (booking.status === 'COMPLETED') return { data: booking, status: 200 };
    if (booking.status !== 'CONFIRMED') fail(409, 'INVALID_BOOKING_STATUS', 'Chỉ hoàn thành booking CONFIRMED.');
    if (booking.issue_reported_at) fail(409, 'BOOKING_HAS_ISSUE', 'Cần xử lý sự cố trước khi hoàn thành.');
    if (Date.parse(slot.end_at) > now) fail(409, 'BOOKING_NOT_ENDED', 'Chưa đến giờ kết thúc ca.');
    const before = structuredClone(booking); booking.status = 'COMPLETED'; booking.updated_at = new Date(now).toISOString();
    audit(db, user, 'BOOKING_COMPLETE', 'booking', booking, before, now);
    return { data: booking, status: 200 };
  }
  bodyFields(body, ['method']); counterMethod(body.method); assertOperational(context);
  if (booking.status !== 'CONFIRMED' || booking.issue_reported_at) fail(409, 'INVALID_BOOKING_STATUS', 'Chỉ gia hạn đơn CONFIRMED không có sự cố.');
  const next = db.slots.find((s) => s.court_id === slot.court_id && s.slot_date === slot.slot_date && s.start_time === slot.end_time);
  if (!next) fail(409, 'NEXT_SLOT_MISSING', 'Không có ca liền kề để gia hạn.');
  if (Date.parse(next.end_at) <= now) fail(409, 'SLOT_ENDED', 'Ca gia hạn đã kết thúc.');
  return reserve(db, user, slotContext(db, next), booking, 'EXTENSION', body.method, now, booking.id);
}
