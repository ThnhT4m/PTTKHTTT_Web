import assert from 'node:assert/strict';

export async function runEdges({e,c,check,visit,login,logout,court,venue,tomorrow,later,intercept,unintercept}) {
  const {send,evaluate,until,fill,click,shot}=c;
  const info=(route,level='REAL_BROWSER')=>({route,role:'CUSTOMER',level,viewport:'1366x768'});
  await logout();
  await check('QA-E-AUTH','Registration field errors, UTF-8 overflow, confirmation and real duplicate email',info('/register'),async()=>{
    await visit('/register',`!!document.querySelector('[name=full_name]')`);
    for(const [name,value]of Object.entries({full_name:'A',email:'bad',phone:'x',password:'short',password_confirmation:'different'}))await fill(`[name=${name}]`,value);
    await evaluate(`document.querySelector('form').requestSubmit()`);await until(`document.querySelectorAll('[aria-invalid=true]').length===5`);
    for(const [name,value]of Object.entries({full_name:'Khách QA6',email:'customer@example.com',phone:'0901234567',password:'😀'.repeat(19),password_confirmation:'😀'.repeat(19)}))await fill(`[name=${name}]`,value);
    await evaluate(`document.querySelector('form').requestSubmit()`);await until(`document.querySelector('.customer-field-error')?.innerText.includes('72 byte')`);
    for(const name of ['password','password_confirmation'])await fill(`[name=${name}]`,'Demo@12345');
    await evaluate(`document.querySelector('form').requestSubmit()`);await until(`!!document.querySelector('[role=alert]')`);
    assert.equal(await evaluate(`location.pathname`),'/register');assert.equal(await evaluate(`document.querySelector('[role=alert]').innerText`),'Email đã được đăng ký.');assert.ok(c.responses.some(r=>r.path==='/api/auth/register'&&r.status===409));await shot('registration-validation');
    return {invalidFields:5,overflowBytes:76,duplicateEmail:409};
  });
  await login('customer','/venues');
  await check('QA-E-401','Authenticated 401 clears token and explains expiration independently of login errors',info('/my-bookings','HTTP_FIXTURE_401'),async()=>{
    await intercept('/api/auth/me',async p=>send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:401,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({success:false,error:{code:'TOKEN_EXPIRED',message:'Phiên đã hết hạn'},server_time:new Date().toISOString()})).toString('base64')}));
    try{await visit('/my-bookings',`location.pathname==='/login' && !!document.querySelector('.notice--info')`);assert.ok(await evaluate(`document.querySelector('.notice--info').innerText.includes('hết hiệu lực')`));assert.equal(await evaluate(`localStorage.getItem('sportbooking.token')`),null);await shot('expired-session');}finally{await unintercept();}
    return {status:401,tokenCleared:true,expiredNotice:true};
  });
  await login('customer','/my-bookings');
  const manager=await e.account('manager1');
  const dates=[tomorrow,later],prices=[123456,654321];
  for(let n=0;n<2;n++){const s=(await manager.client.get(`/courts/${court.id}/slots?date=${dates[n]}`)).data.at(-1);await manager.client.patch(`/slots/${s.id}`,{expected_version:s.version,price:prices[n]});}
  await check('QA-E-STALE','Old delayed schedule cannot replace a newer date response',info('/courts/:id/schedule','REAL_READ_DELAYED_RESPONSE'),async()=>{
    let release;
    await intercept(`/api/courts/${court.id}/slots`,async p=>{if(new URL(p.request.url).searchParams.get('date')===tomorrow)release=()=>send('Fetch.continueResponse',{requestId:p.requestId});else await send('Fetch.continueResponse',{requestId:p.requestId});},'Response');
    try{await c.navigate(`http://127.0.0.1:5175/courts/${court.id}/schedule?date=${tomorrow}`);await until(`!!document.querySelector('input[type=date]') && !!document.querySelector('.loading')`);const end=Date.now()+5000;while(!release&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.ok(release);await fill('input[type=date]',later);await until(`document.querySelectorAll('.slot-card').length===16 && document.body.innerText.includes('654.321')`);await release().catch(()=>{});await new Promise(r=>setTimeout(r,200));assert.equal(await evaluate(`document.body.innerText.includes('123.456')`),false);assert.equal(await evaluate(`document.querySelector('input[type=date]').value`),later);await shot('stale-date-discarded');}finally{await unintercept();}
    return {oldPrice:123456,currentPrice:654321,oldResponseIgnored:true};
  });
  await check('QA-E-REFRESH-WRITE','Hard refresh during committed hold recovers via history without submitting again',info('/courts/:id/schedule → /my-bookings','REAL_WRITE_DELAYED_RESPONSE'),async()=>{
    const before=c.requests.filter(r=>r.method==='POST'&&r.path==='/api/bookings/online').length;
    let release;
    await intercept('/api/bookings/online',async p=>{release=()=>send('Fetch.continueResponse',{requestId:p.requestId});},'Response');
    try{await visit(`/courts/${court.id}/schedule?date=${later}`,`document.querySelectorAll('.slot-card').length===16 && !!document.querySelector('.slot-card:not(:disabled)')`);await evaluate(`document.querySelector('.slot-card:not(:disabled)').click()`);await click('Xác nhận giữ chỗ');const end=Date.now()+5000;while(!release&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.ok(release);await visit('/my-bookings',`!!document.querySelector('.booking-card .badge--PENDING')`);await release().catch(()=>{});await new Promise(r=>setTimeout(r,200));assert.equal(await evaluate('location.pathname'),'/my-bookings');assert.equal(c.requests.filter(r=>r.method==='POST'&&r.path==='/api/bookings/online').length-before,1);
      const booking=(await e.users.admin.client.get(`/bookings?venue_id=${venue.id}&status=PENDING`)).data.find(b=>b.start_at.startsWith(later));assert.ok(booking);assert.equal((await manager.client.get(`/courts/${court.id}/slots?date=${later}`)).data.find(s=>s.id===booking.time_slot_id).status,'HELD');await shot('refresh-write-history');return {writeRequests:1,status:booking.status,managerSlot:'HELD',booking:booking.id};
    }finally{await unintercept();}
  });
  await check('QA-E-RUNTIME','Edge suite has no runtime errors or payment requests',info('*'),async()=>{assert.deepEqual(c.errors,[]);assert.deepEqual(c.warnings,[]);assert.deepEqual(c.interceptionErrors.filter(x=>x!=='Invalid InterceptionId.'),[]);assert.equal(c.requests.some(r=>r.path.startsWith('/api/payments/')),false);return {runtimeErrors:0,paymentRequests:0};});
  return {edgeChecks:5};
}
