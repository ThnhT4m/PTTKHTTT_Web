import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixtures } from '../src/mocks/data.js';
import { createMockTransport } from '../src/mocks/handler.js';
import { createMockStore, CATALOGUE_STORE_KEY } from '../src/mocks/store.js';
import { writeAftersales } from '../src/mocks/aftersales.js';
import { memoryStorage } from './helpers.js';

const now = Date.parse('2026-11-25T02:30:00Z');
function fixture() {
  const db = createFixtures(now), manager = db.users.find((u) => u.email === 'manager1@example.com'), admin = db.users.find((u) => u.role === 'ADMIN');
  const venue = db.venues.find((v) => v.manager_id === manager.id);
  const booking = db.bookings.find((b) => b.venue_id === venue.id && b.status === 'CONFIRMED' && !b.issue_reported_at && !b.refund_status);
  const target = db.slots.find((s) => s.court_id === booking.court_id && s.slot_date === '2026-11-27' && s.status === 'AVAILABLE' && s.price === booking.total_amount);
  return { db, manager, admin, venue, booking, target };
}
test('RV-01/02 ADMIN can move a past booking on a valid issue; voluntary second move reopens only the healthy previous slot', () => {
  const { db, admin, booking, target } = fixture(), old = db.slots.find((s) => s.id === booking.time_slot_id);
  old.start_at = new Date(now - 3600000).toISOString(); old.end_at = new Date(now - 1).toISOString();
  const args = { method: 'POST', path: `/bookings/${booking.id}/reschedule`, user: admin, now, body: { new_time_slot_id: target.id, is_venue_issue: true, reason: 'Sự cố cơ sở đã qua giờ' } };
  writeAftersales(db, args); assert.equal(old.status, 'UNAVAILABLE'); assert.equal(booking.issue_reported_at, null); assert.equal(db.reschedules.at(-1).processed_by, admin.id);
  const next = db.slots.find((s) => s.court_id === booking.court_id && s.slot_date === '2026-11-28' && s.status === 'AVAILABLE' && s.price === booking.total_amount);
  writeAftersales(db, { ...args, body: { ...args.body, new_time_slot_id: next.id, is_venue_issue: false } });
  assert.equal(target.status, 'AVAILABLE'); assert.equal(old.status, 'UNAVAILABLE'); assert.equal(next.status, 'BOOKED');
});
test('RV-03 refund rejects a PAID amount mismatch; terminal retry retains its existing record even after payment is REFUNDED', () => {
  const { db, manager, booking } = fixture();
  const payment = db.payments.find((p) => p.booking_id === booking.id && p.status === 'PAID'); payment.amount++;
  booking.issue_reported_at = new Date(now).toISOString(); booking.issue_reason = 'Sự cố kiểm thử thanh toán';
  const customer = db.users.find((u) => u.id === booking.customer_id), args = { method: 'POST', path: `/bookings/${booking.id}/refund-request`, body: {}, user: customer, now };
  assert.throws(() => writeAftersales(db, args), { code: 'REFUND_AMOUNT_MISMATCH' }); assert.equal(db.refunds.filter((r) => r.booking_id === booking.id).length, 0);
  payment.amount--; const refund = writeAftersales(db, args).data;
  for (const status of ['APPROVED', 'COMPLETED']) writeAftersales(db, { method: 'PATCH', path: `/refunds/${refund.id}/status`, body: { status }, user: manager, now });
  assert.equal(writeAftersales(db, args).data.id, refund.id); assert.equal(payment.status, 'REFUNDED');
});
test('RV-04 anonymous reads cannot bypass inactive venue through nested courts/schedule endpoints', async () => {
  const storage = memoryStorage(), store = createMockStore(storage, () => now), db = structuredClone(store.read());
  const venue = db.venues[0], court = db.courts.find((c) => c.venue_id === venue.id); venue.status = 'INACTIVE'; store.commit(db);
  const transport = createMockTransport({ storage, now: () => now });
  for (const path of [`/venues/${venue.id}`, `/venues/${venue.id}/courts`, `/courts/${court.id}`, `/courts/${court.id}/slots?date=2026-11-25`]) assert.equal((await transport(path)).status, 404);
});
test('RV-05 catalogue name ordering beats UUID order; filtering happens before offset for users/audits', async () => {
  const storage = memoryStorage(), store = createMockStore(storage, () => now), db = structuredClone(store.read());
  const sorted = [...db.venues].sort((a, b) => a.id.localeCompare(b.id)); sorted[0].name = 'Z venue'; sorted[1].name = 'A venue';
  const actor = db.users.find((u) => u.role === 'ADMIN'); store.commit(db);
  const transport = createMockTransport({ storage, now: () => now });
  assert.equal((await transport('/venues?limit=1')).payload.data[0].name, 'A venue');
  const login = await transport('/auth/login', { method: 'POST', body: { email: actor.email, password: 'Demo@12345' } }), token = login.payload.data.token;
  const users = (await transport('/admin/users?role=VENUE_MANAGER', { token })).payload.data;
  assert.deepEqual((await transport('/admin/users?role=VENUE_MANAGER&limit=1&offset=1', { token })).payload.data, users.slice(1, 2));
  const audits = (await transport('/admin/audit-logs?action=STATUS_CHANGED', { token })).payload.data;
  assert.deepEqual((await transport('/admin/audit-logs?action=STATUS_CHANGED&limit=1&offset=1', { token })).payload.data, audits.slice(1, 2));
});
test('refund storage failure leaves PROCESSING, PAID, CONFIRMED and UNAVAILABLE together without partial audit', async () => {
  const storage = memoryStorage(), store = createMockStore(storage, () => now), db = structuredClone(store.read());
  const { manager, booking } = fixture();
  writeAftersales(db, { method: 'POST', path: `/bookings/${booking.id}/venue-issue`, body: { reason: 'Sự cố kiểm tra rollback', action: 'REFUND' }, user: manager, now });
  const refund = db.refunds.find((r) => r.booking_id === booking.id);
  writeAftersales(db, { method: 'PATCH', path: `/refunds/${refund.id}/status`, body: { status: 'APPROVED' }, user: manager, now }); store.commit(db);
  const transport = createMockTransport({ storage, now: () => now });
  const token = (await transport('/auth/login', { method: 'POST', body: { email: manager.email, password: 'Demo@12345' } })).payload.data.token;
  const before = storage.getItem(CATALOGUE_STORE_KEY), set = storage.setItem;
  storage.setItem = (key, value) => { if (key === CATALOGUE_STORE_KEY) throw new Error('Quota'); set(key, value); };
  assert.equal((await transport(`/refunds/${refund.id}/status`, { method: 'PATCH', body: { status: 'COMPLETED' }, token })).status, 503);
  assert.equal(storage.getItem(CATALOGUE_STORE_KEY), before);
  const h = (await transport(`/bookings/${booking.id}/history`, { token })).payload.data;
  assert.equal(h.refund.status, 'PROCESSING'); assert.equal(h.booking.status, 'CONFIRMED'); assert.equal(h.payments[0].status, 'PAID');
});
