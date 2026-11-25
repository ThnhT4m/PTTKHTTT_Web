// Real Chrome smoke checks through CDP; no browser-test dependency or backend required.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { runManagerChecks } from './manager.browser.mjs';
import { runCustomerChecks } from './customer.browser.mjs';
import { runApiCheckoutCheck } from './api.browser.mjs';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
let executable;
for (const path of candidates) { try { await access(path); executable = path; break; } catch {} }
if (!executable) throw new Error('Cần Chrome/Edge. Đặt CHROME_PATH tới browser để chạy test:browser.');
const profile = await mkdtemp(join(tmpdir(), 'sportbooking-browser-'));
let server, chrome, ws;
const pending = new Map(), exceptions = [], apiRequests = [];
let nextId = 0, checked = 0;
let intercept = null;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
async function until(expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { if (await evaluate(expression)) return; } catch {}
    await pause(100);
  }
  throw new Error(`UI timeout: ${expression}\n${await evaluate('document.body.innerText')}`);
}
function pass(name) { checked++; console.log(`PASS ${name}`); }
try {
  process.env.VITE_DATA_MODE = 'mock';
  server = await createServer({ root: clientRoot, server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let spawnError;
  chrome.on('error', (error) => { spawnError = error; });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    if (spawnError) throw spawnError;
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await pause(100); }
  }
  if (!port) throw new Error('Không mở được Chrome DevTools.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, reject) => { ws.onopen = r; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const callback = pending.get(message.id);
      clearTimeout(callback.timer); pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (message.method === 'Fetch.requestPaused' && intercept) void intercept(message.params);
    if (message.method === 'Network.requestWillBeSent') {
      const url = new URL(message.params.request.url);
      if (url.pathname.startsWith('/api') || url.port === '4000') apiRequests.push(url.href);
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 950, deviceScaleFactor: 1, mobile: false });
  async function visit(path, condition) {
    await send('Page.navigate', { url: base + path });
    await until(condition);
  }
  async function login(email, expectedPath) {
    await visit('/login', `!!document.querySelector('input[name="email"]')`);
    await evaluate(`document.querySelector('[name=email]').value=${JSON.stringify(email)}; document.querySelector('[name=password]').value='Demo@12345'; document.querySelector('form').requestSubmit();`);
    await until(`location.pathname===${JSON.stringify(expectedPath)} && !document.querySelector('.loading')`);
  }
  async function logout() {
    await evaluate(`document.querySelector('button[title="Đăng xuất"]').click()`);
    await until(`location.pathname==='/login' && !!document.querySelector('[name=email]')`);
  }
  await visit('/venues', `document.querySelectorAll('.venue-card').length===2`);
  const venueId = await evaluate(`document.querySelector('.venue-card a').getAttribute('href').split('/').pop()`);
  await visit(`/venues/${venueId}`, `document.querySelectorAll('.court-row').length===5`);
  const courtPath = await evaluate(`document.querySelector('.court-row a').getAttribute('href')`);
  await visit(courtPath, `document.querySelectorAll('.slot-card').length===16`);
  pass('Khám phá, chi tiết cơ sở và lịch sân (16 ca)');
  await visit('/manager/venues', `location.pathname==='/login' && !!document.querySelector('[name=email]')`);
  pass('Khách chưa đăng nhập bị chặn route manager');
  await evaluate(`document.querySelector('[name=email]').value='customer@example.com'; document.querySelector('[name=password]').value='Wrong@12345'; document.querySelector('form').requestSubmit();`);
  await until(`document.querySelector('[role=alert]')?.innerText.includes('không đúng')`);
  assert.equal(await evaluate('location.pathname'), '/login');
  pass('Sai mật khẩu giữ nguyên form và hiển thị lỗi');
  await login('customer@example.com', '/venues');
  await visit('/my-bookings', `document.querySelectorAll('.booking-card').length>0`);
  const pendingPath = await evaluate(`document.querySelector('a[href^="/checkout/"]').getAttribute('href')`);
  await visit(pendingPath, `document.querySelector('.countdown strong')?.innerText!=='00:00' && !!document.querySelector('.summary-list')`);
  await evaluate(`document.querySelector('.panel__body > button.button--primary').click()`);
  await until(`document.querySelector('.notice--info')?.innerText.includes('TASK 6')`);
  assert.equal(await evaluate(`document.querySelector('.panel__body > button.button--primary').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('.badge--PENDING')?.innerText`), 'Chờ thanh toán');
  await visit(pendingPath, `!!document.querySelector('.badge--PENDING')`);
  pass('Customer: lịch đặt, checkout, refresh và payment bị vô hiệu hóa trước TASK 6');
  await visit('/admin', `location.pathname==='/venues' && document.querySelectorAll('.venue-card').length===2`);
  pass('Customer bị chặn route ADMIN');
  await logout();
  await login('manager1@example.com', '/manager/venues');
  await until(`document.querySelectorAll('.venue-switcher__item').length===1 && document.querySelectorAll('tbody tr').length===7`);
  assert.match(await evaluate(`document.querySelector('.venue-switcher').innerText`), /Thủ Đức/);
  await visit('/manager/counter', `document.querySelectorAll('.slot-card').length===16 && document.querySelectorAll('tbody tr').length>0`);
  await visit('/manager/requests', `document.querySelectorAll('.booking-card').length>0`);
  assert.doesNotMatch(await evaluate(`document.querySelector('.booking-list').innerText`), /Bình Thạnh/);
  pass('Manager1: cơ sở, quầy thu ngân, sự cố/hoàn tiền chỉ thuộc Thủ Đức');
  await logout();
  await login('manager2@example.com', '/manager/venues');
  await until(`document.querySelectorAll('.venue-switcher__item').length===1`);
  assert.match(await evaluate(`document.querySelector('.venue-switcher').innerText`), /Bình Thạnh/);
  pass('Manager2: cơ sở quản lý riêng Bình Thạnh');
  await logout();
  await login('admin@example.com', '/admin');
  await until(`document.querySelectorAll('.metric-card').length===4 && document.querySelectorAll('tbody tr').length===5`);
  await evaluate(`Array.from(document.querySelectorAll('.tabs button')).find(b=>b.innerText.includes('Trạng thái')).click()`);
  await until(`document.querySelectorAll('.slot-card').length===16`);
  await evaluate(`Array.from(document.querySelectorAll('.tabs button')).find(b=>b.innerText.includes('Nhật ký')).click()`);
  await until(`!!document.querySelector('.audit-details')`);
  pass('Admin: dashboard, users, trạng thái sân/cơ sở và audit');
  await logout();
  await visit('/register', `!!document.querySelector('[name=full_name]')`);
  await evaluate(`document.querySelector('[name=full_name]').value='Khách mới'; document.querySelector('[name=email]').value='new@example.com'; document.querySelector('[name=password]').value='Demo@12345'; document.querySelector('[name=password_confirmation]').value='Demo@12345'; document.querySelector('form').requestSubmit();`);
  await until(`location.pathname==='/venues' && document.querySelectorAll('.venue-card').length===2`);
  pass('Đăng ký mock tạo CUSTOMER và đăng nhập thành công');
  await logout();
  await runManagerChecks({ evaluate, until, visit, login, logout, pass, send });
  await runCustomerChecks({ evaluate, until, visit, login, logout, pass, send });
  assert.deepEqual(apiRequests, []);
  assert.deepEqual(exceptions, []);
  pass('Không request backend /api hoặc :4000; không có lỗi JavaScript runtime');
  await runApiCheckoutCheck({ clientRoot, send, evaluate, until, pass, setIntercept: (value) => { intercept = value; } });
  assert.deepEqual(exceptions, []);
  console.log(`${checked}/${checked} browser checks passed (mock + intercepted API HTTP, Chrome headless).`);
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    await send('Browser.close').catch(() => {});
    ws.close();
  }
  chrome?.kill();
  await server?.close();
  for (const callback of pending.values()) clearTimeout(callback.timer);
  // Only remove the exact temporary profile allocated above, after checking its absolute scope.
  if (resolve(profile).startsWith(`${resolve(tmpdir())}${sep}sportbooking-browser-`))
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
