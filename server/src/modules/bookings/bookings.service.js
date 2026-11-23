import { randomUUID } from 'node:crypto';
import { db } from '../../db/knex.js';
import { AppError } from '../../lib/http.js';
import { lockVenueCourts, lockSlots, assertOperational } from '../../lib/locking.js';
import { writeAudit } from '../../lib/audit.js';
import {
  bookingDetailsQuery,
  bookingDetail,
  locateBooking,
  lockBooking,
  assertBookingAccess,
  assertManagerAccess,
  databaseNow,
} from './bookings.repository.js';

const conflict = (code, message) => new AppError(409, code, message);

async function locateSlot(queryable, id) {
  const slot = await queryable('time_slots').where({ id }).first();
  if (!slot) throw new AppError(404, 'SLOT_NOT_FOUND', 'Không tìm thấy khung giờ.');
  return slot;
}

async function lockSlotContext(trx, snapshot) {
  const [court] = await lockVenueCourts(trx, [snapshot.court_id]);
  const [slot] = await lockSlots(trx, [snapshot.id]);
  return { court, slot, now: await databaseNow(trx) };
}

export async function listBookings(user, filters = {}) {
  const query = bookingDetailsQuery(db).orderBy('b.created_at', 'desc').orderBy('b.id')
    .limit(filters.limit ?? 100).offset(filters.offset ?? 0);
  if (user.role === 'CUSTOMER') query.where('b.customer_id', user.id);
  if (user.role === 'VENUE_MANAGER') query.where('v.manager_id', user.id);
  for (const key of ['status', 'source']) if (filters[key]) query.where(`b.${key}`, filters[key]);
  if (filters.venue_id) query.where('v.id', filters.venue_id);
  if (filters.court_id) query.where('c.id', filters.court_id);
  if (filters.date) query.where('s.slot_date', filters.date);
  if (filters.refund_status) query.where('r.status', filters.refund_status);
  if (filters.has_issue === true) query.whereNotNull('b.issue_reported_at');
  if (filters.has_issue === false) query.whereNull('b.issue_reported_at');
  return query;
}

export async function getBookingHistory(user, id) {
  const booking = await getBooking(user, id);
  const [payments, reschedules, refund, review] = await Promise.all([
    db('payments').where({ booking_id: id }).orderBy('created_at').orderBy('id'),
    db('booking_reschedules').where({ booking_id: id }).orderBy('created_at').orderBy('id'),
    db('refunds').where({ booking_id: id }).first(),
    db('reviews').where({ booking_id: id }).first(),
  ]);
  return { booking, payments, reschedules, refund: refund ?? null, review: review ?? null };
}

export async function getBooking(user, id) {
  const booking = await bookingDetail(db, id);
  if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt sân.');
  assertBookingAccess(user, booking);
  return booking;
}

export async function bookOnline(user, input) {
  const snapshot = await locateSlot(db, input.time_slot_id);
  return db.transaction(async (trx) => {
    const { slot, court, now } = await lockSlotContext(trx, snapshot);
    assertOperational(court);
    const leadMinutes = Number(court.minimum_online_booking_lead_minutes);
    if (new Date(slot.start_at).getTime() - new Date(now).getTime() < leadMinutes * 60000) {
      throw conflict(
        'BOOKING_TOO_LATE',
        `Cần đặt online trước giờ bắt đầu ít nhất ${leadMinutes} phút.`,
      );
    }
    // Conditional UPDATE is a second guard in addition to the row lock.
    const [held] = await trx('time_slots')
      .where({ id: slot.id, status: 'AVAILABLE' })
      .update({
        status: 'HELD',
        held_until: trx.raw('clock_timestamp() + make_interval(mins => ?::integer)', [
          court.payment_hold_minutes,
        ]),
        version: trx.raw('version + 1'),
        updated_at: trx.fn.now(),
      })
      .returning('*');
    if (!held)
      throw conflict('SLOT_UNAVAILABLE', 'Khung giờ vừa được người khác đặt hoặc đang bị khóa.');
    const [booking] = await trx('bookings')
      .insert({
        time_slot_id: slot.id,
        customer_id: user.id,
        customer_name: user.full_name,
        status: 'PENDING',
        source: 'ONLINE',
        total_amount: slot.price,
      })
      .returning('*');
    await writeAudit(trx, { actorId: user.id, action: 'BOOKING_HELD',
      entityType: 'bookings', entityId: booking.id,
      after: { time_slot_id: slot.id, status: booking.status, held_until: held.held_until } });
    return {
      ...booking,
      held_until: held.held_until,
      start_at: slot.start_at,
      end_at: slot.end_at,
    };
  });
}

async function insertCounterPayment(trx, booking, method) {
  return trx('payments')
    .insert({
      booking_id: booking.id,
      method,
      transaction_code: `COUNTER-${randomUUID()}`,
      status: 'PAID',
      amount: booking.total_amount,
    })
    .returning('*');
}

export async function bookWalkIn(user, input) {
  const snapshot = await locateSlot(db, input.time_slot_id);
  return db.transaction(async (trx) => {
    const context = await lockSlotContext(trx, snapshot);
    assertManagerAccess(user, context);
    assertOperational(context.court);
    const { slot, now } = context;
    if (new Date(slot.end_at) <= new Date(now)) throw conflict('SLOT_ENDED', 'Ca này đã kết thúc.');
    const [reserved] = await trx('time_slots')
      .where({ id: slot.id, status: 'AVAILABLE' })
      .update({
        status: 'BOOKED',
        held_until: null,
        version: trx.raw('version + 1'),
        updated_at: trx.fn.now(),
      })
      .returning('*');
    if (!reserved) throw conflict('SLOT_UNAVAILABLE', 'Khung giờ không còn trống.');
    const [booking] = await trx('bookings')
      .insert({
        time_slot_id: slot.id,
        customer_name: input.customer_name,
        customer_phone: input.customer_phone ?? null,
        status: 'CONFIRMED',
        source: 'WALK_IN',
        total_amount: slot.price,
      })
      .returning('*');
    await insertCounterPayment(trx, booking, input.method);
    await writeAudit(trx, {
      actorId: user.id,
      action: 'BOOKING_WALK_IN',
      entityType: 'booking',
      entityId: booking.id,
      after: booking,
    });
    return bookingDetail(trx, booking.id);
  });
}

export async function completeBooking(user, id) {
  const snapshot = await locateBooking(db, id);
  return db.transaction(async (trx) => {
    const context = await lockBooking(trx, snapshot);
    assertManagerAccess(user, context);
    const { booking, slot, now } = context;
    if (booking.status === 'COMPLETED') return bookingDetail(trx, id);
    if (booking.status !== 'CONFIRMED')
      throw conflict('INVALID_BOOKING_STATUS', 'Chỉ đơn đã xác nhận mới được hoàn thành.');
    if (booking.issue_reported_at)
      throw conflict('BOOKING_HAS_ISSUE', 'Cần xử lý sự cố trước khi hoàn thành đơn.');
    if (new Date(slot.end_at) > new Date(now))
      throw conflict('BOOKING_NOT_ENDED', 'Chưa đến giờ kết thúc ca.');
    const [updated] = await trx('bookings')
      .where({ id })
      .update({ status: 'COMPLETED', updated_at: trx.fn.now() })
      .returning('*');
    await writeAudit(trx, {
      actorId: user.id,
      action: 'BOOKING_COMPLETE',
      entityType: 'booking',
      entityId: id,
      before: booking,
      after: updated,
    });
    return bookingDetail(trx, id);
  });
}

export async function extendBooking(user, id, input) {
  const snapshot = await locateBooking(db, id);
  const origin = await locateSlot(db, snapshot.time_slot_id);
  const next = await db('time_slots')
    .where({ court_id: origin.court_id, slot_date: origin.slot_date, start_time: origin.end_time })
    .first();
  if (!next) throw conflict('NEXT_SLOT_MISSING', 'Không có ca liền kề để gia hạn.');
  return db.transaction(async (trx) => {
    const [court] = await lockVenueCourts(trx, [snapshot.court_id]);
    assertManagerAccess(user, { court });
    assertOperational(court);
    const slots = await lockSlots(trx, [snapshot.time_slot_id, next.id]);
    const slot = slots.find((row) => row.id === snapshot.time_slot_id);
    const following = slots.find((row) => row.id === next.id);
    const booking = await trx('bookings').where({ id }).forUpdate().first();
    if (booking.time_slot_id !== snapshot.time_slot_id)
      throw conflict('BOOKING_CHANGED', 'Đơn vừa được dời lịch. Vui lòng tải lại.');
    if (booking.status !== 'CONFIRMED' || booking.issue_reported_at)
      throw conflict('INVALID_BOOKING_STATUS', 'Chỉ gia hạn đơn đã xác nhận và không có sự cố.');
    if (slot.end_time !== following.start_time || slot.court_id !== following.court_id)
      throw conflict('INVALID_NEXT_SLOT', 'Ca gia hạn không liền kề.');
    const now = await databaseNow(trx);
    if (new Date(following.end_at) <= new Date(now))
      throw conflict('SLOT_ENDED', 'Ca gia hạn đã kết thúc.');
    const [reserved] = await trx('time_slots')
      .where({ id: following.id, status: 'AVAILABLE' })
      .update({
        status: 'BOOKED',
        held_until: null,
        version: trx.raw('version + 1'),
        updated_at: trx.fn.now(),
      })
      .returning('*');
    if (!reserved)
      throw conflict('NEXT_SLOT_UNAVAILABLE', 'Ca liền kề không còn trống; không thể gia hạn.');
    const [extension] = await trx('bookings')
      .insert({
        time_slot_id: following.id,
        customer_id: booking.customer_id,
        customer_name: booking.customer_name,
        customer_phone: booking.customer_phone,
        status: 'CONFIRMED',
        source: 'EXTENSION',
        parent_booking_id: id,
        total_amount: following.price,
      })
      .returning('*');
    await insertCounterPayment(trx, extension, input.method);
    await writeAudit(trx, {
      actorId: user.id,
      action: 'BOOKING_EXTEND',
      entityType: 'booking',
      entityId: extension.id,
      after: extension,
    });
    return bookingDetail(trx, extension.id);
  });
}
