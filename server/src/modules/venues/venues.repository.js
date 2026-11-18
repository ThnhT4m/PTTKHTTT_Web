import { db } from '../../db/knex.js';

export function venueQuery() {
  return db('sport_venues as v')
    .select('v.*')
    .select(
      db.raw('(SELECT MIN(c.hourly_price) FROM courts c WHERE c.venue_id = v.id) AS min_price'),
    )
    .select(
      db.raw(
        "COALESCE((SELECT json_agg(DISTINCT c.sport_type) FROM courts c WHERE c.venue_id = v.id), '[]'::json) AS sport_types",
      ),
    )
    .select(db.raw('(SELECT COUNT(*)::int FROM courts c WHERE c.venue_id = v.id) AS court_count'));
}

export async function listVenues(filters, user) {
  const query = venueQuery().orderBy('v.name').limit(100);
  if (filters.mine) query.where('v.manager_id', user.id);
  else if (user?.role !== 'ADMIN') query.where('v.status', 'ACTIVE');
  if (filters.q)
    query.where((builder) =>
      builder.whereILike('v.name', `%${filters.q}%`).orWhereILike('v.address', `%${filters.q}%`),
    );
  if (filters.district) query.where('v.district', filters.district);
  if (filters.sport_type || filters.min_price !== undefined || filters.max_price !== undefined) {
    query.whereExists(function () {
      this.select(db.raw('1')).from('courts as c').whereRaw('c.venue_id = v.id');
      if (filters.sport_type) this.where('c.sport_type', filters.sport_type);
      if (filters.min_price !== undefined) this.where('c.hourly_price', '>=', filters.min_price);
      if (filters.max_price !== undefined) this.where('c.hourly_price', '<=', filters.max_price);
      if (!filters.mine && user?.role !== 'ADMIN') this.where('c.status', 'ACTIVE');
    });
  }
  return query;
}

export const venueById = (id) => venueQuery().where('v.id', id).first();
export const courtsForVenue = (id) => db('courts').where({ venue_id: id }).orderBy('name');
export const courtById = (id) =>
  db('courts as c')
    .join('sport_venues as v', 'v.id', 'c.venue_id')
    .select(
      'c.*',
      'v.name as venue_name',
      'v.address',
      'v.district',
      'v.manager_id',
      'v.status as venue_status',
    )
    .where('c.id', id)
    .first();
