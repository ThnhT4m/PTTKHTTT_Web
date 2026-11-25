import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createHttpTransport, query } from '../src/api/http.js';
import { ApiError } from '../src/api/errors.js';
import { createSession } from '../src/api/session.js';
import { memoryStorage } from './helpers.js';

const server_time = '2026-11-25T02:00:00.000Z';
const success = { status: 200, payload: { success: true, data: [], server_time } };
function setup(transport = async () => success) {
  const session = createSession('api', memoryStorage());
  let expired = 0;
  return { session, client: createApiClient({ transport, session, onExpired: () => expired++ }), expired: () => expired };
}
test('HTTP adapter preserves bearer, JSON DELETE body, signal and array envelope', async () => {
  const calls = [];
  const { session, client } = setup(createHttpTransport('/api/', async (...args) => {
    calls.push(args);
    return { status: 200, json: async () => success.payload };
  }));
  session.setToken('real-token');
  const signal = new AbortController().signal;
  assert.deepEqual(await client.del('/venues/id', { expected_version: 2, reason: 'Bảo trì sân' }, { signal }), { data: [], server_time });
  const [url, options] = calls[0];
  assert.equal(url, '/api/venues/id');
  assert.equal(options.method, 'DELETE');
  assert.equal(options.headers.Authorization, 'Bearer real-token');
  assert.equal(options.signal, signal);
  assert.deepEqual(JSON.parse(options.body), { expected_version: 2, reason: 'Bảo trì sân' });
  await client.post('/bookings/id/complete');
  await client.patch('/slots/id', { expected_version: 1, price: 100000 });
  assert.deepEqual(calls.slice(1).map(([, o]) => [o.method, JSON.parse(o.body)]), [
    ['POST', {}], ['PATCH', { expected_version: 1, price: 100000 }],
  ]);
});
for (const [status, kind] of [[400, 'validation'], [401, 'authentication'], [403, 'forbidden'], [404, 'not_found'], [409, 'conflict'], [429, 'rate_limit'], [500, 'server'], [503, 'server']]) {
  test(`HTTP ${status} keeps error code, details, clock and category`, async () => {
    const { client } = setup(async () => ({ status, payload: { success: false, error: { code: 'TEST_CODE', message: 'Thông báo server', details: { current: { version: 2 } } }, server_time } }));
    await assert.rejects(client.get('/bookings'), (error) => error instanceof ApiError && error.status === status && error.kind === kind && error.code === 'TEST_CODE' && error.details.current.version === 2 && error.server_time === server_time);
  });
}
test('network errors are ApiError; cancellation is preserved', async () => {
  const { client } = setup(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(client.get('/venues'), (e) => e.kind === 'network' && e.status === 0 && e.code === 'NETWORK_ERROR');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.get('/venues', { signal: controller.signal }), { name: 'AbortError' });
});
test('bad or non-JSON successful responses do not pretend to be valid data', async () => {
  for (const payload of [null, {}, { success: true, data: [] }, { success: true, data: [], server_time: 'bad-date' }]) {
    const { client } = setup(async () => ({ status: 200, payload }));
    await assert.rejects(client.get('/venues'), { code: 'INVALID_RESPONSE' });
  }
  const { client } = setup(async () => ({ status: 502, payload: null }));
  await assert.rejects(client.get('/venues'), (e) => e.status === 502 && e.kind === 'server');
});
test('login 401 does not expire a session; authenticated 401 clears it once', async () => {
  const { session, client, expired } = setup(async () => ({ status: 401, payload: { success: false, error: { code: 'UNAUTHORIZED' }, server_time } }));
  session.setToken('token');
  await assert.rejects(client.post('/auth/login', {}));
  assert.equal(session.getToken(), 'token');
  assert.equal(expired(), 0);
  await assert.rejects(client.get('/auth/me'));
  assert.equal(session.getToken(), null);
  assert.equal(expired(), 1);
  await assert.rejects(client.get('/auth/me'));
  assert.equal(expired(), 1);
});
test('an old request cannot invalidate a newly logged-in token', async () => {
  let release;
  const { client, session, expired } = setup(() => new Promise((resolve) => { release = resolve; }));
  session.setToken('old');
  const pending = client.get('/auth/me');
  session.setToken('new');
  release({ status: 401, payload: null });
  await assert.rejects(pending);
  assert.equal(session.getToken(), 'new');
  assert.equal(expired(), 0);
});
test('mode-specific tokens and query preserve API compatibility', () => {
  const storage = memoryStorage();
  const api = createSession('api', storage), mock = createSession('mock', storage);
  api.setToken('real'); mock.setToken('demo'); mock.clear();
  assert.equal(api.getToken(), 'real');
  assert.equal(mock.getToken(), null);
  assert.equal(query({ empty: '', nil: null, missing: undefined, mine: false, offset: 0, q: 'Thủ Đức' }), 'mine=false&offset=0&q=Th%E1%BB%A7+%C4%90%E1%BB%A9c');
});
