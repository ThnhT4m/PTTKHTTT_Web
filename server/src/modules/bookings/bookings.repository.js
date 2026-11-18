import { AppError } from '../../lib/http.js';
import { lockVenueCourts, lockSlots } from '../../lib/locking.js';
import { assertVenueOwner } from '../../middlewares/venueOwner.js';

export function bookingDetailsQuery(queryable) {
  return queryable('bookings as b')
    .join('time_slots as s', 's.id', 'b.time_slot_id')
    .join('courts as c', 'c.id', 's.court_id')
    .join('sport_venues as v', 'v.id', 'c.venue_id')
    .leftJoin('refunds as r', 'r.booking_id', 'b.id')
    .leftJoin('reviews as rv', 'rv.booking_id', 'b.id')
    .select(
      'b.*',
      'c.id as court_id',
      'c.name as court_name',
      'c.sport_type',
      'v.id as venue_id',
      'v.name as venue_name',
      'v.manager_id',
      's.slot_date',
      's.start_time',
      's.end_time',
      's.held_until',
      's.status as slot_status',
      'r.id as refund_id',
      'r.status as refund_status',
      'rv.id as review_id',
    )
    .select(
      queryable.raw("(s.slot_date + s.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' as start_at"),
    )
    .select(queryable.raw("(s.slot_date + s.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' as end_at"));
}

export const bookingDetail = (queryable, id) =>
  bookingDetailsQuery(queryable).where('b.id', id).first();

export async function locateBooking(queryable, id) {
  const row = await queryable('bookings as b')
    .join('time_slots as s', 's.id', 'b.time_slot_id')
    .join('courts as c', 'c.id', 's.court_id')
    .join('sport_venues as v', 'v.id', 'c.venue_id')
    .select('b.*', 's.court_id', 'c.venue_id', 'v.manager_id')
    .where('b.id', id)
    .first();
  if (!row) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt sân.');
  return row;
}

export async function databaseNow(trx) {
  const { rows } = await trx.raw('select clock_timestamp() as now');
  return rows[0].now;
}

// The consistent hierarchy is venue -> court -> slot -> booking. Re-read the
// booking after locking because a reschedule may have changed its slot.
export async function lockBooking(trx, snapshot) {
  const [court] = await lockVenueCourts(trx, [snapshot.court_id]);
  const [slot] = await lockSlots(trx, [snapshot.time_slot_id]);
  const booking = await trx('bookings').where({ id: snapshot.id }).forUpdate().first();
  if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt sân.');
  if (booking.time_slot_id !== snapshot.time_slot_id) {
    throw new AppError(
      409,
      'BOOKING_CHANGED',
      'Đơn vừa được dời lịch. Vui lòng tải lại và thử lại.',
    );
  }
  return { booking, slot, court, now: await databaseNow(trx) };
}

export function assertBookingAccess(user, context) {
  const booking = context.booking ?? context;
  const court = context.court ?? context;
  if (user.role === 'CUSTOMER') {
    if (booking.customer_id !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xử lý đơn đặt này.');
    }
  } else {
    assertVenueOwner(user, { manager_id: court.manager_id });
  }
}

export function assertManagerAccess(user, context) {
  if (!['VENUE_MANAGER', 'ADMIN'].includes(user.role)) {
    throw new AppError(403, 'FORBIDDEN', 'Chức năng dành cho quản lý cơ sở.');
  }
  assertVenueOwner(user, { manager_id: (context.court ?? context).manager_id });
}
