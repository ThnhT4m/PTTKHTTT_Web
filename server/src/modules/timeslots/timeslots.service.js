import { courtDetail } from '../venues/venues.service.js';
import { getByDate } from './timeslots.repository.js';

export async function schedule(courtId, date, user) {
  await courtDetail(courtId, user);
  return getByDate(courtId, date);
}
