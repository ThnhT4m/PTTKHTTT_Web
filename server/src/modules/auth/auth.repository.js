import { db } from '../../db/knex.js';
export const findByEmail = (email) => db('users').where({ email }).first();
export const createUser = async (data) => (await db('users').insert(data).returning('*'))[0];
export const revokeSessions = (userId) =>
  db('users')
    .where({ id: userId })
    .increment('token_version', 1)
    .update({ updated_at: db.fn.now() });
