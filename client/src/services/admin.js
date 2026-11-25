import { get, patch } from '../api/client.js';
import { readPages } from '../api/pagination.js';
export const admin = {
  venues: (options) => readPages(get, '/venues', options),
  courts: (id, options) => readPages(get, `/venues/${id}/courts`, options),
  updateUser: (id, values) => patch(`/admin/users/${id}/status`, values),
  status: (type, item, status, reason) => patch(`/admin/${type}/${item.id}/status`, { expected_version: item.version, status, reason }),
};
