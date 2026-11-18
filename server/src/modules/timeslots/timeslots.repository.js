import { db } from '../../db/knex.js';

export const getByDate = (courtId, date) =>
  db('time_slots')
    .where({ court_id: courtId, slot_date: date })
    .select(
      '*',
      db.raw("(slot_date + start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS start_at"),
      db.raw("(slot_date + end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS end_at"),
    )
    .orderBy('start_time');
