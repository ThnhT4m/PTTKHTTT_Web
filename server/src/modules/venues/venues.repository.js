import { db } from '../../db/knex.js';

export function venueQuery() {
  return db('sport_venues as v')
    .select('v.*')
    .select(
      db.raw("(SELECT MIN(c.hourly_price) FROM courts c WHERE c.venue_id = v.id AND c.status = 'ACTIVE') AS min_price"),
    )
    .select(
      db.raw(
        "COALESCE((SELECT json_agg(DISTINCT c.sport_type) FROM courts c WHERE c.venue_id = v.id AND c.status = 'ACTIVE'), '[]'::json) AS sport_types",
      ),
    )
    .select(db.raw('(SELECT COUNT(*)::int FROM courts c WHERE c.venue_id = v.id) AS court_count'));
}

export async function listVenues(filters, user) {
  const query = venueQuery().orderBy('v.name').orderBy('v.id')
    .limit(filters.limit ?? 100).offset(filters.offset ?? 0);
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
export const courtsForVenue = (id, filters = {}) => {
  const query = db('courts').where({ venue_id: id }).orderBy('name').orderBy('id');
  if (filters.activeOnly) query.where({ status: 'ACTIVE' });
  if (filters.sport_type) query.where({ sport_type: filters.sport_type });
  if (filters.min_price !== undefined) query.where('hourly_price', '>=', filters.min_price);
  if (filters.max_price !== undefined) query.where('hourly_price', '<=', filters.max_price);
  if (filters.limit !== undefined) query.limit(filters.limit).offset(filters.offset ?? 0);
  return query;
};
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
