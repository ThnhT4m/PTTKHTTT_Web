import { courtDetail } from '../venues/venues.service.js';
import { getByDate } from './timeslots.repository.js';
import { db } from '../../db/knex.js';
import { AppError } from '../../lib/http.js';
import { writeAudit } from '../../lib/audit.js';
import { lockVenueCourts, lockSlots } from '../../lib/locking.js';
import { assertVenueOwner } from '../../middlewares/venueOwner.js';
import { databaseNow } from '../bookings/bookings.repository.js';
import { addDays, vietnamDate, slotTemplates } from '../../lib/calendar.js';

export async function schedule(courtId, date, user) {
  await courtDetail(courtId, user);
  return getByDate(courtId, date);
}

export async function generateSlots(venueId, input, user) {
  return db.transaction(async (trx) => {
    const venue = await trx('sport_venues').where({ id: venueId }).forUpdate().first();
    if (!venue) throw new AppError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.');
    assertVenueOwner(user, venue);
    if (venue.status !== 'ACTIVE')
      throw new AppError(409, 'VENUE_NOT_OPERATIONAL', 'Chỉ mở lịch cho cơ sở đang hoạt động.');
    const today = vietnamDate(await databaseNow(trx));
    const startDate = input.start_date ?? today;
    const days = input.days ?? 30;
    const endDate = addDays(startDate, days - 1);
    if (startDate < today || endDate > addDays(today, 30))
      throw new AppError(400, 'INVALID_SCHEDULE_RANGE', 'Chỉ mở lịch từ hôm nay đến 30 ngày tới.');
    const query = trx('courts').where({ venue_id: venueId }).orderBy('id').forUpdate();
    if (input.court_ids) query.whereIn('id', input.court_ids);
    const courts = await query;
    if (input.court_ids && courts.length !== input.court_ids.length)
      throw new AppError(400, 'INVALID_COURTS', 'Có sân không thuộc cơ sở này.');
    const active = courts.filter((court) => court.status === 'ACTIVE');
    if (!active.length) throw new AppError(409, 'NO_ACTIVE_COURTS', 'Không có sân đang hoạt động.');
    const templates = slotTemplates(active, startDate, days);
    let created = 0;
    for (let offset = 0; offset < templates.length; offset += 500) {
      // The venue lock serializes generation with booking/status/price edits.
      // Never overwrite an existing slot, its price or reservation state.
      const inserted = await trx('time_slots').insert(templates.slice(offset, offset + 500))
        .onConflict(['court_id', 'slot_date', 'start_time', 'end_time']).ignore().returning('id');
      created += inserted.length;
    }
    const result = { venue_id: venueId, start_date: startDate, end_date: endDate,
      court_count: active.length, created, skipped: templates.length - created };
    await writeAudit(trx, { actorId: user.id, action: 'SLOTS_GENERATED',
      entityType: 'sport_venues', entityId: venueId, after: result });
    return result;
  });
}

export async function updatePrice(id, input, user) {
  return db.transaction(async (trx) => {
    const snapshot = await trx('time_slots').where({ id }).first();
    if (!snapshot) throw new AppError(404, 'SLOT_NOT_FOUND', 'Không tìm thấy khung giờ.');
    const [court] = await lockVenueCourts(trx, [snapshot.court_id]);
    assertVenueOwner(user, court);
    const [before] = await lockSlots(trx, [id]);
    if (before.version !== input.expected_version)
      throw new AppError(409, 'EDIT_CONFLICT', 'Dữ liệu vừa thay đổi. Tải lại trước khi lưu.', { current: before });
    if (!['AVAILABLE', 'UNAVAILABLE'].includes(before.status) ||
      new Date(before.start_at) <= new Date(await databaseNow(trx)) ||
      await trx('bookings').where({ time_slot_id: id })
        .whereIn('status', ['PENDING', 'CONFIRMED', 'COMPLETED']).first())
      throw new AppError(409, 'SLOT_PRICE_LOCKED', 'Chỉ đổi giá ca chưa bắt đầu và không có đơn đang hiệu lực.');
    const [after] = await trx('time_slots').where({ id }).update({ price: input.price,
      version: before.version + 1, updated_at: trx.fn.now() }).returning('*');
    await writeAudit(trx, { actorId: user.id, action: 'SLOT_PRICE_CHANGED',
      entityType: 'time_slots', entityId: id, before, after });
    return after;
  });
}
