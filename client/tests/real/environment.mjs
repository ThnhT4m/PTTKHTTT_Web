// Test-only setup. Never seed an existing database, connect to production or alter server source.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import knex from 'knex';
import { createApiClient, createHttpTransport } from '../../src/api/http.js';
import { createSession } from '../../src/api/session.js';
import { memoryStorage } from '../helpers.js';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const artifacts = new URL('../../test-artifacts/task5/', import.meta.url);
export async function createEnvironment() {
  const adminUrl = new URL(process.env.TASK5_DB_ADMIN_URL || 'postgres://sportbooking:sportbooking_dev@127.0.0.1:55435/postgres');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname), 'Only a local disposable PostgreSQL instance is supported.');
  assert.equal(adminUrl.pathname, '/postgres', 'Setup connects to postgres only to CREATE a new test database.');
  const connection = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 10000 });
  await connection.connect();
  const version = (await connection.query('SHOW server_version')).rows[0].server_version;
  assert.match(version, /^16\./, 'TASK 5 requires PostgreSQL 16.');
  const run = `sportbooking_tv3_${Date.now()}_${randomBytes(3).toString('hex')}`;
  async function createDatabase(suffix) {
    const name = `${run}_${suffix}_test`; assert.match(name, /^sportbooking_tv3_[a-z0-9_]+_test$/);
    // CREATE fails if the name exists. No DROP/TRUNCATE or reset of an existing database.
    await connection.query(`CREATE DATABASE "${name}"`);
    const url = new URL(adminUrl); url.pathname = '/' + name;
    return { name, url: url.href };
  }
  const uiDatabase = await createDatabase('ui'), backendDatabase = await createDatabase('backend');
  await connection.end();
  const database = knex({ client: 'pg', connection: uiDatabase.url, pool: { min: 0, max: 12 } });
  assert.equal((await database.raw('SELECT current_database() AS name')).rows[0].name, uiDatabase.name);
  assert.equal((await database.raw("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0, 'Seed only a newly created empty test DB.');
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = uiDatabase.url;
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  process.env.JWT_EXPIRES_IN = '8h';
  process.env.PAYMENT_SANDBOX_ENABLED = 'false';
  process.env.CLIENT_ORIGIN = 'http://127.0.0.1:5175';
  await mkdir(artifacts, { recursive: true });
  execFileSync('git', ['check-ignore', fileURLToPath(artifacts)], { cwd: root, stdio: 'ignore' });
  await writeFile(new URL('backend.env', artifacts), ['NODE_ENV=test', `DATABASE_URL=${uiDatabase.url}`, `JWT_SECRET=${process.env.JWT_SECRET}`, 'PAYMENT_SANDBOX_ENABLED=false', `CLIENT_ORIGIN=${process.env.CLIENT_ORIGIN}`].join('\n') + '\n', { mode: 0o600 });
  await database.migrate.latest({ directory: fileURLToPath(new URL('../../../server/src/db/migrations/', import.meta.url)) });
  await database.seed.run({ directory: fileURLToPath(new URL('../../../server/src/db/seeds/', import.meta.url)) });
  const { app } = await import('../../../server/src/app.js');
  const { db: serverDb } = await import('../../../server/src/db/knex.js');
  const { startHoldExpirationJob, expireHolds } = await import('../../../server/src/jobs/holdExpiration.job.js');
  let server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  const job = startHoldExpirationJob(), origin = `http://127.0.0.1:${server.address().port}`;
  const requests = [];
  const fetcher = async (url, options) => {
    assert.ok(!new URL(url).pathname.startsWith('/api/payments/'), 'TASK 5 Frontend tests must never send payment create/confirm.');
    const response = await fetch(url, options);
    requests.push({ method: options.method, path: new URL(url).pathname + new URL(url).search, status: response.status });
    return response;
  };
  async function account(name, password = 'Demo@12345') {
    const session = createSession('api', memoryStorage());
    const client = createApiClient({ transport: createHttpTransport(origin + '/api', fetcher), session });
    const { data } = await client.post('/auth/login', { email: name.includes('@') ? name : `${name}@example.com`, password });
    session.setToken(data.token); return { client, session, user: data.user };
  }
  const users = Object.fromEntries(await Promise.all(['customer', 'customer2', 'manager1', 'manager2', 'admin'].map(async (name) => [name, await account(name)])));
  const clock = async () => Date.parse((await database.raw('SELECT clock_timestamp() AS now')).rows[0].now);
  const confirmed = async (slot, user = users.customer.user, name = 'Khách fixture TASK 5') => {
    const id = await database.transaction(async (trx) => {
      await trx('time_slots').where({ id: slot.id, status: 'AVAILABLE' }).update({ status: 'BOOKED', held_until: null });
      const [booking] = await trx('bookings').insert({ time_slot_id: slot.id, customer_id: user.id, customer_name: name, source: 'ONLINE', status: 'CONFIRMED', total_amount: slot.price }).returning('*');
      await trx('payments').insert({ booking_id: booking.id, method: 'BANK_TRANSFER', status: 'PAID', amount: slot.price, transaction_code: `task5-fixture-${booking.id}` });
      return booking.id;
    });
    return (await users.admin.client.get(`/bookings/${id}`)).data;
  };
  const result = { database, origin, requests, users, account, clock, confirmed, expireHolds, artifacts, version, uiDatabase, backendDatabase, root };
  // Isolate the responsive test group from the functional group's auth request budget.
  // This is a new unmodified Express app instance, with the same real limiter and same DB.
  result.freshHttpApp = async () => {
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    const { app: isolated } = await import(`../../../server/src/app.js?task5=${randomBytes(6).toString('hex')}`);
    server = await new Promise((resolve) => { const listening = isolated.listen(port, '127.0.0.1', () => resolve(listening)); });
  };
  result.close = async () => { job.stop(); await new Promise((resolve) => server.close(resolve)); await serverDb.destroy(); await database.destroy(); };
  return result;
}
