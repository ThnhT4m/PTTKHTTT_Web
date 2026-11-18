import knex from 'knex';
import pg from 'pg';
import { env } from '../config/env.js';

// DATE phải giữ dạng lịch địa phương, không tự đổi sang Date theo timezone host.
pg.types.setTypeParser(1082, (value) => value);

export const db = knex({
  client: 'pg',
  connection: env.databaseUrl,
  pool: { min: 0, max: 10 },
});
