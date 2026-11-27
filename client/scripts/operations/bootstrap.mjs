// Explicit first-time setup only. Runtime never imports or invokes this file.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import knex from 'knex';
import { assertOperationalDatabase } from '../lib/databaseSafety.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const privateDir = new URL('../../.local/', import.meta.url);
await mkdir(privateDir, { recursive: true });
execFileSync('git', ['check-ignore', fileURLToPath(privateDir)], { cwd: root, stdio: 'ignore' });
const envFile = new URL('operations.env', privateDir);
let existing;
try { existing = await readFile(envFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const configured = process.env.DATABASE_URL || existing?.match(/^DATABASE_URL=(.+)$/m)?.[1];
assert.ok(configured, 'Set DATABASE_URL explicitly for first-time initialization; keep credentials in the local environment.');
const target = assertOperationalDatabase(configured);
assert.equal(target.port, '55435', 'This bootstrap/backup targets the verified local Docker PostgreSQL on port 55435.');
if (existing) assert.equal(new URL(existing.match(/^DATABASE_URL=(.+)$/m)?.[1]).href, target.href, 'Existing runtime configuration targets a different database.');
const connection = new pg.Client({ connectionString: target.href });
await connection.connect();
await connection.query("SELECT pg_advisory_lock(hashtext('sportbooking-operational-bootstrap'))");
const db = knex({ client: 'pg', connection: target.href });
let initialized = false;
try {
  const tables = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
  if (tables.length) {
    console.log('Operational database already contains tables. No migration, seed or data changes performed.');
  } else {
    process.env.NODE_ENV = 'development';
    const backupDir = new URL('backups/', privateDir); await mkdir(backupDir, { recursive: true });
    const backup = execFileSync('docker', ['exec', 'sportbooking-tv3-task5-db-1', 'pg_dump', '-U', 'sportbooking', '-d', 'sportbooking', '--no-owner', '--no-acl']);
    await writeFile(new URL('sportbooking-empty-before.sql', backupDir), backup);
    await db.migrate.latest({ directory: fileURLToPath(new URL('../../../server/src/db/migrations/', import.meta.url)) });
    const business = ['users','sport_venues','courts','time_slots','bookings','payments','booking_reschedules','refunds','reviews','audit_logs'];
    for (const table of business) assert.equal(Number((await db(table).count('* as n').first()).n), 0, 'Seed requires all business tables to be empty.');
    await db.seed.run({ directory: fileURLToPath(new URL('../../../server/src/db/seeds/', import.meta.url)) });
    initialized = true;
  }
  if (!existing) await writeFile(envFile, `NODE_ENV=development\nDATABASE_URL=${target.href}\nJWT_SECRET=${randomBytes(48).toString('hex')}\nJWT_EXPIRES_IN=8h\nPAYMENT_SANDBOX_ENABLED=false\nCLIENT_ORIGIN=http://127.0.0.1:5176\nVITE_DATA_MODE=api\n`, { mode: 0o600 });
  console.log(JSON.stringify({ database: target.pathname.slice(1), initialized, seedOnRuntimeStart: false, environmentFile: 'client/.local/operations.env' }));
} finally {
  await db.destroy();
  await connection.query("SELECT pg_advisory_unlock(hashtext('sportbooking-operational-bootstrap'))");
  await connection.end();
}
