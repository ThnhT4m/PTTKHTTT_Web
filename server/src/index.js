import { app } from './app.js';
import { db } from './db/knex.js';
import { env } from './config/env.js';
import { startHoldExpirationJob } from './jobs/holdExpiration.job.js';

await db.raw('SELECT 1');
const server = app.listen(env.port, () =>
  console.log(`SportBooking API đang chạy tại http://localhost:${env.port}/api`),
);
const holdExpirationJob = startHoldExpirationJob();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  holdExpirationJob.stop();
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
