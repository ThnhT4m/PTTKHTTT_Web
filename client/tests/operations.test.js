import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockTransport } from '../src/mocks/handler.js';
import { createMockStore, CATALOGUE_STORE_KEY } from '../src/mocks/store.js';
import { createApiClient } from '../src/api/http.js';
import { createSession } from '../src/api/session.js';
import { memoryStorage } from './helpers.js';
import { orderRows } from '../src/mocks/order.js';
import { redactSecrets } from '../src/utils/redact.js';
import { canComplete, nextSlot, walkInErrors, walkInReason, slotPhase } from '../src/utils/operations.js';

const instant = Date.parse('2026-11-25T02:30:00Z');
async function setup() {
  const storage = memoryStorage(); let clock = instant;
  const now = () => clock;
  async function account(email) {
    const session = createSession('mock', memoryStorage());
    const client = createApiClient({ transport: createMockTransport({ storage, now }), session });
    async function login() { const { data } = await client.post('/auth/login', { email, password: 'Demo@12345' }); session.setToken(data.token); return data.user; }
    return { client, session, user: await login(), login };
  }
  const manager = await account('manager1@example.com'), customer = await account('customer@example.com'), admin = await account('admin@example.com'), foreign = await account('manager2@example.com');
  const store = createMockStore(storage, now);
  function edit(fn) { const db = structuredClone(store.read()); fn(db); store.commit(db); }
  async function fresh() {
    const venue = (await manager.client.post('/venues', { name: 'Cơ sở kiểm thử POS', address: 'Địa chỉ kiểm thử hợp lệ', district: 'Thủ Đức' })).data;
    const court = (await manager.client.post(`/venues/${venue.id}/courts`, { name: 'Sân kiểm thử POS', sport_type: 'FOOTBALL', hourly_price: 250000 })).data;
    await manager.client.post(`/venues/${venue.id}/generate-slots`, { days: 3 });
    const slots = (await manager.client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data;
    return { venue, court, slots };
  }
  return { storage, manager, customer, admin, foreign, store, edit, fresh, account, advance: (ms) => { clock += ms; } };
}
const walk = (client, slot, extra = {}) => client.post('/bookings/walk-in', { time_slot_id: slot.id, customer_name: '  Khách POS  ', customer_phone: ' 0901234567 ', method: 'CASH', ...extra });
const slotAt = (slots, hour) => slots.find((s) => s.start_time === `${hour}:00:00`);

test('POS sells a running slot without online lead time and future slots, atomically with exact paid amount', async () => {
  const { manager, fresh } = await setup(), { slots } = await fresh();
  for (const hour of ['09', '12']) {
    const slot = slotAt(slots, hour), booking = (await walk(manager.client, slot)).data;
    assert.equal(booking.status, 'CONFIRMED'); assert.equal(booking.source, 'WALK_IN'); assert.equal(booking.customer_name, 'Khách POS'); assert.equal(booking.customer_phone, '0901234567');
    const history = (await manager.client.get(`/bookings/${booking.id}/history`)).data;
    assert.equal(history.payments.length, 1); assert.equal(history.payments[0].amount, slot.price); assert.equal(history.payments[0].status, 'PAID');
    await assert.rejects(walk(manager.client, slot), { status: 409 });
  }
});
test('POS rejects ended/held/booked/unavailable slots, inactive parents, bad input and foreign ownership', async () => {
  const { manager, customer, foreign, fresh, edit } = await setup(), { slots, venue, court } = await fresh();
  await assert.rejects(walk(manager.client, slotAt(slots, '08')), { status: 409, code: 'SLOT_ENDED' });
  for (const status of ['HELD', 'BOOKED', 'UNAVAILABLE']) {
    edit((db) => { db.slots.find((s) => s.id === slotAt(slots, '12').id).status = status; });
    await assert.rejects(walk(manager.client, slotAt(slots, '12')), { status: 409 });
  }
  await assert.rejects(walk(foreign.client, slotAt(slots, '13')), { status: 403 });
  await assert.rejects(walk(customer.client, slotAt(slots, '13')), { status: 403 });
  for (const extra of [{ method: 'CARD' }, { customer_name: ' ' }, { customer_name: 'x'.repeat(121) }, { customer_phone: 'x'.repeat(31) }]) await assert.rejects(walk(manager.client, slotAt(slots, '13'), extra), { status: 400 });
  for (const [key, id] of [['venues', venue.id], ['courts', court.id]]) {
    edit((db) => { db[key].find((r) => r.id === id).status = 'INACTIVE'; });
    await assert.rejects(walk(manager.client, slotAt(slots, '13')), { status: 409 });
    edit((db) => { db[key].find((r) => r.id === id).status = 'ACTIVE'; });
  }
});
test('extension uses only adjacent same-day slot, its actual price and inherited customer/parent; parent remains independent', async () => {
  const { manager, customer, fresh, edit } = await setup(), { slots } = await fresh();
  const original = (await walk(manager.client, slotAt(slots, '09'))).data, next = slotAt(slots, '10');
  edit((db) => { db.slots.find((s) => s.id === next.id).price = 333000; db.bookings.find((b) => b.id === original.id).customer_id = customer.user.id; });
  const child = (await manager.client.post(`/bookings/${original.id}/extend`, { method: 'BANK_TRANSFER' })).data;
  assert.equal(child.source, 'EXTENSION'); assert.equal(child.parent_booking_id, original.id); assert.equal(child.time_slot_id, next.id); assert.equal(child.customer_id, customer.user.id); assert.equal(child.customer_name, original.customer_name); assert.equal(child.customer_phone, original.customer_phone); assert.equal(child.total_amount, 333000);
  assert.equal((await manager.client.get(`/bookings/${original.id}`)).data.time_slot_id, original.time_slot_id);
  assert.equal((await customer.client.get(`/bookings/${child.id}/history`)).data.payments[0].amount, 333000);
});
for (const status of ['HELD', 'BOOKED', 'UNAVAILABLE']) test(`extension never skips adjacent ${status} slot`, async () => {
  const { manager, fresh, edit } = await setup(), { slots } = await fresh(), b = (await walk(manager.client, slotAt(slots, '09'))).data;
  edit((db) => { db.slots.find((s) => s.id === slotAt(slots, '10').id).status = status; });
  await assert.rejects(manager.client.post(`/bookings/${b.id}/extend`, { method: 'CASH' }), { status: 409, code: 'NEXT_SLOT_UNAVAILABLE' });
  assert.equal((await manager.client.get('/bookings?source=EXTENSION')).data.filter((x) => x.parent_booking_id === b.id).length, 0);
});
test('extension rejects end-of-day, inactive parent, issue and wrong role/scope', async () => {
  const { manager, foreign, customer, fresh, edit } = await setup(), { slots, court } = await fresh(), b = (await walk(manager.client, slotAt(slots, '21'))).data;
  await assert.rejects(manager.client.post(`/bookings/${b.id}/extend`, { method: 'CASH' }), { code: 'NEXT_SLOT_MISSING' });
  for (const actor of [foreign, customer]) await assert.rejects(actor.client.post(`/bookings/${b.id}/extend`, { method: 'CASH' }), { status: 403 });
  edit((db) => { db.courts.find((c) => c.id === court.id).status = 'INACTIVE'; });
  await assert.rejects(manager.client.post(`/bookings/${b.id}/extend`, { method: 'CASH' }), { status: 409 });
});
test('completion guards server end time/issue, is idempotent, keeps BOOKED and enables owner review', async () => {
  const { manager, customer, foreign, fresh, edit, advance, store } = await setup(), { slots } = await fresh(), b = (await walk(manager.client, slotAt(slots, '09'))).data;
  await assert.rejects(manager.client.post(`/bookings/${b.id}/complete`, {}), { code: 'BOOKING_NOT_ENDED' });
  edit((db) => { const row = db.bookings.find((r) => r.id === b.id); row.issue_reported_at = new Date(instant).toISOString(); row.customer_id = customer.user.id; });
  advance(3600000); await assert.rejects(manager.client.post(`/bookings/${b.id}/complete`, {}), { code: 'BOOKING_HAS_ISSUE' });
  edit((db) => { db.bookings.find((r) => r.id === b.id).issue_reported_at = null; });
  await assert.rejects(foreign.client.post(`/bookings/${b.id}/complete`, {}), { status: 403 });
  assert.equal((await manager.client.post(`/bookings/${b.id}/complete`, {})).data.status, 'COMPLETED');
  const count = store.read().audits.length; await manager.client.post(`/bookings/${b.id}/complete`, {}); assert.equal(store.read().audits.length, count);
  assert.equal(store.read().slots.find((s) => s.id === b.time_slot_id).status, 'BOOKED');
  assert.equal((await customer.client.post(`/bookings/${b.id}/reviews`, { rating: 5, comment: 'Đã sử dụng sân sau hoàn thành.' })).data.rating, 5);
});
test('RV-01/02 customer cannot invent issue; false does not reopen damaged slot; shared staff move clears flags and records history', async () => {
  const { manager, customer, foreign, store } = await setup();
  let b = (await customer.client.get('/bookings?status=CONFIRMED')).data.find((b) => !b.issue_reported_at && !b.refund_status);
  const target = (await customer.client.get(`/courts/${b.court_id}/slots?date=2026-11-27`)).data.find((s) => s.status === 'AVAILABLE' && s.price === b.total_amount);
  const body = { new_time_slot_id: target.id, reason: 'Dời do sự cố sân', is_venue_issue: true };
  await assert.rejects(customer.client.post(`/bookings/${b.id}/reschedule`, body), { status: 403, code: 'VENUE_ISSUE_NOT_REPORTED' });
  await assert.rejects(foreign.client.post(`/bookings/${b.id}/venue-issue`, { reason: body.reason, action: 'REPORT' }), { status: 403 });
  await manager.client.post(`/bookings/${b.id}/venue-issue`, { reason: body.reason, action: 'REPORT' });
  const count = store.read().audits.length; await manager.client.post(`/bookings/${b.id}/venue-issue`, { reason: body.reason, action: 'REPORT' }); assert.equal(store.read().audits.length, count);
  await customer.client.post(`/bookings/${b.id}/reschedule`, { ...body, is_venue_issue: false });
  const h = (await customer.client.get(`/bookings/${b.id}/history`)).data;
  assert.equal(h.booking.issue_reported_at, null); assert.equal(h.booking.issue_reason, null); assert.equal(h.reschedules.at(-1).is_venue_issue, true);
  assert.equal(store.read().slots.find((s) => s.id === b.time_slot_id).status, 'UNAVAILABLE'); assert.equal(store.read().slots.find((s) => s.id === target.id).status, 'BOOKED');
  const target2 = (await manager.client.get(`/courts/${b.court_id}/slots?date=2026-11-28`)).data.find((s) => s.status === 'AVAILABLE' && s.price === b.total_amount);
  await manager.client.post(`/bookings/${b.id}/reschedule`, { ...body, new_time_slot_id: target2.id });
  assert.equal((await manager.client.get(`/bookings/${b.id}/history`)).data.reschedules.find((r) => r.new_time_slot_id === target2.id).processed_by, manager.user.id);
});
test('RV-02 invalid old slot state rejects move with no partial changes', async () => {
  const { customer, edit, storage } = await setup(), b = (await customer.client.get('/bookings?status=CONFIRMED')).data.find((b) => !b.issue_reported_at && !b.refund_status);
  const target = (await customer.client.get(`/courts/${b.court_id}/slots?date=2026-11-27`)).data.find((s) => s.price === b.total_amount && s.status === 'AVAILABLE');
  edit((db) => { db.slots.find((s) => s.id === b.time_slot_id).status = 'HELD'; }); const before = storage.getItem(CATALOGUE_STORE_KEY);
  await assert.rejects(customer.client.post(`/bookings/${b.id}/reschedule`, { new_time_slot_id: target.id, reason: 'Kiểm tra ca cũ' }), { code: 'INVALID_SLOT_STATE' }); assert.equal(storage.getItem(CATALOGUE_STORE_KEY), before);
});
test('RV-03 missing PAID rejects refund and rolls back combined issue; existing request retries safely', async () => {
  const { manager, customer, edit, storage } = await setup(), b = (await customer.client.get('/bookings?status=CONFIRMED')).data.find((b) => !b.issue_reported_at && !b.refund_status);
  edit((db) => { db.payments.filter((p) => p.booking_id === b.id).forEach((p) => { p.status = 'FAILED'; }); }); const before = storage.getItem(CATALOGUE_STORE_KEY);
  await assert.rejects(manager.client.post(`/bookings/${b.id}/venue-issue`, { reason: 'Sự cố không thanh toán', action: 'REFUND' }), { status: 409, code: 'PAID_PAYMENT_REQUIRED' }); assert.equal(storage.getItem(CATALOGUE_STORE_KEY), before);
  await manager.client.post(`/bookings/${b.id}/venue-issue`, { reason: 'Sự cố không thanh toán', action: 'REPORT' });
  await assert.rejects(customer.client.post(`/bookings/${b.id}/refund-request`, {}), { code: 'PAID_PAYMENT_REQUIRED' });
});
test('refund full chain updates payment/booking/slot atomically, creates two approval audits, excludes reschedule and is terminal-idempotent', async () => {
  const { manager, customer, foreign, admin, store } = await setup(), b = (await customer.client.get('/bookings?status=CONFIRMED')).data.find((b) => !b.issue_reported_at && !b.refund_status);
  const refund = (await manager.client.post(`/bookings/${b.id}/venue-issue`, { reason: 'Sân ngập không phục vụ', action: 'REFUND' })).data;
  assert.equal((await customer.client.post(`/bookings/${b.id}/refund-request`, {})).data.id, refund.id);
  await assert.rejects(manager.client.post(`/bookings/${b.id}/reschedule`, { new_time_slot_id: b.time_slot_id, reason: 'Không dời cùng hoàn tiền' }), { code: 'REFUND_ALREADY_REQUESTED' });
  await assert.rejects(foreign.client.patch(`/refunds/${refund.id}/status`, { status: 'APPROVED' }), { status: 403 });
  await assert.rejects(manager.client.patch(`/refunds/${refund.id}/status`, { status: 'PROCESSING' }), { status: 400 });
  await assert.rejects(manager.client.patch(`/refunds/${refund.id}/status`, { status: 'COMPLETED' }), { status: 409 });
  assert.equal((await manager.client.patch(`/refunds/${refund.id}/status`, { status: 'APPROVED' })).data.status, 'PROCESSING');
  const audits = (await admin.client.get(`/admin/audit-logs?entity_id=${refund.id}`)).data;
  assert.ok(audits.some((a) => a.action === 'REFUND_APPROVED' && a.after_data.status === 'APPROVED'));
  assert.ok(audits.some((a) => a.action === 'REFUND_PROCESSING' && a.actor_id === null));
  await assert.rejects(manager.client.patch(`/refunds/${refund.id}/status`, { status: 'APPROVED' }), { status: 409 });
  await manager.client.patch(`/refunds/${refund.id}/status`, { status: 'COMPLETED' });
  const h = (await customer.client.get(`/bookings/${b.id}/history`)).data;
  assert.equal(h.booking.status, 'CANCELLED_BY_VENUE'); assert.equal(h.payments[0].status, 'REFUNDED'); assert.equal(h.refund.status, 'COMPLETED'); assert.equal(store.read().slots.find((s) => s.id === b.time_slot_id).status, 'UNAVAILABLE');
  const count = store.read().audits.length; await manager.client.patch(`/refunds/${refund.id}/status`, { status: 'COMPLETED' }); await customer.client.post(`/bookings/${b.id}/refund-request`, {}); assert.equal(store.read().audits.length, count);
});
test('RV-04 inactive venue/court reads reject public/customer/foreign staff and allow owner/admin', async () => {
  const { manager, customer, foreign, admin, fresh, edit } = await setup(), { venue, court } = await fresh();
  edit((db) => { db.venues.find((v) => v.id === venue.id).status = 'INACTIVE'; });
  for (const path of [`/venues/${venue.id}`, `/venues/${venue.id}/courts`, `/courts/${court.id}`, `/courts/${court.id}/slots?date=2026-11-25`]) {
    for (const actor of [customer, foreign]) await assert.rejects(actor.client.get(path), { status: 404 });
    for (const actor of [manager, admin]) assert.ok((await actor.client.get(path)).data);
  }
  edit((db) => { db.venues.find((v) => v.id === venue.id).status = 'ACTIVE'; db.courts.find((c) => c.id === court.id).status = 'MAINTENANCE'; });
  for (const actor of [customer, foreign]) for (const suffix of ['', '/slots?date=2026-11-25']) await assert.rejects(actor.client.get(`/courts/${court.id}${suffix}`), { status: 404 });
});
test('admin access changes revoke old sessions on lock/unlock/promote/demote, persist across reload and protect owners/admin', async () => {
  const { admin, customer, manager, account, storage } = await setup();
  await assert.rejects(admin.client.patch(`/admin/users/${admin.user.id}/status`, { is_active: false }), { code: 'SELF_ADMIN_PROTECTED' });
  await assert.rejects(admin.client.patch(`/admin/users/${manager.user.id}/status`, { role: 'CUSTOMER' }), { code: 'MANAGER_HAS_VENUES' });
  await assert.rejects(admin.client.patch(`/admin/users/${customer.user.id}/status`, { role: 'ADMIN' }), { status: 400 });
  for (const values of [{ is_active: false }, { is_active: true }, { role: 'VENUE_MANAGER' }, { role: 'CUSTOMER' }]) {
    const old = customer.session.getToken(); await admin.client.patch(`/admin/users/${customer.user.id}/status`, values);
    const raw = await createMockTransport({ storage })( '/auth/me', { token: old }); assert.equal(raw.status, 401);
    if (values.is_active !== false) await customer.login();
  }
  const reloaded = await account('customer@example.com'); assert.equal(reloaded.user.role, 'CUSTOMER');
});
test('admin aliases enforce versions and protected slot states; overview sums PAID rather than booking totals', async () => {
  const { admin, manager, fresh, store } = await setup(), { venue, court, slots } = await fresh();
  await admin.client.patch(`/admin/courts/${court.id}/status`, { status: 'MAINTENANCE', reason: 'Bảo trì sân kiểm thử', expected_version: 1 });
  await assert.rejects(admin.client.patch(`/admin/courts/${court.id}/status`, { status: 'ACTIVE', reason: 'Phiên bản đã cũ', expected_version: 1 }), { status: 409, code: 'EDIT_CONFLICT' });
  await admin.client.patch(`/admin/courts/${court.id}/status`, { status: 'ACTIVE', reason: 'Bảo trì hoàn tất', expected_version: 2 });
  const slot = slotAt(slots, '12'); await walk(manager.client, slot);
  await assert.rejects(admin.client.patch(`/admin/slots/${slot.id}/status`, { status: 'AVAILABLE', reason: 'Không mở ca BOOKED', expected_version: 2 }), { status: 409 });
  const overview = (await admin.client.get('/admin/overview')).data, db = store.read();
  assert.equal(overview.total_revenue, db.payments.filter((p) => p.status === 'PAID').reduce((n, p) => n + p.amount, 0)); assert.equal(overview.total_bookings, db.bookings.length); assert.equal(overview.total_users, db.users.length); assert.equal(overview.total_venues, db.venues.length);
});
test('RV-05 backend ordering uses created time then correct ID direction; filtering precedes pagination', async () => {
  const { admin, manager, edit } = await setup();
  const recent = (await admin.client.get('/admin/users')).data;
  edit((db) => { db.users.find((u) => u.id === recent.at(-1).id).created_at = '2030-01-01T00:00:00Z'; });
  assert.equal((await admin.client.get('/admin/users?limit=1')).data[0].id, recent.at(-1).id);
  for (const path of ['/bookings', '/refunds', '/admin/users', '/admin/audit-logs']) {
    const all = (await admin.client.get(path)).data, page = (await admin.client.get(`${path}?limit=2&offset=1`)).data; assert.deepEqual(page, all.slice(1, 3));
    assert.deepEqual(all, orderRows(all, path.includes('audit') ? 'audit' : 'recent'));
  }
  const scoped = (await manager.client.get('/bookings?status=CONFIRMED')).data;
  assert.deepEqual((await manager.client.get('/bookings?status=CONFIRMED&limit=1&offset=1')).data, scoped.slice(1, 2));
  const tied = [{ id: 'b', created_at: '2026-01-01' }, { id: 'a', created_at: '2026-01-01' }];
  assert.deepEqual(orderRows(tied, 'recent').map((r) => r.id), ['a', 'b']); assert.deepEqual(orderRows(tied, 'audit').map((r) => r.id), ['b', 'a']); assert.deepEqual(orderRows(tied, 'history').map((r) => r.id), ['a', 'b']);
});
test('audit recursively redacts credentials; filters actor/entity/action and admin users expose safe fields only', async () => {
  const { admin, customer, edit } = await setup();
  const secret = { password_hash: 'secret', nested: { token_version: 4, credential: 'secret', rows: [{ access_token: 'secret', name: 'safe' }] } };
  assert.doesNotMatch(JSON.stringify(redactSecrets(secret)), /secret|password_hash|access_token|token_version|credential/);
  edit((db) => { db.users.find((u) => u.id === customer.user.id).password_hash = 'secret'; db.audits.push({ id: crypto.randomUUID(), actor_id: admin.user.id, entity_id: customer.user.id, action: 'TEST_REDACT', created_at: '2030-01-01', before_data: secret, after_data: secret }); });
  const rows = (await admin.client.get(`/admin/audit-logs?actor_id=${admin.user.id}&entity_id=${customer.user.id}&action=TEST_REDACT&limit=1`)).data;
  assert.equal(rows.length, 1); assert.doesNotMatch(JSON.stringify([rows, (await admin.client.get('/admin/users')).data]), /secret|password_hash|token_version|credential/);
});
test('storage failures roll back POS, refund transition and session revocation; no backend fetch or online payment', async () => {
  const { storage, manager, admin, customer, fresh } = await setup(), { slots } = await fresh();
  const saved = storage.getItem(CATALOGUE_STORE_KEY), set = storage.setItem, oldFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected network'); };
  storage.setItem = (key, value) => { if (key === CATALOGUE_STORE_KEY) throw new Error('Quota'); set(key, value); };
  try {
    await assert.rejects(walk(manager.client, slotAt(slots, '12')), { status: 503 });
    await assert.rejects(admin.client.patch(`/admin/users/${customer.user.id}/status`, { is_active: false }), { status: 503 });
    assert.equal((await customer.client.get('/auth/me')).data.user.id, customer.user.id); assert.equal(storage.getItem(CATALOGUE_STORE_KEY), saved);
    for (const path of ['/payments/create', '/payments/confirm']) await assert.rejects(customer.client.post(path, {}), { status: 501 });
    assert.equal(requests, 0);
  } finally { globalThis.fetch = oldFetch; storage.setItem = set; }
});
test('counter UI rules distinguish phase, exact adjacency, paid-method/name validation and completion timing', () => {
  const slot = { court_id: 'c', status: 'AVAILABLE', start_at: '2026-11-25T02:00:00Z', end_at: '2026-11-25T03:00:00Z' };
  assert.equal(walkInReason(slot, { status: 'ACTIVE' }, { status: 'ACTIVE' }, instant), ''); assert.equal(slotPhase(slot, instant), 'Đang diễn ra'); assert.equal(slotPhase(slot, instant + 3600000), 'Đã kết thúc'); assert.equal(slotPhase(slot, instant - 3600000), 'Chưa bắt đầu');
  assert.equal(nextSlot({ court_id: 'c', end_at: slot.start_at }, [slot]), slot); assert.equal(nextSlot({ court_id: 'other', end_at: slot.start_at }, [slot]), null);
  assert.equal(canComplete({ status: 'CONFIRMED', end_at: slot.end_at }, instant), false); assert.equal(canComplete({ status: 'CONFIRMED', end_at: slot.end_at }, instant + 3600000), true);
  assert.ok(walkInErrors({ customer_name: ' ', method: 'CARD' }).customer_name); assert.deepEqual(walkInErrors({ customer_name: 'Khách hợp lệ', method: 'CASH', customer_phone: '' }), {});
});
