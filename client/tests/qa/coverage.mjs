import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function runCoverage({ e, c, check, visit, login, logout, closeModal, venue, court, pending, tomorrow, later, intercept, unintercept }) {
  const { send, evaluate, until, click, fill, shot } = c;
  const info = (route, role, level = 'REAL_BROWSER') => ({ route, role, level, viewport: '1366x768' });
  const settle = async () => { await new Promise(r=>setTimeout(r,150)); await until(`!document.querySelector('.loading')`); };
  const selectVenue = async () => { await evaluate(`Array.from(document.querySelectorAll('.venue-switcher button')).find(b=>b.querySelector('span').firstChild.textContent===${JSON.stringify(venue.name)}).click()`); await until(`document.querySelector('.venue-info h2')?.textContent===${JSON.stringify(venue.name)} && !document.querySelector('.loading')`); };
  const visuals = [], controls = [];
  async function labelFill(label, value) {
    await evaluate(`(()=>{const el=Array.from(document.querySelectorAll('input,select')).find(e=>Array.from(e.labels||[]).some(l=>l.querySelector('.field__label')?.textContent.trim()===${JSON.stringify(label)}));if(!el)throw Error('Missing labelled field: '+${JSON.stringify(label)});document.querySelector('[data-qa-field]')?.removeAttribute('data-qa-field');el.setAttribute('data-qa-field','true')})()`);
    await fill('[data-qa-field]',value); await settle();
  }
  async function exerciseSelect(label) {
    const options = await evaluate(`Array.from(Array.from(document.querySelectorAll('select')).find(e=>Array.from(e.labels||[]).some(l=>l.querySelector('.field__label')?.textContent.trim()===${JSON.stringify(label)})).options).map(o=>o.value)`);
    for(const value of options) await labelFill(label,value);
    await labelFill(label,options[0]); return options.length;
  }
  await check('QA-M2-FOCUS', 'Venue modal keyboard trap, Escape, focus restoration and labels', info('/manager/venues', 'VENUE_MANAGER'), async () => {
    await visit('/manager/venues');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Thêm cơ sở').focus()`); await click('Thêm cơ sở');
    await until(`document.querySelector('[role=dialog]')?.contains(document.activeElement)`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role=dialog] input,[role=dialog] textarea,[role=dialog] select')).every(el=>el.labels?.length>0)`), true);
    await evaluate(`Array.from(document.querySelectorAll('[role=dialog] button')).at(-1).focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
    assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`), 'Đóng');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate(`document.activeElement.textContent.trim()`), 'Lưu thông tin');
    await shot('focus-trap'); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until(`!document.querySelector('[role=dialog]')`); assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Thêm cơ sở');
    return { labels: true, tabWrap: true, shiftTabWrap: true, escape: true, focusRestored: true };
  });
  await check('QA-M2-READ', 'Manager tabs, scoped court filters and daily schedule selection', info('/manager/venues', 'VENUE_MANAGER'), async () => {
    await selectVenue(); await click('Thông tin cơ sở'); assert.ok(await evaluate(`document.body.innerText.includes('Đặt online trước giờ bắt đầu')`));
    await click('Danh sách sân'); await until(`document.querySelectorAll('tbody tr').length===1`);
    await fill('.manager-filters input','KHÔNG CÓ'); await until(`document.querySelectorAll('tbody tr').length===0`); await fill('.manager-filters input','');
    await exerciseSelect('Bộ môn'); await exerciseSelect('Trạng thái');
    const filters = await evaluate(`Array.from(document.querySelectorAll('.manager-filters input,.manager-filters select')).map(el=>({tag:el.tagName,type:el.type}))`);
    await click('Lịch và giá sân'); await until(`document.querySelectorAll('.slot-card').length===16`);
    await fill('input[type=date]', tomorrow); await settle(); await until(`document.querySelectorAll('.slot-card').length===16`);
    await evaluate(`document.querySelector('.slot-card').click()`); assert.equal(await evaluate(`document.querySelector('.slot-card').getAttribute('aria-pressed')`), 'true');
    await click('Tải lại lịch'); await settle(); return { tabs: 3, filters, slots: 16, selected: true };
  });
  // Dedicated new data, including null optional fields and valid VND boundary prices.
  const m = await e.account('manager1');
  const longName = 'Sân Nhà ' + 'Thể thao Việt Nam '.repeat(7);
  const longVenue = (await m.client.post('/venues', { name: longName.slice(0, 149), address: 'Đường Nguyễn Thị Minh Khai '.repeat(8).slice(0, 280), district: 'Quận 7', payment_hold_minutes: 5 })).data;
  for (const [name, price, sport] of [['Sân miễn phí', 0, 'TENNIS'], ['Sân giá lớn ' + 'Bóng rổ '.repeat(12), 100000000, 'BASKETBALL']]) await m.client.post(`/venues/${longVenue.id}/courts`, { name: name.slice(0, 119), hourly_price: price, sport_type: sport });
  for (let n = 0; n < 13; n++) await m.client.post('/venues', { name: `QA6 Page ${n}`, address: `12 Đường Kiểm Thử ${n}`, district: 'Quận 7', payment_hold_minutes: 5 });
  // Stable, legitimate test-only booking rows for pagination; no payment endpoints.
  const rows = (await m.client.get(`/courts/${court.id}/slots?date=${later}`)).data.filter(s => s.status === 'AVAILABLE');
  for (const s of rows.slice(0, 13)) { const b=await e.confirmed(s, e.users.customer.user, 'Khách QA6 phân trang'); await m.client.post(`/bookings/${b.id}/venue-issue`,{action:'REFUND',reason:'Fixture sự cố QA6 để kiểm tra phân trang refund'}); }
  const password = await e.database('users').select('password_hash').first();
  await e.database('users').insert(Array.from({length:13},(_,n)=>({full_name:`Khách QA6 ${n}`,email:`qa6-page-${n}@example.com`,password_hash:password.password_hash,role:'CUSTOMER'})));
  await logout();
  await check('QA-AUTH-RETURN', 'Guest root/header, protected route, show password and original court/date return', info('/login', 'GUEST'), async () => {
    await visit('/', `location.pathname==='/venues' && !!document.querySelector('.hero')`);
    await visit(`/courts/${court.id}/schedule?date=${tomorrow}`, `document.querySelectorAll('.slot-card').length===16`);
    await evaluate(`document.querySelector('.slot-card:not(:disabled)').click()`); await click('Đăng nhập để giữ chỗ'); await until(`location.pathname==='/login'`);
    await fill('[name=email]', 'customer@example.com'); await fill('[name=password]', 'Demo@12345');
    await evaluate(`document.querySelector('.customer-password button').click()`); assert.equal(await evaluate(`document.querySelector('[name=password]').type`), 'text');
    await evaluate(`document.querySelector('.customer-password button').click()`); assert.equal(await evaluate(`document.querySelector('[name=password]').type`), 'password');
    await evaluate(`document.querySelector('form').requestSubmit()`); await until(`location.pathname==='/courts/${court.id}/schedule' && location.search.includes('${tomorrow}') && !document.querySelector('.loading')`);
    await visit('/manager/counter', `location.pathname==='/venues'`); return { originalDate: tomorrow, noManagerAccess: true };
  });
  await check('QA-CATALOG-FILTERS', 'Rapid search, combined filters, empty/reset, pagination and preserved back link', info('/venues', 'CUSTOMER'), async () => {
    await visit('/venues', `document.querySelectorAll('.venue-card').length===12`); await click('Trang sau'); await until(`location.search.includes('offset=12') && !document.querySelector('.loading')`); await click('Trang trước'); await settle();
    for (const value of ['QA', 'QA6', 'QA6 Sân Nhà']) await fill('[aria-label="Tìm cơ sở"]', value);
    await until(`document.querySelectorAll('.venue-card').length===1 && location.search.includes('q=') && !document.querySelector('.loading')`);
    await fill('[aria-label="Quận huyện"]', 'Quận 7'); await settle(); await fill('[aria-label="Bộ môn"]', 'FOOTBALL'); await settle(); await fill('[aria-label="Giá tối thiểu"]', '0'); await settle(); await fill('[aria-label="Giá tối đa"]', '180000'); await settle();
    await until(`new URLSearchParams(location.search).get('district')==='Quận 7' && new URLSearchParams(location.search).get('sport_type')==='FOOTBALL' && new URLSearchParams(location.search).get('min_price')==='0' && new URLSearchParams(location.search).get('max_price')==='180000'`);
    await until(`document.querySelectorAll('.venue-card').length===1`);
    await evaluate(`document.querySelector('.venue-card a').click()`); await until(`location.pathname==='/venues/${venue.id}' && !document.querySelector('.loading')`);
    await evaluate(`document.querySelector('.text-link').click()`); await until(`location.pathname==='/venues' && location.search.includes('sport_type=FOOTBALL')`);
    await fill('[aria-label="Tìm cơ sở"]', 'KHÔNG TỒN TẠI QA6'); await until(`!!document.querySelector('.empty-state') && !document.querySelector('.loading')`); await shot('catalog-empty');
    await click('Xóa bộ lọc'); await until(`location.search==='' && document.querySelectorAll('.venue-card').length===12`);
    await fill('[aria-label="Giá tối thiểu"]', '200'); await fill('[aria-label="Giá tối đa"]', '100'); await until(`!!document.querySelector('[role=alert]')`); await click('Xóa bộ lọc'); return { rapid: 3, combined: 5, pagination: true, empty: true, reset: true, backPreservesFilters: true, invalidRange: true };
  });
  await check('QA-CATALOG-BOUNDARIES', 'Vietnamese long names, optional null, VND zero/max, missing court/venue', info('/venues/:id', 'CUSTOMER'), async () => {
    await visit(`/venues/${longVenue.id}`, `document.querySelectorAll('.court-row').length===2`);
    assert.ok(await evaluate(`document.body.innerText.includes('100.000.000') && document.body.innerText.includes('0 ₫')`)); await shot('long-zero-max');
    for (const path of ['/venues/00000000-0000-4000-8000-000000000000', '/courts/00000000-0000-4000-8000-000000000000/schedule']) { await visit(path, `!!document.querySelector('[role=alert]')`); assert.equal(await evaluate(`!!document.querySelector('.slot-card')`), false); }
    return { longName: longVenue.name.length, nullDescription: true, min: 0, max: 100000000, missing: 404 };
  });
  await check('QA-HISTORY-TABS', 'Every customer status tab, history paging, detail refresh and focus restore', info('/my-bookings', 'CUSTOMER'), async () => {
    await visit('/my-bookings', `document.querySelectorAll('.booking-card').length===12`); await click('Trang sau'); await until(`location.search.includes('offset=12') && !document.querySelector('.loading')`); await click('Trang trước'); await settle();
    const tabs = await evaluate(`Array.from(document.querySelectorAll('.tabs button')).map(b=>b.textContent)`);
    for (const tab of tabs) { await click(tab); await until(`Array.from(document.querySelectorAll('.tabs button')).find(b=>b.textContent===${JSON.stringify(tab)}).getAttribute('aria-pressed')==='true'`); await settle(); }
    await click('Tất cả'); await settle(); await evaluate(`document.querySelector('.booking-card button').focus();document.querySelector('.booking-card button').click()`); await until(`!!document.querySelector('[role=dialog] .summary-list')`); await shot('booking-detail'); await closeModal();
    await click('Làm mới lịch sử'); await settle(); return { tabs: tabs.length, pagination: true, detail: true, refresh: true };
  });
  await check('FE-QA-005-006', 'Checkout explains payment scope and timer makes no repeated live announcements', info('/checkout/:id', 'CUSTOMER'), async () => {
    await visit(`/checkout/${pending.id}`, `!!document.querySelector('.countdown')`);
    assert.equal(await evaluate(`document.querySelector('.countdown').getAttribute('aria-live')`), 'off');
    assert.equal(await evaluate(`document.querySelector('.countdown').getAttribute('role')`), 'timer');
    const foreground=await evaluate(`getComputedStyle(document.querySelector('.summary-list__row dt')).color`);
    const rgb=foreground.match(/\d+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    const contrast=1.05/(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]+.05);assert.ok(contrast>=4.5);
    assert.equal(await evaluate(`document.querySelector('.icon-button').getBoundingClientRect().height>=44`),true);
    assert.equal(await evaluate(`document.body.innerText.includes('TASK 6')`), false);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.payment-methods input')).every(e=>e.disabled)`), true);
    await shot('checkout-accessible-timer'); return { onlinePayment: 'OUT_OF_SCOPE_TV3', live: 'off', summaryContrast:contrast, iconHeight:44 };
  });
  for (const status of [400, 403, 404, 409, 429, 500, 503]) await check('QA-HTTP-' + status, 'Read error is visible and manual retry recovers HTTP ' + status, info('/venues/:id', 'CUSTOMER', 'HTTP_FIXTURE'), async () => {
    await intercept('/api/venues/' + venue.id, async p => new URL(p.request.url).pathname.endsWith(venue.id) ? send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ success: false, error: { code: 'QA_' + status, message: 'QA lỗi ' + status }, server_time: new Date().toISOString() })).toString('base64') }) : send('Fetch.continueRequest', {requestId:p.requestId}));
    try { await visit(`/venues/${venue.id}`, `document.querySelector('[role=alert]')?.innerText.includes('QA lỗi ${status}')`); await shot('http-' + status); } finally { await unintercept(); }
    await click('Thử lại'); await until(`document.querySelectorAll('.court-row').length===1 && !document.querySelector('[role=alert]')`); return { injected: status, recovered: true };
  });
  await check('QA-OFFLINE', 'Failed read can retry; pending read shows loading and is discarded after navigation', info('/venues/:id', 'CUSTOMER', 'CDP_NETWORK_FAULT'), async () => {
    await intercept('/api/venues/' + venue.id, async p => send(new URL(p.request.url).pathname.endsWith(venue.id)?'Fetch.failRequest':'Fetch.continueRequest', { requestId: p.requestId, ...(new URL(p.request.url).pathname.endsWith(venue.id)?{errorReason:'InternetDisconnected'}:{}) }));
    try { await visit(`/venues/${venue.id}`, `!!document.querySelector('[role=alert]')`); await shot('offline-read'); } finally { await unintercept(); }
    await click('Thử lại'); await until(`!!document.querySelector('.court-row')`);
    let release; await intercept('/api/venues/' + venue.id, async p => { if(new URL(p.request.url).pathname.endsWith(venue.id))release = () => send('Fetch.continueRequest', { requestId: p.requestId });else await send('Fetch.continueRequest',{requestId:p.requestId}); });
    try { await c.navigate('http://127.0.0.1:5175/venues/' + venue.id); await until(`!!document.querySelector('.loading')`); const end = Date.now() + 5000; while (!release && Date.now() < end) await new Promise(r=>setTimeout(r,50)); assert.ok(release); await shot('no-response-loading'); await evaluate(`document.querySelector('.site-nav a').click()`); await until(`location.pathname==='/venues'`); await release().catch(()=>{}); await settle(); assert.equal(await evaluate('location.pathname'), '/venues'); } finally { await unintercept(); }
    return { offlineRetry: true, loadingWithoutReply: true, ignoredOnNavigation: true };
  });
  // Full screenshot matrix: every route/screen plus admin sub-screens and manager tabs/modal.
  await check('FE-QA-009','Public header exposes session verification failures and recovers without losing token',info('/venues','CUSTOMER','HTTP_FIXTURE_AUTH_ME_503'),async()=>{
    await e.freshHttpApp();await intercept('/api/auth/me',async p=>send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({success:false,error:{code:'QA_AUTH_UNAVAILABLE',message:'QA xác minh phiên tạm gián đoạn'},server_time:new Date().toISOString()})).toString('base64')}));
    try{await visit('/venues',`document.querySelector('.header-session [role=alert]')?.innerText.includes('QA xác minh phiên')`);await shot('session-unavailable');assert.equal(await evaluate(`!!localStorage.getItem('sportbooking.token')`),true);}finally{await unintercept();}
    await click('Thử lại phiên đăng nhập');await until(`!!document.querySelector('.header-user')`);return {tokenPreserved:true,visibleError:true,retryRecovers:true};
  });
  // Each image is separately named and its DOM geometry/control inventory is retained for review.
  const viewports = [[1920,1080],[1366,768],[820,1100],[390,844],[360,800]];
  const capture = async (name, path, role, setup, condition) => {
    // Keep screenshot navigation separate from the dedicated real rate-limit case.
    // New unmodified Express limiter, same DB/JWT/port; no limit is disabled.
    await e.freshHttpApp();
    for (const [width,height] of viewports) await check(`VIS-${name}-${width}`, `Visual ${name} ${width}×${height}`, { ...info(path,role), viewport: `${width}x${height}`, level: 'REAL_BROWSER_SCREENSHOT' }, async()=> {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}); await visit(path,condition); if(role!=='GUEST')await until(`!!document.querySelector('.header-user')`); if(setup) await setup(); await settle(); await evaluate(`document.fonts.ready`);
      const filename=`visual-${name}-${width}`; await shot(filename);
      const geometry=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,headings:Array.from(document.querySelectorAll('h1,h2')).map(e=>e.textContent),controls:Array.from(document.querySelectorAll('button,a,input,select,textarea,summary')).filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,name:e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent.trim().slice(0,100)||e.labels?.[0]?.innerText,disabled:e.disabled||false,type:e.type}))})`);
      visuals.push({name,path,role,width,height,file:filename+'.png',...geometry}); controls.push(...geometry.controls.map(control=>({screen:name,width,...control})));
      const ax=await send('Accessibility.getFullAXTree');const buttons=ax.nodes.filter(n=>!n.ignored&&n.role?.value==='button');assert.ok(buttons.every(n=>n.name?.value?.trim()),'Every visible button needs an accessible name');
      assert.ok(geometry.scroll<=width+1,`Page horizontal overflow ${geometry.scroll}/${width}`); return { screenshot: filename+'.png', controls:geometry.controls.length, scroll:geometry.scroll };
    });
  };
  await capture('catalog','/venues','CUSTOMER',null,`document.querySelectorAll('.venue-card').length===12`);
  await capture('venue',`/venues/${longVenue.id}`,'CUSTOMER',null,`document.querySelectorAll('.court-row').length===2`);
  await capture('schedule',`/courts/${court.id}/schedule?date=${tomorrow}`,'CUSTOMER',null,`document.querySelectorAll('.slot-card').length===16`);
  await capture('checkout',`/checkout/${pending.id}`,'CUSTOMER',null,`!!document.querySelector('.countdown')`);
  await capture('history','/my-bookings','CUSTOMER',null,`document.querySelectorAll('.booking-card').length===12`);
  await capture('not-found','/qa-route-does-not-exist','CUSTOMER');
  await logout(); await e.freshHttpApp();
  await capture('login','/login','GUEST',null,`!!document.querySelector('[name=email]')`);
  await capture('register','/register','GUEST',null,`!!document.querySelector('[name=full_name]')`);
  await login('manager1','/manager/venues');
  await check('QA-WORKFLOW-FILTERS','Every POS/aftersales dropdown, booking/refund pagination and date filter',info('/manager/counter + /manager/requests','VENUE_MANAGER'),async()=>{
    const exercised=[];
    await visit('/manager/counter');await labelFill('Cơ sở',venue.id);await until(`document.querySelectorAll('.slot-card').length===16`);
    await labelFill('Ngày',tomorrow);await labelFill('Sân',court.id);
    for(const label of ['Lọc sân','Trạng thái đơn','Nguồn đơn'])exercised.push({label,options:await exerciseSelect(label)});
    await labelFill('Ngày đặt sân',later);await until(`!!document.querySelector('.customer-pagination')`);await click('Trang sau');await settle();assert.ok(await evaluate(`document.querySelector('.customer-pagination').innerText.includes('Trang 2')`));await click('Trang trước');await settle();
    await visit('/manager/requests');await labelFill('Cơ sở',venue.id);
    for(const label of ['Lọc sân','Trạng thái đơn','Nguồn đơn','Sự cố','Trạng thái hoàn tiền'])exercised.push({label,options:await exerciseSelect(label)});
    await labelFill('Ngày đặt sân',later);await settle();
    const navs=await evaluate(`document.querySelectorAll('.customer-pagination').length`);assert.equal(navs,2);
    for(const index of [0,1]){await evaluate(`document.querySelectorAll('.customer-pagination')[${index}].querySelectorAll('button')[1].click()`);await settle();assert.equal(await evaluate(`document.querySelectorAll('.customer-pagination')[${index}].innerText.includes('Trang 2')`),true);await evaluate(`document.querySelectorAll('.customer-pagination')[${index}].querySelector('button').click()`);await settle();}
    await shot('workflow-filter-pages');return {exercised,bookingPages:2,refundPages:2};
  });
  await check('QA-M3-GUARD','Generate and price forms block repeated submits and uncertain writes',info('/manager/venues','VENUE_MANAGER','REAL_WRITE_DELAYED_OR_LOST_RESPONSE'),async()=>{
    await visit('/manager/venues');await selectVenue();await click('Sinh lịch sân');await until(`!!document.querySelector('[role=dialog] form')`);
    await evaluate(`document.querySelector('[role=dialog] input[type=checkbox]').click()`);await evaluate(`document.querySelector('.manager-court-options input').click()`);
    let paused=[];const pattern='/api/venues/'+venue.id+'/generate-slots';await intercept(pattern,async p=>{paused.push(p.requestId)},'Response');const before=c.requests.filter(r=>r.path===pattern&&r.method==='POST').length;
    try{await evaluate(`const f=document.querySelector('[role=dialog] form');f.requestSubmit();f.requestSubmit()`);await until(`!!document.querySelector('[role=dialog] fieldset:disabled')`);await new Promise(r=>setTimeout(r,400));assert.equal(c.requests.filter(r=>r.path===pattern&&r.method==='POST').length-before,1);for(const id of paused)await send('Fetch.continueResponse',{requestId:id});paused=[];await until(`!!document.querySelector('.manager-generation-result')`);assert.ok(await evaluate(`document.querySelector('.manager-generation-result').innerText.includes('480')`));}finally{for(const id of paused)await send('Fetch.continueResponse',{requestId:id}).catch(()=>{});await unintercept();}await closeModal();
    await click('Lịch và giá sân');await until(`document.querySelectorAll('.slot-card').length===16`);await fill('input[type=date]',tomorrow);await settle();await evaluate(`document.querySelectorAll('.slot-card')[15].click()`);await click('Chỉnh giá ca');await fill('[name=price]',0);
    await intercept('/api/slots/',async p=>send('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'}),'Response');try{await evaluate(`document.querySelector('[role=dialog] form').requestSubmit()`);await until(`document.querySelector('[role=dialog]').innerText.includes('Chưa xác định')`);assert.equal(await evaluate(`document.querySelector('[role=dialog] button.button--primary').disabled`),true);await shot('price-lost-response');}finally{await unintercept();await closeModal();}
    return {generateRequests:1,repeatSkipped:480,individualCourt:true,priceUnknownBlocked:true};
  });
  await capture('manager-courts','/manager/venues','VENUE_MANAGER',async()=>{await selectVenue();await click('Danh sách sân');});
  await capture('manager-info','/manager/venues','VENUE_MANAGER',async()=>{await selectVenue();await click('Thông tin cơ sở');});
  await capture('manager-schedule','/manager/venues','VENUE_MANAGER',async()=>{await selectVenue();await click('Lịch và giá sân');await until(`document.querySelectorAll('.slot-card').length===16`);});
  await capture('manager-modal','/manager/venues','VENUE_MANAGER',async()=>{await click('Thêm cơ sở');await until(`!!document.querySelector('[role=dialog]')`);});
  await capture('counter','/manager/counter','VENUE_MANAGER',async()=>{await labelFill('Cơ sở',venue.id);await labelFill('Ngày',tomorrow);await until(`document.querySelectorAll('.slot-card').length===16 && !!document.querySelector('tbody tr')`);},`!!document.querySelector('.workflow-filters') && !document.querySelector('.loading')`);
  await capture('requests','/manager/requests','VENUE_MANAGER',async()=>{await labelFill('Cơ sở',venue.id);await until(`document.querySelectorAll('.booking-card').length===12 && document.querySelectorAll('tbody tr').length===12`);},`document.querySelectorAll('.workflow-filters').length>0 && !document.querySelector('.loading')`);
  await logout(); await login('manager2','/manager/venues');
  await check('QA-MANAGER2', 'Second manager cannot see or write manager1 data', info('/manager/venues','VENUE_MANAGER2'),async()=>{await until(`!!document.querySelector('.venue-switcher')`);assert.equal(await evaluate(`document.querySelector('.venue-switcher').innerText.includes('QA6')`),false);await assert.rejects(e.users.manager2.client.patch(`/venues/${venue.id}`,{name:'Forbidden',expected_version:venue.version}),err=>err.status===403);return {scopeIsolated:true,foreignWrite:403};});
  await logout(); await login('admin','/admin');
  await check('QA-ADMIN-FILTERS','All user filters/pages/self-lock/owner guards and audit filters/pages',info('/admin','ADMIN'),async()=>{
    await until(`!!document.querySelector('tbody tr')`);const roles=await exerciseSelect('Vai trò'),active=await exerciseSelect('Trạng thái tài khoản');
    await click('Trang sau');await settle();assert.ok(await evaluate(`document.querySelector('.customer-pagination').innerText.includes('Trang 2')`));await click('Trang trước');await settle();
    await labelFill('Tìm tài khoản','admin@example.com');await until(`document.querySelectorAll('tbody tr').length===1`);assert.equal(await evaluate(`document.querySelector('tbody button').disabled`),true);
    await labelFill('Tìm tài khoản','manager1@example.com');await until(`document.querySelectorAll('tbody tr').length===1 && document.querySelector('tbody tr').innerText.includes('manager1@example.com')`);assert.equal(await evaluate(`Array.from(document.querySelectorAll('tbody button')).find(b=>b.textContent.includes('Hạ quyền')).disabled`),true);
    await click('Nhật ký thay đổi');await until(`!!document.querySelector('[name=actor_id]')`);await fill('[name=actor_id]','bad');await click('Lọc nhật ký');await until(`document.querySelector('[role=alert]')?.innerText.includes('UUID')`);
    await fill('[name=actor_id]',e.users.manager1.user.id);await fill('[name=entity_id]',venue.id);await fill('[name=action]','VENUE_CREATED');await click('Lọc nhật ký');await settle();await until(`!!document.querySelector('.audit-details')`);await evaluate(`document.querySelector('summary').click()`);assert.doesNotMatch(await evaluate('document.querySelector("pre").textContent'),/password_hash|token_version/);
    for(const name of ['actor_id','entity_id','action'])await fill(`[name=${name}]`,'');await click('Lọc nhật ký');await settle();await click('Trang sau');await settle();assert.ok(await evaluate(`document.querySelector('.customer-pagination').innerText.includes('Trang 2')`));await click('Trang trước');await settle();
    await click('Tải lại thống kê');await settle();return {roles,active,userPagination:true,selfLockDisabled:true,ownedManagerDemotionDisabled:true,auditFilters:3,auditPagination:true};
  });
  await capture('admin-users','/admin','ADMIN',null,`document.querySelectorAll('.metric-card').length===4 && !!document.querySelector('tbody tr')`);
  await capture('admin-operations','/admin','ADMIN',async()=>{await click('Trạng thái sân & cơ sở');await settle();await labelFill('Chọn cơ sở',venue.id);await until(`document.querySelectorAll('.slot-card').length===16`);});
  await capture('admin-audit','/admin','ADMIN',async()=>{await click('Nhật ký thay đổi');await until(`!!document.querySelector('.audit-details')`);await evaluate(`document.querySelector('.audit-details').open=true`);});
  await check('QA-ZOOM', '200 percent reflow simulation keeps modal controls reachable',info('/admin','ADMIN','REFLOW_SIMULATION'),async()=>{await send('Emulation.setDeviceMetricsOverride',{width:683,height:384,deviceScaleFactor:2,mobile:false});await visit('/admin');await click('Nhật ký thay đổi');await settle();assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));await shot('zoom-200-reflow');return {physicalViewport:'1366x768',cssViewport:'683x384',scale:2,nativeBrowserZoom:false};});
  await check('QA-RUNTIME-PAYMENT', 'No runtime exceptions, React warnings or payment API calls',info('*','ALL'),async()=>{assert.deepEqual(c.errors,[]);assert.deepEqual(c.warnings,[]);assert.deepEqual(c.interceptionErrors.filter(message=>message!=='Invalid InterceptionId.'),[]);assert.equal(c.requests.filter(r=>r.path.startsWith('/api/payments/')).length,0);return {exceptions:0,reactWarnings:0,paymentRequests:0,cancelledCDPInterceptions:c.interceptionErrors.length};});
  await writeFile(new URL('visual-index.json',e.artifacts),JSON.stringify(visuals,null,2));
  await writeFile(new URL('control-observations.json',e.artifacts),JSON.stringify(controls,null,2));
  return {visualScreens:17,visualShots:visuals.length,controlObservations:controls.length,longVenue:longVenue.id};
}
