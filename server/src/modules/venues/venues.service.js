import { db } from '../../db/knex.js';
import { AppError } from '../../lib/http.js';
import { writeAudit } from '../../lib/audit.js';
import { lockVenueCourts } from '../../lib/locking.js';
import { assertVenueOwner } from '../../middlewares/venueOwner.js';
import * as repository from './venues.repository.js';

export async function list(filters, user) {
  if (filters.mine && (!user || !['VENUE_MANAGER', 'ADMIN'].includes(user.role)))
    throw new AppError(403, 'FORBIDDEN', 'Chỉ quản lý được xem cơ sở phụ trách.');
  return repository.listVenues(filters, user);
}

async function accessibleVenue(id, user) {
  const venue = await repository.venueById(id);
  if (!venue) throw new AppError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.');
  if (
    venue.status !== 'ACTIVE' &&
    user?.role !== 'ADMIN' &&
    !(user?.role === 'VENUE_MANAGER' && user.id === venue.manager_id)
  )
    throw new AppError(404, 'VENUE_NOT_FOUND', 'Cơ sở đang ngưng phục vụ.');
  return venue;
}

export async function detail(id, user) {
  const venue = await accessibleVenue(id, user);
  const privileged = user?.role === 'ADMIN' ||
    (user?.role === 'VENUE_MANAGER' && user.id === venue.manager_id);
  return { ...venue, courts: await repository.courtsForVenue(id, { activeOnly: !privileged }) };
}

export async function listCourts(id, filters, user) {
  const venue = await accessibleVenue(id, user);
  const privileged = user?.role === 'ADMIN' ||
    (user?.role === 'VENUE_MANAGER' && user.id === venue.manager_id);
  return repository.courtsForVenue(id, { ...filters, activeOnly: !privileged });
}

export async function courtDetail(id, user) {
  const court = await repository.courtById(id);
  if (!court) throw new AppError(404, 'COURT_NOT_FOUND', 'Không tìm thấy sân.');
  if (
    (court.status !== 'ACTIVE' || court.venue_status !== 'ACTIVE') &&
    user?.role !== 'ADMIN' &&
    !(user?.role === 'VENUE_MANAGER' && user.id === court.manager_id)
  )
    throw new AppError(404, 'COURT_NOT_FOUND', 'Sân đang ngưng phục vụ.');
  return court;
}

export async function createVenue(input, user) {
  return db.transaction(async (trx) => {
    // Serialize with ADMIN role changes: a demoted manager must not create
    // a venue using a request authenticated before the change committed.
    const actor = await trx('users').where({ id: user.id }).forUpdate().first();
    if (!actor?.is_active || !['VENUE_MANAGER', 'ADMIN'].includes(actor.role))
      throw new AppError(403, 'FORBIDDEN', 'Tài khoản không còn quyền tạo cơ sở.');
    const [venue] = await trx('sport_venues')
      .insert({ ...input, manager_id: user.id, status: 'ACTIVE' })
      .returning('*');
    await writeAudit(trx, {
      actorId: user.id,
      action: 'VENUE_CREATED',
      entityType: 'sport_venues',
      entityId: venue.id,
      after: venue,
    });
    return venue;
  });
}

function assertVersion(row, expected) {
  if (row.version !== expected)
    throw new AppError(
      409,
      'EDIT_CONFLICT',
      'Dữ liệu đã được người khác cập nhật. Tải lại trước khi lưu.',
      { current: row },
    );
}

export async function updateVenue(id, input, user) {
  const { expected_version, ...changes } = input;
  return db.transaction(async (trx) => {
    const before = await trx('sport_venues').where({ id }).forUpdate().first();
    if (!before) throw new AppError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.');
    assertVenueOwner(user, before);
    assertVersion(before, expected_version);
    const [after] = await trx('sport_venues')
      .where({ id, version: expected_version })
      .update({ ...changes, version: expected_version + 1, updated_at: trx.fn.now() })
      .returning('*');
    await writeAudit(trx, {
      actorId: user.id,
      action: 'VENUE_UPDATED',
      entityType: 'sport_venues',
      entityId: id,
      before,
      after,
    });
    return after;
  });
}

export async function createCourt(venueId, input, user) {
  return db.transaction(async (trx) => {
    const venue = await trx('sport_venues').where({ id: venueId }).forUpdate().first();
    if (!venue) throw new AppError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.');
    assertVenueOwner(user, venue);
    const [court] = await trx('courts')
      .insert({ ...input, venue_id: venueId, status: 'ACTIVE' })
      .returning('*');
    await writeAudit(trx, {
      actorId: user.id,
      action: 'COURT_CREATED',
      entityType: 'courts',
      entityId: court.id,
      after: court,
    });
    return court;
  });
}

export async function updateCourt(id, input, user) {
  const { expected_version, ...changes } = input;
  return db.transaction(async (trx) => {
    const [before] = await lockVenueCourts(trx, [id]);
    assertVenueOwner(user, before);
    assertVersion(before, expected_version);
    const [after] = await trx('courts')
      .where({ id, version: expected_version })
      .update({ ...changes, version: expected_version + 1, updated_at: trx.fn.now() })
      .returning('*');
    await writeAudit(trx, {
      actorId: user.id,
      action: 'COURT_UPDATED',
      entityType: 'courts',
      entityId: id,
      before,
      after,
    });
    return after;
  });
}
