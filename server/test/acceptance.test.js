import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

// Never migrate/seed the development database from this suite.
const testUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://sportbooking:sportbooking_dev@localhost:5432/sportbooking_test';
if (!new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL phải trỏ tới database có tên kết thúc bằng _test.');
}
process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET = 'integration-test-secret-with-more-than-32-characters';
process.env.NODE_ENV = 'test';
process.env.PAYMENT_SANDBOX_ENABLED = 'true';
const appModule = await import('../src/app.js');
const app = appModule.default || appModule.app;
const { db } = await import('../src/db/knex.js');
const { expireHolds } = await import('../src/jobs/holdExpiration.job.js');
const tokens = {};
let users, court, otherCourt;

const api = (method, path, role = 'customer') => {
  const req = request(app)[method](`/api${path}`);
  return tokens[role] ? req.set('Authorization', `Bearer ${tokens[role]}`) : req;
};
const success = (res) => {
  assert.ok(res.status >= 200 && res.status < 300, JSON.stringify(res.body));
  assert.equal(res.body.success, true);
  assert.ok(res.body.server_time);
  return res.body.data;
};
const slotTimes = (query) =>
  query.select(
    '*',
    db.raw("(slot_date + start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS start_at"),
    db.raw("(slot_date + end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS end_at"),
  );
async function futureSlot(courtId = court.id, extra = {}) {
  const row = await slotTimes(
    db('time_slots').where({ court_id: courtId, status: 'AVAILABLE', ...extra }),
  )
    .whereRaw(
      "(slot_date + start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' > clock_timestamp() + interval '1 day'",
    )
    .orderBy('slot_date')
    .orderBy('start_time')
    .first();
  assert.ok(row, 'Cần slot trống trong seed');
  return row;
}
async function hold(slot, who = 'customer') {
  return success(await api('post', '/bookings/online', who).send({ time_slot_id: slot.id }));
}
async function pay(booking, who = 'customer') {
  const payment = success(
    await api('post', '/payments/create', who).send({
      booking_id: booking.id,
      method: 'BANK_TRANSFER',
    }),
  );
  success(
    await api('post', '/payments/confirm', who).send({
      transaction_code: payment.transaction_code,
    }),
  );
  return payment;
}
async function confirmedFixture(slot, customerId = users.customer.id) {
  await db('time_slots').where({ id: slot.id }).update({ status: 'BOOKED', held_until: null });
  const [booking] = await db('bookings')
    .insert({
      time_slot_id: slot.id,
      customer_id: customerId,
      customer_name: 'Khách test',
      status: 'CONFIRMED',
      source: 'ONLINE',
      total_amount: slot.price,
    })
    .returning('*');
  await db('payments').insert({
    booking_id: booking.id,
    amount: slot.price,
    method: 'BANK_TRANSFER',
    transaction_code: `fixture-${booking.id}`,
    status: 'PAID',
  });
  return booking;
}

before(async () => {
  await db.raw('SELECT 1');
  await db.migrate.latest({
    directory: fileURLToPath(new URL('../src/db/migrations', import.meta.url)),
  });
  await db.seed.run({ directory: fileURLToPath(new URL('../src/db/seeds', import.meta.url)) });
  users = Object.fromEntries(
    await Promise.all(
      ['customer', 'customer2', 'manager1', 'manager2', 'admin'].map(async (name) => [
        name,
        await db('users')
          .where({ email: `${name}@example.com` })
          .first(),
      ]),
    ),
  );
  for (const [name, user] of Object.entries(users)) {
    tokens[name] = success(
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Demo@12345' }),
    ).token;
    assert.ok(tokens[name]);
  }
  const venue = await db('sport_venues').where({ manager_id: users.manager1.id }).first();
  court = await db('courts').where({ venue_id: venue.id }).first();
  const venue2 = await db('sport_venues').where({ manager_id: users.manager2.id }).first();
  otherCourt = await db('courts').where({ venue_id: venue2.id }).first();
});
after(async () => {
  await db.destroy();
});

test('Auth: API riêng tư đòi JWT; đăng ký không tự cấp ADMIN', async () => {
  assert.equal((await request(app).get('/api/bookings')).status, 401);
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      full_name: 'Khách mới',
      email: 'new@example.com',
      password: 'GoodPass@123',
      role: 'ADMIN',
    });
  assert.ok([400, 201].includes(res.status));
  if (res.status === 201)
    assert.equal((await db('users').where({ email: 'new@example.com' }).first()).role, 'CUSTOMER');
  assert.equal((await api('get', '/admin/users')).status, 403);
});

test('TC-01: hai khách giữ cùng slot, chỉ một thành công', async () => {
  const slot = await futureSlot();
  const responses = await Promise.all(
    ['customer', 'customer2'].map((who) =>
      api('post', '/bookings/online', who).send({ time_slot_id: slot.id }),
    ),
  );
  assert.equal(responses.filter((r) => r.status >= 200 && r.status < 300).length, 1);
  assert.equal(responses.filter((r) => r.status === 409).length, 1);
  assert.equal(
    Number(
      (
        await db('bookings')
          .where({ time_slot_id: slot.id, status: 'PENDING' })
          .count('* as n')
          .first()
      ).n,
    ),
    1,
  );
});

test('TC-02: expire job chuyển booking và slot trong cùng giao dịch', async () => {
  const slot = await futureSlot();
  const booking = await hold(slot);
  await db('time_slots')
    .where({ id: slot.id })
    .update({ held_until: db.raw("clock_timestamp() - interval '1 second'") });
  await expireHolds();
  assert.equal((await db('bookings').where({ id: booking.id }).first()).status, 'EXPIRED');
  const updated = await db('time_slots').where({ id: slot.id }).first();
  assert.equal(updated.status, 'AVAILABLE');
  assert.equal(updated.held_until, null);
});

test('TC-03: payment atomic và callback lặp không ghi trùng', async () => {
  const slot = await futureSlot();
  const booking = await hold(slot);
  const payment = success(
    await api('post', '/payments/create').send({ booking_id: booking.id, method: 'E_WALLET' }),
  );
  const responses = await Promise.all(
    [1, 2].map(() =>
      api('post', '/payments/confirm').send({ transaction_code: payment.transaction_code }),
    ),
  );
  responses.forEach(success);
  assert.equal((await db('bookings').where({ id: booking.id }).first()).status, 'CONFIRMED');
  assert.equal((await db('time_slots').where({ id: slot.id }).first()).status, 'BOOKED');
  assert.equal(
    Number(
      (
        await db('payments')
          .where({ booking_id: booking.id, status: 'PAID' })
          .count('* as n')
          .first()
      ).n,
    ),
    1,
  );
});

test('TC-04: hold đúng 5 phút; từ chối 15 phút và đặt sát giờ', async () => {
  const venue = await db('sport_venues').where({ id: court.venue_id }).first();
  success(
    await api('patch', `/venues/${venue.id}`, 'manager1').send({
      expected_version: venue.version,
      payment_hold_minutes: 5,
    }),
  );
  const current = await db('sport_venues').where({ id: venue.id }).first();
  assert.equal(
    (
      await api('patch', `/venues/${venue.id}`, 'manager1').send({
        expected_version: current.version,
        payment_hold_minutes: 15,
      })
    ).status,
    400,
  );
  const booking = await hold(await futureSlot());
  const remaining = new Date(booking.held_until).getTime() - Date.now();
  assert.ok(remaining > 290000 && remaining <= 301000, `hold=${remaining}ms`);
  const past = await db('time_slots')
    .where({ court_id: court.id, status: 'AVAILABLE' })
    .whereRaw("slot_date < (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date")
    .first();
  assert.equal((await api('post', '/bookings/online').send({ time_slot_id: past.id })).status, 409);
});

test('TC-05: Walk-in bán được ca đang diễn ra', async (t) => {
  const slot = await slotTimes(
    db('time_slots').where({ court_id: otherCourt.id, status: 'AVAILABLE' }),
  )
    .whereRaw("(slot_date + start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' <= clock_timestamp()")
    .whereRaw("(slot_date + end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' > clock_timestamp()")
    .first();
  if (!slot)
    return t.skip(
      'Ngoài giờ 06:00–22:00 Việt Nam, chạy lại trong giờ mở cửa để kiểm tra ca đang diễn ra.',
    );
  const booking = success(
    await api('post', '/bookings/walk-in', 'manager2').send({
      time_slot_id: slot.id,
      customer_name: 'Khách tại quầy',
      method: 'CASH',
    }),
  );
  assert.equal(booking.status, 'CONFIRMED');
  assert.equal(booking.source, 'WALK_IN');
  assert.equal((await db('payments').where({ booking_id: booking.id }).first()).status, 'PAID');
});

test('TC-06: gia hạn chỉ sang đúng ca liền kề AVAILABLE', async () => {
  const origin = await futureSlot(court.id, { start_time: '18:00:00' });
  const booking = await hold(origin);
  await pay(booking);
  const next = await db('time_slots')
    .where({ court_id: court.id, slot_date: origin.slot_date, start_time: '19:00:00' })
    .first();
  await hold(next, 'customer2');
  assert.equal(
    (await api('post', `/bookings/${booking.id}/extend`, 'manager1').send({ method: 'CASH' }))
      .status,
    409,
  );
  assert.equal(
    Number(
      (await db('bookings').where({ parent_booking_id: booking.id }).count('* as n').first()).n,
    ),
    0,
  );
});

test('TC-07: dời tự nguyện mở slot cũ; khách không tự hủy/hoàn', async () => {
  const old = await futureSlot();
  const booking = await hold(old);
  await pay(booking);
  const target = await futureSlot(court.id);
  success(
    await api('post', `/bookings/${booking.id}/reschedule`).send({
      new_time_slot_id: target.id,
      reason: 'Đổi kế hoạch',
    }),
  );
  assert.equal((await db('time_slots').where({ id: old.id }).first()).status, 'AVAILABLE');
  assert.equal((await db('time_slots').where({ id: target.id }).first()).status, 'BOOKED');
  assert.equal((await api('post', `/bookings/${booking.id}/refund-request`).send({})).status, 409);
  assert.equal((await api('delete', `/bookings/${booking.id}`)).status, 404);
});

test('TC-07b: dời do sự cố giữ slot hỏng UNAVAILABLE', async () => {
  const old = await futureSlot();
  const booking = await hold(old);
  await pay(booking);
  success(
    await api('post', `/bookings/${booking.id}/venue-issue`, 'manager1').send({
      reason: 'Đèn sân hỏng',
      action: 'REPORT',
    }),
  );
  const target = await futureSlot();
  success(
    await api('post', `/bookings/${booking.id}/reschedule`).send({
      new_time_slot_id: target.id,
      reason: 'Đổi sân do sự cố',
      is_venue_issue: true,
    }),
  );
  assert.equal((await db('time_slots').where({ id: old.id }).first()).status, 'UNAVAILABLE');
});

test('TC-08: hoàn tiền đúng chuỗi, atomic REFUNDED/CANCELLED_BY_VENUE/UNAVAILABLE', async () => {
  const slot = await futureSlot();
  const booking = await hold(slot);
  await pay(booking);
  success(
    await api('post', `/bookings/${booking.id}/venue-issue`, 'manager1').send({
      reason: 'Hỏng mặt sân',
      action: 'REPORT',
    }),
  );
  const refund = success(await api('post', `/bookings/${booking.id}/refund-request`).send({}));
  assert.equal(refund.status, 'REQUESTED');
  assert.equal(
    (await api('patch', `/refunds/${refund.id}/status`, 'manager1').send({ status: 'COMPLETED' }))
      .status,
    409,
  );
  const processing = success(
    await api('patch', `/refunds/${refund.id}/status`, 'manager1').send({ status: 'APPROVED' }),
  );
  assert.equal(processing.status, 'PROCESSING');
  success(
    await api('patch', `/refunds/${refund.id}/status`, 'manager1').send({ status: 'COMPLETED' }),
  );
  assert.equal(
    (await db('bookings').where({ id: booking.id }).first()).status,
    'CANCELLED_BY_VENUE',
  );
  assert.equal((await db('payments').where({ booking_id: booking.id }).first()).status, 'REFUNDED');
  assert.equal((await db('time_slots').where({ id: slot.id }).first()).status, 'UNAVAILABLE');
  const transitions = await db('audit_logs').where({ entity_id: refund.id }).orderBy('created_at');
  assert.ok(transitions.some((log) => log.after_data?.status === 'APPROVED'));
  assert.ok(transitions.some((log) => log.after_data?.status === 'PROCESSING'));
});

test('TC-09: complete sau giờ kết thúc, đánh giá đúng chủ đúng một lần', async () => {
  const slot = await db('time_slots')
    .where({ court_id: court.id, status: 'AVAILABLE' })
    .whereRaw("slot_date < (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date")
    .orderBy('start_time', 'desc')
    .first();
  const booking = await confirmedFixture(slot);
  assert.equal(
    (await api('post', `/bookings/${booking.id}/reviews`).send({ rating: 5, comment: 'Sân tốt' }))
      .status,
    409,
  );
  success(await api('post', `/bookings/${booking.id}/complete`, 'manager1').send({}));
  success(await api('post', `/bookings/${booking.id}/complete`, 'manager1').send({}));
  assert.equal(
    (await api('post', `/bookings/${booking.id}/reviews`, 'customer2').send({ rating: 5 })).status,
    403,
  );
  success(
    await api('post', `/bookings/${booking.id}/reviews`).send({ rating: 5, comment: 'Sân tốt' }),
  );
  assert.equal(
    (await api('post', `/bookings/${booking.id}/reviews`).send({ rating: 4 })).status,
    409,
  );
});

test('TC-10: manager khác cơ sở bị chặn sửa và xử lý đơn', async () => {
  const current = await db('courts').where({ id: court.id }).first();
  assert.equal(
    (
      await api('patch', `/courts/${court.id}`, 'manager2').send({
        name: 'Sai quyền',
        expected_version: current.version,
      })
    ).status,
    403,
  );
  const slot = await futureSlot();
  assert.equal(
    (
      await api('post', '/bookings/walk-in', 'manager2').send({
        time_slot_id: slot.id,
        customer_name: 'Sai quyền',
        method: 'CASH',
      })
    ).status,
    403,
  );
  const booking = await hold(slot);
  await pay(booking);
  assert.equal(
    (
      await api('post', `/bookings/${booking.id}/venue-issue`, 'manager2').send({
        reason: 'Sai quyền',
        action: 'REPORT',
      })
    ).status,
    403,
  );
});

test('Bổ sung: status tách khỏi PATCH metadata và route ADMIN; sinh lịch có validation', async () => {
  const current = await db('courts').where({ id: court.id }).first();
  assert.equal(
    (
      await api('patch', `/courts/${court.id}`, 'manager1').send({
        status: 'MAINTENANCE',
        expected_version: current.version,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api('patch', `/admin/courts/${court.id}/status`, 'manager1').send({
        status: 'MAINTENANCE',
        expected_version: current.version,
        reason: 'Tự khóa',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post(`/api/venues/${court.venue_id}/generate-slots`)
        .set('Authorization', `Bearer ${tokens.manager1}`)
        .send({ days: 0 })
    ).status,
    400,
  );
});

test('Bổ sung: hai người sửa cùng version, một thành công và một EDIT_CONFLICT', async () => {
  const current = await db('courts').where({ id: court.id }).first();
  const results = await Promise.all(
    ['Tên A', 'Tên B'].map((name) =>
      api('patch', `/courts/${court.id}`, 'manager1').send({
        name,
        expected_version: current.version,
      }),
    ),
  );
  assert.equal(results.filter((res) => res.status === 200).length, 1);
  const rejected = results.find((res) => res.status === 409);
  assert.ok(rejected);
  assert.equal(rejected.body.error.code, 'EDIT_CONFLICT');
  assert.equal((await db('courts').where({ id: court.id }).first()).version, current.version + 1);
});

test('Bổ sung: ADMIN khóa sân tranh chấp với booking, không tạo trạng thái sai', async () => {
  const [newCourt] = await db('courts')
    .insert({
      venue_id: otherCourt.venue_id,
      name: 'Sân kiểm tra concurrency',
      sport_type: 'BADMINTON',
      hourly_price: 100000,
    })
    .returning('*');
  const template = await futureSlot(otherCourt.id);
  const [slot] = await db('time_slots')
    .insert({
      court_id: newCourt.id,
      slot_date: template.slot_date,
      start_time: '10:00:00',
      end_time: '11:00:00',
      price: 100000,
    })
    .returning('*');
  const results = await Promise.all([
    api('post', '/bookings/online').send({ time_slot_id: slot.id }),
    api('patch', `/admin/courts/${newCourt.id}/status`, 'admin').send({
      status: 'MAINTENANCE',
      expected_version: 1,
      reason: 'Bảo trì có kiểm soát',
    }),
  ]);
  assert.equal(
    results.filter((res) => res.status >= 200 && res.status < 300).length,
    1,
    JSON.stringify(results.map((res) => res.body)),
  );
  assert.equal(results.filter((res) => res.status === 409).length, 1);
  const updated = await db('courts').where({ id: newCourt.id }).first();
  if (updated.status === 'MAINTENANCE') {
    assert.equal(
      Number((await db('bookings').where({ time_slot_id: slot.id }).count('* as n').first()).n),
      0,
    );
    assert.ok(await db('audit_logs').where({ entity_id: newCourt.id }).first());
  } else {
    assert.equal((await db('time_slots').where({ id: slot.id }).first()).status, 'HELD');
  }
});

test('Bổ sung: thanh toán sau hết hold không chiếm lại slot', async () => {
  const slot = await futureSlot();
  const booking = await hold(slot);
  const payment = success(
    await api('post', '/payments/create').send({ booking_id: booking.id, method: 'CREDIT_CARD' }),
  );
  await db('time_slots')
    .where({ id: slot.id })
    .update({ held_until: db.raw("clock_timestamp() - interval '1 second'") });
  await expireHolds();
  const newBooking = await hold(slot, 'customer2');
  assert.equal(
    (await api('post', '/payments/confirm').send({ transaction_code: payment.transaction_code }))
      .status,
    409,
  );
  assert.equal((await db('bookings').where({ id: newBooking.id }).first()).status, 'PENDING');
  assert.equal((await db('time_slots').where({ id: slot.id }).first()).status, 'HELD');
});

test('Bổ sung: ADMIN đổi trạng thái bắt buộc lý do và audit đúng actor', async () => {
  const [emptyCourt] = await db('courts')
    .insert({
      venue_id: court.venue_id,
      name: 'Sân audit độc lập',
      sport_type: 'BADMINTON',
      hourly_price: 80000,
    })
    .returning('*');
  assert.equal(
    (
      await api('patch', `/admin/courts/${emptyCourt.id}/status`, 'admin').send({
        status: 'MAINTENANCE',
        expected_version: 1,
      })
    ).status,
    400,
  );
  success(
    await api('patch', `/admin/courts/${emptyCourt.id}/status`, 'admin').send({
      status: 'MAINTENANCE',
      expected_version: 1,
      reason: 'Bảo trì kiểm thử nhật ký',
    }),
  );
  const audit = await db('audit_logs')
    .where({ entity_id: emptyCourt.id, action: 'COURT_STATUS_CHANGED' })
    .first();
  assert.equal(audit.actor_id, users.admin.id);
  assert.equal(audit.before_data.status, 'ACTIVE');
  assert.equal(audit.after_data.status, 'MAINTENANCE');
  assert.equal(audit.reason, 'Bảo trì kiểm thử nhật ký');
});

// Additional coverage for the PDF revision: runtime M3 and manager ownership.
async function freshSchedule() {
  const created = success(await api('post', `/venues/${court.venue_id}/courts`, 'manager1').send({
    name: `Sân riêng ${randomUUID()}`, sport_type: 'BADMINTON', hourly_price: 120000,
  }));
  const { rows: [clock] } = await db.raw(
    "SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 2)::text AS day",
  );
  const generated = success(await api('post', `/venues/${court.venue_id}/generate-slots`, 'manager1')
    .send({ court_ids: [created.id], start_date: clock.day, days: 1 }));
  assert.equal(generated.created, 16);
  const slots = success(await api('get', `/courts/${created.id}/slots?date=${clock.day}`));
  return { court: created, day: clock.day, slots };
}

test('M3: sinh lịch đồng thời không trùng, không ghi đè slot đã giữ hoặc giá đã sửa', async () => {
  const fixture = await freshSchedule();
  const target = fixture.slots[0];
  const priced = success(await api('patch', `/slots/${target.id}`, 'manager1')
    .send({ expected_version: target.version, price: 180000 }));
  const booking = await hold(priced);
  const before = await db('time_slots').where({ id: target.id }).first();
  const results = await Promise.all([1, 2].map(() =>
    api('post', `/venues/${court.venue_id}/generate-slots`, 'manager1')
      .send({ court_ids: [fixture.court.id], start_date: fixture.day, days: 1 })));
  for (const result of results) {
    assert.equal(success(result).created, 0);
    assert.equal(result.body.data.skipped, 16);
  }
  assert.equal(Number((await db('time_slots').where({ court_id: fixture.court.id }).count('* as n').first()).n), 16);
  const after = await db('time_slots').where({ id: target.id }).first();
  assert.equal(after.status, 'HELD');
  assert.equal(after.price, 180000);
  assert.equal(after.version, before.version);
  assert.equal(after.held_until.getTime(), before.held_until.getTime());
  assert.equal((await db('bookings').where({ id: booking.id }).first()).total_amount, 180000);
});

test('M3: sinh đủ 30 ngày 06–22 cho sân mới; không overlap', async () => {
  const created = success(await api('post', `/venues/${court.venue_id}/courts`, 'manager1').send({
    name: `Sân 30 ngày ${randomUUID()}`, sport_type: 'FOOTBALL', hourly_price: 250000,
  }));
  const responses = await Promise.all([1, 2].map(() =>
    api('post', `/venues/${court.venue_id}/generate-slots`, 'manager1').send({ court_ids: [created.id] })));
  const counts = responses.map((r) => success(r).created).sort((a, b) => a - b);
  assert.deepEqual(counts, [0, 480]);
  const days = await db('time_slots').where({ court_id: created.id }).select('slot_date')
    .count('* as n').min('start_time as first').max('end_time as last').groupBy('slot_date');
  assert.equal(days.length, 30);
  for (const day of days) {
    assert.equal(Number(day.n), 16);
    assert.equal(day.first, '06:00:00');
    assert.equal(day.last, '22:00:00');
  }
});

test('M3/TC-10: chặn sinh lịch sai chủ, sân khác cơ sở và ngày ngoài hạn', async () => {
  assert.equal((await api('post', `/venues/${court.venue_id}/generate-slots`, 'manager2')
    .send({ days: 1 })).status, 403);
  assert.equal((await api('post', `/venues/${court.venue_id}/generate-slots`)
    .send({ days: 1 })).status, 403);
  assert.equal((await api('post', `/venues/${court.venue_id}/generate-slots`, 'manager1')
    .send({ days: 1, court_ids: [otherCourt.id] })).status, 400);
  for (const body of [{ days: 31 }, { days: 1, start_date: '2020-01-01' },
    { days: 1, start_date: '2099-01-01' }, { days: 1, start_date: '2026-02-30' }]) {
    assert.equal((await api('post', `/venues/${court.venue_id}/generate-slots`, 'manager1').send(body)).status, 400);
  }
});

test('M2/M3: manager đổi trạng thái trong phạm vi; customer và manager khác bị chặn', async () => {
  const fixture = await freshSchedule();
  const target = fixture.slots[0];
  const body = { expected_version: target.version, status: 'UNAVAILABLE', reason: 'Bảo trì hệ thống đèn' };
  assert.equal((await api('patch', `/slots/${target.id}/status`, 'manager2').send(body)).status, 403);
  assert.equal((await api('patch', `/slots/${target.id}/status`).send(body)).status, 403);
  const blocked = success(await api('patch', `/slots/${target.id}/status`, 'manager1').send(body));
  assert.equal(blocked.status, 'UNAVAILABLE');
  assert.equal((await api('post', '/bookings/online').send({ time_slot_id: target.id })).status, 409);
  const restored = success(await api('patch', `/slots/${target.id}/status`, 'manager1')
    .send({ ...body, expected_version: blocked.version, status: 'AVAILABLE' }));
  assert.equal(restored.status, 'AVAILABLE');
  assert.ok(await db('audit_logs').where({ entity_id: target.id, actor_id: users.manager1.id, action: 'SLOT_STATUS_CHANGED' }).first());
  const closed = success(await api('patch', `/courts/${fixture.court.id}/status`, 'manager1')
    .send({ ...body, expected_version: fixture.court.version, status: 'MAINTENANCE' }));
  assert.equal(closed.status, 'MAINTENANCE');
  const publicCourts = success(await api('get', `/venues/${court.venue_id}/courts?limit=300`));
  assert.ok(!publicCourts.some((c) => c.id === closed.id));
  assert.equal((await api('post', '/bookings/online').send({ time_slot_id: target.id })).status, 409);
});

test('M2: CRUD cơ sở/sân, xóa mềm giữ lịch sử; chủ khác không thể đổi trạng thái', async () => {
  const venue = success(await api('post', '/venues', 'manager1').send({
    name: 'Cơ sở kiểm thử CRUD', address: '123 Đường kiểm thử', district: 'Thủ Đức',
  }));
  const created = success(await api('post', `/venues/${venue.id}/courts`, 'manager1').send({
    name: 'Sân CRUD', sport_type: 'PICKLEBALL', hourly_price: 100000,
  }));
  const body = { expected_version: venue.version, reason: 'Tạm dừng cơ sở kiểm thử', status: 'INACTIVE' };
  assert.equal((await api('patch', `/venues/${venue.id}/status`, 'manager2').send(body)).status, 403);
  const updated = success(await api('patch', `/venues/${venue.id}/status`, 'manager1').send(body));
  assert.equal((await api('get', `/venues/${venue.id}`)).status, 404);
  assert.equal(success(await api('get', `/venues/${venue.id}`, 'manager1')).status, 'INACTIVE');
  success(await api('patch', `/venues/${venue.id}/status`, 'manager1')
    .send({ ...body, expected_version: updated.version, status: 'ACTIVE' }));
  const archived = success(await api('delete', `/courts/${created.id}`, 'manager1')
    .send({ expected_version: created.version, reason: 'Ngưng hoạt động sân thử nghiệm' }));
  assert.equal(archived.status, 'INACTIVE');
  assert.ok(await db('courts').where({ id: created.id }).first());
  const current = await db('sport_venues').where({ id: venue.id }).first();
  const archivedVenue = success(await api('delete', `/venues/${venue.id}`, 'manager1')
    .send({ expected_version: current.version, reason: 'Ngưng hoạt động cơ sở thử nghiệm' }));
  assert.equal(archivedVenue.status, 'INACTIVE');
});

test('M3: giá slot có version và ownership; không sửa giá slot đang HELD/BOOKED', async () => {
  const { slots } = await freshSchedule();
  const target = slots[0];
  const body = { expected_version: target.version, price: 150000 };
  assert.equal((await api('patch', `/slots/${target.id}`, 'manager2').send(body)).status, 403);
  assert.equal((await api('patch', `/slots/${target.id}`, 'manager1').send({ ...body, price: -1 })).status, 400);
  const results = await Promise.all([140000, 150000].map((price) =>
    api('patch', `/slots/${target.id}`, 'manager1').send({ ...body, price })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  const current = await db('time_slots').where({ id: target.id }).first();
  const booking = await hold(current);
  const held = await db('time_slots').where({ id: target.id }).first();
  assert.equal((await api('patch', `/slots/${target.id}`, 'manager1')
    .send({ price: 999, expected_version: held.version })).status, 409);
  await pay(booking);
  const booked = await db('time_slots').where({ id: target.id }).first();
  assert.equal((await api('patch', `/slots/${target.id}/status`, 'manager1')
    .send({ expected_version: booked.version, status: 'AVAILABLE', reason: 'Thử mở lại ca đã đặt' })).status, 409);
  assert.equal((await db('bookings').where({ id: booking.id }).first()).total_amount, current.price);
});

test('M5: nhiều payment attempts chỉ một PAID, các attempt còn lại FAILED', async () => {
  const booking = await hold(await futureSlot());
  const attempts = await Promise.all(['BANK_TRANSFER', 'E_WALLET'].map(async (method) =>
    success(await api('post', '/payments/create').send({ booking_id: booking.id, method }))));
  assert.equal((await api('post', '/payments/confirm', 'customer2')
    .send({ transaction_code: attempts[0].transaction_code })).status, 403);
  const results = await Promise.all(attempts.map((p) =>
    api('post', '/payments/confirm').send({ transaction_code: p.transaction_code })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  const payments = await db('payments').where({ booking_id: booking.id });
  assert.equal(payments.filter((p) => p.status === 'PAID').length, 1);
  assert.equal(payments.filter((p) => p.status === 'FAILED').length, 1);
});

test('M5/M6: confirm sau deadline bị chặn dù cron chưa chạy', async () => {
  const booking = await hold(await futureSlot());
  const payment = success(await api('post', '/payments/create')
    .send({ booking_id: booking.id, method: 'BANK_TRANSFER' }));
  await db('time_slots').where({ id: booking.time_slot_id })
    .update({ held_until: db.raw("clock_timestamp() - interval '1 second'") });
  assert.equal((await api('post', '/payments/confirm').send({ transaction_code: payment.transaction_code })).status, 409);
  await Promise.all([expireHolds(), expireHolds()]);
  assert.equal((await db('bookings').where({ id: booking.id }).first()).status, 'EXPIRED');
  assert.equal((await db('payments').where({ id: payment.id }).first()).status, 'FAILED');
  assert.equal(Number((await db('audit_logs').where({ entity_id: booking.id, action: 'BOOKING_EXPIRED' }).count('* as n').first()).n), 1);
});

test('M7/M8: complete sớm bị chặn; gia hạn thành công tạo booking con và payment', async () => {
  const { slots } = await freshSchedule();
  const booking = await hold(slots[0]);
  await pay(booking);
  assert.equal((await api('post', `/bookings/${booking.id}/complete`, 'manager1').send({})).status, 409);
  const extension = success(await api('post', `/bookings/${booking.id}/extend`, 'manager1')
    .send({ method: 'CASH' }));
  assert.equal(extension.source, 'EXTENSION');
  assert.equal(extension.parent_booking_id, booking.id);
  assert.equal(extension.time_slot_id, slots[1].id);
  assert.equal(extension.status, 'CONFIRMED');
  assert.equal((await db('payments').where({ booking_id: extension.id }).first()).status, 'PAID');
  assert.equal((await api('post', `/bookings/${booking.id}/extend`, 'manager1').send({ method: 'CASH' })).status, 409);
});

test('M9: hai booking dời cùng một đích, chỉ một thắng và bên thua rollback', async () => {
  const { slots } = await freshSchedule();
  const a = await hold(slots[0]);
  const b = await hold(slots[1], 'customer2');
  await pay(a);
  await pay(b, 'customer2');
  const results = await Promise.all([[a, 'customer'], [b, 'customer2']].map(([booking, who]) =>
    api('post', `/bookings/${booking.id}/reschedule`, who)
      .send({ new_time_slot_id: slots[2].id, reason: 'Dời sang ca phù hợp hơn' })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  const loserIndex = results.findIndex((r) => r.status === 409);
  const loser = [a, b][loserIndex];
  assert.equal((await db('bookings').where({ id: loser.id }).first()).time_slot_id, slots[loserIndex].id);
  assert.equal((await db('time_slots').where({ id: slots[loserIndex].id }).first()).status, 'BOOKED');
  assert.equal(Number((await db('booking_reschedules').whereIn('booking_id', [a.id, b.id]).count('* as n').first()).n), 1);
});

test('M9/M10: refund và dời sân loại trừ nhau trong cùng cuộc đua', async () => {
  const { slots } = await freshSchedule();
  const booking = await hold(slots[0]);
  await pay(booking);
  success(await api('post', `/bookings/${booking.id}/venue-issue`, 'manager1')
    .send({ reason: 'Hỏng hệ thống chiếu sáng', action: 'REPORT' }));
  const responses = await Promise.all([
    api('post', `/bookings/${booking.id}/refund-request`).send({}),
    api('post', `/bookings/${booking.id}/reschedule`).send({
      new_time_slot_id: slots[1].id, reason: 'Chọn ca khác sau sự cố', is_venue_issue: true,
    }),
  ]);
  assert.equal(responses.filter((r) => r.status >= 200 && r.status < 300).length, 1);
  assert.equal(responses.filter((r) => r.status === 409).length, 1);
  const refunds = await db('refunds').where({ booking_id: booking.id });
  const moves = await db('booking_reschedules').where({ booking_id: booking.id });
  assert.equal(refunds.length + moves.length, 1);
  assert.equal((await db('time_slots').where({ id: slots[0].id }).first()).status, 'UNAVAILABLE');
});

test('M10: list/detail/history đúng phạm vi; yêu cầu hoàn lặp và xác nhận lặp an toàn', async () => {
  const booking = await hold(await futureSlot());
  await pay(booking);
  const refund = success(await api('post', `/bookings/${booking.id}/venue-issue`, 'manager1')
    .send({ reason: 'Sân ngập nước không thể sử dụng', action: 'REFUND' }));
  assert.equal(success(await api('post', `/bookings/${booking.id}/refund-request`).send({})).id, refund.id);
  assert.equal((await api('get', `/refunds/${refund.id}`, 'manager2')).status, 403);
  assert.equal((await api('get', `/refunds/${refund.id}`, 'customer2')).status, 403);
  assert.equal((await api('patch', `/refunds/${refund.id}/status`, 'manager2')
    .send({ status: 'APPROVED' })).status, 403);
  assert.equal(success(await api('get', `/refunds?booking_id=${booking.id}`, 'manager2')).length, 0);
  assert.equal(success(await api('get', `/refunds?booking_id=${booking.id}`, 'manager1'))[0].id, refund.id);
  success(await api('patch', `/refunds/${refund.id}/status`, 'manager1').send({ status: 'APPROVED' }));
  const results = await Promise.all([1, 2].map(() =>
    api('patch', `/refunds/${refund.id}/status`, 'manager1').send({ status: 'COMPLETED' })));
  results.forEach(success);
  assert.equal(success(await api('post', `/bookings/${booking.id}/refund-request`).send({})).status, 'COMPLETED');
  const history = success(await api('get', `/bookings/${booking.id}/history`));
  assert.equal(history.refund.status, 'COMPLETED');
  assert.equal(history.payments[0].status, 'REFUNDED');
  assert.equal((await api('get', `/bookings/${booking.id}/history`, 'customer2')).status, 403);
  assert.equal(Number((await db('audit_logs').where({ entity_id: refund.id, action: 'REFUND_COMPLETED' }).count('* as n').first()).n), 1);
});

test('Danh sách: phân trang, lọc giá/môn và scope không bị vượt bằng query', async () => {
  const { slots } = await freshSchedule();
  const booking = await hold(slots[0]);
  assert.equal(success(await api('get', `/bookings?court_id=${slots[0].court_id}&status=PENDING`))[0].id, booking.id);
  assert.equal(success(await api('get', `/bookings?court_id=${slots[0].court_id}&status=PENDING`, 'customer2')).length, 0);
  assert.equal(success(await api('get', `/bookings?venue_id=${court.venue_id}`, 'manager2')).length, 0);
  const first = success(await api('get', '/bookings?limit=1&offset=0'));
  const second = success(await api('get', '/bookings?limit=1&offset=1'));
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.notEqual(first[0].id, second[0].id);
  for (const path of ['/bookings?limit=0', '/bookings?offset=-1', '/venues?mine=garbage',
    '/venues?min_price=200&max_price=100', '/venues?min_price=oops']) {
    assert.equal((await api('get', path)).status, 400);
  }
  const courts = success(await api('get', `/venues/${court.venue_id}/courts?sport_type=BADMINTON&min_price=120000&max_price=120000&limit=300`));
  assert.ok(courts.length);
  assert.ok(courts.every((c) => c.sport_type === 'BADMINTON' && c.hourly_price === 120000));
});

test('Audit thất bại rollback cả giá/version; không commit thiếu nhật ký', async () => {
  const { slots } = await freshSchedule();
  const slot = slots[0];
  await db.raw(`CREATE FUNCTION test_reject_price_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'SLOT_PRICE_CHANGED' THEN RAISE EXCEPTION 'forced audit failure'; END IF;
    RETURN NEW; END; $$;
    CREATE TRIGGER test_reject_price_audit BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION test_reject_price_audit();`);
  try {
    assert.equal((await api('patch', `/slots/${slot.id}`, 'manager1')
      .send({ expected_version: slot.version, price: 999999 })).status, 500);
    const current = await db('time_slots').where({ id: slot.id }).first();
    assert.equal(current.price, slot.price);
    assert.equal(current.version, slot.version);
  } finally {
    await db.raw('DROP TRIGGER IF EXISTS test_reject_price_audit ON audit_logs; DROP FUNCTION IF EXISTS test_reject_price_audit();');
  }
});

test('HTTP: JSON hỏng và payload quá lớn vẫn trả envelope lỗi', async () => {
  const invalid = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_JSON');
  assert.equal(invalid.body.success, false);
  const large = await request(app).post('/api/auth/login').send({ data: 'x'.repeat(70000) });
  assert.equal(large.status, 413);
  assert.equal(large.body.error.code, 'PAYLOAD_TOO_LARGE');
});

test('M1/M12: logout/khóa/cấp quyền thu hồi token, dữ liệu user và audit không lộ bí mật', async () => {
  const session = success(await request(app).post('/api/auth/register').send({
    full_name: 'Khách kiểm tra phiên', email: 'session-test@example.com', password: 'Demo@12345',
  }));
  const me = () => request(app).get('/api/auth/me').set('Authorization', `Bearer ${session.token}`);
  success(await me());
  success(await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${session.token}`));
  assert.equal((await me()).status, 401);
  const login = () => request(app).post('/api/auth/login').send({ email: 'session-test@example.com', password: 'Demo@12345' });
  const active = success(await login());
  success(await api('patch', `/admin/users/${session.user.id}/status`, 'admin').send({ is_active: false }));
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${active.token}`)).status, 401);
  assert.equal((await login()).status, 403);
  success(await api('patch', `/admin/users/${session.user.id}/status`, 'admin')
    .send({ is_active: true, role: 'VENUE_MANAGER' }));
  const updated = success(await login());
  assert.equal(updated.user.role, 'VENUE_MANAGER');
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${active.token}`)).status, 401);
  const list = success(await api('get', '/admin/users?q=session-test&limit=1', 'admin'));
  assert.equal(list[0].id, session.user.id);
  assert.ok(!JSON.stringify(list).includes('password_hash'));
  const audit = success(await api('get', `/admin/audit-logs?entity_id=${session.user.id}`, 'admin'));
  assert.ok(audit.length >= 2);
  assert.ok(!JSON.stringify(audit).includes('password_hash'));
  assert.ok(!JSON.stringify(audit).includes('token_version'));
});

test('PostgreSQL: ràng buộc overlap, thời lượng, HELD deadline và payment unique', async () => {
  const { slots } = await freshSchedule();
  const slot = slots[0];
  const rejected = async (query, code) => assert.rejects(async () => await query,
    (error) => (Array.isArray(code) ? code : [code]).includes(error.code));
  await rejected(db('time_slots').insert({ court_id: slot.court_id, slot_date: slot.slot_date,
    start_time: slot.start_time, end_time: slot.end_time, price: 1000 }), ['23505', '23P01']);
  await rejected(db('time_slots').insert({ court_id: slot.court_id, slot_date: slot.slot_date,
    start_time: '06:30:00', end_time: '07:30:00', price: 1000 }), '23514');
  await rejected(db('time_slots').where({ id: slot.id }).update({ status: 'HELD', held_until: null }), '23514');
  const booking = await hold(slot);
  await pay(booking);
  await rejected(db('payments').insert({ booking_id: booking.id, method: 'CASH',
    transaction_code: `duplicate-${randomUUID()}`, status: 'PAID', amount: slot.price }), '23505');
  assert.equal((await db('time_slots').where({ id: slot.id }).first()).status, 'BOOKED');
});

test('M9: lỗi ghi lịch sử dời rollback booking và cả hai slot', async () => {
  const { slots } = await freshSchedule();
  const booking = await hold(slots[0]);
  await pay(booking);
  await db.raw(`CREATE FUNCTION test_reject_reschedule() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'forced reschedule history failure'; END; $$;
    CREATE TRIGGER test_reject_reschedule BEFORE INSERT ON booking_reschedules
    FOR EACH ROW EXECUTE FUNCTION test_reject_reschedule();`);
  try {
    assert.equal((await api('post', `/bookings/${booking.id}/reschedule`).send({
      new_time_slot_id: slots[1].id, reason: 'Kiểm tra rollback dời lịch',
    })).status, 500);
    assert.equal((await db('bookings').where({ id: booking.id }).first()).time_slot_id, slots[0].id);
    assert.equal((await db('time_slots').where({ id: slots[0].id }).first()).status, 'BOOKED');
    assert.equal((await db('time_slots').where({ id: slots[1].id }).first()).status, 'AVAILABLE');
    assert.equal(Number((await db('booking_reschedules').where({ booking_id: booking.id }).count('* as n').first()).n), 0);
  } finally {
    await db.raw('DROP TRIGGER IF EXISTS test_reject_reschedule ON booking_reschedules; DROP FUNCTION IF EXISTS test_reject_reschedule();');
  }
});

test('M1: chặn mật khẩu bị bcrypt cắt ngầm, giới hạn theo byte UTF-8', async () => {
  const email = 'password-byte-limit@example.com';
  for (const password of ['a'.repeat(73), 'ế'.repeat(25)]) {
    const body = { email, password };
    const register = await request(app).post('/api/auth/register')
      .send({ ...body, full_name: 'Kiểm tra giới hạn mật khẩu' });
    assert.equal(register.status, 400);
    assert.equal(register.body.error.code, 'VALIDATION_ERROR');
    assert.equal((await request(app).post('/api/auth/login').send(body)).status, 400);
  }
  assert.equal(await db('users').where({ email }).first(), undefined);
  const password = 'ế'.repeat(24); // Exactly 72 UTF-8 bytes.
  success(await request(app).post('/api/auth/register').send({
    email, password, full_name: 'Mật khẩu tiếng Việt',
  }));
  success(await request(app).post('/api/auth/login').send({ email, password }));
});

test('M4/M6: đơn EXPIRED không nhận deadline giữ chỗ của khách đặt sau', async () => {
  const slot = await futureSlot();
  const old = await hold(slot);
  await db('time_slots').where({ id: slot.id })
    .update({ held_until: db.raw("clock_timestamp() - interval '1 second'") });
  await expireHolds();
  const replacement = await hold(slot, 'customer2');
  const oldDetail = success(await api('get', `/bookings/${old.id}`));
  const newDetail = success(await api('get', `/bookings/${replacement.id}`, 'customer2'));
  assert.equal(oldDetail.status, 'EXPIRED');
  assert.equal(oldDetail.held_until, null);
  assert.ok(newDetail.held_until);
  const history = success(await api('get', `/bookings/${old.id}/history`));
  assert.equal(history.booking.held_until, null);
});

test('M5: recheck deadline ở bước BOOKED; hết hạn phải rollback cả payment và booking', async () => {
  const booking = await hold(await futureSlot());
  const first = success(await api('post', '/payments/create')
    .send({ booking_id: booking.id, method: 'BANK_TRANSFER' }));
  const alternative = success(await api('post', '/payments/create')
    .send({ booking_id: booking.id, method: 'E_WALLET' }));
  const original = await db('time_slots').where({ id: booking.time_slot_id }).first();
  // Force the database deadline to pass AFTER assertPayable read it but BEFORE
  // the final BOOKED update, avoiding wall-clock sleeps or timing flakiness.
  await db.raw(`CREATE FUNCTION test_expire_during_payment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE time_slots SET held_until = clock_timestamp() - interval '1 second'
      WHERE id = (SELECT time_slot_id FROM bookings WHERE id = NEW.booking_id);
      RETURN NEW;
    END; $$;
    CREATE TRIGGER test_expire_during_payment BEFORE UPDATE ON payments
    FOR EACH ROW WHEN (OLD.status = 'PENDING' AND NEW.status = 'PAID')
    EXECUTE FUNCTION test_expire_during_payment();`);
  try {
    const res = await api('post', '/payments/confirm').send({ transaction_code: first.transaction_code });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'HOLD_EXPIRED');
    assert.equal((await db('bookings').where({ id: booking.id }).first()).status, 'PENDING');
    const after = await db('time_slots').where({ id: booking.time_slot_id }).first();
    assert.equal(after.status, 'HELD');
    assert.equal(after.held_until.getTime(), original.held_until.getTime());
    assert.equal(after.version, original.version);
    const payments = await db('payments').whereIn('id', [first.id, alternative.id]);
    assert.equal(payments.length, 2);
    assert.ok(payments.every((payment) => payment.status === 'PENDING'));
    assert.equal(Number((await db('audit_logs')
      .where({ entity_id: first.id, action: 'PAYMENT_CONFIRMED_SANDBOX' }).count('* as n').first()).n), 0);
  } finally {
    await db.raw('DROP TRIGGER IF EXISTS test_expire_during_payment ON payments; DROP FUNCTION IF EXISTS test_expire_during_payment();');
  }
});
