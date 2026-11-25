import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { addDays, todayVN } from '../src/utils/format.js';

export async function runCustomerChecks({ evaluate, until, visit, login, logout, pass, send }) {
  const artifacts = new URL('../test-artifacts/', import.meta.url); await mkdir(artifacts, { recursive: true });
  const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(new URL(`${name}.png`, artifacts), Buffer.from(data, 'base64')); };
  const click = async (text, scope = 'document') => {
    await until(`Array.from((${scope}).querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)})`);
    return evaluate(`Array.from((${scope}).querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  };
  const fill = (selector, value) => evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(String(value))}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const api = (code) => evaluate(`import('/src/api/client.js').then(async api=>{${code}})`);
  const selectAvailable = async (date) => {
    await until(`(() => {const grid=document.querySelector('.slot-grid');const button=grid?.querySelector('.slot-card:not(:disabled)');if(grid?.getAttribute('aria-label')!==${JSON.stringify(`Lịch sân ngày ${date}`)} || !button)return false;button.click();return true;})()`);
    await until(`!!document.querySelector('.booking-selection .summary-list')`);
  };
  const submit = () => evaluate(`document.querySelector('[role=dialog] form').requestSubmit()`);
  const closed = () => until(`!document.querySelector('[role=dialog]') && !document.querySelector('.loading')`);
  const tomorrow = addDays(todayVN(), 1), later = addDays(todayVN(), 2);
  const venue = await api(`return (await api.get('/venues')).data.find(v=>v.district==='Thủ Đức')`);
  const court = await api(`return (await api.get('/venues/${venue.id}/courts')).data.find(c=>c.sport_type==='FOOTBALL')`);
  const schedule = `/courts/${court.id}/schedule?date=${tomorrow}`;

  await visit('/venues', `document.querySelectorAll('.venue-card').length===3`);
  await fill('[aria-label="Tìm cơ sở"]', 'Thủ');
  await until(`new URLSearchParams(location.search).get('q')==='Thủ' && document.querySelectorAll('.venue-card').length===1`);
  await fill('[aria-label="Quận huyện"]', 'Thủ Đức'); await fill('[aria-label="Bộ môn"]', 'FOOTBALL');
  await fill('[aria-label="Giá tối thiểu"]', '200000'); await fill('[aria-label="Giá tối đa"]', '350000');
  await until(`document.querySelectorAll('.venue-card').length===1 && !document.querySelector('.loading')`);
  await shot('task3-catalog-desktop');
  const filterSearch = await evaluate('location.search');
  await evaluate(`document.querySelector('.venue-card a').click()`);
  await until(`document.querySelectorAll('.court-row').length>0`);
  await shot('task3-venue-detail');
  await evaluate(`document.querySelector('a.text-link').click()`);
  await until(`location.pathname==='/venues' && document.querySelectorAll('.venue-card').length===1`);
  assert.equal(await evaluate('location.search'), filterSearch);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Tìm cơ sở"]').value`), 'Thủ');
  await fill('[aria-label="Giá tối thiểu"]', '500000');
  await until(`document.querySelector('[role=alert]')?.innerText.includes('không được vượt')`);
  await click('Xóa bộ lọc'); await until(`document.querySelectorAll('.venue-card').length===3`);
  pass('TASK 3: debounce, bộ lọc giá/địa điểm, validation và giữ bộ lọc khi quay lại');

  await visit(schedule, `document.querySelectorAll('.slot-card').length===16 && !!document.querySelector('.slot-card:not(:disabled)')`);
  await selectAvailable(tomorrow);
  await click('Đăng nhập để giữ chỗ');
  await until(`location.pathname==='/login' && !!document.querySelector('[name=email]')`);
  await fill('[name=email]', 'customer@example.com'); await fill('[name=password]', 'Demo@12345');
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await until(`location.pathname==='/courts/${court.id}/schedule' && new URLSearchParams(location.search).get('date')==='${tomorrow}' && !!document.querySelector('.slot-card:not(:disabled)')`);
  await selectAvailable(tomorrow);
  await fill('input[type=date]', later);
  await until(`new URLSearchParams(location.search).get('date')==='${later}' && !document.querySelector('.booking-selection .summary-list') && !document.querySelector('.loading')`);
  await fill('input[type=date]', tomorrow);
  await until(`new URLSearchParams(location.search).get('date')==='${tomorrow}' && !!document.querySelector('.slot-card:not(:disabled)') && !document.querySelector('.loading')`);
  await selectAvailable(tomorrow);
  await until(`!!document.querySelector('.booking-selection .summary-list')`);
  await shot('task3-schedule-selected');
  await click('Xác nhận giữ chỗ');
  await until(`location.pathname.startsWith('/checkout/') && !!document.querySelector('.badge--PENDING')`);
  const checkout = await evaluate('location.pathname'), bookingId = checkout.split('/').pop();
  const held = await api(`return (await api.get('/bookings/${bookingId}')).data`);
  assert.equal(held.status, 'PENDING'); assert.equal(held.held_until !== null, true);
  assert.equal((await api(`return (await api.get('/bookings/${bookingId}/history')).data.payments`)).length, 0);
  assert.equal(await evaluate(`document.querySelector('.panel__body > button.button--primary').disabled`), true);
  await shot('task3-checkout-readonly');
  await visit(checkout, `!!document.querySelector('.badge--PENDING')`);
  assert.equal((await api(`return (await api.get('/bookings/${bookingId}')).data`)).held_until, held.held_until);
  pass('TASK 3: đăng nhập quay đúng sân/ngày, bỏ slot cũ khi đổi ngày, giữ chỗ và refresh giữ deadline');

  await visit(schedule, `!!document.querySelector('.slot-card:not(:disabled)') && !document.querySelector('.loading')`);
  await selectAvailable(tomorrow); await click('Xác nhận giữ chỗ');
  await until(`location.pathname.startsWith('/checkout/') && !!document.querySelector('.badge--PENDING')`);
  // Expiration fixture: emulate an already elapsed server deadline, without creating payment.
  await evaluate(`Promise.all([import('/src/mocks/store.js')]).then(([m])=>{const store=m.createMockStore(localStorage,Date.now),db=structuredClone(store.read());const b=db.bookings.find(b=>b.id==='${bookingId}');const slot=db.slots.find(s=>s.id===b.time_slot_id);b.held_until=new Date(Date.now()-1000).toISOString();slot.held_until=b.held_until;slot.version++;store.commit(db);})`);
  await visit(checkout, `!!document.querySelector('.badge--EXPIRED')`);
  await until(`document.querySelector('.countdown strong')?.innerText==='00:00'`);
  assert.equal((await api(`return (await api.get('/bookings/${bookingId}')).data`)).held_until, null);
  pass('TASK 3: checkout hết hạn chuyển EXPIRED, không reset hoặc xác nhận thanh toán');

  await visit('/my-bookings', `document.querySelectorAll('.booking-card').length===12`);
  const pageOne = await evaluate(`Array.from(document.querySelectorAll('.booking-card')).map(e=>e.dataset.bookingId)`);
  await click('Trang sau'); await until(`new URLSearchParams(location.search).get('offset')==='12' && document.querySelectorAll('.booking-card').length>0 && !document.querySelector('.loading')`);
  const pageTwo = await evaluate(`Array.from(document.querySelectorAll('.booking-card')).map(e=>e.dataset.bookingId)`);
  assert.ok(pageTwo.every((id) => !pageOne.includes(id)));
  await click('Hết hạn'); await until(`document.querySelectorAll('.booking-card').length>0 && !document.querySelector('.loading')`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.booking-card')).every(e=>!!e.querySelector('.badge--EXPIRED'))`), true);
  await click('Đã xác nhận'); await until(`!!document.querySelector('.booking-card .badge--CONFIRMED') && !document.querySelector('.loading')`);
  const rows = await api(`return (await api.get('/bookings?status=CONFIRMED')).data`);
  const ordinary = rows.find((b) => !b.issue_reported_at && !b.refund_status && Date.parse(b.start_at) > Date.now());
  const issue = rows.find((b) => b.issue_reported_at && !b.refund_status), issueRefund = rows.find((b) => b.issue_reported_at && !b.refund_status && b.id !== issue.id);
  await click('Dời lịch', `document.querySelector('[data-booking-id="${ordinary.id}"]')`);
  await until(`!!document.querySelector('[role=dialog] input[type=date]')`);
  await fill('[role=dialog] input[type=date]', later);
  await until(`document.querySelectorAll('[role=dialog] select[name=new_time_slot_id] option').length>1`);
  const newTarget = await evaluate(`document.querySelector('[role=dialog] select[name=new_time_slot_id] option:nth-child(2)').value`);
  await fill('[role=dialog] [name=new_time_slot_id]', newTarget); await fill('[role=dialog] [name=reason]', 'Đổi sang lịch phù hợp hơn');
  await shot('task3-reschedule'); await submit(); await closed();
  assert.equal((await api(`return (await api.get('/bookings/${ordinary.id}/history')).data`)).booking.time_slot_id, newTarget);
  pass('TASK 3: phân trang/lọc lịch sử và dời lịch tự nguyện qua giao diện');

  await click('Dời lịch', `document.querySelector('[data-booking-id="${issue.id}"]')`);
  await fill('[role=dialog] input[type=date]', later);
  await until(`document.querySelectorAll('[role=dialog] select[name=new_time_slot_id] option').length>1`);
  const issueTarget = await evaluate(`document.querySelector('[role=dialog] select[name=new_time_slot_id] option:nth-child(2)').value`);
  await fill('[role=dialog] [name=new_time_slot_id]', issueTarget); await fill('[role=dialog] [name=reason]', 'Dời sân do sự cố đã báo'); await submit(); await closed();
  const issueHistory = await api(`return (await api.get('/bookings/${issue.id}/history')).data`);
  assert.equal(issueHistory.reschedules.at(-1).is_venue_issue, true);
  await click('Yêu cầu hoàn tiền', `document.querySelector('[data-booking-id="${issueRefund.id}"]')`);
  await shot('task3-refund-confirmation'); await click('Xác nhận yêu cầu hoàn tiền', `document.querySelector('[role=dialog]')`); await closed();
  await until(`!!document.querySelector('[data-booking-id="${issueRefund.id}"] .refund-progress')`);
  assert.equal((await api(`return (await api.get('/bookings/${issueRefund.id}/history')).data`)).refund.status, 'REQUESTED');
  pass('TASK 3: dời do sự cố và yêu cầu hoàn tiền chỉ tạo REQUESTED');

  await click('Hoàn thành'); await until(`!!document.querySelector('.booking-card .badge--COMPLETED') && !document.querySelector('.loading')`);
  const completed = await api(`return (await api.get('/bookings?status=COMPLETED')).data.find(b=>!b.review_id)`);
  await click('Viết đánh giá', `document.querySelector('[data-booking-id="${completed.id}"]')`);
  await evaluate(`document.querySelector('[role=dialog] input[name=rating][value="4"]').click()`);
  await fill('[role=dialog] [name=comment]', 'Sân sạch, lịch rõ ràng và thuận tiện.'); await shot('task3-review'); await submit(); await closed();
  await click('Chi tiết & lịch sử', `document.querySelector('[data-booking-id="${completed.id}"]')`);
  await until(`document.querySelector('[role=dialog]')?.innerText.includes('Sân sạch, lịch rõ ràng')`);
  await shot('task3-booking-history'); await evaluate(`document.querySelector('[role=dialog] [aria-label="Đóng"]').click()`); await closed();
  assert.equal(await evaluate(`document.querySelector('[data-booking-id="${completed.id}"]').innerText.includes('Viết đánh giá')`), false);
  pass('TASK 3: gửi đánh giá một lần và xem giao dịch/lịch sử/đánh giá chỉ đọc');

  // A protected booking from another customer must never render its summary.
  const foreign = await evaluate(`import('/src/mocks/store.js').then(m=>{const db=m.createMockStore(localStorage,Date.now).read();const user=db.users.find(u=>u.email==='customer2@example.com');return db.bookings.find(b=>b.customer_id===user.id).id;})`);
  await visit(`/checkout/${foreign}`, `document.querySelector('[role=alert]')?.innerText.includes('phạm vi')`);
  assert.equal(await evaluate(`!!document.querySelector('.summary-list')`), false);
  pass('TASK 3: truy cập URL booking của người khác bị chặn');
  await logout();

  await visit('/register', `!!document.querySelector('[name=password_confirmation]')`);
  for (const [name, value] of Object.entries({ full_name: 'Khách UI TASK 3', email: 'ui-task3@example.com', phone: '0903456789', password: 'Register@12345', password_confirmation: 'Wrong@12345' })) await fill(`[name=${name}]`, value);
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await until(`document.querySelector('.customer-field-error')?.innerText.includes('chưa khớp')`);
  await evaluate(`document.querySelector('[aria-label="Hiện mật khẩu"]').click()`); assert.equal(await evaluate(`document.querySelector('[name=password]').type`), 'text');
  await fill('[name=password_confirmation]', 'Register@12345'); await evaluate(`document.querySelector('form').requestSubmit()`);
  await until(`location.pathname==='/venues' && !!document.querySelector('.header-user')`);
  const publicSession = await api(`return (await api.get('/auth/me')).data.user`); assert.equal(publicSession.role, 'CUSTOMER');
  assert.equal(await evaluate(`localStorage.getItem('sportbooking.mock.catalogue.v2').includes('Register@12345')`), false);
  pass('TASK 3: xác nhận mật khẩu, hiện/ẩn, đăng ký và không lưu mật khẩu plaintext');

  for (const [name, width, height] of [['tablet', 820, 1100], ['mobile', 390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
    await visit('/venues', `document.querySelectorAll('.venue-card').length===3`); await shot(`task3-catalog-${name}`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`), true);
    await visit(schedule, `document.querySelectorAll('.slot-card').length===16`); await shot(`task3-schedule-${name}`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`), true);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 950, deviceScaleFactor: 1, mobile: false });
  pass('TASK 3: desktop/tablet/mobile hiển thị không tràn ngang, có nhãn và vùng bấm');
  // Revoking the current mock session must return to login with an expiration message.
  await evaluate(`const token=localStorage.getItem('sportbooking.mock.token');const sessions=JSON.parse(localStorage.getItem('sportbooking.mock.sessions.v1'));sessions[token].expires=0;localStorage.setItem('sportbooking.mock.sessions.v1',JSON.stringify(sessions));`);
  await visit('/my-bookings', `location.pathname==='/login' && !!document.querySelector('[name=email]')`);
  await until(`document.querySelector('.notice--info')?.innerText.includes('hết hiệu lực')`);
  pass('TASK 3: phiên hết hạn điều hướng về đăng nhập và hiển thị thông báo riêng');
}
