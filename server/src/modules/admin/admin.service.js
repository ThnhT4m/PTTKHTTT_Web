import { db } from '../../db/knex.js';
import { AppError } from '../../lib/http.js';
import { writeAudit } from '../../lib/audit.js';
import { lockVenueCourts, lockSlots } from '../../lib/locking.js';
import { assertVenueOwner } from '../../middlewares/venueOwner.js';

export async function overview() {
  const [[venues], [bookings], [revenue], [users]] = await Promise.all([
    db('sport_venues').count('* as count'),
    db('bookings').count('* as count'),
    db('payments').where({ status: 'PAID' }).sum('amount as total'),
    db('users').count('* as count'),
  ]);
  return {
    total_venues: Number(venues.count),
    total_bookings: Number(bookings.count),
    total_revenue: Number(revenue.total || 0),
    total_users: Number(users.count),
  };
}

export const listUsers = ({ limit = 100, offset = 0, q, role, is_active } = {}) => {
  const query = db('users')
    .select('id', 'full_name', 'email', 'phone', 'role', 'is_active', 'created_at')
    .orderBy('created_at', 'desc')
    .orderBy('id').limit(limit).offset(offset);
  if (q) query.where((b) => b.whereILike('full_name', `%${q}%`).orWhereILike('email', `%${q}%`));
  if (role) query.where({ role });
  if (is_active !== undefined) query.where({ is_active });
  return query;
};
export const listAudit = ({ limit = 100, offset = 0, actor_id, entity_id, action } = {}) => {
  const query = db('audit_logs as a')
    .leftJoin('users as u', 'u.id', 'a.actor_id')
    .select('a.*', 'u.full_name as actor_name')
    .orderBy('a.created_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(limit).offset(offset);
  if (actor_id) query.where('a.actor_id', actor_id);
  if (entity_id) query.where('a.entity_id', entity_id);
  if (action) query.where('a.action', action);
  return query;
};

export async function updateUser(id, input, actor) {
  return db.transaction(async (trx) => {
    const before = await trx('users').where({ id }).forUpdate().first();
    if (!before) throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng.');
    if (id === actor.id && (input.is_active === false || (input.role && input.role !== actor.role)))
      throw new AppError(
        409,
        'SELF_ADMIN_PROTECTED',
        'Không thể tự khóa hoặc tự hạ quyền tài khoản quản trị đang dùng.',
      );
    if (before.role === 'ADMIN' && input.role && input.role !== 'ADMIN')
      throw new AppError(409, 'ADMIN_PROTECTED', 'Base không hỗ trợ hạ quyền ADMIN.');
    if (input.role === 'CUSTOMER' && (await trx('sport_venues').where({ manager_id: id }).first()))
      throw new AppError(
        409,
        'MANAGER_HAS_VENUES',
        'Cần chuyển giao các cơ sở trước khi hạ quyền quản lý.',
      );
    const [after] = await trx('users')
      .where({ id })
      .update({ ...input, token_version: before.token_version + 1, updated_at: trx.fn.now() })
      .returning(['id', 'full_name', 'email', 'phone', 'role', 'is_active', 'created_at']);
    await writeAudit(trx, {
      actorId: actor.id,
      action: 'USER_ACCESS_UPDATED',
      entityType: 'users',
      entityId: id,
      before,
      after,
      reason: 'Quản trị thay đổi quyền hoặc trạng thái tài khoản',
    });
    return after;
  });
}

function expected(row, version) {
  if (row.version !== version)
    throw new AppError(409, 'EDIT_CONFLICT', 'Dữ liệu vừa được cập nhật. Tải lại trước khi lưu.', {
      current: row,
    });
}

async function assertNoOpenBookings(trx, courtIds) {
  if (!courtIds.length) return;
  const active = await trx('bookings as b')
    .join('time_slots as s', 's.id', 'b.time_slot_id')
    .whereIn('s.court_id', courtIds)
    .whereIn('b.status', ['PENDING', 'CONFIRMED'])
    .whereRaw("(s.slot_date + s.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' > NOW()")
    .select('b.id')
    .first();
  if (active)
    throw new AppError(
      409,
      'ACTIVE_BOOKINGS_EXIST',
      'Còn đơn giữ chỗ hoặc đã xác nhận chưa kết thúc. Xử lý sự cố/dời/hoàn tiền trước khi khóa sân.',
    );
}

export async function setVenueStatus(id, input, actor) {
  return db.transaction(async (trx) => {
    const before = await trx('sport_venues').where({ id }).forUpdate().first();
    if (!before) throw new AppError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.');
    assertVenueOwner(actor, before);
    expected(before, input.expected_version);
    const courts = await trx('courts').where({ venue_id: id }).orderBy('id').forUpdate();
    if (input.status !== 'ACTIVE')
      await assertNoOpenBookings(
        trx,
        courts.map((court) => court.id),
      );
    const [after] = await trx('sport_venues')
      .where({ id, version: input.expected_version })
      .update({ status: input.status, version: before.version + 1, updated_at: trx.fn.now() })
      .returning('*');
    await writeAudit(trx, {
      actorId: actor.id,
      action: 'VENUE_STATUS_CHANGED',
      entityType: 'sport_venues',
      entityId: id,
      before,
      after,
      reason: input.reason,
    });
    return after;
  });
}

export async function setCourtStatus(id, input, actor) {
  return db.transaction(async (trx) => {
    const [before] = await lockVenueCourts(trx, [id]);
    assertVenueOwner(actor, before);
    expected(before, input.expected_version);
    if (input.status !== 'ACTIVE') await assertNoOpenBookings(trx, [id]);
    const [after] = await trx('courts')
      .where({ id, version: input.expected_version })
      .update({ status: input.status, version: before.version + 1, updated_at: trx.fn.now() })
      .returning('*');
    await writeAudit(trx, {
      actorId: actor.id,
      action: 'COURT_STATUS_CHANGED',
      entityType: 'courts',
      entityId: id,
      before,
      after,
      reason: input.reason,
    });
    return after;
  });
}

export async function setSlotStatus(id, input, actor) {
  return db.transaction(async (trx) => {
    const preliminary = await trx('time_slots').where({ id }).first();
    if (!preliminary) throw new AppError(404, 'SLOT_NOT_FOUND', 'Không tìm thấy khung giờ.');
    const [court] = await lockVenueCourts(trx, [preliminary.court_id]);
    assertVenueOwner(actor, court);
    const [before] = await lockSlots(trx, [id]);
    expected(before, input.expected_version);
    if (
      !['AVAILABLE', 'UNAVAILABLE'].includes(before.status) ||
      (await trx('bookings')
        .where({ time_slot_id: id })
        .whereIn('status', ['PENDING', 'CONFIRMED', 'COMPLETED'])
        .first())
    ) {
      throw new AppError(
        409,
        'SLOT_HAS_BOOKING',
        'Khung giờ gắn với giao dịch. Hãy xử lý đúng luồng đặt/dời/hoàn tiền.',
      );
    }
    const [after] = await trx('time_slots')
      .where({ id, version: input.expected_version })
      .update({
        status: input.status,
        held_until: null,
        version: before.version + 1,
        updated_at: trx.fn.now(),
      })
      .returning('*');
    await writeAudit(trx, {
      actorId: actor.id,
      action: 'SLOT_STATUS_CHANGED',
      entityType: 'time_slots',
      entityId: id,
      before,
      after,
      reason: input.reason,
    });
    return after;
  });
}
