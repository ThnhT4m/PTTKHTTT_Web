import cron from 'node-cron';
import { db } from '../db/knex.js';
import { lockVenueCourts, lockSlots } from '../lib/locking.js';
import { databaseNow } from '../modules/bookings/bookings.repository.js';

// Recheck the deadline after acquiring all locks; confirmation may have won
// the race since the initial scan. Never release BOOKED or UNAVAILABLE slots.
export async function expireHolds() {
  const candidates = await db('time_slots')
    .where({ status: 'HELD' })
    .where('held_until', '<=', db.raw('clock_timestamp()'))
    .orderBy('held_until')
    .limit(1000)
    .select('id', 'court_id');
  let expired = 0;
  for (const candidate of candidates) {
    expired += await db.transaction(async (trx) => {
      await lockVenueCourts(trx, [candidate.court_id]);
      const [slot] = await lockSlots(trx, [candidate.id]);
      const now = await databaseNow(trx);
      if (
        !slot ||
        slot.status !== 'HELD' ||
        !slot.held_until ||
        new Date(slot.held_until) > new Date(now)
      )
        return 0;
      const bookings = await trx('bookings')
        .where({ time_slot_id: slot.id, status: 'PENDING' })
        .orderBy('id')
        .forUpdate()
        .select('id');
      if (bookings.length) {
        await trx('bookings')
          .whereIn(
            'id',
            bookings.map((row) => row.id),
          )
          .update({ status: 'EXPIRED', updated_at: trx.fn.now() });
        await trx('payments')
          .whereIn(
            'booking_id',
            bookings.map((row) => row.id),
          )
          .where({ status: 'PENDING' })
          .update({ status: 'FAILED', updated_at: trx.fn.now() });
      }
      await trx('time_slots')
        .where({ id: slot.id, status: 'HELD' })
        .update({
          status: 'AVAILABLE',
          held_until: null,
          version: trx.raw('version + 1'),
          updated_at: trx.fn.now(),
        });
      return 1;
    });
  }
  return expired;
}

export function startHoldExpirationJob() {
  let running = false;
  return cron.schedule('*/30 * * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await expireHolds();
    } catch (error) {
      console.error('Không thể quét giữ chỗ quá hạn:', error.code ?? error.name);
    } finally {
      running = false;
    }
  });
}
