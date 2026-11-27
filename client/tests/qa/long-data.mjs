import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../real/chrome.mjs';
import { addDays, todayVN } from '../../src/utils/format.js';
process.env.SPORTBOOKING_QA = 'task6.1';
const before = process.argv.includes('--before');
process.env.SPORTBOOKING_QA_SUITE = before ? 'long-before' : 'long-after';
const { createEnvironment } = await import('../real/environment.mjs');
const e = await createEnvironment(); let vite,c;
const results=[];
try {
  const api=e.users.manager1.client;
  const venue=(await api.post('/venues',{name:('Cơ sở '+ 'A'.repeat(150)).slice(0,150),address:('Địa chỉ '+ 'S'.repeat(300)).slice(0,300),district:'Thủ Đức',description:('Không gian thể thao '+ 'M'.repeat(2000)).slice(0,2000),payment_hold_minutes:5})).data;
  const court=(await api.post(`/venues/${venue.id}/courts`,{name:('Sân '+ 'B'.repeat(120)).slice(0,120),sport_type:'FOOTBALL',hourly_price:300000,description:('Mặt sân '+ 'N'.repeat(2000)).slice(0,2000)})).data;
  const date=addDays(todayVN(await e.clock()),1);
  await api.post(`/venues/${venue.id}/generate-slots`,{start_date:date,days:1});
  await e.confirmed((await api.get(`/courts/${court.id}/slots?date=${date}`)).data[0],e.users.customer.user);
  process.env.VITE_DATA_MODE='api';
  vite=await createServer({root:fileURLToPath(new URL('../../',import.meta.url)),server:{host:'127.0.0.1',port:5175,strictPort:true,proxy:{'/api':{target:e.origin,changeOrigin:true}}}});await vite.listen();c=await launchChrome(e.artifacts);
  async function visit(path,condition=`!!document.querySelector('main') && !document.querySelector('.loading')`){await c.navigate('http://127.0.0.1:5175'+path);await c.until(condition);}
  async function login(who,path){await visit('/login',`!!document.querySelector('[name=email]')`);await c.fill('[name=email]',who+'@example.com');await c.fill('[name=password]','Demo@12345');await c.evaluate(`document.querySelector('form').requestSubmit()`);await c.until(`location.pathname===${JSON.stringify(path)} && !!document.querySelector('.header-user') && !document.querySelector('.loading')`);}
  async function logout(){await c.evaluate(`document.querySelector('[title="Đăng xuất"]').click()`);await c.until(`location.pathname==='/login'`);}
  async function capture(name,path,ready,setup){await e.freshHttpApp();for(const[width,height]of [[1920,1080],[1366,768],[820,1100],[390,844],[360,800]]){const record={id:`LONG-${name}-${width}`,role:name,viewport:`${width}x${height}`,route:path,status:'FAIL'};try{await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await visit(path,ready);await c.until(`!!document.querySelector('.header-user')`);if(setup)await setup();await c.evaluate('document.fonts.ready');await c.shot(`long-${name}-${width}`);const size=await c.evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.body.innerText.length,tables:Array.from(document.querySelectorAll('.table-wrap')).map(el=>({width:el.clientWidth,scroll:el.scrollWidth}))})`);record.geometry=size;assert.ok(size.scroll<=width+1,`Page overflow: ${size.scroll}/${width}`);if(name==='venue'){assert.equal(await c.evaluate(`document.querySelectorAll('.court-row').length`),1);const bounds=await c.evaluate(`(()=>{const r=document.querySelector('.court-row__action .button').getBoundingClientRect();return {left:r.left,right:r.right}})()`);assert.ok(bounds.left>=0&&bounds.right<=width);assert.ok(await c.evaluate(`document.body.innerText.includes('300.000')`));}if(name==='modal')assert.ok(await c.evaluate(`Array.from(document.querySelectorAll('.summary-list__row dt')).every(el=>el.getBoundingClientRect().width>=60)`),'Summary labels must keep a readable column');record.status='PASS';}catch(error){record.error=error.message;}results.push(record);console.log(record.status+' '+record.id+(record.error?' '+record.error:''));await writeFile(new URL('long-checks.json',e.artifacts),JSON.stringify({database:e.uiDatabase.name,source:'isolated QA only; valid boundary strings; PAID fixture',results},null,2));}}
  await login('customer','/venues');
  await capture('venue',`/venues/${venue.id}`,`!!document.querySelector('.court-row')`);
  await capture('history','/my-bookings',`!!document.querySelector('.booking-card')`);
  await capture('modal','/my-bookings',`!!document.querySelector('.booking-card')`,async()=>{await c.click('Chi tiết & lịch sử');await c.until(`!!document.querySelector('[role=dialog] .summary-list')`);});
  await logout();await login('manager1','/manager/venues');
  await capture('manager','/manager/venues',`!!document.querySelector('.venue-switcher') && !document.querySelector('.loading')`,async()=>{await c.evaluate(`Array.from(document.querySelectorAll('.venue-switcher button')).find(b=>b.textContent.includes(${JSON.stringify(venue.name)})).click()`);await c.until(`!!document.querySelector('tbody tr') && !document.querySelector('.loading')`);});
  await logout();await login('admin','/admin');
  await capture('audit','/admin',`!!document.querySelector('.metric-card') && !document.querySelector('.loading')`,async()=>{await c.click('Nhật ký thay đổi');await c.until(`!!document.querySelector('.audit-details')`);await c.evaluate(`document.querySelectorAll('.audit-details').forEach(el=>el.open=true)`);});
  assert.deepEqual(c.errors,[]);assert.equal(c.requests.some(r=>r.path.startsWith('/api/payments/')),false);
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
  console.log(JSON.stringify({pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length,database:e.uiDatabase.name}));
} finally {await c?.close();await vite?.close();await e.close();}
