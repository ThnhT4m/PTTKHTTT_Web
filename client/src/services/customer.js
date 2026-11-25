import { get, post, query } from '../api/client.js';
import { readPages } from '../api/pagination.js';
export const customer = {
  districts: (options) => readPages(get, '/venues', options),
  courts: (id, options) => readPages(get, `/venues/${id}/courts`, options),
  hold: (id) => post('/bookings/online', { time_slot_id: id }),
  history: (id, options) => get(`/bookings/${id}/history`, options),
  reschedule: (id, body) => post(`/bookings/${id}/reschedule`, body),
  refund: (id) => post(`/bookings/${id}/refund-request`, {}),
  review: (id, body) => post(`/bookings/${id}/reviews`, body),
};
export function pagePath(path, filters, offset = 0, limit = 12) {
  return `${path}?${query({ ...filters, limit, offset })}`;
}
