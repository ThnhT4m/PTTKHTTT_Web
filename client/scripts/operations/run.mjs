// Persistent project data only. No migration/seed/reset is run on startup.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { assertOperationalDatabase } from '../lib/databaseSafety.mjs';

const database = assertOperationalDatabase(process.env.DATABASE_URL);
assert.equal(process.env.PAYMENT_SANDBOX_ENABLED, 'false', 'Online payment must stay disabled.');
assert.ok(process.env.JWT_SECRET?.length >= 32);
assert.notEqual(process.env.NODE_ENV, 'test');
process.env.VITE_DATA_MODE = 'api';
process.env.VITE_API_BASE = '/api';
const port = Number(process.env.OPERATIONAL_API_PORT || 4006);
const uiPort = Number(process.env.OPERATIONAL_UI_PORT || 5176);
const mode = process.argv[2] || 'both';
assert.ok(['backend','frontend','both'].includes(mode));
process.env.CLIENT_ORIGIN = `http://127.0.0.1:${uiPort}`;
let db, server, vite, job;
if (mode !== 'frontend') {
  const { app } = await import('../../../server/src/app.js');
  ({ db } = await import('../../../server/src/db/knex.js'));
  const tables = (await db.raw("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename IN ('users','sport_venues','courts','time_slots','bookings','payments','booking_reschedules','refunds','reviews','audit_logs')")).rows[0].n;
  assert.equal(tables, 10, 'Initialize the empty operational database explicitly before starting.');
  const { startHoldExpirationJob } = await import('../../../server/src/jobs/holdExpiration.job.js');
  server = await new Promise((resolve, reject) => { const instance = app.listen(port, '127.0.0.1', () => resolve(instance)); instance.on('error', reject); });
  job = startHoldExpirationJob();
}
if (mode !== 'backend') {
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), server: { host: '127.0.0.1', port: uiPort, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: true } } } });
  try { await vite.listen(); } catch (error) { server?.close(); job?.stop(); await db?.destroy(); throw error; }
}
console.log(`Sân Nhà ${mode}: http://127.0.0.1:${uiPort}; API port ${port}; database ${database.pathname.slice(1)}; API mode; online payment disabled; no startup seed.`);
let closing = false;
async function close() { if (closing) return; closing = true; job?.stop(); await vite?.close(); if(server)await new Promise(resolve => server.close(resolve)); await db?.destroy(); }
process.on('SIGINT', () => { void close(); }); process.on('SIGTERM', () => { void close(); });
