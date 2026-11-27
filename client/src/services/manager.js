import { get, post, patch, del, query } from '../api/client.js';
import { readPages } from '../api/pagination.js';

// UI-only filters are applied after ALL pages have been read, never to one partial page.
export async function readAll(path, { signal, pageSize = 300 } = {}) {
  return readPages(get, path, { signal, pageSize });
}
export const manager = {
  venues: (options) => readAll('/venues?mine=true', options),
  venue: (id, options) => get(`/venues/${id}`, options),
  courts: (id, options) => readAll(`/venues/${id}/courts`, options),
  slots: (id, date, options) => get(`/courts/${id}/slots?${query({ date })}`, options),
  saveVenue: (item, values) => item ? patch(`/venues/${item.id}`, { ...values, expected_version: item.version }) : post('/venues', values),
  saveCourt: (venueId, item, values) => item ? patch(`/courts/${item.id}`, { ...values, expected_version: item.version }) : post(`/venues/${venueId}/courts`, values),
  status: (type, item, status, reason) => patch(`/${type}/${item.id}/status`, { expected_version: item.version, status, reason }),
  remove: (type, item, reason) => del(`/${type}/${item.id}`, { expected_version: item.version, reason }),
  generate: (venueId, body) => post(`/venues/${venueId}/generate-slots`, body),
  price: (slot, price) => patch(`/slots/${slot.id}`, { expected_version: slot.version, price }),
};
