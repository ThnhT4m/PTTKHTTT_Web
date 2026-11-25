import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runManagerChecks({ evaluate, until, visit, login, logout, pass, send }) {
  const artifacts = new URL('../test-artifacts/', import.meta.url);
  await mkdir(artifacts, { recursive: true });
  const screenshot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(new URL(`${name}.png`, artifacts), Buffer.from(data, 'base64'));
  };
  const click = (text, scope = 'document') => evaluate(`Array.from((${scope}).querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  const fill = (selector, value) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)}); const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(String(value))}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const submit = () => evaluate(`document.querySelector('[role=dialog] form').requestSubmit()`);
  const closed = () => until(`!document.querySelector('[role=dialog]') && !document.querySelector('.loading')`);
  const api = (expression) => evaluate(`import('/src/api/client.js').then(async api=>{${expression}})`);
  await login('manager1@example.com', '/manager/venues');
  await until(`document.querySelectorAll('.venue-switcher__item').length===1 && document.querySelectorAll('tbody tr').length===7`);
  await click('Thông tin cơ sở');
  await click('Sửa thông tin');
  await until(`!!document.querySelector('[role=dialog] [name=name]')`);
  await api(`const mine=(await api.get('/venues?mine=true')).data[0]; await api.patch('/venues/'+mine.id,{expected_version:mine.version,name:'Thủ Đức cập nhật khác'});`);
  await fill('[role=dialog] [name=name]', 'Không ghi đè phiên bản');
  await submit();
  await until(`document.querySelector('[role=dialog] [role=alert]')?.innerText.includes('tải lại')`);
  await screenshot('task2-version-conflict');
  await click('Tải lại dữ liệu mới', `document.querySelector('[role=dialog]')`);
  await closed();
  await until(`document.querySelector('.venue-info h2')?.innerText==='Thủ Đức cập nhật khác'`);
  const current = await api(`return (await api.get('/venues?mine=true')).data[0]`);
  assert.equal(current.version, 2); assert.equal(current.name, 'Thủ Đức cập nhật khác');
  pass('TASK 2: EDIT_CONFLICT hiển thị tải lại, không tự gửi lại hoặc ghi đè');
  await click('Đổi trạng thái cơ sở');
  await fill('[role=dialog] select[name=status]', 'INACTIVE');
  await fill('[role=dialog] textarea[name=reason]', 'Bảo trì kiểm tra hệ thống');
  await submit();
  await until(`document.querySelector('[role=dialog] [role=alert]')?.innerText.includes('booking')`);
  await click('Đóng', `document.querySelector('[role=dialog]')`);
  await closed();
  pass('TASK 2: giao diện chặn ngưng cơ sở còn booking hiệu lực');

  await click('Thêm cơ sở');
  for (const [name, value] of Object.entries({ name: 'Sân Nhà Review TASK 2', address: '12 Nguyễn Văn Linh', district: 'Quận 7', payment_hold_minutes: 3, minimum_online_booking_lead_minutes: 15 })) await fill(`[role=dialog] [name=${name}]`, value);
  await submit(); await closed();
  await until(`document.querySelector('.venue-info h2')?.innerText==='Sân Nhà Review TASK 2' && document.querySelectorAll('.venue-switcher__item').length===2`);
  const venueId = await api(`return (await api.get('/venues?mine=true')).data.find(v=>v.name==='Sân Nhà Review TASK 2').id`);
  await click('Sửa thông tin');
  await fill('[role=dialog] [name=payment_hold_minutes]', 10); await fill('[role=dialog] [name=minimum_online_booking_lead_minutes]', 25);
  await submit(); await closed();
  await until(`document.querySelector('.summary-list')?.innerText.includes('25 phút')`);
  await screenshot('task2-venue');
  pass('TASK 2: tạo/sửa cơ sở, cấu hình hold/lead và đồng bộ danh sách');

  await click('Danh sách sân'); await click('Thêm sân');
  for (const [name, value] of Object.entries({ name: 'Cầu lông Review', sport_type: 'BADMINTON', hourly_price: 125001 })) await fill(`[role=dialog] [name=${name}]`, value);
  await submit(); await closed();
  await until(`document.querySelectorAll('tbody tr').length===1 && document.querySelector('tbody').innerText.includes('Cầu lông Review')`);
  const courtId = await evaluate(`document.querySelector('tbody tr').dataset.courtId`);
  await click('Chỉnh sửa', `document.querySelector('tbody tr')`);
  await fill('[role=dialog] [name=name]', 'Cầu lông Review mới'); await fill('[role=dialog] [name=hourly_price]', 126001);
  await submit(); await closed();
  await until(`document.querySelector('tbody').innerText.includes('Cầu lông Review mới')`);
  // Filter by status on the fully loaded list, without unsupported API query parameters.
  await fill('.manager-filters .field:nth-child(3) select', 'MAINTENANCE');
  await until(`document.querySelectorAll('tbody tr').length===0`);
  await fill('.manager-filters .field:nth-child(3) select', '');
  await until(`document.querySelectorAll('tbody tr').length===1`);
  await screenshot('task2-courts');
  pass('TASK 2: tạo/sửa sân, giá nguyên VND và lọc trạng thái tại giao diện');

  await click('Sinh lịch sân');
  await until(`!!document.querySelector('[role=dialog] input[type=number]')`);
  assert.equal(await evaluate(`document.querySelector('[role=dialog] [role=alert]')`), null);
  assert.equal(await evaluate(`document.querySelector('[role=dialog] input[type=number]').value`), '30');
  await screenshot('task2-generate-form');
  await submit();
  await until(`!!document.querySelector('.manager-generation-result') && !document.querySelector('[role=dialog] fieldset').disabled`);
  assert.match(await evaluate(`document.querySelector('.manager-generation-result').innerText`), /480/);
  await screenshot('task2-generate-result');
  await submit();
  await until(`document.querySelector('.manager-generation-result')?.innerText.includes('480') && !document.querySelector('[role=dialog] fieldset').disabled`);
  const counts = await evaluate(`Array.from(document.querySelectorAll('.manager-generation-result dd')).map(e=>Number(e.innerText))`);
  assert.deepEqual(counts, [1, 0, 480]);
  await click('Đóng', `document.querySelector('[role=dialog]')`); await closed();
  pass('TASK 2: sinh 30 ngày tạo 480 ca; gọi lặp trả 0 tạo mới/480 bỏ qua');

  await click('Xem lịch', `document.querySelector('tbody tr')`);
  await until(`document.querySelectorAll('.manager-slot-grid .slot-card').length===16`);
  const tomorrow = await evaluate(`new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})`);
  await fill('section[aria-label="Lịch và giá sân"] input[type=date]', tomorrow);
  await until(`document.querySelectorAll('.manager-slot-grid .slot-card').length===16 && !document.querySelector('.loading')`);
  await evaluate(`document.querySelector('.manager-slot-grid .slot-card').click()`);
  await until(`!!document.querySelector('.manager-slot-detail')`);
  await screenshot('task2-schedule');
  await click('Chỉnh giá ca'); await fill('[role=dialog] [name=price]', 135001);
  await screenshot('task2-price');
  await submit(); await closed();
  await until(`document.querySelector('.manager-slot-grid .slot-card').innerText.includes('135.001')`);
  await click('Đổi trạng thái ca'); await fill('[role=dialog] [name=status]', 'UNAVAILABLE'); await fill('[role=dialog] [name=reason]', 'Bảo trì đèn sân');
  await screenshot('task2-slot-status');
  await submit(); await closed();
  await until(`document.querySelector('.manager-slot-grid .slot-card').classList.contains('slot-card--UNAVAILABLE')`);
  const slotAfter = await api(`return (await api.get('/courts/${courtId}/slots?date=${tomorrow}')).data[0]`);
  assert.equal(slotAfter.price, 135001); assert.equal(slotAfter.status, 'UNAVAILABLE'); assert.equal(slotAfter.version, 3);
  pass('TASK 2: chọn ca, chỉnh giá và đổi trạng thái cập nhật đồng thời grid/chi tiết');
  // Change default court price then repeat generation; existing customized slot must survive.
  await click('Danh sách sân'); await until(`!!document.querySelector('tbody tr')`);
  await click('Chỉnh sửa', `document.querySelector('tbody tr')`); await fill('[role=dialog] [name=hourly_price]', 222222);
  await submit(); await closed(); await click('Sinh lịch sân'); await submit();
  await until(`!!document.querySelector('.manager-generation-result') && !document.querySelector('[role=dialog] fieldset').disabled`);
  assert.equal((await api(`return (await api.get('/courts/${courtId}/slots?date=${tomorrow}')).data[0]`)).price, 135001);
  await click('Đóng', `document.querySelector('[role=dialog]')`); await closed();
  pass('TASK 2: thay giá mặc định/sinh lại lịch không ghi đè giá slot cũ');

  await click('Đổi trạng thái', `document.querySelector('tbody tr')`); await fill('[role=dialog] [name=status]', 'MAINTENANCE'); await fill('[role=dialog] [name=reason]', 'Bảo trì sân định kỳ');
  await screenshot('task2-court-status');
  await submit(); await closed(); await until(`!!document.querySelector('tbody .badge--MAINTENANCE')`);
  await click('Xóa mềm', `document.querySelector('tbody tr')`); await fill('[role=dialog] [name=reason]', 'Ngừng phục vụ tạm thời'); await submit(); await closed();
  await until(`!!document.querySelector('tbody .badge--INACTIVE')`);
  await click('Đổi trạng thái', `document.querySelector('tbody tr')`); await fill('[role=dialog] [name=status]', 'ACTIVE'); await fill('[role=dialog] [name=reason]', 'Hoạt động trở lại'); await submit(); await closed();
  await until(`!!document.querySelector('tbody .badge--ACTIVE')`);
  pass('TASK 2: trạng thái sân, xóa mềm giữ bản ghi và kích hoạt lại');

  await click('Thông tin cơ sở'); await click('Xóa mềm cơ sở'); await fill('[role=dialog] [name=reason]', 'Tạm ngừng vận hành cơ sở'); await submit(); await closed();
  await until(`!!document.querySelector('.venue-info .badge--INACTIVE')`);
  assert.equal(await evaluate(`document.querySelectorAll('.venue-switcher__item').length`), 2);
  await visit('/manager/venues', `document.querySelectorAll('.venue-switcher__item').length===2 && !document.querySelector('.loading')`);
  await evaluate(`Array.from(document.querySelectorAll('.venue-switcher__item')).find(b=>b.innerText.includes('Review TASK 2')).click()`);
  await until(`!!document.querySelector('.venue-info .badge--INACTIVE')`);
  await click('Thông tin cơ sở'); await click('Đổi trạng thái cơ sở'); await fill('[role=dialog] [name=status]', 'ACTIVE'); await fill('[role=dialog] [name=reason]', 'Mở lại cơ sở phục vụ'); await submit(); await closed();
  await until(`!!document.querySelector('.venue-info .badge--ACTIVE')`);
  assert.equal((await api(`return (await api.get('/venues/${venueId}/courts')).data`)).length, 1);
  pass('TASK 2: xóa mềm cơ sở, refresh giữ dữ liệu và kích hoạt lại');

  // Existing protected slots stay viewable while manual actions are disabled.
  await evaluate(`Array.from(document.querySelectorAll('.venue-switcher__item')).find(b=>b.innerText.includes('Thủ Đức')).click()`);
  await until(`document.querySelector('.venue-info h2')?.innerText.includes('Thủ Đức') && !document.querySelector('.loading')`);
  await click('Lịch và giá sân'); await until(`document.querySelectorAll('.manager-slot-grid .slot-card').length===16`);
  await fill('section[aria-label="Lịch và giá sân"] input[type=date]', tomorrow);
  await until(`!!document.querySelector('.manager-slot-grid .slot-card--HELD')`);
  for (const state of ['HELD', 'BOOKED']) {
    await evaluate(`document.querySelector('.manager-slot-grid .slot-card--${state}').click()`);
    await until(`!!document.querySelector('.manager-slot-detail')`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.manager-slot-detail button')).every(b=>b.disabled)`), true);
  }
  pass('TASK 2: HELD/BOOKED có nhãn, chọn xem được nhưng không sửa giá/trạng thái');
  await logout();
}
