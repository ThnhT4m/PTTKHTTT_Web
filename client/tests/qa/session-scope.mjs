import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../real/chrome.mjs';
process.env.SPORTBOOKING_QA='task6.1';process.env.SPORTBOOKING_QA_SUITE=process.argv.includes('--before')?'scope-before':'scope-after';
const {createEnvironment}=await import('../real/environment.mjs');const e=await createEnvironment();let vite,c;
try{
  const venue=(await e.users.manager1.client.post('/venues',{name:'Cơ sở ngừng phục vụ của quản lý',address:'Địa chỉ trong môi trường QA riêng',district:'Thủ Đức',description:'Thông tin chỉ chủ cơ sở và quản trị viên được đọc khi ngừng phục vụ.'})).data;
  await e.users.manager1.client.patch(`/venues/${venue.id}/status`,{status:'INACTIVE',reason:'Đối chiếu phạm vi phiên trong môi trường QA',expected_version:venue.version});
  process.env.VITE_DATA_MODE='api';vite=await createServer({root:fileURLToPath(new URL('../../',import.meta.url)),server:{host:'127.0.0.1',port:5175,strictPort:true,proxy:{'/api':{target:e.origin,changeOrigin:true}}}});await vite.listen();c=await launchChrome(e.artifacts);
  await c.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await c.navigate('http://127.0.0.1:5175/login');await c.until(`!!document.querySelector('[name=email]')`);await c.fill('[name=email]','manager1@example.com');await c.fill('[name=password]','Demo@12345');await c.evaluate(`document.querySelector('form').requestSubmit()`);await c.until(`location.pathname==='/manager/venues' && !!document.querySelector('.header-user')`);
  await c.navigate(`http://127.0.0.1:5175/venues/${venue.id}`);await c.until(`document.querySelector('h1')?.textContent===${JSON.stringify(venue.name)} && !!document.querySelector('.header-user') && !document.querySelector('.loading')`);
  const token=e.users.customer.session.getToken();await c.evaluate(`localStorage.setItem('sportbooking.token',${JSON.stringify(token)});window.dispatchEvent(new StorageEvent('storage',{key:'sportbooking.token'}))`);
  await c.until(`document.querySelector('.header-user')?.innerText.includes('Khách hàng Demo')`);await new Promise(r=>setTimeout(r,500));await c.shot('session-scope');
  const leaked=await c.evaluate(`document.body.innerText.includes(${JSON.stringify(venue.name)})`),hasError=await c.evaluate(`!!document.querySelector('main [role=alert]')`);
  const result={id:'SCOPE-01',status:!leaked&&hasError?'PASS':'FAIL',database:e.uiDatabase.name,roleSwitch:'VENUE_MANAGER → CUSTOMER via storage event, same public route',oldPrivateDataVisible:leaked,backendErrorVisible:hasError,runtimeErrors:c.errors};await writeFile(new URL('scope-result.json',e.artifacts),JSON.stringify(result,null,2));assert.equal(leaked,false);assert.equal(hasError,true);
  await c.evaluate(`localStorage.setItem('sportbooking.token',${JSON.stringify(e.users.manager1.session.getToken())});window.dispatchEvent(new StorageEvent('storage',{key:'sportbooking.token'}))`);
  await c.until(`document.querySelector('.header-user')?.innerText.includes('Quản lý Minh')`);await c.navigate('http://127.0.0.1:5175/manager/venues');await c.until(`document.querySelector('.venue-switcher')?.innerText.includes(${JSON.stringify(venue.name)}) && !document.querySelector('.loading')`);
  await c.evaluate(`localStorage.setItem('sportbooking.token',${JSON.stringify(e.users.manager2.session.getToken())});window.dispatchEvent(new StorageEvent('storage',{key:'sportbooking.token'}))`);
  await c.until(`document.querySelector('.header-user')?.innerText.includes('Quản lý Linh') && document.querySelector('.venue-switcher')?.innerText.includes('Bình Thạnh') && !document.querySelector('.loading')`);
  assert.equal(await c.evaluate(`document.body.innerText.includes(${JSON.stringify(venue.name)})`),false);await c.shot('manager-session-scope');
  result.managerToManager='PASS: manager1 → manager2 on the same protected route; previous catalogue discarded';await writeFile(new URL('scope-result.json',e.artifacts),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.deepEqual(c.errors,[]);
}finally{await c?.close();await vite?.close();await e.close();}
