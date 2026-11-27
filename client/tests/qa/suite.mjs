import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../real/chrome.mjs';
import { addDays, todayVN } from '../../src/utils/format.js';
import { runCoverage } from './coverage.mjs';
import { runEdges } from './edges.mjs';

export async function runFinalChecks(e, check) {
  process.env.VITE_DATA_MODE = 'api'; process.env.VITE_PROXY_TARGET = e.origin;
  const vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), server: { host: '127.0.0.1', port: 5175, strictPort: true, proxy: { '/api': { target: e.origin, changeOrigin: true } } } });
  await vite.listen(); const c = await launchChrome(e.artifacts), { send, evaluate, until, click, fill, shot } = c;
  const base = 'http://127.0.0.1:5175', db = e.database, day = todayVN(await e.clock()), tomorrow = addDays(day, 1), later = addDays(day, 2);
  const api = e.users.manager1.client, admin = e.users.admin.client;
  const venue = (await api.post('/venues', { name: 'QA6 Sân Nhà', address: '12 Đường Kiểm Thử', district: 'Quận 7', payment_hold_minutes: 5 })).data;
  const court = (await api.post(`/venues/${venue.id}/courts`, { name: 'QA6 Sân bóng đá', sport_type: 'FOOTBALL', hourly_price: 180000 })).data;
  await api.post(`/venues/${venue.id}/generate-slots`, { days: 30 });
  const slots = async (date = tomorrow, id = court.id) => (await admin.get(`/courts/${id}/slots?date=${date}`)).data;
  const free = async (date = tomorrow) => (await slots(date)).find((s) => s.status === 'AVAILABLE');
  const pending = (await e.users.customer.client.post('/bookings/online', { time_slot_id: (await free()).id })).data;
  const visit = async (path, condition = `!!document.querySelector('main') && !document.querySelector('.loading')`) => { await c.navigate(base + path); await until(condition); };
  const login = async (who, destination) => { await visit('/login', `!!document.querySelector('[name=email]')`); await fill('[name=email]', who + '@example.com'); await fill('[name=password]', 'Demo@12345'); await evaluate(`document.querySelector('form').requestSubmit()`); await until(`location.pathname===${JSON.stringify(destination)} && !document.querySelector('.loading')`); };
  const logout = async () => { await until(`!!document.querySelector('[title="Đăng xuất"]')`); await evaluate(`document.querySelector('[title="Đăng xuất"]').click()`); await until(`location.pathname==='/login' && !!document.querySelector('[name=email]')`); };
  const closeModal = async () => { await evaluate(`document.querySelector('[role=dialog] [aria-label="Đóng"]').click()`); await until(`!document.querySelector('[role=dialog]')`); };
  const submit = async () => evaluate(`document.querySelector('[role=dialog] form').requestSubmit()`);
  const info = (route, role, level = 'REAL_BROWSER') => ({ route, role, level, viewport: '1366x768' });
  async function intercept(pattern, handler, stage = 'Request') { c.setIntercept(handler); await send('Fetch.enable', { patterns: [{ urlPattern: '*' + pattern + '*', requestStage: stage }] }); }
  async function unintercept() { await send('Fetch.disable'); c.setIntercept(null); }
  async function failScreenshot(id) { await shot(id); }
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await login('customer', '/venues');
    await check('FE-QA-001', 'Late hold response cannot take over a route the customer already left', info('/courts/:id/schedule', 'CUSTOMER', 'REAL_WRITE_DELAYED_RESPONSE'), async () => {
      let release;
      await intercept('/api/bookings/online', async (p) => { release = () => send('Fetch.continueResponse', { requestId: p.requestId }); }, 'Response');
      try {
        await visit(`/courts/${court.id}/schedule?date=${later}`, `document.querySelectorAll('.slot-card').length===16 && !!document.querySelector('.slot-card:not(:disabled)')`);
        await evaluate(`document.querySelector('.slot-card:not(:disabled)').click()`); await click('Xác nhận giữ chỗ');
        const end = Date.now() + 10000; while (!release && Date.now() < end) await new Promise((r) => setTimeout(r, 50)); assert.ok(release);
        await evaluate(`Array.from(document.querySelectorAll('.site-nav a')).find(a=>a.textContent==='Khám phá sân').click()`); await until(`location.pathname==='/venues'`);
        await release(); await new Promise((r) => setTimeout(r, 400)); await failScreenshot('FE-QA-001');
        assert.equal(await evaluate('location.pathname'), '/venues');
        return { committedBooking: true, stayedOnRequestedRoute: true };
      } finally { await unintercept(); }
    });
    await check('FE-QA-002', 'Checkout removes an old read error after a successful refresh', info('/checkout/:id', 'CUSTOMER', 'HTTP_FIXTURE_READ_FAILURE'), async () => {
      await visit(`/checkout/${pending.id}`, `!!document.querySelector('.badge--PENDING')`);
      await intercept('/api/bookings/' + pending.id, async (p) => send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ success: false, error: { code: 'QA_TEMPORARY', message: 'QA mất kết nối tạm thời' }, server_time: new Date().toISOString() })).toString('base64') }));
      try { await until(`document.querySelector('[role=alert]')?.innerText.includes('QA mất kết nối')`); }
      finally { await unintercept(); }
      const before = c.requests.filter((r) => r.path === '/api/bookings/' + pending.id).length;
      const end = Date.now() + 18000; while (c.requests.filter((r) => r.path === '/api/bookings/' + pending.id).length === before && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 200)); await failScreenshot('FE-QA-002');
      assert.equal(await evaluate(`document.body.innerText.includes('QA mất kết nối tạm thời')`), false);
      return { recovered: true, oldErrorCleared: true };
    });
    await logout(); await login('manager1', '/manager/venues');
    await check('FE-QA-003', 'Manager creation blocks repeated submits while a write is in flight', info('/manager/venues', 'VENUE_MANAGER', 'REAL_WRITE_DELAYED_RESPONSE'), async () => {
      await click('Thêm cơ sở'); for (const [key, value] of Object.entries({ name: 'QA6 Burst', address: '12 Burst Street', district: 'Quận 7' })) await fill(`[role=dialog] [name=${key}]`, value);
      let paused = [];
      await intercept('/api/venues', async (p) => { if (p.request.method === 'POST') paused.push(p.requestId); else await send('Fetch.continueResponse', { requestId: p.requestId }); }, 'Response');
      const before = c.requests.filter((r) => r.method === 'POST' && r.path === '/api/venues').length;
      try {
        await evaluate(`const form=document.querySelector('[role=dialog] form'); form.requestSubmit(); form.requestSubmit();`); await new Promise((r) => setTimeout(r, 500));
        const sent = c.requests.filter((r) => r.method === 'POST' && r.path === '/api/venues').length - before;
        for (const id of paused) await send('Fetch.continueResponse', { requestId: id }); paused = [];
        await until(`!document.querySelector('[role=dialog]') && !document.querySelector('.loading')`); await failScreenshot('FE-QA-003'); assert.equal(sent, 1);
        return { writeRequests: sent };
      } finally { for (const id of paused) await send('Fetch.continueResponse', { requestId: id }).catch(() => {}); await unintercept(); }
    });
    await check('FE-QA-004', 'Manager warns and blocks a retry after the server committed but response was lost', info('/manager/venues', 'VENUE_MANAGER', 'REAL_WRITE_LOST_RESPONSE'), async () => {
      await click('Thêm cơ sở'); for (const [key, value] of Object.entries({ name: 'QA6 Lost Response', address: '12 Lost Street', district: 'Quận 7' })) await fill(`[role=dialog] [name=${key}]`, value);
      await intercept('/api/venues', async (p) => p.request.method === 'POST' ? send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionClosed' }) : send('Fetch.continueResponse', { requestId: p.requestId }), 'Response');
      try { await submit(); await until(`!!document.querySelector('[role=dialog] [role=alert]')`); await failScreenshot('FE-QA-004');
        const count = Number((await db('sport_venues').where({ name: 'QA6 Lost Response' }).count('* as n').first()).n); assert.equal(count, 1);
        assert.equal(await evaluate(`document.querySelector('[role=dialog] button.button--primary').disabled`), true);
        assert.equal(await evaluate(`document.querySelector('[role=dialog]').innerText.includes('Chưa xác định')`), true);
        return { committedOnce: true, retryBlocked: true };
      } finally { await unintercept(); await closeModal(); }
    });
    const coverage = process.env.QA_PHASE === 'before' ? {} : await (process.env.QA_PHASE === 'edge' ? runEdges : runCoverage)({ e, c, check, visit, login, logout, closeModal, venue, court, pending, tomorrow, later, intercept, unintercept });
    return { ...coverage, interactions: c.actions.length, actions: c.actions, requests: c.requests, responses: c.responses, runtimeErrors: c.errors, warnings: c.warnings, interceptionErrors:c.interceptionErrors, venue: venue.id, court: court.id, pending: pending.id };
  } finally { await c.close(); await vite.close(); }
}
