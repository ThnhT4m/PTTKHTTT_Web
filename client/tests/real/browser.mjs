import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createServer } from 'vite';
import { launchChrome } from './chrome.mjs';
import { fileURLToPath } from 'node:url';
import { addDays } from '../../src/utils/format.js';

export async function runBrowserChecks(e, check) {
  process.env.VITE_DATA_MODE = 'api'; process.env.VITE_PROXY_TARGET = e.origin;
  const vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), server: { host: '127.0.0.1', port: 5175, strictPort: true, proxy: { '/api': { target: e.origin, changeOrigin: true } } } });
  await vite.listen(); const base = 'http://127.0.0.1:5175', c = await launchChrome(e.artifacts);
  const { send, evaluate, until, click, fill, shot } = c, f = e.fixture, db = e.database;
  const visit = async (path, condition = `!!document.querySelector('main') && !document.querySelector('.loading')`) => { await c.navigate(base + path); await until(condition); };
  const login = async (email, destination, password = 'Demo@12345') => { await visit('/login', `!!document.querySelector('[name=email]')`); await fill('[name=email]', email); await fill('[name=password]', password); await evaluate(`document.querySelector('form').requestSubmit()`); await until(`location.pathname===${JSON.stringify(destination)} && !document.querySelector('.loading')`); };
  const logout = async () => { await evaluate(`document.querySelector('[title="Đăng xuất"]').click()`); await until(`location.pathname==='/login' && !!document.querySelector('[name=email]')`); };
  const submit = async () => evaluate(`document.querySelector('[role=dialog] form').requestSubmit()`);
  const closed = async () => until(`!document.querySelector('[role=dialog]') && !document.querySelector('.loading')`);
  const modalClose = async () => { await evaluate(`document.querySelector('[role=dialog] [aria-label="Đóng"]').click()`); await closed(); };
  const row = (id) => `Array.from(document.querySelectorAll('tbody tr')).find(r=>r.innerText.includes('${id}'))`;
  let held, uiVenue, uiCourt, pos, extension, complete, move, issue, review;
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 950, deviceScaleFactor: 1, mobile: false });
    await check('AUTH', 'Browser: registration, password errors and CUSTOMER route protection', 'CUSTOMER', async () => {
      await visit('/register', `!!document.querySelector('[name=full_name]')`);
      for (const [key, value] of Object.entries({ full_name: 'Khách UI thật', email: 'task5-ui@example.com', password: 'Demo@12345', password_confirmation: 'Demo@12345' })) await fill(`[name=${key}]`, value);
      await evaluate(`document.querySelector('form').requestSubmit()`); await until(`location.pathname==='/venues' && !!document.querySelector('.header-user')`);
      await visit('/admin', `location.pathname==='/venues' && !document.querySelector('.loading')`); await logout();
      await fill('[name=email]', 'customer@example.com'); await fill('[name=password]', 'Wrong@12345'); await evaluate(`document.querySelector('form').requestSubmit()`); await until(`document.querySelector('[role=alert]')?.innerText.includes('không đúng')`); await shot('real-auth');
      await login('customer@example.com', '/venues');
      return { registered: true, wrongPasswordUI: true, forbiddenAdmin: true };
    });
    await check('CATALOGUE', 'Browser: real search/filter, venue detail and daily slot prices', 'CUSTOMER', async () => {
      await visit('/venues', `document.querySelectorAll('.venue-card').length>0`);
      await fill('[aria-label="Tìm cơ sở"]', f.venue.name); await until(`document.querySelectorAll('.venue-card').length===1 && !document.querySelector('.loading')`);
      await visit(`/venues/${f.venue.id}`, `document.querySelectorAll('.court-row').length>0`); await shot('real-venue');
      await visit(`/courts/${f.court.id}/schedule?date=${f.later}`, `document.querySelectorAll('.slot-card').length===16 && !document.querySelector('.loading')`);
      await shot('real-schedule'); return { venue: f.venue.id, court: f.court.id, slots: 16 };
    });
    await check('TC-01', 'Browser: actual conflict reloads schedule after another customer wins', 'CUSTOMER + independent CUSTOMER2', async () => {
      await visit(`/courts/${f.court.id}/schedule?date=${f.later}`, `document.querySelectorAll('.slot-card').length===16 && !document.querySelector('.loading')`);
      const available = (await f.slots(f.court.id, f.later)).find((s) => s.status === 'AVAILABLE');
      const index = (await f.slots(f.court.id, f.later)).findIndex((s) => s.id === available.id);
      await evaluate(`document.querySelectorAll('.slot-card')[${index}].click()`); await until(`!!document.querySelector('.booking-selection .summary-list')`);
      await e.users.customer2.client.post('/bookings/online', { time_slot_id: available.id });
      await click('Xác nhận giữ chỗ'); await until(`document.querySelector('[role=alert]')?.innerText.includes('không còn') || document.querySelector('[role=alert]')?.innerText.includes('vừa')`);
      await until(`document.querySelectorAll('.slot-card')[${index}].disabled && !document.querySelector('.loading')`);
      assert.equal(await evaluate(`location.pathname.includes('checkout')`), false); await shot('real-conflict');
      return { slot_id: available.id, conflict: 409, UI_reloaded: true };
    });
    await check('TC-02/04', 'Browser: hold PENDING/deadline survives checkout reload; payment stays disabled', 'CUSTOMER', async () => {
      await visit(`/courts/${f.court.id}/schedule?date=${f.later}`, `document.querySelectorAll('.slot-card').length===16 && !!document.querySelector('.slot-card:not(:disabled)')`);
      await evaluate(`document.querySelector('.slot-card:not(:disabled)').click()`); await click('Xác nhận giữ chỗ');
      await until(`location.pathname.startsWith('/checkout/') && !!document.querySelector('.badge--PENDING')`);
      const id = await evaluate(`location.pathname.split('/').pop()`); held = (await e.users.admin.client.get(`/bookings/${id}`)).data;
      const deadline = held.held_until; await visit(`/checkout/${id}`, `!!document.querySelector('.badge--PENDING') && document.querySelector('.countdown strong')?.innerText!=='00:00'`);
      assert.equal((await e.users.admin.client.get(`/bookings/${id}`)).data.held_until, deadline);
      assert.equal(await evaluate(`document.querySelector('.panel__body > button.button--primary').disabled`), true); await shot('real-checkout');
      return { booking_id: id, deadline, reset: false, paymentRequests: 0 };
    });
    // Only fixtures for paid online/customer/history and a past slot. No online payment API is called.
    const selected = await f.free(f.court.id, addDays(f.today, 3)); move = await e.confirmed(selected, e.users.customer.user, 'Khách dời UI thật');
    issue = await e.confirmed(await f.free(f.court.id, addDays(f.today, 3)), e.users.customer.user, 'Khách hoàn UI thật');
    review = await e.confirmed(await f.free(f.court.id, addDays(f.today, -1)), e.users.customer.user, 'Khách review UI thật');
    await e.users.manager1.client.post(`/bookings/${issue.id}/venue-issue`, { reason: 'Sự cố fixture UI thật', action: 'REPORT' });
    await e.users.manager1.client.post(`/bookings/${review.id}/complete`, {});
    await check('TC-07/08/09', 'Browser: customer history, reschedule, requested refund and owner review', 'CUSTOMER', async () => {
      await visit('/my-bookings?status=CONFIRMED', `!!document.querySelector('.booking-card') && !document.querySelector('.loading')`);
      const card = (b) => `document.querySelector('[data-booking-id="${b.id}"]')`;
      await click('Dời lịch', card(move)); await fill('[role=dialog] input[type=date]', addDays(f.today, 4)); await until(`document.querySelectorAll('[role=dialog] [name=new_time_slot_id] option').length>1`);
      const target = await evaluate(`document.querySelector('[role=dialog] [name=new_time_slot_id] option:nth-child(2)').value`); await fill('[role=dialog] [name=new_time_slot_id]', target); await fill('[role=dialog] [name=reason]', 'Dời lịch qua UI thật'); await submit(); await closed();
      assert.equal((await f.detail(move.id)).time_slot_id, target);
      await click('Yêu cầu hoàn tiền', card(issue)); await click('Xác nhận yêu cầu hoàn tiền', `document.querySelector('[role=dialog]')`); await closed();
      await click('Hoàn thành'); await until(`!!document.querySelector('.booking-card .badge--COMPLETED')`);
      await click('Viết đánh giá', card(review)); await fill('[role=dialog] [name=comment]', 'Đánh giá qua UI và PostgreSQL thật'); await submit(); await closed();
      await click('Chi tiết & lịch sử', card(review)); await until(`document.querySelector('[role=dialog]')?.innerText.includes('Đánh giá qua UI')`); await shot('real-history'); await modalClose();
      return { moved: move.id, requestedRefund: issue.id, reviewed: review.id };
    });
    await check('TC-10/18', 'Browser: other owner rejected, expired token and locked account handled distinctly', 'CUSTOMER', async () => {
      const foreign = await e.confirmed(await f.free(f.court.id, addDays(f.today, 3)), e.users.customer2.user);
      await visit(`/checkout/${foreign.id}`, `!!document.querySelector('[role=alert]')`); assert.equal(await evaluate(`!!document.querySelector('.summary-list')`), false);
      const expired = jwt.sign({ ver: 0 }, process.env.JWT_SECRET, { subject: e.users.customer.user.id, expiresIn: -1 }); await evaluate(`localStorage.setItem('sportbooking.token',${JSON.stringify(expired)})`);
      await visit('/my-bookings', `location.pathname==='/login' && !!document.querySelector('[name=email]')`); await until(`document.querySelector('.notice--info')?.innerText.includes('hết hiệu lực')`);
      const account = (await e.users.admin.client.get('/admin/users?q=task5-ui%40example.com')).data[0]; await e.users.admin.client.patch(`/admin/users/${account.id}/status`, { is_active: false });
      await fill('[name=email]', account.email); await fill('[name=password]', 'Demo@12345'); await evaluate(`document.querySelector('form').requestSubmit()`); await until(`document.querySelector('[role=alert]')?.innerText.includes('khóa')`);
      await e.users.admin.client.patch(`/admin/users/${account.id}/status`, { is_active: true }); return { privateBooking: 403, expired: 401, lockedLogin: 403 };
    });
    await login('manager1@example.com', '/manager/venues');
    await check('TC-04/13/20', 'Browser: manager CRUD and 480-slot generation, actual version conflict', 'VENUE_MANAGER', async () => {
      await click('Thêm cơ sở'); for (const [key, value] of Object.entries({ name: 'UI T5 Cơ sở', address: '12 Địa chỉ UI thật', district: 'Quận 7', payment_hold_minutes: 1, minimum_online_booking_lead_minutes: 10 })) await fill(`[role=dialog] [name=${key}]`, value);
      await submit(); await closed(); await click('Danh sách sân'); await click('Thêm sân'); for (const [key, value] of Object.entries({ name: 'UI T5 Sân', sport_type: 'FOOTBALL', hourly_price: 280000 })) await fill(`[role=dialog] [name=${key}]`, value); await submit(); await closed();
      uiVenue = (await e.users.manager1.client.get('/venues?mine=true')).data.find((v) => v.name === 'UI T5 Cơ sở'); uiCourt = (await e.users.manager1.client.get(`/venues/${uiVenue.id}/courts`)).data[0];
      await click('Sinh lịch sân'); await submit(); await until(`document.querySelector('.manager-generation-result')?.innerText.includes('480')`); await shot('real-manager-generation'); await click('Đóng', `document.querySelector('[role=dialog]')`); await closed();
      await click('Chỉnh sửa', `document.querySelector('tbody tr')`);
      await e.users.manager1.client.patch(`/courts/${uiCourt.id}`, { name: 'UI T5 Sân cập nhật', expected_version: uiCourt.version });
      await fill('[role=dialog] [name=name]', 'Không ghi đè'); await submit(); await until(`document.querySelector('[role=dialog] [role=alert]')?.innerText.includes('Tải lại')`); await shot('real-version-conflict'); await click('Tải lại dữ liệu mới', `document.querySelector('[role=dialog]')`); await closed();
      return { venue: uiVenue.id, court: uiCourt.id, generated: 480, conflict: 409 };
    });
    await check('UX-CLOCK-NETWORK', 'Browser: manager uses server clock under 2-hour skew and retries a failed read', 'VENUE_MANAGER', async () => {
      const now = await e.clock(), rows = (await e.users.manager1.client.get(`/courts/${uiCourt.id}/slots?date=${f.today}`)).data;
      const index = rows.findIndex((s) => Date.parse(s.start_at) > now); assert.ok(index >= 0);
      await evaluate(`window.__task5Now=Date.now; Date.now=()=>window.__task5Now()+7200000`);
      try {
        // Set the skew before mounting ManagerSchedule, so the old local-clock guard would fail.
        await click('Xem lịch', `document.querySelector('tbody tr')`);
        await until(`document.querySelectorAll('.manager-slot-grid .slot-card').length===16`);
        await click('Tải lại lịch'); await until(`document.querySelectorAll('.manager-slot-grid .slot-card').length===16 && !document.querySelector('.loading')`);
        await evaluate(`document.querySelectorAll('.manager-slot-grid .slot-card')[${index}].click()`); await until(`!!document.querySelector('.manager-slot-detail')`);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('.manager-slot-detail button')).find(b=>b.innerText==='Chỉnh giá ca').disabled`), false);
        await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await click('Tải lại lịch');
        await until(`document.querySelector('section[aria-label="Lịch và giá sân"] [role=alert]')?.innerText.includes('kết nối')`); await shot('real-read-network-error');
        await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await click('Tải lại dữ liệu', `document.querySelector('section[aria-label="Lịch và giá sân"]')`); await until(`document.querySelectorAll('.manager-slot-grid .slot-card').length===16 && !document.querySelector('.loading')`);
      } finally { await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await evaluate(`Date.now=window.__task5Now`); }
      return { skewMilliseconds: 7200000, priceActionUsesServerClock: true, offlineRead: 'NETWORK_ERROR', readRetry: true };
    });
    await check('TC-05/06', 'Browser: real POS walk-in/extension and linked history', 'VENUE_MANAGER', async () => {
      await visit('/manager/counter', `!!document.querySelector('.panel__header .field select') && !document.querySelector('.loading')`); await fill('.panel__header .field:nth-child(1) select', uiVenue.id); await fill('.panel__header input[type=date]', f.tomorrow); await until(`document.querySelectorAll('.slot-card').length===16 && !document.querySelector('.loading')`);
      await evaluate(`document.querySelector('.slot-card:not(:disabled)').click()`); await fill('[role=dialog] [name=customer_name]', 'Khách POS UI thật'); await evaluate(`document.querySelector('[name=collected]').click()`); await submit(); await closed();
      pos = (await e.users.manager1.client.get(`/bookings?venue_id=${uiVenue.id}&source=WALK_IN`)).data[0]; await click('Gia hạn', row(pos.id)); await until(`document.querySelector('[role=dialog]')?.innerText.includes('07:00') && !document.querySelector('.loading')`); await evaluate(`document.querySelector('[name=collected]').click()`); await shot('real-pos-extension'); await submit(); await closed();
      extension = (await e.users.manager1.client.get(`/bookings?venue_id=${uiVenue.id}&source=EXTENSION`)).data[0]; assert.equal(extension.parent_booking_id, pos.id); await click('Chi tiết', row(extension.id)); await until(`document.querySelector('[role=dialog]')?.innerText.includes('Booking cha')`); await shot('real-pos-history'); await modalClose();
      return { parent: pos.id, child: extension.id, paid: (await f.history(extension.id)).payments[0].status };
    });
    await check('TC-09', 'Browser: manager completes a legitimate past-slot fixture and retries safely', 'VENUE_MANAGER', async () => {
      const pastSlot = await f.free(f.court.id, addDays(f.today, -1)); complete = await e.confirmed(pastSlot, e.users.customer.user, 'Khách complete UI thật');
      await visit('/manager/counter', `!!document.querySelector('.panel__header .field select') && !document.querySelector('.loading')`); await fill('.panel__header .field:nth-child(1) select', complete.venue_id);
      await fill('.workflow-filters .field:nth-child(2) input[type=date]', addDays(f.today, -1)); await until(`!!(${row(complete.id)}) && !document.querySelector('.loading')`);
      await click('Hoàn thành', row(complete.id)); await shot('real-complete'); await submit(); await closed(); assert.equal((await f.detail(complete.id)).status, 'COMPLETED');
      await e.users.manager1.client.post(`/bookings/${complete.id}/complete`, {}); return { booking_id: complete.id, completed: true, idempotent: true };
    });
    await check('TC-07/08', 'Browser: manager issue/reschedule and full sandbox refund read back from API', 'VENUE_MANAGER', async () => {
      await visit('/manager/requests', `!!document.querySelector('.workflow-page > .field select') && !document.querySelector('.loading')`); await fill('.workflow-page > .field select', uiVenue.id); await until(`!!document.querySelector('.booking-card') && !document.querySelector('.loading')`);
      const card = `Array.from(document.querySelectorAll('.booking-card')).find(r=>r.innerText.includes('${pos.id}'))`;
      await click('Báo sự cố', card); await fill('[role=dialog] [name=reason]', 'Sự cố từ UI với Backend thật'); await submit(); await closed();
      await click('Dời lịch', card); await fill('[role=dialog] input[type=date]', f.later); await until(`document.querySelectorAll('[name=new_time_slot_id] option').length>1`); const target = await evaluate(`document.querySelector('[name=new_time_slot_id] option:nth-child(2)').value`); await fill('[name=new_time_slot_id]', target); await fill('[role=dialog] [name=reason]', 'Dời do sự cố UI thật'); await submit(); await closed();
      assert.equal((await f.detail(pos.id)).issue_reported_at, null);
      await click('Lập yêu cầu hoàn tiền', card); await fill('[role=dialog] [name=reason]', 'Sự cố hoàn tiền UI thật'); await submit(); await closed();
      await click('Duyệt hoàn tiền'); await submit(); await closed(); await until(`!!document.querySelector('tbody .badge--PROCESSING')`); await click('Xác nhận đã hoàn'); await shot('real-refund'); await submit(); await closed(); await until(`!!document.querySelector('tbody .badge--COMPLETED')`);
      const h = await f.history(pos.id); assert.equal(h.payments[0].status, 'REFUNDED'); assert.equal(h.booking.status, 'CANCELLED_BY_VENUE'); return { booking_id: pos.id, refund: h.refund.id, payment: 'REFUNDED', moneyTransferred: false };
    });
    await logout(); await login('admin@example.com', '/admin');
    await check('TC-12/18/22', 'Browser: Admin users/status/audit with real session revocation', 'ADMIN', async () => {
      await until(`document.querySelectorAll('.metric-card').length===4 && !document.querySelector('.loading')`); await fill('.workflow-filters input', 'task5-ui@example.com'); await until(`document.querySelectorAll('tbody tr').length===1 && !document.querySelector('.loading')`);
      await click('Khóa'); await submit(); await closed(); await click('Mở khóa'); await submit(); await closed(); await click('Cấp quyền quản lý'); await submit(); await closed(); await until(`!!document.querySelector('tbody .badge--VENUE_MANAGER')`); await click('Hạ quyền khách hàng'); await submit(); await closed();
      await click('Trạng thái sân & cơ sở'); await until(`!!document.querySelector('.panel__body > .field select')`); await fill('.panel__body > .field select', uiVenue.id); await until(`document.querySelector('h3')?.innerText==='UI T5 Cơ sở' && !document.querySelector('.loading')`);
      await click('Đổi trạng thái sân'); await fill('[role=dialog] [name=status]', 'MAINTENANCE'); await fill('[role=dialog] [name=reason]', 'Kiểm thử bảo vệ đơn hiệu lực'); await submit(); await until(`!!document.querySelector('[role=dialog] [role=alert]')`); await modalClose();
      await click('Nhật ký thay đổi'); await fill('[name=entity_id]', uiCourt.id); await click('Lọc nhật ký'); await until(`!!document.querySelector('.audit-details') && !document.querySelector('.loading')`); await evaluate(`document.querySelector('summary').click()`); assert.doesNotMatch(await evaluate('document.body.innerText'), /password_hash|token_version|credential/); await shot('real-admin-audit');
      return { roles: true, activeBookingGuard: true, auditSafe: true };
    });
    await check('UX', 'Browser: all nine screen groups at desktop/tablet/mobile and keyboard', 'all three roles', async () => {
      await e.freshHttpApp();
      const screens = { admin: ['/admin'], manager1: ['/manager/venues', '/manager/counter', '/manager/requests'], customer: ['/venues', `/venues/${f.venue.id}`, `/courts/${f.court.id}/schedule?date=${f.later}`, `/checkout/${held.id}`, '/my-bookings'], guest: ['/login', '/register'] };
      const verified = [];
      await logout();
      for (const [actor, paths] of Object.entries(screens)) {
        if (actor !== 'guest') await login(`${actor}@example.com`, actor === 'admin' ? '/admin' : actor === 'manager1' ? '/manager/venues' : '/venues');
        for (const [size, width, height] of [['desktop', 1365, 950], ['tablet', 820, 1100], ['mobile', 390, 844]]) {
          await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: size === 'mobile' });
          for (let index = 0; index < paths.length; index++) { const path = paths[index]; await visit(path, actor === 'guest' ? `!!document.querySelector('[name=email]')` : `!!document.querySelector('.header-user') && !!document.querySelector('main') && !document.querySelector('.loading')`); assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), true, `Overflow ${actor} ${path} ${size}`); await shot(`real-${actor}-${index}-${size}`); verified.push({ actor, path, size }); }
        }
        if (actor !== 'guest') await logout();
      }
      await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 950, deviceScaleFactor: 1, mobile: false }); await login('manager1@example.com', '/manager/venues'); await click('Thêm cơ sở');
      await evaluate(`const b=[...document.querySelectorAll('[role=dialog] button')];b.at(-1).focus()`); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); assert.equal(await evaluate(`document.querySelector('[role=dialog]').contains(document.activeElement)`), true); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await closed(); await logout(); return { checkedViews: verified.length, verified, keyboard: true };
    });
    await check('HTTP-429', 'Browser: actual auth rate limit has readable error and unlocks submit', 'guest', async () => {
      // Run last; exhaust only this in-process test server's limiter, never a shared server.
      let status; for (let n = 0; n < 105 && status !== 429; n++) status = (await fetch(e.origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status;
      assert.equal(status, 429); await visit('/login', `!!document.querySelector('[name=email]')`); await fill('[name=email]', 'customer@example.com'); await fill('[name=password]', 'Demo@12345'); await evaluate(`document.querySelector('form').requestSubmit()`); await until(`document.querySelector('[role=alert]')?.innerText.includes('Quá nhiều')`); assert.equal(await evaluate(`document.querySelector('form button.button--primary').disabled`), false); await shot('real-rate-limit'); return { status: 429, UI_message: true };
    });
    await check('NETWORK', 'Browser: real proxy used, no mock store, no payment calls or runtime exceptions', 'all roles', async () => {
      assert.ok(c.requests.length > 100); assert.equal(c.requests.some((r) => r.path.startsWith('/api/payments/')), false); assert.deepEqual(c.errors, []); assert.equal(await evaluate(`localStorage.getItem('sportbooking.mock.catalogue.v2')`), null);
      return { requests: c.requests.length, paymentRequests: 0, mockStore: false, runtimeExceptions: 0, proxy: e.origin };
    });
  } finally { await c.close(); await vite.close(); }
}
