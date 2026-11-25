import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockTransport } from '../src/mocks/handler.js';
import { createMockStore, CATALOGUE_STORE_KEY } from '../src/mocks/store.js';
import { createApiClient } from '../src/api/http.js';
import { createSession } from '../src/api/session.js';
import { memoryStorage } from './helpers.js';
import { createLatestLoader } from '../src/api/latest.js';
import { customerReturnPath, onlineSlotReason, priceRangeError, canReschedule, canRequestRefund, canReview, fieldErrors } from '../src/utils/customer.js';

const instant = Date.parse('2026-11-25T02:00:00Z');
async function setup({ storage = memoryStorage(), now = () => instant, email = 'customer@example.com' } = {}) {
  const session = createSession('mock', memoryStorage());
  const client = createApiClient({ transport: createMockTransport({ storage, now }), session });
  async function login(email, password = 'Demo@12345') {
    const { data } = await client.post('/auth/login', { email, password }); session.setToken(data.token); return data.user;
  }
  const user = email ? await login(email) : null;
  return { client, storage, session, user, login };
}
async function target(client, date = '2026-11-26') {
  const venue = (await client.get('/venues')).data.find((v) => v.district === 'Thủ Đức');
  const courts = (await client.get(`/venues/${venue.id}/courts`)).data;
  const court = courts.find((c) => c.sport_type === 'FOOTBALL');
  const slots = (await client.get(`/courts/${court.id}/slots?date=${date}`)).data;
  return { venue, court, slots, slot: slots.find((s) => s.status === 'AVAILABLE') };
}
test('registration creates only CUSTOMER, stores salted password hash, survives reload and supports exact password', async () => {
  const { client, storage, login } = await setup({ email: null });
  const password = ' Demo mới@123 ';
  const { data } = await client.post('/auth/register', { full_name: 'Khách đăng ký', email: 'NEW@example.com', phone: '0901234567', password });
  assert.equal(data.user.role, 'CUSTOMER'); assert.equal(data.user.email, 'new@example.com');
  assert.equal(data.user.password_hash, undefined);
  const serialized = storage.getItem(CATALOGUE_STORE_KEY);
  assert.ok(serialized); assert.doesNotMatch(serialized, /Demo mới|password_hash/);
  assert.ok(JSON.parse(serialized).credentials[data.user.id].salt);
  assert.equal((await login('new@example.com', password)).id, data.user.id);
  await assert.rejects(login('new@example.com', password.trim()), { status: 401 });
  const reload = await setup({ storage, email: null });
  assert.equal((await reload.login('new@example.com', password)).id, data.user.id);
});
test('registration rejects bad fields, duplicate email, privilege injection and 72-byte overflow', async () => {
  const { client } = await setup();
  const valid = { full_name: 'Khách mới', email: 'fresh@example.com', password: 'Demo@12345' };
  for (const body of [{ ...valid, full_name: 123 }, { ...valid, phone: 123456789 }, { ...valid, full_name: ' ' }, { ...valid, email: 'bad' }, { ...valid, password: 'ế'.repeat(25) }, { ...valid, role: 'ADMIN' }, { ...valid, is_active: true }, { ...valid, password_confirmation: valid.password }])
    await assert.rejects(client.post('/auth/register', body), { status: 400 });
  await assert.rejects(client.post('/auth/register', { ...valid, email: 'CUSTOMER@example.com' }), { status: 409, code: 'EMAIL_EXISTS' });
});
test('registration accepts exactly 72 UTF-8 bytes and never returns credentials via user or audit APIs', async () => {
  const storage = memoryStorage(), account = await setup({ storage });
  const password = 'ế'.repeat(24);
  const { data } = await account.client.post('/auth/register', { full_name: 'Khách UTF8', email: 'utf8@example.com', password });
  assert.equal((await account.login('utf8@example.com', password)).id, data.user.id);
  const admin = await setup({ storage, email: 'admin@example.com' });
  const text = JSON.stringify([(await admin.client.get('/admin/users')).data, (await admin.client.get('/admin/audit-logs')).data]);
  assert.doesNotMatch(text, /"hash"|"salt"|password|token_version/);
});
test('login differentiates bad password, locked account and expired session', async () => {
  let clock = instant;
  const storage = memoryStorage(), account = await setup({ storage, now: () => clock });
  await assert.rejects(account.login('customer@example.com', 'Wrong@12345'), { status: 401, code: 'INVALID_CREDENTIALS' });
  const store = createMockStore(storage, () => clock), db = structuredClone(store.read());
  db.users.find((u) => u.id === account.user.id).is_active = false; store.commit(db);
  await assert.rejects(account.login('customer@example.com'), { status: 403, code: 'ACCOUNT_DISABLED' });
  await assert.rejects(account.client.get('/auth/me'), { status: 401 });
  db.users.find((u) => u.id === account.user.id).is_active = true; store.commit(db);
  await account.login('customer@example.com'); clock += 86400001;
  await assert.rejects(account.client.get('/auth/me'), { status: 401 });
});
test('safe login return URLs preserve customer date/filters and reject external or forbidden routes', () => {
  assert.equal(customerReturnPath('/courts/uuid/schedule?date=2026-11-26', 'CUSTOMER'), '/courts/uuid/schedule?date=2026-11-26');
  for (const path of ['https://evil.test', '//evil.test', '/admin', '/manager/venues', '/login', '/register']) assert.equal(customerReturnPath(path, 'CUSTOMER'), '/venues');
  assert.equal(customerReturnPath('/my-bookings', 'VENUE_MANAGER'), '/manager/venues');
  assert.equal(customerReturnPath('/venues', 'ADMIN'), '/admin');
});
test('catalogue combines district, sport and min/max price with limit/offset; inactive venues stay managed but hidden publicly', async () => {
  const storage = memoryStorage(), manager = await setup({ storage, email: 'manager1@example.com' });
  const venue = (await manager.client.post('/venues', { name: 'Cơ sở ẩn', address: 'Địa chỉ hợp lệ', district: 'Quận 7' })).data;
  await manager.client.patch(`/venues/${venue.id}/status`, { expected_version: 1, status: 'INACTIVE', reason: 'Tạm ngừng cơ sở' });
  const customer = await setup({ storage });
  assert.ok(!(await customer.client.get('/venues')).data.some((v) => v.id === venue.id));
  assert.ok((await manager.client.get('/venues?mine=true')).data.some((v) => v.id === venue.id));
  const all = (await customer.client.get('/venues?district=Thủ%20Đức&sport_type=BADMINTON&min_price=100000&max_price=130000&limit=1&offset=0')).data;
  assert.equal(all.length, 1);
  assert.deepEqual((await customer.client.get('/venues?district=Thủ%20Đức&limit=1&offset=1')).data, []);
  assert.equal(priceRangeError('200000', '100000').length > 0, true);
  assert.equal(priceRangeError('', '100000'), '');
});
test('latest loader ignores stale successes and stale errors even when transport ignores abort', async () => {
  const loader = createLatestLoader(), publications = [];
  let finishOld, failOld;
  const old = loader.run(() => new Promise((resolve) => { finishOld = resolve; }), (value) => publications.push(value));
  await loader.run(async () => 'new', (value) => publications.push(value));
  finishOld('old'); await old; assert.deepEqual(publications, [{ result: 'new' }]);
  const failed = loader.run(() => new Promise((_, reject) => { failOld = reject; }), (value) => publications.push(value));
  loader.cancel(); failOld(new Error('stale')); await failed;
  assert.equal(publications.length, 1);
});
test('lead-time boundary uses supplied server clock and venue configuration', () => {
  const court = { status: 'ACTIVE' }, venue = { status: 'ACTIVE', minimum_online_booking_lead_minutes: 20 };
  const slot = { status: 'AVAILABLE', start_at: new Date(instant + 20 * 60000).toISOString() };
  assert.equal(onlineSlotReason(slot, court, venue, instant), '');
  assert.match(onlineSlotReason(slot, court, venue, instant + 1), /20 phút/);
  assert.ok(onlineSlotReason({ ...slot, status: 'HELD' }, court, venue, instant));
  assert.ok(onlineSlotReason(slot, court, { ...venue, status: 'INACTIVE' }, instant));
});
test('online hold creates only PENDING/HELD with configured deadline and no payment', async () => {
  const { client } = await setup(), { venue, slot } = await target(client);
  const { data, server_time } = await client.post('/bookings/online', { time_slot_id: slot.id });
  assert.equal(data.status, 'PENDING'); assert.equal(data.total_amount, slot.price);
  assert.equal(Date.parse(data.held_until) - Date.parse(server_time), venue.payment_hold_minutes * 60000);
  const actual = (await client.get(`/courts/${data.court_id}/slots?date=2026-11-26`)).data.find((s) => s.id === slot.id);
  assert.equal(actual.status, 'HELD'); assert.equal(actual.held_until, data.held_until);
  assert.deepEqual((await client.get(`/bookings/${data.id}/history`)).data.payments, []);
});
test('hold enforces authentication, CUSTOMER role, slot availability and lead time', async () => {
  const storage = memoryStorage(), one = await setup({ storage }), { slot, court } = await target(one.client);
  const guest = await setup({ storage, email: null });
  await assert.rejects(guest.client.post('/bookings/online', { time_slot_id: slot.id }), { status: 401 });
  const manager = await setup({ storage, email: 'manager1@example.com' });
  await assert.rejects(manager.client.post('/bookings/online', { time_slot_id: slot.id }), { status: 403 });
  await one.client.post('/bookings/online', { time_slot_id: slot.id });
  await assert.rejects(one.client.post('/bookings/online', { time_slot_id: slot.id }), { status: 409 });
  const today = (await one.client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data.find((s) => s.start_time === '09:00:00');
  await assert.rejects(one.client.post('/bookings/online', { time_slot_id: today.id }), { status: 409, code: 'LEAD_TIME' });
});
test('hold rejects inactive court/venue; two requests in a single runtime have one winner', async () => {
  const storage = memoryStorage(), one = await setup({ storage }), { slot, court } = await target(one.client);
  const manager = await setup({ storage, email: 'manager1@example.com' });
  const inactive = (await manager.client.get(`/venues/${court.venue_id}/courts`)).data.find((c) => c.status === 'INACTIVE');
  const inactiveSlot = (await manager.client.get(`/courts/${inactive.id}/slots?date=2026-11-26`)).data[0];
  await assert.rejects(one.client.post('/bookings/online', { time_slot_id: inactiveSlot.id }), { status: 409 });
  const outcomes = await Promise.allSettled([one.client.post('/bookings/online', { time_slot_id: slot.id }), one.client.post('/bookings/online', { time_slot_id: slot.id })]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(outcomes.find((r) => r.status === 'rejected').reason.status, 409);
});
test('refresh preserves hold deadline; expiration persists and releases only owned hold', async () => {
  let clock = instant; const now = () => clock, storage = memoryStorage();
  const one = await setup({ storage, now }), { slot } = await target(one.client);
  const held = (await one.client.post('/bookings/online', { time_slot_id: slot.id })).data;
  clock += 60000;
  const reload = await setup({ storage, now });
  assert.equal((await reload.client.get(`/bookings/${held.id}`)).data.held_until, held.held_until);
  clock += 300000;
  const old = (await reload.client.get(`/bookings/${held.id}`)).data;
  assert.equal(old.status, 'EXPIRED'); assert.equal(old.held_until, null);
  const two = await setup({ storage, now, email: 'customer2@example.com' });
  const newer = (await two.client.post('/bookings/online', { time_slot_id: slot.id })).data;
  assert.equal((await reload.client.get(`/bookings/${held.id}`)).data.held_until, null);
  assert.equal((await two.client.get(`/bookings/${newer.id}`)).data.held_until, newer.held_until);
  const after = await setup({ storage, now });
  assert.equal((await after.client.get(`/bookings/${held.id}`)).data.status, 'EXPIRED');
});
test('old expired hold cannot release a replacement hold with a different deadline', async () => {
  let clock = instant; const storage = memoryStorage(), one = await setup({ storage, now: () => clock });
  const pending = (await one.client.get('/bookings?status=PENDING')).data[0];
  const store = createMockStore(storage, () => clock), db = structuredClone(store.read());
  const original = db.bookings.find((b) => b.id === pending.id), slot = db.slots.find((s) => s.id === original.time_slot_id);
  const replacement = { ...original, id: crypto.randomUUID(), customer_id: db.users[1].id, held_until: new Date(instant + 900000).toISOString() };
  db.bookings.push(replacement); slot.held_until = replacement.held_until; store.commit(db); clock += 360000;
  assert.equal((await one.client.get(`/bookings/${original.id}`)).data.status, 'EXPIRED');
  const slots = (await one.client.get(`/courts/${slot.court_id}/slots?date=2026-11-26`)).data;
  assert.equal(slots.find((s) => s.id === slot.id).held_until, replacement.held_until);
});
test('customer cannot read or mutate another customer booking/history/refund', async () => {
  const storage = memoryStorage(), one = await setup({ storage }), two = await setup({ storage, email: 'customer2@example.com' });
  const b = (await two.client.get('/bookings?status=CONFIRMED')).data[0];
  for (const suffix of ['', '/history']) await assert.rejects(one.client.get(`/bookings/${b.id}${suffix}`), { status: 403 });
  for (const [suffix, body] of [['reschedule', { new_time_slot_id: b.time_slot_id, reason: 'Đổi lịch chơi' }], ['refund-request', {}], ['reviews', { rating: 5 }]]) await assert.rejects(one.client.post(`/bookings/${b.id}/${suffix}`, body), { status: 403 });
});
test('booking list filters and pagination remain scoped for all five states', async () => {
  const { client, user } = await setup();
  for (const status of ['PENDING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED_BY_VENUE']) {
    const rows = (await client.get(`/bookings?status=${status}&limit=1&offset=0`)).data;
    assert.equal(rows.length, 1); assert.equal(rows[0].status, status); assert.equal(rows[0].customer_id, user.id);
  }
  const first = (await client.get('/bookings?limit=2&offset=0')).data, next = (await client.get('/bookings?limit=2&offset=2')).data;
  assert.equal(first.length, 2); assert.equal(next.length, 2); assert.ok(next.every((b) => !first.some((old) => old.id === b.id)));
});
async function rescheduleSetup(issue = false) {
  const account = await setup(), rows = (await account.client.get('/bookings?status=CONFIRMED')).data;
  const booking = rows.find((b) => !b.refund_status && (issue ? !!b.issue_reported_at : !b.issue_reported_at));
  const slots = (await account.client.get(`/courts/${booking.court_id}/slots?date=2026-11-27`)).data;
  return { ...account, booking, target: slots.find((s) => s.status === 'AVAILABLE' && s.price === booking.total_amount) };
}
for (const issue of [false, true]) test(`reschedule ${issue ? 'venue issue' : 'voluntary'} updates both slots, booking and persistent history`, async () => {
  const { client, storage, booking, target } = await rescheduleSetup(issue);
  await client.post(`/bookings/${booking.id}/reschedule`, { new_time_slot_id: target.id, reason: 'Đổi sang ca phù hợp', is_venue_issue: issue });
  const history = (await client.get(`/bookings/${booking.id}/history`)).data;
  assert.equal(history.booking.time_slot_id, target.id); assert.equal(history.booking.total_amount, booking.total_amount); assert.equal(history.booking.status, 'CONFIRMED');
  assert.equal(history.reschedules.at(-1).is_venue_issue, issue);
  const old = (await client.get(`/courts/${booking.court_id}/slots?date=2026-11-26`)).data.find((s) => s.id === booking.time_slot_id);
  assert.equal(old.status, issue ? 'UNAVAILABLE' : 'AVAILABLE');
  const reload = await setup({ storage });
  assert.equal((await reload.client.get(`/bookings/${booking.id}/history`)).data.booking.time_slot_id, target.id);
});
test('reschedule rejects wrong price/sport/venue, occupied target, old target, fake issue and existing refund', async () => {
  const { client, booking, target } = await rescheduleSetup();
  await assert.rejects(client.post(`/bookings/${booking.id}/reschedule`, { new_time_slot_id: target.id, reason: 'Tự nhận sự cố', is_venue_issue: true }), { status: 403 });
  const { venue } = await targetForConflict(client);
  const courts = (await client.get(`/venues/${venue.id}/courts`)).data;
  const foreignVenue = (await client.get('/venues')).data.find((v) => v.id !== booking.venue_id);
  const foreignCourt = (await client.get(`/venues/${foreignVenue.id}/courts`)).data[0];
  const badTargets = [booking.time_slot_id];
  for (const court of [courts.find((c) => c.sport_type !== booking.sport_type), foreignCourt]) badTargets.push((await client.get(`/courts/${court.id}/slots?date=2026-11-27`)).data.find((s) => s.status === 'AVAILABLE').id);
  const booked = (await client.get(`/courts/${booking.court_id}/slots?date=2026-11-26`)).data.find((s) => s.status === 'HELD');
  badTargets.push(booked.id);
  for (const [index, id] of badTargets.entries()) await assert.rejects(client.post(`/bookings/${booking.id}/reschedule`, { new_time_slot_id: id, reason: 'Kiểm tra đích sai' }), { status: index === 1 || index === 2 ? 400 : 409 });
  const refunded = (await client.get('/bookings?refund_status=REQUESTED')).data[0];
  await assert.rejects(client.post(`/bookings/${refunded.id}/reschedule`, { new_time_slot_id: target.id, reason: 'Đã yêu cầu hoàn tiền', is_venue_issue: true }), { status: 409 });
});
async function targetForConflict(client) { return target(client); }
test('reschedule rejects price mismatch and voluntary changes after old start; issue flag requires recorded issue', async () => {
  const { client, storage, booking, target } = await rescheduleSetup();
  const manager = await setup({ storage, email: 'manager1@example.com' });
  await manager.client.patch(`/slots/${target.id}`, { expected_version: target.version, price: booking.total_amount + 1 });
  await assert.rejects(client.post(`/bookings/${booking.id}/reschedule`, { new_time_slot_id: target.id, reason: 'Sai giá đích' }), { status: 400, code: 'PRICE_MISMATCH' });
  const store = createMockStore(storage, () => instant), db = structuredClone(store.read());
  db.slots.find((s) => s.id === booking.time_slot_id).start_at = new Date(instant - 1).toISOString(); db.slots.find((s) => s.id === target.id).price = booking.total_amount; store.commit(db);
  await assert.rejects(client.post(`/bookings/${booking.id}/reschedule`, { new_time_slot_id: target.id, reason: 'Đã bắt đầu' }), { status: 409, code: 'BOOKING_ALREADY_STARTED' });
});
test('refund request requires recorded issue, remains REQUESTED, is idempotent, persists and blocks rescheduling', async () => {
  const { client, storage } = await setup(), rows = (await client.get('/bookings?status=CONFIRMED')).data;
  const ordinary = rows.find((b) => !b.issue_reported_at), issue = rows.find((b) => b.issue_reported_at && !b.refund_status);
  await assert.rejects(client.post(`/bookings/${ordinary.id}/refund-request`, {}), { status: 409 });
  const refund = (await client.post(`/bookings/${issue.id}/refund-request`, {})).data;
  assert.equal(refund.status, 'REQUESTED'); assert.equal(refund.amount, issue.total_amount);
  assert.equal((await client.post(`/bookings/${issue.id}/refund-request`, {})).data.id, refund.id);
  const detail = (await client.get(`/bookings/${issue.id}/history`)).data;
  assert.equal(detail.booking.status, 'CONFIRMED'); assert.equal(detail.refund.id, refund.id);
  const reload = await setup({ storage }); assert.equal((await reload.client.get(`/refunds/${refund.id}`)).data.status, 'REQUESTED');
  await assert.rejects(client.post(`/bookings/${issue.id}/reschedule`, { new_time_slot_id: issue.time_slot_id, reason: 'Không dời cùng refund', is_venue_issue: true }), { status: 409 });
});
test('review accepts only one owner COMPLETED review, validates rating/comment and persists content', async () => {
  const { client, storage } = await setup(), rows = (await client.get('/bookings?status=COMPLETED')).data;
  const booking = rows.find((b) => !b.review_id);
  for (const rating of [0, 6, 1.5, '5']) await assert.rejects(client.post(`/bookings/${booking.id}/reviews`, { rating }), { status: 400 });
  await assert.rejects(client.post(`/bookings/${booking.id}/reviews`, { rating: 5, comment: 'x'.repeat(2001) }), { status: 400 });
  const review = (await client.post(`/bookings/${booking.id}/reviews`, { rating: 4, comment: 'Sân sạch và thoáng.' })).data;
  assert.equal(review.rating, 4);
  await assert.rejects(client.post(`/bookings/${booking.id}/reviews`, { rating: 5 }), { status: 409 });
  const pending = (await client.get('/bookings?status=PENDING')).data[0];
  await assert.rejects(client.post(`/bookings/${pending.id}/reviews`, { rating: 5 }), { status: 409 });
  const reload = await setup({ storage }); assert.equal((await reload.client.get(`/bookings/${booking.id}/history`)).data.review.comment, review.comment);
});
test('customer writes appear in manager scope; online payment stays unsupported and POS enforces state/validation', async () => {
  const storage = memoryStorage(), one = await setup({ storage }), { slot } = await target(one.client);
  const booking = (await one.client.post('/bookings/online', { time_slot_id: slot.id })).data;
  const manager = await setup({ storage, email: 'manager1@example.com' });
  assert.ok((await manager.client.get('/bookings')).data.some((b) => b.id === booking.id));
  for (const [client, path, body] of [[one.client, '/payments/create', { booking_id: booking.id, method: 'BANK_TRANSFER' }], [one.client, '/payments/confirm', { transaction_code: 'no-payment' }]]) await assert.rejects(client.post(path, body), { status: 501, code: 'MOCK_NOT_IMPLEMENTED' });
  await assert.rejects(manager.client.post('/bookings/walk-in', {}), { status: 400 });
  await assert.rejects(manager.client.post(`/bookings/${booking.id}/complete`, {}), { status: 409 });
  await assert.rejects(manager.client.post(`/bookings/${booking.id}/venue-issue`, {}), { status: 400 });
  assert.equal((await one.client.get(`/bookings/${booking.id}`)).data.status, 'PENDING');
});
test('customer action visibility and backend field errors support safe forms', () => {
  assert.equal(canReschedule({ status: 'CONFIRMED', start_at: new Date(instant + 1000).toISOString() }, instant), true);
  assert.equal(canReschedule({ status: 'CONFIRMED', start_at: new Date(instant - 1).toISOString() }, instant), false);
  assert.equal(canRequestRefund({ status: 'CONFIRMED', issue_reported_at: 'now' }), true);
  assert.equal(canRequestRefund({ status: 'CONFIRMED' }), false);
  assert.equal(canReview({ status: 'COMPLETED' }), true);
  assert.equal(canReview({ status: 'COMPLETED', review_id: 'id' }), false);
  assert.deepEqual(fieldErrors({ details: { fieldErrors: { email: ['Email sai'] } } }), { email: 'Email sai' });
  assert.deepEqual(fieldErrors({ details: [{ path: ['password'], message: 'Mật khẩu sai' }] }), { password: 'Mật khẩu sai' });
});
