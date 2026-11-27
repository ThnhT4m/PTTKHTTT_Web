import { get, post, patch, query } from '../api/client.js';
import { readPages } from '../api/pagination.js';
export const operations = {
  venues: (options) => readPages(get, '/venues?mine=true', options),
  courts: (venueId, options) => readPages(get, `/venues/${venueId}/courts`, options),
  related: (venueId, options) => readPages(get, `/bookings?${query({ venue_id: venueId, source: 'EXTENSION' })}`, options),
  walkIn: (body) => post('/bookings/walk-in', body),
  extend: (id, method) => post(`/bookings/${id}/extend`, { method }),
  complete: (id) => post(`/bookings/${id}/complete`, {}),
  report: (id, body) => post(`/bookings/${id}/venue-issue`, body),
  refundStatus: (id, status) => patch(`/refunds/${id}/status`, { status }),
};
