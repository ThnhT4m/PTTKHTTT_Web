import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixtures, DEMO_PASSWORD } from '../src/mocks/data.js';
import { createMockTransport } from '../src/mocks/handler.js';
import { createApiClient } from '../src/api/http.js';
import { createSession } from '../src/api/session.js';
import { memoryStorage } from './helpers.js';

const instant = Date.parse('2026-11-25T02:00:00Z');
function setup(storage = memoryStorage(), now = () => instant) {
  const transport = createMockTransport({ storage, now });
  const session = createSession('mock', storage);
  const client = createApiClient({ transport, session });
  async function login(email) {
    const { data } = await client.post('/auth/login', { email, password: DEMO_PASSWORD });
    session.setToken(data.token);
    return data.user;
  }
  return { storage, session, client, login };
}
test('fixtures use unique UUIDs, five sports, all required states and 16 consecutive slots/day', () => {
  const db = createFixtures(instant);
  for (const rows of Object.values(db)) {
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
    for (const row of rows) assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }
  assert.equal(db.users.length, 5);
  assert.equal(new Set(db.courts.map((c) => c.sport_type)).size, 5);
  assert.deepEqual(new Set(db.slots.map((s) => s.status)), new Set(['AVAILABLE', 'HELD', 'BOOKED', 'UNAVAILABLE']));
  assert.deepEqual(new Set(db.bookings.map((b) => b.status)), new Set(['PENDING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED_BY_VENUE']));
  assert.deepEqual(new Set(db.refunds.map((r) => r.status)), new Set(['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED']));
  const groups = Map.groupBy(db.slots, (s) => `${s.court_id}/${s.slot_date}`);
  for (const slots of groups.values()) {
    assert.equal(slots.length, 16);
    assert.equal(slots[0].start_time, '06:00:00');
    assert.equal(slots.at(-1).end_time, '22:00:00');
    slots.forEach((s, i) => {
      assert.equal(Date.parse(s.end_at) - Date.parse(s.start_at), 3600000);
      if (i) assert.equal(slots[i - 1].end_at, s.start_at);
    });
  }
});
test('public catalogue filters, pagination, court details and daily schedules render without auth', async () => {
  const { client } = setup();
  const venues = (await client.get('/venues')).data;
  assert.equal(venues.length, 2);
  assert.equal((await client.get('/venues?limit=1&offset=1')).data[0].id, venues[1].id);
  assert.deepEqual((await client.get('/venues?offset=2')).data, []);
  assert.equal((await client.get('/venues?q=Thủ%20Đức&sport_type=BADMINTON&max_price=120000')).data.length, 1);
  assert.equal((await client.get('/venues?min_price=999999')).data.length, 0);
  const venue = (await client.get(`/venues/${venues[0].id}`)).data;
  assert.equal(venue.courts.length, 5);
  assert.ok(venue.courts.every((c) => c.status === 'ACTIVE'));
  const courts = (await client.get(`/venues/${venue.id}/courts?sport_type=TENNIS&limit=1`)).data;
  assert.equal(courts.length, 1);
  assert.equal(courts[0].sport_type, 'TENNIS');
  const court = (await client.get(`/courts/${courts[0].id}`)).data;
  assert.equal(court.venue_name, venue.name);
  assert.equal((await client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data.length, 16);
  const hidden = createFixtures(instant).courts.find((c) => c.status === 'INACTIVE');
  await assert.rejects(client.get(`/courts/${hidden.id}`), { status: 404 });
});
test('all five demo accounts authenticate and no secret fields appear in user data', async () => {
  const { client, login } = setup();
  for (const email of ['customer@example.com', 'customer2@example.com', 'manager1@example.com', 'manager2@example.com', 'admin@example.com']) {
    const user = await login(email);
    assert.equal((await client.get('/auth/me')).data.user.id, user.id);
    assert.equal(user.password_hash, undefined);
    assert.equal(user.token_version, undefined);
    await client.post('/auth/logout');
    await assert.rejects(client.get('/auth/me'), { status: 401 });
  }
  await assert.rejects(client.post('/auth/login', { email: 'customer@example.com', password: 'Wrong@12345' }), { status: 401, code: 'INVALID_CREDENTIALS' });
  await assert.rejects(client.post('/auth/login', { email: 'customer@example.com', password: 'ế'.repeat(25) }), { status: 400 });
});
test('customers see only their bookings, history and refunds; URL changes cannot expand access', async () => {
  const one = setup(), two = setup();
  const user = await one.login('customer@example.com');
  await two.login('customer2@example.com');
  const rows = (await one.client.get('/bookings')).data;
  assert.ok(rows.length && rows.every((b) => b.customer_id === user.id));
  for (const b of rows) {
    const history = (await one.client.get(`/bookings/${b.id}/history`)).data;
    assert.equal(history.booking.id, b.id);
    assert.deepEqual(Object.keys(history).sort(), ['booking', 'payments', 'refund', 'reschedules', 'review']);
    assert.equal(b.held_until !== null, b.status === 'PENDING');
  }
  assert.ok((await one.client.get('/bookings?status=CONFIRMED&has_issue=true')).data.every((b) => b.status === 'CONFIRMED' && b.issue_reported_at));
  assert.ok((await one.client.get('/refunds?status=REQUESTED')).data.every((r) => r.status === 'REQUESTED'));
  const foreign = (await two.client.get('/bookings')).data[0];
  for (const suffix of ['', '/history']) await assert.rejects(one.client.get(`/bookings/${foreign.id}${suffix}`), { status: 403 });
  const refund = (await two.client.get('/refunds')).data[0];
  await assert.rejects(one.client.get(`/refunds/${refund.id}`), { status: 403 });
  await assert.rejects(one.client.get('/venues?mine=true'), { status: 403 });
  await assert.rejects(one.client.get('/admin/overview'), { status: 403 });
});
test('two managers have disjoint management scopes; foreign filters never grant access', async () => {
  const managers = [setup(), setup()];
  const venues = [], bookings = [], refunds = [];
  for (const [i, m] of managers.entries()) {
    const user = await m.login(`manager${i + 1}@example.com`);
    venues[i] = (await m.client.get('/venues?mine=true')).data;
    assert.ok(venues[i].length && venues[i].every((v) => v.manager_id === user.id));
    bookings[i] = (await m.client.get('/bookings')).data;
    assert.ok(bookings[i].length && bookings[i].every((b) => venues[i].some((v) => v.id === b.venue_id)));
    refunds[i] = (await m.client.get('/refunds')).data;
    const detail = (await m.client.get(`/venues/${venues[i][0].id}`)).data;
    assert.equal(detail.courts.length, 7);
    await assert.rejects(m.client.get('/admin/users'), { status: 403 });
  }
  assert.notEqual(venues[0][0].id, venues[1][0].id);
  assert.deepEqual((await managers[0].client.get(`/bookings?venue_id=${venues[1][0].id}`)).data, []);
  assert.deepEqual((await managers[0].client.get(`/refunds?venue_id=${venues[1][0].id}`)).data, []);
  for (const suffix of ['', '/history']) await assert.rejects(managers[0].client.get(`/bookings/${bookings[1][0].id}${suffix}`), { status: 403 });
  await assert.rejects(managers[0].client.get(`/refunds/${refunds[1][0].id}`), { status: 403 });
  // Public browsing of another venue exposes only its active courts, as the API contract allows.
  assert.equal((await managers[0].client.get(`/venues/${venues[1][0].id}`)).data.courts.length, 5);
});
test('admin gets dashboard, filtered users and audit, all without secret fields', async () => {
  const { client, login } = setup();
  await login('admin@example.com');
  const overview = (await client.get('/admin/overview')).data;
  assert.equal(overview.total_venues, 2);
  assert.equal(overview.total_users, 5);
  assert.ok(overview.total_bookings > 0 && overview.total_revenue > 0);
  assert.equal((await client.get('/admin/users?role=VENUE_MANAGER&is_active=true')).data.length, 2);
  const logs = (await client.get('/admin/audit-logs?limit=1')).data;
  assert.equal(logs.length, 1);
  assert.ok(logs[0].before_data || logs[0].after_data);
  const all = JSON.stringify([(await client.get('/admin/users')).data, (await client.get('/admin/audit-logs')).data]);
  assert.doesNotMatch(all, /password_hash|token_version|Demo@12345/);
});
test('unsupported business mutations fail; customers cannot write M2/M3; booking/payment state is preserved', async () => {
  const { client, login } = setup();
  await login('customer@example.com');
  const pending = (await client.get('/bookings?status=PENDING')).data[0];
  const before = (await client.get(`/bookings/${pending.id}/history`)).data;
  for (const [method, path, body] of [
    ['post', '/payments/create', { booking_id: pending.id, method: 'BANK_TRANSFER' }],
    ['post', '/payments/confirm', { transaction_code: 'MOCK-PENDING-1' }],
    ['post', `/bookings/${pending.id}/complete`, {}], ['post', `/bookings/${pending.id}/extend`, {}],
  ]) await assert.rejects(client[method](path, body), (e) => e.status === 501 && e.code === 'MOCK_NOT_IMPLEMENTED' && /TASK 1/.test(e.message));
  // TASK 3 implements these endpoints; invalid input/state must now be rejected by business rules.
  await assert.rejects(client.post('/auth/register', {}), { status: 400 });
  await assert.rejects(client.post('/bookings/online', { time_slot_id: pending.time_slot_id }), { status: 409 });
  await assert.rejects(client.post(`/bookings/${pending.id}/reschedule`, { new_time_slot_id: pending.time_slot_id, reason: 'Đổi giờ chơi' }), { status: 409 });
  await assert.rejects(client.post(`/bookings/${pending.id}/reviews`, { rating: 5 }), { status: 409 });
  // These endpoints now exist in TASK 2; the same customer requests must be forbidden.
  for (const [method, path, body] of [
    ['post', '/venues/id/generate-slots', {}], ['patch', '/slots/id', { price: 1 }],
    ['patch', '/venues/id/status', {}], ['del', '/courts/id', { expected_version: 1, reason: 'Tạm ngưng' }],
  ]) await assert.rejects(client[method](path, body), { status: 403 });
  assert.deepEqual((await client.get(`/bookings/${pending.id}/history`)).data, before);
  assert.equal(before.booking.status, 'PENDING');
});
test('mock never calls fetch, including unknown routes and unsupported writes', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('Network forbidden'); };
  try {
    const { client, login } = setup();
    await client.get('/venues'); await login('admin@example.com');
    for (const path of ['/admin/overview', '/admin/users', '/admin/audit-logs', '/bookings', '/refunds']) await client.get(path);
    await assert.rejects(client.get('/unknown'), { status: 404 });
    await assert.rejects(client.post('/payments/confirm'), { code: 'MOCK_NOT_IMPLEMENTED' });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
test('session reload and logout revoke all sessions of same user across instances', async () => {
  const storage = memoryStorage(), one = setup(storage), two = setup(storage);
  await one.login('customer@example.com'); const firstToken = one.session.getToken();
  await two.login('customer@example.com'); const secondToken = two.session.getToken();
  assert.notEqual(firstToken, secondToken);
  const reload = setup(storage);
  assert.equal((await reload.client.get('/auth/me')).data.user.role, 'CUSTOMER');
  await two.client.post('/auth/logout');
  one.session.setToken(firstToken);
  await assert.rejects(one.client.get('/auth/me'), { status: 401 });
  one.session.setToken(secondToken);
  await assert.rejects(one.client.get('/auth/me'), { status: 401 });
});
test('hold deadline survives reload and expires without ever confirming payment', async () => {
  let clock = instant;
  const storage = memoryStorage(), one = setup(storage, () => clock);
  await one.login('customer@example.com');
  const pending = (await one.client.get('/bookings?status=PENDING')).data[0];
  clock += 60000;
  const reload = setup(storage, () => clock);
  assert.equal((await reload.client.get(`/bookings/${pending.id}`)).data.held_until, pending.held_until);
  clock += 300000;
  const expired = (await reload.client.get(`/bookings/${pending.id}/history`)).data;
  assert.equal(expired.booking.status, 'EXPIRED');
  assert.equal(expired.booking.held_until, null);
  assert.ok(expired.payments.every((p) => p.status === 'FAILED'));
  clock += 86400000;
  await assert.rejects(reload.client.get('/auth/me'), { status: 401 });
});
test('mock validates pagination, filters and dates instead of silently showing wrong data', async () => {
  const { client, login } = setup();
  await login('admin@example.com');
  const court = (await client.get('/venues')).data[0];
  const id = (await client.get(`/venues/${court.id}`)).data.courts[0].id;
  for (const path of ['/venues?limit=0', '/venues?limit=301', '/venues?offset=-1', '/venues?offset=1000001', '/venues?offset=1.2', '/venues?unknown=x', '/venues?min_price=200&max_price=100', '/venues?sport_type=OTHER', '/bookings?has_issue=1', '/bookings?status=OTHER', '/bookings?date=2026-02-29', `/courts/${id}/slots?date=2026-11-31`])
    await assert.rejects(client.get(path), { status: 400 });
});
