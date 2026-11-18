import { AppError } from './http.js';

export async function lockVenueCourts(trx, courtIds) {
  const ids = [...new Set(courtIds)].sort();
  const found = await trx('courts').whereIn('id', ids).select('id', 'venue_id');
  if (found.length !== ids.length)
    throw new AppError(404, 'COURT_NOT_FOUND', 'Không tìm thấy sân.');
  const venueIds = [...new Set(found.map((court) => court.venue_id))].sort();
  const venues = await trx('sport_venues').whereIn('id', venueIds).orderBy('id').forUpdate();
  const courts = await trx('courts').whereIn('id', ids).orderBy('id').forUpdate();
  return courts.map((court) => {
    const venue = venues.find((item) => item.id === court.venue_id);
    return {
      ...court,
      venue_status: venue.status,
      manager_id: venue.manager_id,
      payment_hold_minutes: venue.payment_hold_minutes,
      minimum_online_booking_lead_minutes: venue.minimum_online_booking_lead_minutes,
    };
  });
}

export async function lockSlots(trx, slotIds) {
  const ids = [...new Set(slotIds)].sort();
  return trx('time_slots')
    .whereIn('id', ids)
    .select(
      '*',
      trx.raw("(slot_date + start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS start_at"),
      trx.raw("(slot_date + end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS end_at"),
    )
    .orderBy('id')
    .forUpdate();
}

export function assertOperational(court) {
  if (court.status !== 'ACTIVE' || court.venue_status !== 'ACTIVE') {
    throw new AppError(409, 'COURT_NOT_OPERATIONAL', 'Sân hoặc cơ sở đang ngưng phục vụ.');
  }
}
