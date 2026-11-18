import { db } from '../db/knex.js';
import { AppError, asyncHandler } from '../lib/http.js';

export function assertVenueOwner(user, venue) {
  if (user.role !== 'ADMIN' && (user.role !== 'VENUE_MANAGER' || user.id !== venue.manager_id)) {
    throw new AppError(403, 'VENUE_FORBIDDEN', 'Bạn không được quản lý cơ sở này.');
  }
}

export const requireVenueOwner = (param = 'id') =>
  asyncHandler(async (req, res, next) => {
    const venue = await db('sport_venues').where({ id: req.params[param] }).first();
    if (!venue) throw new AppError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.');
    assertVenueOwner(req.user, venue);
    req.venue = venue;
    next();
  });
