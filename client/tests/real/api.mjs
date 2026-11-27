import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { todayVN, addDays } from '../../src/utils/format.js';

export async function runApiChecks(e, check) {
  const { database: db, users: u } = e, api = (role) => u[role].client;
  const today = todayVN(await e.clock()), tomorrow = addDays(today, 1), later = addDays(today, 2);
  const venues = (await api('manager1').get('/venues?mine=true')).data, venue = venues[0];
  const courts = (await api('manager1').get(`/venues/${venue.id}/courts`)).data, court = courts[0];
  const slots = async (courtId = court.id, date = tomorrow) => (await api('manager1').get(`/courts/${courtId}/slots?date=${date}`)).data;
  const free = async (courtId = court.id, date = tomorrow) => (await slots(courtId, date)).find((s) => s.status === 'AVAILABLE');
  const detail = async (id) => (await api('admin').get(`/bookings/${id}`)).data;
  const history = async (id) => (await api('admin').get(`/bookings/${id}/history`)).data;
  const walk = (slot, extra = {}) => api('manager1').post('/bookings/walk-in', { time_slot_id: slot.id, customer_name: 'Khách tại quầy thật', method: 'CASH', ...extra });
  const counts = (table, where) => db(table).where(where).count('* as n').first().then((r) => Number(r.n));
  let managed, newCourt;
  await check('ENV', 'Health DB, envelope and CORS through actual HTTP', 'guest', async () => {
    const r = await fetch(e.origin + '/api/health', { headers: { Origin: 'http://127.0.0.1:5175' } }), body = await r.json();
    assert.equal(r.status, 200); assert.equal(body.success, true); assert.equal(body.data.status, 'ok'); assert.ok(Date.parse(body.server_time)); assert.equal(r.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5175');
    return { status: r.status, postgres: e.version, database: e.uiDatabase.name };
  });
  await check('TC-18/22', 'Registration, wrong password, logout, expired JWT and private responses', 'CUSTOMER', async () => {
    const r = await api('customer').post('/auth/register', { full_name: 'Khách tích hợp thật', email: 'task5-new@example.com', password: 'Integration@12345' });
    assert.equal(r.data.user.role, 'CUSTOMER'); assert.ok(r.data.token); assert.doesNotMatch(JSON.stringify(r.data.user), /password_hash|token_version|credential/);
    await assert.rejects(api('customer').post('/auth/login', { email: 'customer@example.com', password: 'Wrong@12345' }), { status: 401, code: 'INVALID_CREDENTIALS' });
    const other = await e.account('customer2'); await other.client.post('/auth/logout', {}); await assert.rejects(other.client.get('/auth/me'), { status: 401 });
    u.customer2 = await e.account('customer2');
    const expired = jwt.sign({ ver: 0 }, process.env.JWT_SECRET, { subject: u.customer.user.id, expiresIn: -1, algorithm: 'HS256' });
    const response = await fetch(e.origin + '/api/auth/me', { headers: { Authorization: `Bearer ${expired}` } }); assert.equal(response.status, 401);
    return { role: r.data.user.role, wrongPassword: 401, loggedOutToken: 401, expiredToken: 401 };
  });
  await check('CATALOGUE', 'All catalogue filters, ordering, pagination and real slot values', 'CUSTOMER', async () => {
    const all = (await api('customer').get('/venues?limit=300')).data;
    assert.deepEqual((await api('customer').get('/venues?limit=1&offset=1')).data, all.slice(1, 2));
    const filtered = (await api('customer').get(`/venues?district=${encodeURIComponent(venue.district)}&sport_type=${court.sport_type}&min_price=${court.hourly_price}&max_price=${court.hourly_price}`)).data;
    assert.ok(filtered.some((v) => v.id === venue.id));
    const courtRows = (await api('customer').get(`/venues/${venue.id}/courts?sport_type=${court.sport_type}&min_price=${court.hourly_price}&max_price=${court.hourly_price}&limit=1`)).data; assert.equal(courtRows.length, 1);
    const s = await free(); assert.equal(typeof s.price, 'number'); assert.ok(s.start_at.endsWith('Z')); assert.equal(Date.parse(s.end_at) - Date.parse(s.start_at), 3600000);
    return { venues: all.length, filtered: filtered.length, slot_id: s.id, price: s.price, window: [s.start_at, s.end_at] };
  });
  await check('TC-04/20', 'Manager CRUD, hold bounds 1/5/10, 30-day generation and repeat preservation', 'VENUE_MANAGER', async () => {
    managed = (await api('manager1').post('/venues', { name: 'T5 Cơ sở tích hợp', address: '12 Đường Kiểm Thử', district: 'Quận 7', payment_hold_minutes: 1, minimum_online_booking_lead_minutes: 10 })).data;
    for (const value of [0, 15, 1.5]) await assert.rejects(api('manager1').patch(`/venues/${managed.id}`, { expected_version: managed.version, payment_hold_minutes: value }), { status: 400 });
    for (const value of [5, 10, 1]) managed = (await api('manager1').patch(`/venues/${managed.id}`, { expected_version: managed.version, payment_hold_minutes: value })).data;
    newCourt = (await api('manager1').post(`/venues/${managed.id}/courts`, { name: 'T5 Sân tích hợp', sport_type: 'FOOTBALL', hourly_price: 250000 })).data;
    const generated = (await api('manager1').post(`/venues/${managed.id}/generate-slots`, { days: 30 })).data; assert.equal(generated.created, 480);
    const before = await free(newCourt.id); await api('manager1').patch(`/slots/${before.id}`, { expected_version: before.version, price: 270000 });
    const repeated = (await api('manager1').post(`/venues/${managed.id}/generate-slots`, { days: 30 })).data; assert.equal(repeated.created, 0); assert.equal(repeated.skipped, 480);
    assert.equal((await slots(newCourt.id)).find((s) => s.id === before.id).price, 270000);
    return { venue_id: managed.id, court_id: newCourt.id, created: generated.created, repeated };
  });
  await check('TC-04', 'Lead time and held_until are decided by server clock/configuration', 'CUSTOMER', async () => {
    const running = (await slots()).find((s) => Date.parse(s.start_at) <= Date.now() && Date.parse(s.end_at) > Date.now() && s.status === 'AVAILABLE');
    if (running) await assert.rejects(api('customer').post('/bookings/online', { time_slot_id: running.id }), { status: 409 });
    const s = await free(newCourt.id), r = await api('customer').post('/bookings/online', { time_slot_id: s.id });
    const delta = Date.parse(r.data.held_until) - Date.parse(r.server_time); assert.ok(delta > 58000 && delta <= 61000);
    assert.equal((await detail(r.data.id)).status, 'PENDING'); assert.equal((await history(r.data.id)).payments.length, 0);
    return { booking_id: r.data.id, deadline: r.data.held_until, server_time: r.server_time, delta };
  });
  await check('TC-01', 'Two independent customer sessions race one AVAILABLE slot on PostgreSQL', 'CUSTOMER + CUSTOMER2', async () => {
    const s = await free(), results = await Promise.allSettled(['customer', 'customer2'].map((role) => api(role).post('/bookings/online', { time_slot_id: s.id })));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
    assert.equal(await counts('bookings', { time_slot_id: s.id, status: 'PENDING' }), 1); assert.equal((await db('time_slots').where({ id: s.id }).first()).status, 'HELD');
    return { slot_id: s.id, statuses: results.map((r) => r.status === 'fulfilled' ? 201 : r.reason.status), active_pending: 1 };
  });
  await check('TC-13', 'Two metadata writes with the same expected_version have one winner', 'VENUE_MANAGER', async () => {
    const before = (await api('manager1').get(`/courts/${newCourt.id}`)).data;
    const names = ['T5 Winner A', 'T5 Winner B'];
    const results = await Promise.allSettled(names.map((name) => api('manager1').patch(`/courts/${before.id}`, { name, expected_version: before.version })));
    const winner = results.findIndex((r) => r.status === 'fulfilled'); assert.ok(winner >= 0); assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
    const after = (await api('manager1').get(`/courts/${before.id}`)).data; assert.equal(after.name, names[winner]); assert.equal(after.version, before.version + 1);
    return { court_id: before.id, version: after.version, winner: after.name, loser: 409 };
  });
  await check('TC-14', 'Customer hold races ADMIN court closure without invalid final state', 'CUSTOMER + ADMIN', async () => {
    const c = (await api('manager1').post(`/venues/${managed.id}/courts`, { name: 'T5 Race Court', sport_type: 'FOOTBALL', hourly_price: 100000 })).data;
    await api('manager1').post(`/venues/${managed.id}/generate-slots`, { days: 2, court_ids: [c.id] }); const s = await free(c.id);
    const results = await Promise.allSettled([api('customer').post('/bookings/online', { time_slot_id: s.id }), api('admin').patch(`/admin/courts/${c.id}/status`, { status: 'INACTIVE', expected_version: c.version, reason: 'Kiểm thử đóng sân đồng thời' })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
    const after = await db('courts').where({ id: c.id }).first(), pending = await counts('bookings', { time_slot_id: s.id, status: 'PENDING' });
    assert.ok((after.status === 'ACTIVE' && pending === 1) || (after.status === 'INACTIVE' && pending === 0));
    return { court_id: c.id, final_status: after.status, pending, statuses: results.map((r) => r.status === 'fulfilled' ? 200 : r.reason.status) };
  });
  await check('TC-02', 'Real cron expires only the old hold; replacement deadline stays separate', 'CUSTOMER + CUSTOMER2 + cron', async () => {
    const s = await free(), held = (await api('customer').post('/bookings/online', { time_slot_id: s.id })).data;
    // Test-only deadline fixture on the new disposable database, keeping HELD constraint valid.
    await db('time_slots').where({ id: s.id }).update({ held_until: db.raw("clock_timestamp() - interval '1 second'") });
    const end = Date.now() + 35000; let old;
    do { old = await detail(held.id); if (old.status === 'EXPIRED') break; await new Promise((r) => setTimeout(r, 1000)); } while (Date.now() < end);
    assert.equal(old.status, 'EXPIRED');
    const newer = (await api('customer2').post('/bookings/online', { time_slot_id: s.id })).data;
    await e.expireHolds(); const historical = await detail(held.id), current = await detail(newer.id);
    assert.equal(historical.held_until, null); assert.equal(current.held_until, newer.held_until); assert.equal(current.status, 'PENDING');
    return { slot_id: s.id, expired: held.id, newer: newer.id, old_deadline: historical.held_until, new_deadline: current.held_until, actual_cron: true };
  });
  await check('TC-05', 'POS future/running/ended slot validation and scope', 'VENUE_MANAGER', async () => {
    const daily = await slots(newCourt.id, today), running = daily.find((s) => Date.parse(s.start_at) <= Date.now() && Date.parse(s.end_at) > Date.now());
    assert.ok(running, 'Running slot requires real VN time between 06:00 and 22:00.');
    const b = (await walk(running)).data; assert.equal(b.status, 'CONFIRMED'); assert.equal((await history(b.id)).payments[0].status, 'PAID');
    await assert.rejects(walk(running), { status: 409 }); const ended = daily.find((s) => Date.parse(s.end_at) <= Date.now()); assert.ok(ended); await assert.rejects(walk(ended), { status: 409 });
    await assert.rejects(api('manager2').post('/bookings/walk-in', { time_slot_id: (await free(newCourt.id)).id, customer_name: 'Sai chủ sân', method: 'CASH' }), { status: 403 });
    return { running_id: running.id, booking_id: b.id, paid: true, ended: 409, wrongOwner: 403 };
  });
  await check('TC-06/21', 'Exact adjacent extension, real slot price snapshot and all occupied states', 'VENUE_MANAGER', async () => {
    const daily = await slots(newCourt.id, later), b = (await walk(daily[0])).data, next = daily[1];
    for (const status of ['HELD', 'BOOKED', 'UNAVAILABLE']) {
      await db('time_slots').where({ id: next.id }).update({ status, held_until: status === 'HELD' ? db.raw("clock_timestamp() + interval '5 minutes'") : null });
      await assert.rejects(api('manager1').post(`/bookings/${b.id}/extend`, { method: 'CASH' }), { status: 409, code: 'NEXT_SLOT_UNAVAILABLE' });
    }
    await db('time_slots').where({ id: next.id }).update({ status: 'AVAILABLE', held_until: null });
    await api('manager1').patch(`/slots/${next.id}`, { expected_version: next.version, price: 333000 });
    const child = (await api('manager1').post(`/bookings/${b.id}/extend`, { method: 'BANK_TRANSFER' })).data;
    assert.equal(child.time_slot_id, next.id); assert.equal(child.parent_booking_id, b.id); assert.equal(child.total_amount, 333000); assert.equal((await history(child.id)).payments[0].amount, 333000);
    const c = (await api('manager1').get(`/courts/${newCourt.id}`)).data; await api('manager1').patch(`/courts/${c.id}`, { expected_version: c.version, hourly_price: 444000 });
    assert.equal((await detail(b.id)).total_amount, b.total_amount); assert.equal((await slots(newCourt.id, later))[0].price, b.total_amount);
    return { parent: b.id, child: child.id, adjacent: next.id, actual_price: child.total_amount, snapshot: b.total_amount };
  });
  await check('TC-07', 'Customer voluntary/issue reschedule, incompatible targets and flags/history', 'CUSTOMER + VENUE_MANAGER', async () => {
    const b = await e.confirmed(await free()), target = await free(court.id, later), body = { new_time_slot_id: target.id, reason: 'Dời tự nguyện tích hợp', is_venue_issue: false };
    await assert.rejects(api('customer').post(`/bookings/${b.id}/reschedule`, { ...body, is_venue_issue: true }), { status: 403 });
    await assert.rejects(api('customer').post(`/bookings/${b.id}/refund-request`, {}), { status: 409 });
    await api('customer').post(`/bookings/${b.id}/reschedule`, body); assert.equal((await db('time_slots').where({ id: b.time_slot_id }).first()).status, 'AVAILABLE');
    const next = (await slots(court.id, later)).find((s) => s.status === 'AVAILABLE' && s.id !== target.id);
    await api('manager1').post(`/bookings/${b.id}/venue-issue`, { reason: 'Sự cố tại sân tích hợp', action: 'REPORT' });
    await api('customer').post(`/bookings/${b.id}/reschedule`, { ...body, new_time_slot_id: next.id });
    const moved = await detail(b.id), h = await history(b.id); assert.equal(moved.issue_reported_at, null); assert.equal(moved.issue_reason, null); assert.equal((await db('time_slots').where({ id: target.id }).first()).status, 'UNAVAILABLE'); assert.equal(h.reschedules.length, 2);
    const foreign = (await api('manager2').get('/venues?mine=true')).data[0], other = (await api('manager2').get(`/venues/${foreign.id}/courts`)).data[0], incompatible = (await api('manager2').get(`/courts/${other.id}/slots?date=${later}`)).data.find((s) => s.status === 'AVAILABLE');
    await assert.rejects(api('customer').post(`/bookings/${b.id}/reschedule`, { ...body, new_time_slot_id: incompatible.id }), { status: 400 });
    return { booking_id: b.id, history: h.reschedules.length, issueCleared: true, damagedOldSlot: 'UNAVAILABLE', wrongVenue: 400 };
  });
  await check('TC-17', 'Two confirmed bookings race the same reschedule target with rollback', 'CUSTOMER + CUSTOMER2', async () => {
    const first = await e.confirmed(await free()), second = await e.confirmed(await free(), u.customer2.user), target = await free(court.id, later);
    const outcomes = await Promise.allSettled([['customer', first], ['customer2', second]].map(([role, b]) => api(role).post(`/bookings/${b.id}/reschedule`, { new_time_slot_id: target.id, reason: 'Tranh ca đích thực tế' })));
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(outcomes.find((r) => r.status === 'rejected').reason.status, 409);
    assert.equal(await counts('bookings', { time_slot_id: target.id, status: 'CONFIRMED' }), 1);
    const losing = outcomes[0].status === 'rejected' ? first : second; assert.equal((await detail(losing.id)).time_slot_id, losing.time_slot_id); assert.equal((await history(losing.id)).reschedules.length, 0);
    return { target: target.id, statuses: outcomes.map((r) => r.status === 'fulfilled' ? 200 : r.reason.status), loserRollback: true };
  });
  await check('TC-08', 'Refund REPORT/request/approve/complete, read-back atomic state and idempotency', 'CUSTOMER + VENUE_MANAGER', async () => {
    const b = await e.confirmed(await free()); await api('manager1').post(`/bookings/${b.id}/venue-issue`, { reason: 'Sân không thể phục vụ tích hợp', action: 'REPORT' });
    const refund = (await api('customer').post(`/bookings/${b.id}/refund-request`, {})).data;
    assert.equal((await api('customer').post(`/bookings/${b.id}/refund-request`, {})).data.id, refund.id);
    await assert.rejects(api('manager1').patch(`/refunds/${refund.id}/status`, { status: 'COMPLETED' }), { status: 409 });
    await assert.rejects(api('customer').post(`/bookings/${b.id}/reschedule`, { new_time_slot_id: (await free()).id, reason: 'Không dời cùng refund' }), { status: 409 });
    assert.equal((await api('manager1').patch(`/refunds/${refund.id}/status`, { status: 'APPROVED' })).data.status, 'PROCESSING');
    await api('manager1').patch(`/refunds/${refund.id}/status`, { status: 'COMPLETED' });
    const h = await history(b.id); assert.equal(h.payments[0].status, 'REFUNDED'); assert.equal(h.booking.status, 'CANCELLED_BY_VENUE'); assert.equal(h.refund.status, 'COMPLETED'); assert.equal((await db('time_slots').where({ id: b.time_slot_id }).first()).status, 'UNAVAILABLE');
    const logs = (await api('admin').get(`/admin/audit-logs?entity_id=${refund.id}`)).data;
    for (const status of ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED']) assert.ok(logs.some((a) => a.action === `REFUND_${status}`));
    await api('manager1').patch(`/refunds/${refund.id}/status`, { status: 'COMPLETED' }); assert.equal(await counts('audit_logs', { entity_id: refund.id }), logs.length);
    return { refund_id: refund.id, payment: 'REFUNDED', booking: h.booking.status, slot: 'UNAVAILABLE', auditSteps: logs.map((a) => a.action) };
  });
  await check('TC-09', 'Past confirmed fixture completes and enables one owner review; early/issue guards', 'VENUE_MANAGER + CUSTOMER', async () => {
    const past = await free(court.id, addDays(today, -1)), b = await e.confirmed(past);
    await api('manager1').post(`/bookings/${b.id}/complete`, {}); const n = await counts('audit_logs', { entity_id: b.id }); await api('manager1').post(`/bookings/${b.id}/complete`, {}); assert.equal(await counts('audit_logs', { entity_id: b.id }), n);
    assert.equal((await db('time_slots').where({ id: past.id }).first()).status, 'BOOKED');
    await assert.rejects(api('customer2').post(`/bookings/${b.id}/reviews`, { rating: 5 }), { status: 403 });
    for (const rating of [0, 6, 1.5]) await assert.rejects(api('customer').post(`/bookings/${b.id}/reviews`, { rating }), { status: 400 });
    await api('customer').post(`/bookings/${b.id}/reviews`, { rating: 5, comment: 'Review sau complete thật' }); await assert.rejects(api('customer').post(`/bookings/${b.id}/reviews`, { rating: 4 }), { status: 409 });
    const future = await e.confirmed(await free()); await assert.rejects(api('manager1').post(`/bookings/${future.id}/complete`, {}), { status: 409 });
    return { booking_id: b.id, completed: true, slot: 'BOOKED', oneReview: await counts('reviews', { booking_id: b.id }), earlyComplete: 409 };
  });
  await check('TC-10/11', 'Ownership on every manager mutation and customer booking/history/refund reads', 'manager2 + customer2', async () => {
    const b = await e.confirmed(await free());
    for (const path of [`/bookings/${b.id}`, `/bookings/${b.id}/history`]) await assert.rejects(api('customer2').get(path), { status: 403 });
    const bad = [ ['patch', `/venues/${venue.id}`, { expected_version: venue.version, name: 'Sai chủ sân' }], ['patch', `/courts/${court.id}`, { expected_version: court.version, name: 'Sai chủ sân' }], ['post', `/venues/${venue.id}/courts`, { name: 'Sai chủ sân', sport_type: court.sport_type, hourly_price: 1 }], ['post', `/bookings/${b.id}/complete`, {}], ['post', `/bookings/${b.id}/extend`, { method: 'CASH' }], ['post', `/bookings/${b.id}/venue-issue`, { reason: 'Báo ngoài phạm vi', action: 'REPORT' }], ['post', `/bookings/${b.id}/reschedule`, { reason: 'Dời ngoài phạm vi', new_time_slot_id: (await free(court.id, later)).id }]];
    for (const [method, path, body] of bad) await assert.rejects(api('manager2')[method](path, body), { status: 403 });
    assert.equal((await api('manager2').get(`/bookings?venue_id=${venue.id}`)).data.length, 0);
    await assert.rejects(api('manager1').patch(`/admin/courts/${court.id}/status`, { expected_version: court.version, status: 'ACTIVE', reason: 'Không phải ADMIN' }), { status: 403 });
    return { booking_id: b.id, forbiddenMutations: bad.length, privateRead: 403, scopedList: [] };
  });
  await check('TC-11/12/18', 'Admin access guards, session revocation, status/version and audit', 'ADMIN', async () => {
    const r = (await api('admin').get('/admin/users?q=task5-new%40example.com')).data[0]; assert.ok(r);
    const leaf = await e.account(r.email, 'Integration@12345');
    for (const values of [{ is_active: false }, { is_active: true }, { role: 'VENUE_MANAGER' }, { role: 'CUSTOMER' }]) {
      await api('admin').patch(`/admin/users/${r.id}/status`, values);
      if (values.is_active === false) { await assert.rejects(leaf.client.get('/auth/me'), { status: 401 }); await assert.rejects(e.account(r.email, 'Integration@12345'), { status: 403 }); }
    }
    await assert.rejects(api('admin').patch(`/admin/users/${u.admin.user.id}/status`, { is_active: false }), { status: 409 }); await assert.rejects(api('admin').patch(`/admin/users/${u.manager1.user.id}/status`, { role: 'CUSTOMER' }), { status: 409 });
    const c = (await api('manager1').post(`/venues/${managed.id}/courts`, { name: 'T5 Trạng thái', sport_type: 'TENNIS', hourly_price: 100000 })).data;
    const changed = (await api('admin').patch(`/admin/courts/${c.id}/status`, { status: 'INACTIVE', expected_version: 1, reason: 'Kiểm thử trạng thái Admin' })).data;
    await assert.rejects(api('admin').patch(`/admin/courts/${c.id}/status`, { status: 'ACTIVE', expected_version: 1, reason: 'Phiên bản cũ kiểm thử' }), { status: 409 });
    await assert.rejects(api('customer').get(`/courts/${c.id}`), { status: 404 }); assert.ok((await api('admin').get(`/courts/${c.id}`)).data);
    await api('manager1').del(`/courts/${c.id}`, { expected_version: changed.version, reason: 'Xóa mềm kiểm thử' });
    const latest = (await api('admin').get(`/courts/${c.id}`)).data; await api('admin').patch(`/admin/courts/${c.id}/status`, { status: 'ACTIVE', expected_version: latest.version, reason: 'Kích hoạt lại kiểm thử' });
    const logs = (await api('admin').get(`/admin/audit-logs?actor_id=${u.admin.user.id}&entity_id=${c.id}&action=COURT_STATUS_CHANGED`)).data; assert.ok(logs.length >= 2); assert.ok(logs.every((a) => a.before_data && a.after_data && a.reason));
    assert.doesNotMatch(JSON.stringify([(await api('admin').get('/admin/users')).data, logs]), /password_hash|token_version|credential/);
    return { user_id: r.id, tokenRevoked: true, ownerDemotion: 409, selfLock: 409, court_id: c.id, auditCount: logs.length };
  });
  await check('ADMIN', 'Overview revenue exactly matches PostgreSQL PAID and excludes REFUNDED', 'ADMIN', async () => {
    const summary = (await api('admin').get('/admin/overview')).data, paid = (await db('payments').where({ status: 'PAID' }).sum('amount as n').first()).n;
    assert.equal(summary.total_revenue, Number(paid || 0)); assert.equal(summary.total_users, await counts('users', {})); assert.equal(summary.total_bookings, await counts('bookings', {})); assert.equal(summary.total_venues, await counts('sport_venues', {}));
    return summary;
  });
  await check('CONTRACT', 'Frontend limits accepted by actual Backend and precise validation boundary', 'VENUE_MANAGER', async () => {
    const longName = 'S'.repeat(120), address = 'A'.repeat(300);
    const v = (await api('manager1').post('/venues', { name: 'T5 Biên validation', address, district: 'Quận 7' })).data;
    const c = (await api('manager1').post(`/venues/${v.id}/courts`, { name: longName, sport_type: 'TENNIS', hourly_price: 0 })).data; assert.equal(c.name.length, 120);
    await assert.rejects(api('manager1').patch(`/venues/${v.id}`, { expected_version: 1, address: 'ab' }), { status: 400 });
    return { addressMax: address.length, courtNameMax: c.name.length, addressMin: 3 };
  });
  e.fixture = { venue, court, managed, newCourt, today, tomorrow, later, free, slots, history, detail };
}
