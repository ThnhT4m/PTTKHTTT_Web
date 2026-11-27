import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockTransport } from '../src/mocks/handler.js';
import { createApiClient } from '../src/api/http.js';
import { createSession } from '../src/api/session.js';
import { memoryStorage } from './helpers.js';
import { CATALOGUE_STORE_KEY } from '../src/mocks/store.js';
import { addDays } from '../src/utils/format.js';
import { readPages } from '../src/api/pagination.js';

const clock = Date.parse('2026-11-25T02:00:00Z');
const venueBody = { name: 'Sân Nhà Quận 7', address: '12 Nguyễn Văn Linh', district: 'Quận 7', description: 'Cơ sở mới', payment_hold_minutes: 5, minimum_online_booking_lead_minutes: 10 };
const courtBody = { name: 'Cầu lông mới', sport_type: 'BADMINTON', hourly_price: 123456, description: 'Sân mới' };
const reason = 'Kiểm tra bảo trì định kỳ';
async function setup(storage = memoryStorage(), email = 'manager1@example.com') {
  const session = createSession('mock', storage), client = createApiClient({ transport: createMockTransport({ storage, now: () => clock }), session });
  const { data } = await client.post('/auth/login', { email, password: 'Demo@12345' });
  session.setToken(data.token);
  return { client, session, storage, user: data.user };
}
async function fresh(client) {
  const venue = (await client.post('/venues', venueBody)).data;
  const court = (await client.post(`/venues/${venue.id}/courts`, courtBody)).data;
  return { venue, court };
}
const status = (client, type, item, state, version = item.version) => client.patch(`/${type}/${item.id}/status`, { status: state, expected_version: version, reason });
test('M2 creates venue with ownership/defaults, updates metadata and rejects status or ownership fields', async () => {
  const { client, user } = await setup();
  const venue = (await client.post('/venues', venueBody)).data;
  assert.match(venue.id, /^[0-9a-f-]{36}$/);
  assert.equal(venue.manager_id, user.id); assert.equal(venue.version, 1);
  assert.equal((await client.get(`/venues/${venue.id}`)).data.name, venueBody.name);
  const updated = (await client.patch(`/venues/${venue.id}`, { expected_version: 1, name: 'Tên mới', payment_hold_minutes: 10, minimum_online_booking_lead_minutes: 20 })).data;
  assert.equal(updated.version, 2); assert.equal(updated.name, 'Tên mới'); assert.equal(updated.status, 'ACTIVE');
  for (const body of [{ status: 'INACTIVE' }, { manager_id: user.id }, { venue_id: venue.id }])
    await assert.rejects(client.patch(`/venues/${venue.id}`, { expected_version: 2, ...body }), { status: 400 });
  assert.equal((await client.get('/venues?mine=true')).data.some((v) => v.id === venue.id), true);
});
test('M2 creates/updates courts with all five sports and price 0; slot prices remain snapshots', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  await client.post(`/venues/${venue.id}/generate-slots`, { days: 1 });
  const before = (await client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data;
  const updated = (await client.patch(`/courts/${court.id}`, { expected_version: 1, name: 'Sân đổi tên', sport_type: 'TENNIS', hourly_price: 0 })).data;
  assert.equal(updated.version, 2); assert.equal(updated.hourly_price, 0); assert.equal(updated.sport_type, 'TENNIS');
  assert.deepEqual((await client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data, before);
  await client.post(`/venues/${venue.id}/generate-slots`, { start_date: '2026-11-26', days: 1 });
  assert.ok((await client.get(`/courts/${court.id}/slots?date=2026-11-26`)).data.every((s) => s.price === 0));
  await assert.rejects(client.patch(`/courts/${court.id}`, { expected_version: 2, venue_id: 'other' }), { status: 400 });
});
test('venue and court status changes require reason/version and preserve inactive records for managers', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  for (const [type, item] of [['venues', venue], ['courts', court]]) {
    const changed = (await status(client, type, item, 'MAINTENANCE')).data;
    assert.equal(changed.version, 2); assert.equal(changed.status, 'MAINTENANCE');
    const inactive = (await status(client, type, changed, 'INACTIVE')).data;
    assert.equal(inactive.version, 3);
    await assert.rejects(client.patch(`/${type}/${item.id}/status`, { expected_version: 3, status: 'ACTIVE' }), { status: 400 });
    const active = (await status(client, type, inactive, 'ACTIVE')).data;
    assert.equal(active.version, 4);
  }
  const courtChanged = (await client.get(`/courts/${court.id}`)).data;
  await status(client, 'courts', courtChanged, 'INACTIVE');
  assert.equal((await client.get(`/venues/${venue.id}/courts`)).data.length, 1);
});
test('soft-delete preserves venue, courts, slots, booking history and can be reactivated', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  await client.post(`/venues/${venue.id}/generate-slots`, { days: 1 });
  const slots = (await client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data;
  const bookings = (await client.get('/bookings')).data;
  const deletedCourt = (await client.del(`/courts/${court.id}`, { expected_version: 1, reason })).data;
  assert.equal(deletedCourt.status, 'INACTIVE'); assert.equal(deletedCourt.version, 2);
  assert.deepEqual((await client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data, slots);
  const deletedVenue = (await client.del(`/venues/${venue.id}`, { expected_version: 1, reason })).data;
  assert.equal(deletedVenue.status, 'INACTIVE');
  assert.ok((await client.get('/venues?mine=true')).data.some((v) => v.id === venue.id));
  assert.deepEqual((await client.get('/bookings')).data, bookings);
  await status(client, 'venues', deletedVenue, 'ACTIVE');
  await status(client, 'courts', deletedCourt, 'ACTIVE');
});
test('foreign manager and customer cannot write any M2/M3 resource', async () => {
  const storage = memoryStorage(), owner = await setup(storage), { venue, court } = await fresh(owner.client);
  await owner.client.post(`/venues/${venue.id}/generate-slots`, { days: 1 });
  const slot = (await owner.client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data.at(-1);
  for (const email of ['manager2@example.com', 'customer@example.com']) {
    const { client } = await setup(storage, email);
    for (const [method, path, body] of [
      ['patch', `/venues/${venue.id}`, { expected_version: 1, name: 'Không được' }],
      ['patch', `/venues/${venue.id}/status`, { expected_version: 1, status: 'INACTIVE', reason }],
      ['del', `/venues/${venue.id}`, { expected_version: 1, reason }],
      ['post', `/venues/${venue.id}/courts`, courtBody],
      ['patch', `/courts/${court.id}`, { expected_version: 1, hourly_price: 1 }],
      ['patch', `/courts/${court.id}/status`, { expected_version: 1, status: 'MAINTENANCE', reason }],
      ['del', `/courts/${court.id}`, { expected_version: 1, reason }],
      ['post', `/venues/${venue.id}/generate-slots`, {}],
      ['patch', `/slots/${slot.id}`, { expected_version: 1, price: 1 }],
      ['patch', `/slots/${slot.id}/status`, { expected_version: 1, status: 'UNAVAILABLE', reason }],
    ]) await assert.rejects(client[method](path, body), { status: 403 });
  }
});
test('stale version returns EDIT_CONFLICT/current without overwrite or extra audit', async () => {
  const { client } = await setup(), { venue } = await fresh(client);
  await client.patch(`/venues/${venue.id}`, { expected_version: 1, name: 'Thắng phiên bản' });
  for (const operation of [() => client.patch(`/venues/${venue.id}`, { expected_version: 1, name: 'Ghi đè' }), () => status(client, 'venues', venue, 'INACTIVE'), () => client.del(`/venues/${venue.id}`, { expected_version: 1, reason })])
    await assert.rejects(operation(), (e) => e.status === 409 && e.code === 'EDIT_CONFLICT' && e.details.current.version === 2);
  assert.equal((await client.get(`/venues/${venue.id}`)).data.name, 'Thắng phiên bản');
});
test('two same-version writes in one mock runtime allow exactly one winner', async () => {
  const { client } = await setup(), { court } = await fresh(client);
  const results = await Promise.allSettled([10000, 20000].map((hourly_price) => client.patch(`/courts/${court.id}`, { expected_version: 1, hourly_price })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'EDIT_CONFLICT');
});
test('generate 30 days for new court produces exactly 480 unique one-hour slots, 06–22', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  const { data } = await client.post(`/venues/${venue.id}/generate-slots`, { court_ids: [court.id] });
  assert.deepEqual(data, { venue_id: venue.id, court_count: 1, created: 480, skipped: 0, start_date: '2026-11-25', end_date: '2026-12-24' });
  const ids = [];
  for (let i = 0; i < 30; i++) {
    const rows = (await client.get(`/courts/${court.id}/slots?date=${addDays('2026-11-25', i)}`)).data;
    assert.equal(rows.length, 16); assert.equal(rows[0].start_time, '06:00:00'); assert.equal(rows.at(-1).end_time, '22:00:00');
    for (const s of rows) { ids.push(s.id); assert.equal(Date.parse(s.end_at) - Date.parse(s.start_at), 3600000); assert.equal(s.price, court.hourly_price); }
  }
  assert.equal(new Set(ids).size, 480);
});
test('repeated generation skips existing slots and preserves price, manual status, hold and booking', async () => {
  const { client } = await setup();
  const venue = (await client.get('/venues?mine=true')).data[0];
  const courts = (await client.get(`/venues/${venue.id}/courts`)).data;
  const court = courts.find((c) => c.sport_type === 'FOOTBALL' && c.status === 'ACTIVE');
  const slots = (await client.get(`/courts/${court.id}/slots?date=2026-11-26`)).data;
  const editable = slots.find((s) => s.status === 'AVAILABLE');
  const changed = (await client.patch(`/slots/${editable.id}`, { expected_version: editable.version, price: 654321 })).data;
  await status(client, 'slots', changed, 'UNAVAILABLE');
  const before = (await client.get(`/courts/${court.id}/slots?date=2026-11-26`)).data, bookings = (await client.get('/bookings')).data;
  const result = (await client.post(`/venues/${venue.id}/generate-slots`, { start_date: '2026-11-26', days: 1, court_ids: [court.id] })).data;
  assert.equal(result.created, 0); assert.equal(result.skipped, 16);
  assert.deepEqual((await client.get(`/courts/${court.id}/slots?date=2026-11-26`)).data, before);
  assert.deepEqual((await client.get('/bookings')).data, bookings);
});
test('generation validates dates, bounds, days, duplicate/foreign/nonexistent court IDs', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  const foreignVenue = (await client.get('/venues')).data.find((v) => v.district === 'Bình Thạnh');
  const foreignCourt = (await client.get(`/venues/${foreignVenue.id}/courts`)).data[0];
  for (const body of [
    { days: 0 }, { days: 31 }, { days: 1.5 }, { days: '30' }, { days: null },
    { start_date: '2026-11-24' }, { start_date: '2026-11-31' }, { start_date: '2026-12-25', days: 2 },
    { court_ids: [] }, { court_ids: [court.id, court.id] }, { court_ids: [foreignCourt.id] },
    { court_ids: ['00000000-0000-4000-8000-000000000000'] }, { court_ids: ['not-a-uuid'] },
    { court_ids: Array.from({ length: 101 }, () => crypto.randomUUID()) }, { ignored: true },
  ]) await assert.rejects(client.post(`/venues/${venue.id}/generate-slots`, body), { status: 400 });
  const boundary = (await client.post(`/venues/${venue.id}/generate-slots`, { start_date: '2026-12-25', days: 1 })).data;
  assert.equal(boundary.created, 16); assert.equal(boundary.end_date, '2026-12-25');
});
test('generation includes only ACTIVE courts and rejects inactive venue or no active courts', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  const another = (await client.post(`/venues/${venue.id}/courts`, { ...courtBody, name: 'Sân bảo trì' })).data;
  await status(client, 'courts', another, 'MAINTENANCE');
  const generated = (await client.post(`/venues/${venue.id}/generate-slots`, { days: 1, court_ids: [court.id, another.id] })).data;
  assert.equal(generated.court_count, 1); assert.equal(generated.created, 16);
  await status(client, 'courts', court, 'INACTIVE');
  await assert.rejects(client.post(`/venues/${venue.id}/generate-slots`, {}), { status: 409, code: 'NO_ACTIVE_COURTS' });
  await status(client, 'venues', venue, 'MAINTENANCE');
  await assert.rejects(client.post(`/venues/${venue.id}/generate-slots`, {}), { status: 409, code: 'VENUE_NOT_ACTIVE' });
});
test('slot price can change for future AVAILABLE/UNAVAILABLE; stale version is rejected', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  await client.post(`/venues/${venue.id}/generate-slots`, { start_date: '2026-11-26', days: 1 });
  let slot = (await client.get(`/courts/${court.id}/slots?date=2026-11-26`)).data[0];
  slot = (await client.patch(`/slots/${slot.id}`, { expected_version: 1, price: 0 })).data;
  assert.equal(slot.version, 2); assert.equal(slot.price, 0);
  slot = (await status(client, 'slots', slot, 'UNAVAILABLE')).data;
  slot = (await client.patch(`/slots/${slot.id}`, { expected_version: 3, price: 100001 })).data;
  assert.equal(slot.version, 4); assert.equal(slot.price, 100001);
  await assert.rejects(client.patch(`/slots/${slot.id}`, { expected_version: 3, price: 1 }), { code: 'EDIT_CONFLICT', status: 409 });
  await assert.rejects(client.patch(`/slots/${slot.id}/status`, { expected_version: 3, status: 'AVAILABLE', reason }), { code: 'EDIT_CONFLICT', status: 409 });
});
test('slot manual status can only be AVAILABLE/UNAVAILABLE, with valid reason/version', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  await client.post(`/venues/${venue.id}/generate-slots`, { start_date: '2026-11-26', days: 1 });
  let slot = (await client.get(`/courts/${court.id}/slots?date=2026-11-26`)).data[0];
  for (const state of ['HELD', 'BOOKED', 'ACTIVE']) await assert.rejects(status(client, 'slots', slot, state), { status: 400 });
  for (const bad of ['', '    ', '1234', 'x'.repeat(1001)]) await assert.rejects(client.patch(`/slots/${slot.id}/status`, { expected_version: 1, status: 'UNAVAILABLE', reason: bad }), { status: 400 });
  slot = (await status(client, 'slots', slot, 'UNAVAILABLE')).data;
  slot = (await status(client, 'slots', slot, 'AVAILABLE')).data;
  assert.equal(slot.version, 3); assert.equal(slot.status, 'AVAILABLE');
});
test('HELD/BOOKED and issue slots with active booking reject manual price/status; started slots reject price', async () => {
  const { client } = await setup();
  const bookings = (await client.get('/bookings')).data;
  for (const b of [bookings.find((b) => b.status === 'PENDING'), bookings.find((b) => b.status === 'CONFIRMED' && !b.issue_reported_at), bookings.find((b) => b.refund_status === 'REQUESTED')]) {
    const slot = (await client.get(`/courts/${b.court_id}/slots?date=2026-11-26`)).data.find((s) => s.id === b.time_slot_id);
    await assert.rejects(client.patch(`/slots/${slot.id}`, { expected_version: slot.version, price: 120000 }), { status: 409, code: 'SLOT_PRICE_LOCKED' });
    await assert.rejects(status(client, 'slots', slot, 'AVAILABLE'), { status: 409, code: 'SLOT_IN_USE' });
    await assert.rejects(status(client, 'slots', slot, 'UNAVAILABLE'), { status: 409, code: 'SLOT_IN_USE' });
  }
  const venue = (await client.get('/venues?mine=true')).data[0], court = (await client.get(`/venues/${venue.id}/courts`)).data[0];
  const past = (await client.get(`/courts/${court.id}/slots?date=2026-11-24`)).data.find((s) => s.status === 'AVAILABLE');
  await assert.rejects(client.patch(`/slots/${past.id}`, { expected_version: past.version, price: 1 }), { status: 409, code: 'SLOT_PRICE_LOCKED' });
});
test('future PENDING/CONFIRMED bookings block venue/court closure and soft-delete', async () => {
  const { client } = await setup();
  const b = (await client.get('/bookings?status=PENDING')).data[0];
  const venue = (await client.get(`/venues/${b.venue_id}`)).data, court = (await client.get(`/courts/${b.court_id}`)).data;
  for (const [type, item] of [['venues', venue], ['courts', court]]) {
    for (const state of ['INACTIVE', 'MAINTENANCE']) await assert.rejects(status(client, type, item, state), { status: 409, code: 'ACTIVE_BOOKINGS' });
    await assert.rejects(client.del(`/${type}/${item.id}`, { expected_version: item.version, reason }), { status: 409, code: 'ACTIVE_BOOKINGS' });
    assert.equal((await client.get(`/${type}/${item.id}`)).data.status, 'ACTIVE');
  }
});
test('metadata, money, versions and manual reasons are validated before changing data', async () => {
  const { client } = await setup(), { venue, court } = await fresh(client);
  for (const body of [{ name: ' ' }, { payment_hold_minutes: 0 }, { payment_hold_minutes: 11 }, { payment_hold_minutes: 1.1 }, { minimum_online_booking_lead_minutes: 9 }, { minimum_online_booking_lead_minutes: 1.1 }, { description: 'x'.repeat(2001) }])
    await assert.rejects(client.patch(`/venues/${venue.id}`, { expected_version: 1, ...body }), { status: 400 });
  for (const hourly_price of [-1, 1.5, 100000001, '1000', null]) await assert.rejects(client.patch(`/courts/${court.id}`, { expected_version: 1, hourly_price }), { status: 400 });
  for (const expected_version of [0, -1, 1.5, '1', null]) await assert.rejects(client.patch(`/courts/${court.id}`, { expected_version, name: 'Hợp lệ' }), { status: 400 });
  await assert.rejects(client.patch(`/courts/${court.id}`, { expected_version: 1, sport_type: 'OTHER' }), { status: 400 });
  assert.equal((await client.get(`/venues/${venue.id}`)).data.version, 1);
  assert.equal((await client.get(`/courts/${court.id}`)).data.version, 1);
});
test('successful writes create auditable before/after/reason; failed writes add no audit', async () => {
  const storage = memoryStorage(), { client } = await setup(storage), { venue, court } = await fresh(client);
  await client.patch(`/courts/${court.id}`, { expected_version: 1, hourly_price: 234567 });
  const latest = (await client.get(`/courts/${court.id}`)).data;
  await status(client, 'courts', latest, 'MAINTENANCE');
  const admin = await setup(storage, 'admin@example.com');
  const audits = (await admin.client.get(`/admin/audit-logs?entity_id=${court.id}`)).data;
  assert.equal(audits.length, 3);
  const operation = audits.find((a) => a.action === 'STATUS_CHANGED');
  assert.equal(operation.before_data.status, 'ACTIVE'); assert.equal(operation.after_data.status, 'MAINTENANCE'); assert.equal(operation.reason, reason);
  await assert.rejects(admin.client.patch(`/courts/${court.id}`, { expected_version: 1, name: 'Ghi đè' }), { status: 409 });
  assert.equal((await admin.client.get(`/admin/audit-logs?entity_id=${court.id}`)).data.length, 3);
  assert.doesNotMatch(JSON.stringify(audits), /password_hash|token_version/);
});
test('mock catalogue persists across reload, synchronizes readers and public visibility after status', async () => {
  const storage = memoryStorage(), one = await setup(storage), { venue, court } = await fresh(one.client);
  await one.client.post(`/venues/${venue.id}/generate-slots`, { days: 1 });
  await status(one.client, 'courts', court, 'INACTIVE');
  const reloaded = await setup(storage);
  assert.equal((await reloaded.client.get(`/venues/${venue.id}/courts`)).data[0].status, 'INACTIVE');
  assert.equal((await reloaded.client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data.length, 16);
  const customer = await setup(storage, 'customer@example.com');
  assert.deepEqual((await customer.client.get(`/venues/${venue.id}/courts`)).data, []);
  await assert.rejects(customer.client.get(`/courts/${court.id}`), { status: 404 });
  assert.ok(storage.getItem(CATALOGUE_STORE_KEY).length < 20000);
});
test('storage failure rolls back data and audit instead of reporting false success', async () => {
  const storage = memoryStorage(), { client } = await setup(storage), { venue } = await fresh(client);
  const saved = storage.getItem(CATALOGUE_STORE_KEY), set = storage.setItem;
  storage.setItem = (key, value) => { if (key === CATALOGUE_STORE_KEY) throw new Error('Quota exceeded'); set(key, value); };
  await assert.rejects(client.patch(`/venues/${venue.id}`, { expected_version: 1, name: 'Không được lưu' }), { status: 503, code: 'MOCK_STORAGE_FULL' });
  assert.equal((await client.get(`/venues/${venue.id}`)).data.name, venue.name);
  assert.equal(storage.getItem(CATALOGUE_STORE_KEY), saved);
});
test('memory-only mock still updates reads without localStorage', async () => {
  const session = createSession('mock', memoryStorage());
  const client = createApiClient({ transport: createMockTransport({ now: () => clock }), session });
  const logged = (await client.post('/auth/login', { email: 'manager1@example.com', password: 'Demo@12345' })).data;
  session.setToken(logged.token);
  const venue = (await client.post('/venues', venueBody)).data;
  assert.equal((await client.get(`/venues/${venue.id}`)).data.name, venue.name);
});
test('all M2/M3 writes and reads remain local without any fetch', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('No backend'); };
  try {
    const { client } = await setup(), { venue, court } = await fresh(client);
    await client.post(`/venues/${venue.id}/generate-slots`, { days: 1 });
    const slot = (await client.get(`/courts/${court.id}/slots?date=2026-11-25`)).data.at(-1);
    await client.patch(`/slots/${slot.id}`, { expected_version: 1, price: 12345 });
    await client.del(`/courts/${court.id}`, { expected_version: 1, reason });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
test('all pages are loaded before UI-only court name/status filtering, including page boundaries', async () => {
  const rows = Array.from({ length: 450 }, (_, index) => ({ id: index, status: index >= 300 ? 'INACTIVE' : 'ACTIVE' }));
  const calls = [], signal = new AbortController().signal;
  const result = await readPages(async (path, options) => {
    calls.push(path); assert.equal(options.signal, signal);
    const url = new URL(path, 'http://local');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['limit', 'mine', 'offset']);
    const offset = Number(url.searchParams.get('offset'));
    return { data: rows.slice(offset, offset + 300) };
  }, '/venues?mine=true', { signal });
  assert.equal(calls.length, 2); assert.equal(result.data.length, 450);
  assert.equal(result.data.filter((c) => c.status === 'INACTIVE').length, 150);
  const fullPage = await readPages(async (path) => ({ data: path.endsWith('offset=0') ? rows.slice(0, 300) : [] }), '/courts');
  assert.equal(fullPage.data.length, 300);
});
test('pagination rejects malformed responses, partial-page failures and aborted loads', async () => {
  await assert.rejects(readPages(async () => ({ data: {} }), '/courts'), { code: 'INVALID_RESPONSE' });
  let page = 0;
  await assert.rejects(readPages(async () => { if (page++) throw new Error('Page failed'); return { data: Array(300).fill({}) }; }, '/courts'), /Page failed/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readPages(async () => { throw new Error('Should not fetch'); }, '/courts', { signal: controller.signal }), { name: 'AbortError' });
});
test('catalogue metadata refreshes flattened booking names without changing the booked price', async () => {
  const { client } = await setup();
  const booking = (await client.get('/bookings')).data[0];
  const venue = (await client.get(`/venues/${booking.venue_id}`)).data;
  const court = (await client.get(`/courts/${booking.court_id}`)).data;
  await client.patch(`/venues/${venue.id}`, { expected_version: venue.version, name: 'Cơ sở đổi tên' });
  await client.patch(`/courts/${court.id}`, { expected_version: court.version, name: 'Sân đổi tên', hourly_price: 999999 });
  const current = (await client.get(`/bookings/${booking.id}`)).data;
  assert.equal(current.venue_name, 'Cơ sở đổi tên'); assert.equal(current.court_name, 'Sân đổi tên');
  assert.equal(current.total_amount, booking.total_amount);
});
