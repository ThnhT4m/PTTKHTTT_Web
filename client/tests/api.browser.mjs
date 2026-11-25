import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createFixtures } from '../src/mocks/data.js';

// Intercepted HTTP responses test the real frontend adapter, without a backend or database.
export async function runApiCheckoutCheck({ clientRoot, send, evaluate, until, pass, setIntercept }) {
  const previousMode = process.env.VITE_DATA_MODE;
  process.env.VITE_DATA_MODE = 'api';
  const server = await createServer({ root: clientRoot, server: { host: '127.0.0.1', port: 0, strictPort: false } });
  let script;
  const calls = [], failures = [];
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const db = createFixtures(Date.now()), user = db.users[0], booking = db.bookings.find((b) => b.customer_id === user.id && b.status === 'PENDING');
    setIntercept(async ({ requestId, request }) => {
      try {
        const path = new URL(request.url).pathname.replace(/^\/api/, '');
        calls.push({ method: request.method, path });
        const data = path === '/auth/me' ? { user } : path === `/bookings/${booking.id}` ? booking : null;
        const payload = data ? { success: true, data, server_time: new Date().toISOString() } : { success: false, error: { code: 'TEST_UNEXPECTED_ROUTE', message: 'Unexpected HTTP request' }, server_time: new Date().toISOString() };
        await send('Fetch.fulfillRequest', { requestId, responseCode: data ? 200 : 404, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(payload)).toString('base64') });
      } catch (error) { failures.push(error.message); }
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: `${base}/api/*`, requestStage: 'Request' }] });
    script = await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(base)})localStorage.setItem('sportbooking.token','test-only-api-session');` });
    await send('Page.navigate', { url: `${base}/checkout/${booking.id}` });
    await until(`!!document.querySelector('.badge--PENDING') && !!document.querySelector('.countdown strong') && !!document.querySelector('.panel__body > button.button--primary')`);
    assert.equal(await evaluate(`document.querySelector('.panel__body > button.button--primary').disabled`), true);
    // Even bypassing the disabled HTML control must hit the feature guard before any POST.
    await evaluate(`const button=document.querySelector('.panel__body > button.button--primary');button.disabled=false;button.click();`);
    await evaluate(`new Promise(resolve=>setTimeout(resolve,100))`);
    assert.ok(calls.some((call) => call.path === '/auth/me'));
    assert.ok(calls.some((call) => call.path === `/bookings/${booking.id}`));
    assert.ok(calls.every((call) => call.method === 'GET' && !call.path.startsWith('/payments')));
    assert.deepEqual(failures, []);
    assert.equal(await evaluate(`!!document.querySelector('.badge--PENDING')`), true);
    pass('API mode với HTTP fixture: checkout chỉ GET, guard không gửi payment dù bỏ disabled trong DOM');
  } finally {
    if (script) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier });
    await send('Fetch.disable').catch(() => {}); setIntercept(null);
    await send('Page.navigate', { url: 'about:blank' }).catch(() => {});
    await server.close();
    if (previousMode === undefined) delete process.env.VITE_DATA_MODE; else process.env.VITE_DATA_MODE = previousMode;
  }
}
