import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
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

test('Bổ sung: manager không được tự sửa status bằng PATCH thông tin', async () => {
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
        .send({})
    ).status,
    404,
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
